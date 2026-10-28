"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase";

type Host = {
  id: string;
  display_name: string;
  host_bio: string | null;
  genres: string | null;
  tiktok_url: string | null;
  line_min_cents: number;
};

type LiveRoom = { host_id: string; title: string | null };

export default function Hosts() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [liveRooms, setLiveRooms] = useState<Record<string, LiveRoom>>({});
  const [lineSizes, setLineSizes] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data: hostData, error: hostError } = await supabase
          .from("profiles")
          .select("id,display_name,host_bio,genres,tiktok_url,line_min_cents")
          .eq("is_host", true)
          .order("display_name", { ascending: true });
        if (hostError) throw hostError;
        const hostList = (hostData ?? []) as Host[];
        setHosts(hostList);

        const { data: roomData } = await supabase
          .from("rooms")
          .select("host_id,title")
          .eq("is_live", true);
        const roomMap: Record<string, LiveRoom> = {};
        for (const room of (roomData ?? []) as LiveRoom[]) roomMap[room.host_id] = room;
        setLiveRooms(roomMap);

        const { data: entryData } = await supabase
          .from("queue_entries")
          .select("host_id")
          .in("status", ["queued", "playing", "waiting_on_artist"]);
        const counts: Record<string, number> = {};
        for (const entry of (entryData ?? []) as { host_id: string }[]) {
          counts[entry.host_id] = (counts[entry.host_id] ?? 0) + 1;
        }
        setLineSizes(counts);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load hosts.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sorted = [...hosts].sort((a, b) => {
    const aLive = liveRooms[a.id] ? 0 : 1;
    const bLive = liveRooms[b.id] ? 0 : 1;
    return aLive - bLive;
  });

  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/">TAPE<span>DECK</span></Link>
        <nav className="nav">
          <Link href="/discover">Discover</Link>
          <Link href="/hosts">Hosts</Link>
          <Link href="/upload">Upload</Link>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      </header>
      <section className="hero" style={{ paddingBottom: 10 }}>
        <div className="eyebrow">LIVE HOSTS</div>
        <h1 style={{ fontSize: "clamp(40px,7vw,72px)" }}>Pick your room.</h1>
        <p>Every host runs their own line, live on TikTok. Join a line, check in when the show starts, and hear your tape played and reviewed in the room.</p>
        <p style={{ marginTop: 24 }}>
          <Link className="btn" href="/console">APPLY TO HOST</Link>
        </p>
      </section>
      {loading ? (
        <p className="muted" style={{ maxWidth: 1100, margin: "0 auto", padding: "10px 5vw 90px" }}>Loading hosts…</p>
      ) : error ? (
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "10px 5vw 90px" }}>
          <div className="notice">{error}</div>
        </div>
      ) : sorted.length === 0 ? (
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "10px 5vw 90px" }}>
          <div className="notice">No approved hosts yet. <Link href="/console">Be the first to apply →</Link></div>
        </div>
      ) : (
        <section className="grid">
          {sorted.map((host) => {
            const live = liveRooms[host.id];
            return (
              <div className="card" key={host.id}>
                <div className="eyebrow">{live ? "● LIVE NOW" : "HOST"}</div>
                <h2>{host.display_name}</h2>
                <p className="muted">{host.genres || "All genres"}</p>
                {host.host_bio && <p>{host.host_bio}</p>}
                <p className="muted">
                  In line: {lineSizes[host.id] ?? 0} · Line minimum: ${(host.line_min_cents / 100).toFixed(2)}
                  {live?.title ? ` · ${live.title}` : ""}
                </p>
                <p style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Link className="btn" href={`/host/${host.id}`}>VIEW LINE</Link>
                  <Link className="btn secondary" href={`/room/${host.id}`}>ENTER ROOM</Link>
                </p>
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
