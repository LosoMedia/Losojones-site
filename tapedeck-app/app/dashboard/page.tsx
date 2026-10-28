"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase";
import SignOutButton from "../../components/SignOutButton";

type LineEntry = {
  id: string;
  host_id: string;
  tape_id: string;
  status: string;
  entered_at: string;
  played_at: string | null;
};

const ACTIVE = ["queued", "playing", "waiting_on_artist"];

function fmtWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function statusLabel(status: string) {
  if (status === "playing") return "NOW PLAYING";
  if (status === "waiting_on_artist") return "WAITING ON ARTIST";
  return "IN THE POOL";
}

export default function Dashboard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [loading, setLoading] = useState(true);
  const [myLines, setMyLines] = useState<LineEntry[]>([]);
  const [myHistory, setMyHistory] = useState<LineEntry[]>([]);
  const [hostNames, setHostNames] = useState<Record<string, string>>({});
  const [tapeTitles, setTapeTitles] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          setLoading(false);
          return;
        }
        const me = userData.user.id;
        setUserId(me);

        const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", me).single();
        setIsHost(!!profile?.is_host);

        const { data: linesData } = await supabase
          .from("queue_entries")
          .select("id,host_id,tape_id,status,entered_at,played_at")
          .eq("artist_id", me)
          .in("status", ACTIVE)
          .order("entered_at", { ascending: true });
        const lines = (linesData ?? []) as LineEntry[];
        setMyLines(lines);

        const { data: historyData } = await supabase
          .from("queue_entries")
          .select("id,host_id,tape_id,status,entered_at,played_at")
          .eq("artist_id", me)
          .eq("status", "played")
          .order("played_at", { ascending: false })
          .limit(20);
        const playedHistory = (historyData ?? []) as LineEntry[];
        setMyHistory(playedHistory);

        const all = [...lines, ...playedHistory];
        if (all.length > 0) {
          const hostIds = [...new Set(all.map((e) => e.host_id))];
          const tapeIds = [...new Set(all.map((e) => e.tape_id))];
          const { data: hostsData } = await supabase.from("profiles").select("id,display_name").in("id", hostIds);
          const names: Record<string, string> = {};
          for (const h of (hostsData ?? []) as { id: string; display_name: string }[]) names[h.id] = h.display_name;
          setHostNames(names);
          const { data: tapesData } = await supabase.from("tapes").select("id,title").in("id", tapeIds);
          const titles: Record<string, string> = {};
          for (const t of (tapesData ?? []) as { id: string; title: string }[]) titles[t.id] = t.title;
          setTapeTitles(titles);
        }
      } catch {
        // Dashboard sections are additive; a failed fetch just leaves them empty.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <main className="auth">
      <div className="eyebrow">TAPE DECK DASHBOARD</div>
      <h1>Your creative home.</h1>
      <p className="muted">The dashboard shell is ready. Next it will load your profile, tapes, review assignments, reputation and billing from Supabase.</p>
      <div className="grid" style={{ padding: "20px 0", gridTemplateColumns: "1fr" }}>
        <div className="card">
          <h2>My Tapes</h2>
          <p>Create, edit and publish tapes from one account.</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="btn" href="/upload">DROP A TAPE</Link>
            <Link className="btn secondary" href="/discover">DISCOVER TAPES</Link>
            <Link className="btn secondary" href="/hosts">BROWSE HOSTS</Link>
            <Link className="btn secondary" href="/review">OPEN REVIEW ENGINE</Link>
          </div>
        </div>

        <div className="card">
          <h2>My Lines</h2>
          {loading ? (
            <p>Loading your lines…</p>
          ) : !userId ? (
            <p><Link href="/login" style={{ textDecoration: "underline" }}>Sign in</Link> to see the lines your tapes are standing in.</p>
          ) : myLines.length === 0 ? (
            <p>Your tapes aren&apos;t in any host&apos;s line yet. <Link href="/hosts" style={{ textDecoration: "underline" }}>Pick a room →</Link></p>
          ) : (
            myLines.map((entry) => (
              <p key={entry.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span>
                  <strong>{tapeTitles[entry.tape_id] ?? "Tape"}</strong> — in {hostNames[entry.host_id] ?? "a host"}&apos;s line
                  <span className="muted"> · since {fmtWhen(entry.entered_at)}</span>
                </span>
                <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span className="muted">{statusLabel(entry.status)}</span>
                  <Link className="btn secondary" href={`/room/${entry.host_id}`}>ROOM</Link>
                </span>
              </p>
            ))
          )}
        </div>

        <div className="card">
          <h2>My Play History</h2>
          {loading ? (
            <p>Loading history…</p>
          ) : myHistory.length === 0 ? (
            <p>No plays yet. When a host plays your tape live, it lands here — every room, every date.</p>
          ) : (
            myHistory.map((entry) => (
              <p key={entry.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span><strong>{tapeTitles[entry.tape_id] ?? "Tape"}</strong> — played by {hostNames[entry.host_id] ?? "a host"}</span>
                <span className="muted">{fmtWhen(entry.played_at)}</span>
              </p>
            ))
          )}
        </div>

        <div className="card">
          <h2>{isHost ? "Your Host Room" : "Become a Host"}</h2>
          <p>{isHost
            ? "Your console runs your show: go live, work your line, play tapes, write the reviews."
            : "Hosts run live review shows with their own dedicated line. Hosting is granted by approval."}</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="btn" href="/console">{isHost ? "OPEN CONSOLE" : "APPLY TO HOST"}</Link>
            {isHost && userId && <Link className="btn secondary" href={`/host/${userId}`}>YOUR HOST PAGE</Link>}
            <Link className="btn secondary" href="/hosts">ALL HOSTS</Link>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}><SignOutButton /></div>
        <div className="card">
          <h2>Reviewer Reputation</h2>
          <p>Helpful, constructive reviews will contribute to a separate reviewer reputation score.</p>
        </div>
      </div>
    </main>
  );
}
