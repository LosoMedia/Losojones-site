"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { supabaseBrowser } from "../../lib/supabase";

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export default function Upload() {
  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [status, setStatus] = useState("published");
  const [audio, setAudio] = useState<File | null>(null);
  const [artwork, setArtwork] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [newTapeId, setNewTapeId] = useState<string | null>(null);

  useEffect(() => {
    supabaseBrowser()
      .auth.getUser()
      .then(({ data }) => {
        if (!data.user) {
          window.location.href = "/login";
          return;
        }
        setUserId(data.user.id);
        setChecking(false);
      })
      .catch(() => {
        window.location.href = "/login";
      });
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    if (!audio) {
      setError("Choose an audio file for your tape.");
      return;
    }
    setBusy(true);
    setError("");
    setProgress("");
    try {
      const supabase = supabaseBrowser();
      const stamp = Date.now();

      setProgress("Uploading audio…");
      const audioPath = `${userId}/${stamp}-${safeName(audio.name)}`;
      const audioUpload = await supabase.storage
        .from("audio")
        .upload(audioPath, audio, { contentType: audio.type || undefined, upsert: false });
      if (audioUpload.error) throw audioUpload.error;
      const audioUrl = supabase.storage.from("audio").getPublicUrl(audioPath).data.publicUrl;

      let artworkUrl: string | null = null;
      if (artwork) {
        setProgress("Uploading artwork…");
        const artworkPath = `${userId}/${stamp}-${safeName(artwork.name)}`;
        const artworkUpload = await supabase.storage
          .from("artwork")
          .upload(artworkPath, artwork, { contentType: artwork.type || undefined, upsert: false });
        if (artworkUpload.error) throw artworkUpload.error;
        artworkUrl = supabase.storage.from("artwork").getPublicUrl(artworkPath).data.publicUrl;
      }

      setProgress("Saving your tape…");
      const { data, error: insertError } = await supabase
        .from("tapes")
        .insert({
          artist_id: userId,
          title: title.trim(),
          description: description.trim() || null,
          genre: genre.trim() || null,
          status,
          audio_url: audioUrl,
          artwork_url: artworkUrl,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      setNewTapeId(data.id as string);
      setProgress("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <main className="auth">
        <p className="muted">Checking your session…</p>
      </main>
    );
  }

  if (newTapeId) {
    return (
      <main className="auth">
        <div className="eyebrow">TAPE DECK</div>
        <h1>Tape published.</h1>
        <div className="notice">Your tape is saved and live on the Deck. Anyone can play it and leave a guided review.</div>
        <p style={{ display: "flex", gap: 12, marginTop: 22, flexWrap: "wrap" }}>
          <Link className="btn" href={`/tape/${newTapeId}`}>VIEW YOUR TAPE</Link>
          <Link className="btn secondary" href="/discover">DISCOVER</Link>
        </p>
      </main>
    );
  }

  return (
    <main className="auth">
      <Link href="/" className="muted">← Tape Deck</Link>
      <h1>Drop a Tape</h1>
      <p className="muted">Upload the audio, add the story, and put it in front of reviewers.</p>
      <form className="form" onSubmit={submit}>
        <label>
          Title
          <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name the record" />
        </label>
        <label>
          Genre
          <input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="e.g. Dark R&B / Trap" />
        </label>
        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this Tape, and what should reviewers listen for?" />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="published">Published — visible on Discover</option>
            <option value="draft">Draft — only you can see it</option>
          </select>
        </label>
        <label>
          Audio file
          <input type="file" accept="audio/*" required onChange={(e) => setAudio(e.target.files?.[0] ?? null)} />
        </label>
        <label>
          Artwork (optional)
          <input type="file" accept="image/*" onChange={(e) => setArtwork(e.target.files?.[0] ?? null)} />
        </label>
        <button className="btn" disabled={busy}>{busy ? "WORKING…" : "PUBLISH TAPE"}</button>
        {progress && <div className="notice">{progress}</div>}
        {error && <div className="notice">{error}</div>}
      </form>
    </main>
  );
}
