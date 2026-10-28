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
  created_at: string;
};

export default function TapePage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [tape, setTape] = useState<Tape | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data, error: fetchError } = await supabaseBrowser()
          .from("tapes")
          .select("id,title,description,genre,audio_url,artwork_url,created_at")
          .eq("id", id)
          .single();
        if (fetchError) throw fetchError;
        setTape(data as Tape);
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
        <Link className="btn secondary" href="/discover">MORE TAPES</Link>
      </p>
    </main>
  );
}
