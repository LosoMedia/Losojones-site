"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabaseBrowser } from "../../../lib/supabase";

type HostProfile = { id: string; display_name: string; genres: string | null; tiktok_url: string | null; is_host: boolean };
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

type MyEntry = { id: string; tape_id: string; status: string; checked_in: boolean };

const ACTIVE = ["queued", "playing", "waiting_on_artist"];

function statusLabel(status: string) {
  if (status === "playing") return "NOW PLAYING";
  if (status === "waiting_on_artist") return "WAITING ON ARTIST";
  return "IN THE POOL";
}

export default function RoomPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [host, setHost] = useState<HostProfile | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [board, setBoard] = useState<BoardEntry[]>([]);
  const [tapeTitles, setTapeTitles] = useState<Record<string, string>>({});
  const [artistNames, setArtistNames] = useState<Record<string, string>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [myEntries, setMyEntries] = useState<MyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const supabase = supabaseBrowser();
    const { data: userData } = await supabase.auth.getUser();
    const me = userData.user?.id ?? null;
    setUserId(me);

    const { data: hostData, error: hostError } = await supabase
      .from("profiles")
      .select("id,display_name,genres,tiktok_url,is_host")
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
      for (const t of (tapesData ?? []) as { id: string; title: string }[]) titles[t.id] = t.title;
      setTapeTitles(titles);
      const { data: profilesData } = await supabase.from("profiles").select("id,display_name").in("id", artistIds);
      const names: Record<string, string> = {};
      for (const p of (profilesData ?? []) as { id: string; display_name: string }[]) names[p.id] = p.display_name;
      setArtistNames(names);
    }

    if (me) {
      const { data: mineData } = await supabase
        .from("queue_entries")
        .select("id,tape_id,status,checked_in")
        .eq("host_id", id)
        .eq("artist_id", me)
        .in("status", ACTIVE);
      setMyEntries((mineData ?? []) as MyEntry[]);
    } else {
      setMyEntries([]);
    }
  }, [id]);

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load this room."))
      .finally(() => setLoading(false));
    const timer = setInterval(() => {
      load().catch(() => undefined);
    }, 10000);
    return () => clearInterval(timer);
  }, [load]);

  async function toggleCheckIn(entry: MyEntry) {
    setBusyId(entry.id);
    const next = !entry.checked_in;
    const patch: { checked_in: boolean; status?: string } = { checked_in: next };
    if (next && entry.status === "waiting_on_artist") patch.status = "queued";
    const { error: updateError } = await supabaseBrowser()
      .from("queue_entries")
      .update(patch)
      .eq("id", entry.id);
    setBusyId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await load();
  }

  if (loading) {
    return <main className="review"><p className="muted">Loading room…</p></main>;
  }
  if (!host || !host.is_host) {
    return (
      <main className="review">
        <Link href="/hosts" className="muted">← Hosts</Link>
        <h1>Room not found</h1>
        <div className="notice">{error || "This profile is not an approved host."}</div>
      </main>
    );
  }

  const playing = board.find((e) => e.status === "playing");
  const isHostViewer = userId === host.id;
  const boardHidden = room?.hide_queue && !isHostViewer;

  return (
    <main className="review">
      <Link href={`/host/${host.id}`} className="muted">← {host.display_name}&apos;s page</Link>
      <div className="eyebrow" style={{ marginTop: 18 }}>{room?.is_live ? "● LIVE NOW" : "ROOM — NOT LIVE"}</div>
      <h1>{room?.title || `${host.display_name} Live`}</h1>
      <p className="muted">{host.genres || "All genres"}</p>
      {(room?.tiktok_url || host.tiktok_url) && (
        <p style={{ marginTop: 14 }}>
          <a className="btn" href={(room?.tiktok_url || host.tiktok_url) as string} target="_blank" rel="noreferrer">WATCH THE TIKTOK LIVE</a>
        </p>
      )}
      {error && <div className="notice" style={{ marginTop: 16 }}>{error}</div>}

      <div className="step">
        <h2>Now playing</h2>
        {playing ? (
          <p>
            <strong>{tapeTitles[playing.tape_id] ?? "Tape"}</strong> — {artistNames[playing.artist_id] ?? "Artist"}
          </p>
        ) : (
          <p className="muted">{room?.is_live ? "Nothing on the deck right now — the next draw is coming." : "The show hasn't started. The line is ready when the host goes live."}</p>
        )}
      </div>

      {myEntries.length > 0 && (
        <div className="step">
          <h2>Your tapes in this line</h2>
          {myEntries.map((entry) => (
            <p key={entry.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <span>
                {tapeTitles[entry.tape_id] ?? "Your tape"} — <span className="muted">{statusLabel(entry.status)}</span>
                {entry.checked_in ? " · 🟢 you're checked in" : " · ⚪ not checked in"}
              </span>
              {entry.status !== "playing" && (
                <button className="btn secondary" disabled={busyId === entry.id} onClick={() => toggleCheckIn(entry)}>
                  {entry.checked_in ? "CHECK OUT" : "I'M HERE"}
                </button>
              )}
            </p>
          ))}
          <p className="muted">The draw only pulls checked-in artists. If your tape is called while you&apos;re away, it waits — no penalty.</p>
        </div>
      )}

      <div className="step">
        <h2>The Line</h2>
        {boardHidden ? (
          <div className="notice">The line is hidden by the host right now.</div>
        ) : board.length === 0 ? (
          <p className="muted">The line is empty.</p>
        ) : (
          board
            .filter((e) => e.status !== "playing")
            .map((entry) => (
              <p key={entry.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span>
                  {entry.checked_in ? "🟢 " : "⚪ "}
                  {tapeTitles[entry.tape_id] ?? "Tape"} — {artistNames[entry.artist_id] ?? "Artist"}
                  {entry.pinned ? " · 📌 HOST PICK" : ""}
                  {entry.readded_from ? " · ↩ BACK IN ROTATION" : ""}
                </span>
                <span className="muted">{statusLabel(entry.status)}</span>
              </p>
            ))
        )}
        {!userId && <p className="muted" style={{ marginTop: 12 }}><Link href="/login" style={{ textDecoration: "underline" }}>Sign in</Link> to join this line with your own tape.</p>}
      </div>
      <p className="muted" style={{ marginTop: 14 }}>This room refreshes every 10 seconds.</p>
    </main>
  );
}
