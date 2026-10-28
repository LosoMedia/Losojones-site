"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabaseBrowser } from "../../../lib/supabase";

type HostProfile = {
  id: string;
  display_name: string;
  host_bio: string | null;
  genres: string | null;
  tiktok_url: string | null;
  line_min_cents: number;
  tip_paypal: string | null;
  tip_venmo: string | null;
  tip_cashapp: string | null;
  tip_chime: string | null;
  is_host: boolean;
};

type Room = { id: string; title: string | null; tiktok_url: string | null; is_live: boolean; hide_queue: boolean };

type BoardEntry = {
  id: string;
  tape_id: string;
  artist_id: string;
  status: string;
  checked_in: boolean;
  pinned: boolean;
  entered_at: string;
  readded_from: string | null;
};

type MyTape = { id: string; title: string };

const ACTIVE = ["queued", "playing", "waiting_on_artist"];

function statusLabel(status: string) {
  if (status === "playing") return "NOW PLAYING";
  if (status === "waiting_on_artist") return "WAITING ON ARTIST";
  return "IN THE POOL";
}

export default function HostPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [host, setHost] = useState<HostProfile | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [board, setBoard] = useState<BoardEntry[]>([]);
  const [tapeTitles, setTapeTitles] = useState<Record<string, string>>({});
  const [artistNames, setArtistNames] = useState<Record<string, string>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [myTapes, setMyTapes] = useState<MyTape[]>([]);
  const [selectedTape, setSelectedTape] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!id) return;
    const supabase = supabaseBrowser();
    const { data: userData } = await supabase.auth.getUser();
    setUserId(userData.user?.id ?? null);

    const { data: hostData, error: hostError } = await supabase
      .from("profiles")
      .select("id,display_name,host_bio,genres,tiktok_url,line_min_cents,tip_paypal,tip_venmo,tip_cashapp,tip_chime,is_host")
      .eq("id", id)
      .single();
    if (hostError) throw hostError;
    setHost(hostData as HostProfile);

    const { data: roomData } = await supabase
      .from("rooms")
      .select("id,title,tiktok_url,is_live,hide_queue")
      .eq("host_id", id)
      .order("created_at", { ascending: false })
      .limit(1);
    setRoom(((roomData ?? [])[0] as Room) ?? null);

    const { data: boardData } = await supabase
      .from("queue_board")
      .select("id,tape_id,artist_id,status,checked_in,pinned,entered_at,readded_from")
      .eq("host_id", id)
      .in("status", ACTIVE)
      .order("entered_at", { ascending: true });
    const entries = (boardData ?? []) as BoardEntry[];
    setBoard(entries);

    if (entries.length > 0) {
      const tapeIds = [...new Set(entries.map((e) => e.tape_id))];
      const artistIds = [...new Set(entries.map((e) => e.artist_id))];
      const { data: tapesData } = await supabase.from("tapes").select("id,title").in("id", tapeIds);
      const titles: Record<string, string> = {};
      for (const t of (tapesData ?? []) as MyTape[]) titles[t.id] = t.title;
      setTapeTitles(titles);
      const { data: profilesData } = await supabase.from("profiles").select("id,display_name").in("id", artistIds);
      const names: Record<string, string> = {};
      for (const p of (profilesData ?? []) as { id: string; display_name: string }[]) names[p.id] = p.display_name;
      setArtistNames(names);
    }

    if (userData.user) {
      const { data: myData } = await supabase
        .from("tapes")
        .select("id,title")
        .eq("artist_id", userData.user.id)
        .eq("status", "published")
        .order("created_at", { ascending: false });
      const inLine = new Set(entries.map((e) => e.tape_id));
      const available = ((myData ?? []) as MyTape[]).filter((t) => !inLine.has(t.id));
      setMyTapes(available);
      setSelectedTape((prev) => (available.some((t) => t.id === prev) ? prev : available[0]?.id ?? ""));
    }
  }

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load this host."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function joinLine() {
    if (!userId || !selectedTape || !id) return;
    setBusy(true);
    setError("");
    setNotice("");
    const { error: insertError } = await supabaseBrowser()
      .from("queue_entries")
      .insert({ host_id: id, tape_id: selectedTape, artist_id: userId, segment: "pool" });
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setNotice("You're in the pool. Open the room when the show is live and tap “I'm here” so the draw can find you.");
    await load();
  }

  if (loading) {
    return <main className="review"><p className="muted">Loading host…</p></main>;
  }
  if (!host || !host.is_host) {
    return (
      <main className="review">
        <Link href="/hosts" className="muted">← Hosts</Link>
        <h1>Host not found</h1>
        <div className="notice">{error || "This profile is not an approved host."}</div>
      </main>
    );
  }

  const tips: [string, string | null][] = [
    ["PayPal", host.tip_paypal],
    ["Venmo", host.tip_venmo],
    ["Cash App", host.tip_cashapp],
    ["Chime", host.tip_chime],
  ];
  const playing = board.find((e) => e.status === "playing");
  const waiting = board.filter((e) => e.status === "waiting_on_artist");
  const pool = board.filter((e) => e.status === "queued");

  return (
    <main className="review">
      <Link href="/hosts" className="muted">← Hosts</Link>
      <div className="eyebrow" style={{ marginTop: 18 }}>{room?.is_live ? "● LIVE NOW" : "HOST"}</div>
      <h1>{host.display_name}</h1>
      <p className="muted">{host.genres || "All genres"} · Line minimum ${(host.line_min_cents / 100).toFixed(2)} (paid line arrives in Phase 2)</p>
      {host.host_bio && <p style={{ lineHeight: 1.65 }}>{host.host_bio}</p>}
      <p style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
        {room?.is_live && (
          <Link className="btn" href={`/room/${host.id}`}>ENTER THE ROOM</Link>
        )}
        {(room?.tiktok_url || host.tiktok_url) && (
          <a className="btn secondary" href={(room?.tiktok_url || host.tiktok_url) as string} target="_blank" rel="noreferrer">WATCH ON TIKTOK</a>
        )}
      </p>
      {tips.some(([, v]) => v) && (
        <div className="step">
          <h2>Tip {host.display_name}</h2>
          {tips.filter(([, v]) => v).map(([label, value]) => (
            <p key={label} className="muted">{label}: {value}</p>
          ))}
        </div>
      )}

      <div className="step">
        <h2>The Line</h2>
        {room?.hide_queue ? (
          <div className="notice">The line is hidden by the host right now.</div>
        ) : board.length === 0 ? (
          <p className="muted">The line is empty. Be the first tape in the pool.</p>
        ) : (
          <>
            {playing && (
              <p><strong>Now playing:</strong> {tapeTitles[playing.tape_id] ?? "Tape"} — {artistNames[playing.artist_id] ?? "Artist"}</p>
            )}
            <p className="muted">{pool.length} in the pool · the host draws at random, and checking in makes you drawable.</p>
            {[...pool, ...waiting].map((entry) => (
              <p key={entry.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span>
                  {entry.checked_in ? "🟢 " : "⚪ "}
                  {tapeTitles[entry.tape_id] ?? "Tape"} — {artistNames[entry.artist_id] ?? "Artist"}
                  {entry.pinned ? " · 📌 HOST PICK" : ""}
                  {entry.readded_from ? " · ↩ BACK IN ROTATION" : ""}
                </span>
                <span className="muted">{statusLabel(entry.status)}</span>
              </p>
            ))}
          </>
        )}
      </div>

      <div className="step">
        <h2>Join the line</h2>
        {!userId ? (
          <p className="muted">Sign in and publish a tape to join this host&apos;s pool. <Link href="/login" style={{ textDecoration: "underline" }}>Sign in →</Link></p>
        ) : myTapes.length === 0 ? (
          <p className="muted">None of your published tapes are available for this line — they&apos;re either already in it or not published yet. <Link href="/upload" style={{ textDecoration: "underline" }}>Drop a tape →</Link></p>
        ) : (
          <>
            <div className="question">
              <label htmlFor="tape-select">Your tape</label>
              <select id="tape-select" value={selectedTape} onChange={(e) => setSelectedTape(e.target.value)}>
                {myTapes.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
            <button className="btn" disabled={busy || !selectedTape} onClick={joinLine}>{busy ? "JOINING…" : "JOIN THE POOL — FREE"}</button>
          </>
        )}
        {notice && <div className="notice" style={{ marginTop: 14 }}>{notice}</div>}
        {error && <div className="notice" style={{ marginTop: 14 }}>{error}</div>}
      </div>
    </main>
  );
}
