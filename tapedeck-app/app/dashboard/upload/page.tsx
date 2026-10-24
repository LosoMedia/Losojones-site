"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "../../../lib/supabase";

export default function UploadTapePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [description, setDescription] = useState("");
  const [artworkUrl, setArtworkUrl] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    supabaseBrowser().auth.getUser().then(({ data, error: authError }) => {
      if (!active) return;
      if (authError || !data.user) {
        router.replace("/login");
        return;
      }
      setChecking(false);
    });
    return () => { active = false; };
  }, [router]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!audioFile) {
      setError("Choose an MP3 or other audio file first.");
      return;
    }
    if (audioFile.size > 50 * 1024 * 1024) {
      setError("Audio files must be 50 MB or smaller.");
      return;
    }
    if (!title.trim()) {
      setError("Add a title for your Tape.");
      return;
    }

    setLoading(true);
    const supabase = supabaseBrowser();
    let uploadedPath: string | null = null;

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Your session expired. Sign in again.");

      const safeName = audioFile.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      uploadedPath = user.id + "/" + crypto.randomUUID() + "-" + safeName;
      const { error: uploadError } = await supabase.storage
        .from("tape-audio")
        .upload(uploadedPath, audioFile, {
          contentType: audioFile.type || "application/octet-stream",
          upsert: false,
        });
      if (uploadError) throw new Error("Audio upload failed: " + uploadError.message);

      const { data: publicData } = supabase.storage.from("tape-audio").getPublicUrl(uploadedPath);
      const { error: insertError } = await supabase.from("tapes").insert({
        artist_id: user.id,
        title: title.trim(),
        genre: genre.trim() || null,
        description: description.trim() || null,
        artwork_url: artworkUrl.trim() || null,
        audio_url: publicData.publicUrl,
        status: "draft",
      });
      if (insertError) {
        await supabase.storage.from("tape-audio").remove([uploadedPath]);
        uploadedPath = null;
        throw new Error("The audio uploaded, but Tape details could not be saved: " + insertError.message);
      }

      setMessage("Your Tape was uploaded and saved as a draft.");
      setTitle("");
      setGenre("");
      setDescription("");
      setArtworkUrl("");
      setAudioFile(null);
      const fileInput = document.getElementById("tape-audio-file") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) return <main className="auth"><p className="muted">Checking your sign-in…</p></main>;

  return (
    <main className="auth">
      <Link href="/dashboard" className="muted">← Back to dashboard</Link>
      <div className="eyebrow" style={{ marginTop: 28 }}>TAPE DECK / NEW UPLOAD</div>
      <h1>Drop a Tape.</h1>
      <p className="muted">Upload your audio, add the details, and save it to your account. New uploads start as drafts.</p>

      <form className="form" onSubmit={submit}>
        <label>MP3 / audio file *
          <input
            id="tape-audio-file"
            type="file"
            accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac,.webm"
            required
            onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {audioFile && <p className="muted">Selected: {audioFile.name} · {(audioFile.size / (1024 * 1024)).toFixed(1)} MB</p>}
        <label>Tape title *
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} placeholder="Song or project name" />
        </label>
        <label>Genre
          <input value={genre} onChange={(e) => setGenre(e.target.value)} maxLength={80} placeholder="e.g. Emo rap, R&B, hip-hop" />
        </label>
        <label>Artwork URL (optional)
          <input type="url" value={artworkUrl} onChange={(e) => setArtworkUrl(e.target.value)} placeholder="https://..." />
        </label>
        <label>Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={2000} placeholder="Tell listeners about this Tape." />
        </label>
        <button className="btn" disabled={loading}>{loading ? "UPLOADING…" : "UPLOAD TAPE"}</button>
        {error && <div className="notice" role="alert">{error}</div>}
        {message && <div className="notice" role="status">{message}</div>}
      </form>
    </main>
  );
}
