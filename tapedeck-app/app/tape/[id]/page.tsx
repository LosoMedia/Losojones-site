"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabaseBrowser } from "../../../lib/supabase";

type Tape = {
  id: string;
  title: string;
  description: string | null;
  genre: string | null;
  audio_url: string | null;
  artwork_url: string | null;
  plays_count: number | null;
  type: string | null;
  created_at: string;
};

type PlayRecord = {
  id: string;
  host_id: string;
  played_at: string | null;
  duration_played_seconds: number | null;
};

const TYPE_LABELS: Record<string, string> = { ai: "AI", organic: "ORGANIC", hybrid: "HYBRID" };

function fmtDuration(totalSeconds: number | null) {
  if (totalSeconds == null) return "—";
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtPlayed(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `Played ${d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

export default function TapePage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [tape, setTape] = useState<Tape | null>(null);
  const [playHistory, setPlayHistory] = useState<PlayRecord[]>([]);
  const [hostNames, setHostNames] = useState<Record<string, string>>({});
  const [queuedHosts, setQueuedHosts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data, error: fetchError } = await supabase
          .from("tapes")
          .select("id,title,description,genre,audio_url,artwork_url,plays_count,type,created_at")
          .eq("id", id)
          .single();
        if (fetchError) throw fetchError;
        setTape(data as Tape);

        const { data: historyData } = await supabase
          .from("queue_board")
          .select("id,host_id,played_at,duration_played_seconds")
          .eq("tape_id", id)
          .eq("status", "played")
          .order("played_at", { ascending: false });
        const records = (historyData ?? []) as PlayRecord[];
        setPlayHistory(records);

        const { data: activeData } = await supabase
          .from("queue_board")
          .select("host_id")
          .eq("tape_id", id)
          .in("status", ["queued", "playing", "waiting_on_artist"]);
        setQueuedHosts(new Set(((activeData ?? []) as { host_id: string }[]).map((e) => e.host_id)).size);

        if (records.length > 0) {
          const hostIds = [...new Set(records.map((r) => r.host_id))];
          const { data: profilesData } = await supabase.from("profiles").select("id,display_name").in("id", hostIds);
          const names: Record<string, string> = {};
          for (const p of (profilesData ?? []) as { id: string; display_name: string }[]) names[p.id] = p.display_name;
          setHostNames(names);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load this tape.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <main className="review">
        <p className="muted">Loading tape…</p>
      </main>
    );
  }

  if (error || !tape) {
    return (
      <main className="review">
        <Link href="/discover" className="muted">← Discover</Link>
        <h1>Tape not found</h1>
        <div className="notice">{error || "This tape does not exist or is not published."}</div>
      </main>
    );
  }

  return (
    <main className="review">
      <Link href="/discover" className="muted">← Discover</Link>
      {tape.artwork_url && <img className="tape-art" src={tape.artwork_url} alt={`${tape.title} artwork`} />}
      <div className="eyebrow">{(tape.genre || "TAPE DECK").toUpperCase()}</div>
      <h1>{tape.title}</h1>
      <p className="muted">
        ▶ {tape.plays_count ?? 0} plays{tape.type ? ` · ${TYPE_LABELS[tape.type] ?? tape.type.toUpperCase()}` : ""}
        {queuedHosts > 0 ? ` · 🎙 QUEUED with ${queuedHosts} host${queuedHosts === 1 ? "" : "s"} right now` : ""}
      </p>
      {tape.description && <p className="muted" style={{ lineHeight: 1.65 }}>{tape.description}</p>}
      {tape.audio_url ? (
        <audio className="player" controls preload="metadata" src={tape.audio_url}>
          Your browser does not support audio playback.
        </audio>
      ) : (
        <div className="notice">This tape has no audio file yet.</div>
      )}
      <p style={{ display: "flex", gap: 12, marginTop: 22, flexWrap: "wrap" }}>
        <Link className="btn" href={`/review?tape=${tape.id}`}>REVIEW THIS TAPE</Link>
        <Link className="btn secondary" href="/hosts">SUBMIT TO A HOST</Link>
        <Link className="btn secondary" href="/discover">MORE TAPES</Link>
      </p>
      {playHistory.length > 0 && (
        <div className="step">
          <h2>Play history</h2>
          {playHistory.map((record) => (
            <p key={record.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span>Played by <strong>{hostNames[record.host_id] ?? "a host"}</strong> live</span>
              <span className="muted">{fmtPlayed(record.played_at)} · heard {fmtDuration(record.duration_played_seconds)}</span>
            </p>
          ))}
        </div>
      )}
    </main>
  );
}
