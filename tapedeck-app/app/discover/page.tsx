"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase";

type Tape = {
  id: string;
  title: string;
  description: string | null;
  genre: string | null;
  artwork_url: string | null;
  created_at: string;
};

export default function Discover() {
  const [tapes, setTapes] = useState<Tape[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data, error: fetchError } = await supabaseBrowser()
          .from("tapes")
          .select("id,title,description,genre,artwork_url,created_at")
          .eq("status", "published")
          .order("created_at", { ascending: false });
        if (fetchError) throw fetchError;
        setTapes((data ?? []) as Tape[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load tapes.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/">TAPE<span>DECK</span></Link>
        <nav className="nav">
          <Link href="/discover">Discover</Link>
          <Link href="/upload">Upload</Link>
          <Link href="/login">Login</Link>
          <Link href="/signup">Create Account</Link>
        </nav>
      </header>
      <section className="hero" style={{ paddingBottom: 10 }}>
        <div className="eyebrow">DISCOVER</div>
        <h1 style={{ fontSize: "clamp(40px,7vw,72px)" }}>Fresh off the Deck.</h1>
        <p>Every published tape, newest first. Press play, then leave a guided review.</p>
      </section>
      {loading ? (
        <p className="muted" style={{ maxWidth: 1100, margin: "0 auto", padding: "10px 5vw 90px" }}>Loading tapes…</p>
      ) : error ? (
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "10px 5vw 90px" }}>
          <div className="notice">{error}</div>
        </div>
      ) : tapes.length === 0 ? (
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "10px 5vw 90px" }}>
          <div className="notice">
            No tapes on the Deck yet. <Link href="/upload">Drop the first one →</Link>
          </div>
        </div>
      ) : (
        <section className="grid">
          {tapes.map((tape) => (
            <div className="card" key={tape.id}>
              {tape.artwork_url ? (
                <img className="artwork" src={tape.artwork_url} alt={`${tape.title} artwork`} />
              ) : (
                <div className="artwork placeholder">{tape.title.slice(0, 2).toUpperCase()}</div>
              )}
              <h2>{tape.title}</h2>
              <p className="muted">{tape.genre || "Uncategorized"}</p>
              {tape.description && <p>{tape.description}</p>}
              <Link className="btn" href={`/tape/${tape.id}`}>LISTEN &amp; REVIEW</Link>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
