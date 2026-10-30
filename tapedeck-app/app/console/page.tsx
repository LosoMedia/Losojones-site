"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "../../lib/supabase";

type Profile = {
  id: string;
  display_name: string;
  is_host: boolean;
  host_status: string;
  host_bio: string | null;
  genres: string | null;
  tiktok_url: string | null;
  paypal_email: string | null;
};

type Room = { id: string; title: string | null; tiktok_url: string | null; is_live: boolean; hide_queue: boolean };

type Entry = {
  id: string;
  tape_id: string;
  artist_id: string;
  segment: string;
  amount_cents: number;
  payment_id: string | null;
  status: string;
  checked_in: boolean;
  pinned: boolean;
  entered_at: string;
  played_at: string | null;
  duration_played_seconds: number | null;
  listener_count: number | null;
  readded_from: string | null;
};

type TapeInfo = { id: string; title: string; audio_url: string | null };

const ACTIVE = ["queued", "playing", "waiting_on_artist"];

function fmtDuration(totalSeconds: number | null) {
  if (totalSeconds == null) return "—";
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function Console() {
  const router = useRouter();
  const [gate, setGate] = useState<"loading" | "login" | "apply" | "pending" | "console">("loading");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [history, setHistory] = useState<Entry[]>([]);
  const [tapes, setTapes] = useState<Record<string, TapeInfo>>({});
  const [artists, setArtists] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // application form
  const [appBio, setAppBio] = useState("");
  const [appGenres, setAppGenres] = useState("");
  const [appTiktok, setAppTiktok] = useState("");
  const [appPaypal, setAppPaypal] = useState("");

  // live controls
  const [roomTitle, setRoomTitle] = useState("");
  const [roomTiktok, setRoomTiktok] = useState("");
  const [hideQueue, setHideQueue] = useState(false);

  // player
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playedRef = useRef(0);
  const [playedDisplay, setPlayedDisplay] = useState(0);

  const nowPlaying = entries.find((e) => e.status === "playing") ?? null;

  useEffect(() => {
    playedRef.current = 0;
    setPlayedDisplay(0);
  }, [nowPlaying?.id]);

  const loadConsole = useCallback(async (hostId: string) => {
    const supabase = supabaseBrowser();
    const { data: roomData } = await supabase
      .from("rooms")
      .select("id,title,tiktok_url,is_live,hide_queue")
      .eq("host_id", hostId)
      .order("created_at", { ascending: false })
      .limit(1);
    const currentRoom = ((roomData ?? [])[0] as Room) ?? null;
    setRoom(currentRoom);
    if (currentRoom) {
      setRoomTitle(currentRoom.title ?? "");
      setRoomTiktok(currentRoom.tiktok_url ?? "");
      setHideQueue(currentRoom.hide_queue);
    }

    const { data: activeData } = await supabase
      .from("queue_entries")
      .select("id,tape_id,artist_id,segment,amount_cents,payment_id,status,checked_in,pinned,entered_at,played_at,duration_played_seconds,listener_count,readded_from")
      .eq("host_id", hostId)
      .in("status", ACTIVE)
      .order("entered_at", { ascending: true });
    const active = (activeData ?? []) as Entry[];
    setEntries(active);

    const { data: historyData } = await supabase
      .from("queue_entries")
      .select("id,tape_id,artist_id,segment,amount_cents,payment_id,status,checked_in,pinned,entered_at,played_at,duration_played_seconds,listener_count,readded_from")
      .eq("host_id", hostId)
      .eq("status", "played")
      .order("played_at", { ascending: false })
      .limit(50);
    const played = (historyData ?? []) as Entry[];
    setHistory(played);

    const all = [...active, ...played];
    if (all.length > 0) {
      const tapeIds = [...new Set(all.map((e) => e.tape_id))];
      const artistIds = [...new Set(all.map((e) => e.artist_id))];
      const { data: tapesData } = await supabase.from("tapes").select("id,title,audio_url").in("id", tapeIds);
      const tapeMap: Record<string, TapeInfo> = {};
      for (const t of (tapesData ?? []) as TapeInfo[]) tapeMap[t.id] = t;
      setTapes(tapeMap);
      const { data: profilesData } = await supabase.from("profiles").select("id,display_name").in("id", artistIds);
      const nameMap: Record<string, string> = {};
      for (const p of (profilesData ?? []) as { id: string; display_name: string }[]) nameMap[p.id] = p.display_name;
      setArtists(nameMap);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          setGate("login");
          return;
        }
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id,display_name,is_host,host_status,host_bio,genres,tiktok_url,paypal_email")
          .eq("id", userData.user.id)
          .single();
        if (profileError) throw profileError;
        const me = profileData as Profile;
        setProfile(me);
        setAppBio(me.host_bio ?? "");
        setAppGenres(me.genres ?? "");
        setAppTiktok(me.tiktok_url ?? "");
        setAppPaypal(me.paypal_email ?? "");
        if (me.is_host) {
          setGate("console");
          await loadConsole(me.id);
        } else if (me.host_status === "applied") {
          setGate("pending");
        } else {
          setGate("apply");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load the console.");
      }
    })();
  }, [loadConsole]);

  async function apply(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    setError("");
    const { error: updateError } = await supabaseBrowser()
      .from("profiles")
      .update({ host_bio: appBio.trim() || null, genres: appGenres.trim() || null, tiktok_url: appTiktok.trim() || null, host_status: "applied" })
      .eq("id", profile.id);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setGate("pending");
  }

  async function saveHostProfile() {
    if (!profile) return;
    setBusy(true);
    setError("");
    setNotice("");
    const { error: updateError } = await supabaseBrowser()
      .from("profiles")
      .update({ host_bio: appBio.trim() || null, genres: appGenres.trim() || null, tiktok_url: appTiktok.trim() || null, paypal_email: appPaypal.trim() || null })
      .eq("id", profile.id);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setNotice("Host profile saved.");
  }

  async function goLive() {
    if (!profile) return;
    setBusy(true);
    setError("");
    const supabase = supabaseBrowser();
    const payload = {
      title: roomTitle.trim() || null,
      tiktok_url: roomTiktok.trim() || null,
      hide_queue: hideQueue,
      is_live: true,
      started_at: new Date().toISOString(),
      ended_at: null,
    };
    const result = room
      ? await supabase.from("rooms").update(payload).eq("id", room.id)
      : await supabase.from("rooms").insert({ ...payload, host_id: profile.id });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setNotice("You're live. Your line is active.");
    await loadConsole(profile.id);
  }

  async function endShow() {
    if (!profile || !room) return;
    setBusy(true);
    const { error: updateError } = await supabaseBrowser()
      .from("rooms")
      .update({ is_live: false, ended_at: new Date().toISOString() })
      .eq("id", room.id);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setNotice("Show ended. The line stays frozen for your next show — nobody loses their place.");
    await loadConsole(profile.id);
  }

  async function patchEntry(entryId: string, patch: Partial<Entry>) {
    if (!profile) return;
    setError("");
    const { error: updateError } = await supabaseBrowser().from("queue_entries").update(patch).eq("id", entryId);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await loadConsole(profile.id);
  }

  // Serve order: a pinned pick first, then the top ready paid entry (highest
  // amount, first payment wins ties; paid serves regardless of check-in), then
  // the weighted Random Pool draw among checked-in pool entries. Entries
  // tagged waiting_on_artist carry that status, so they're never picked here.
  function pickNext(): Entry | null {
    const queued = entries.filter((e) => e.status === "queued");
    const pinned = queued.filter((e) => e.pinned);
    if (pinned.length > 0) return pinned[0];
    const paid = queued
      .filter((e) => e.segment === "paid")
      .sort((a, b) => b.amount_cents - a.amount_cents || new Date(a.entered_at).getTime() - new Date(b.entered_at).getTime());
    if (paid.length > 0) return paid[0];
    const candidates = queued.filter((e) => e.segment !== "paid" && e.checked_in);
    if (candidates.length === 0) return null;
    const now = Date.now();
    const weights = candidates.map((e) => 1 + Math.floor((now - new Date(e.entered_at).getTime()) / 60000 / 30));
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < candidates.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  async function playNext() {
    setNotice("");
    const next = pickNext();
    if (!next) {
      setNotice("Nothing ready to serve — paid entries tagged Waiting on Artist are held back, and the pool draw only pulls artists who tapped “I'm here” in the room.");
      return;
    }
    await patchEntry(next.id, { status: "playing" });
  }

  async function markPlayed() {
    if (!profile || !nowPlaying) return;
    setBusy(true);
    setError("");
    const supabase = supabaseBrowser();
    const listeners = new Set(entries.filter((e) => e.checked_in).map((e) => e.artist_id)).size;
    const { error: updateError } = await supabase
      .from("queue_entries")
      .update({
        status: "played",
        played_at: new Date().toISOString(),
        duration_played_seconds: Math.floor(playedRef.current),
        listener_count: listeners,
      })
      .eq("id", nowPlaying.id);
    if (updateError) {
      setBusy(false);
      setError(updateError.message);
      return;
    }
    await supabase.rpc("increment_tape_plays", { p_tape_id: nowPlaying.tape_id });
    router.push(`/review?tape=${nowPlaying.tape_id}`);
  }

  async function reAdd(historyEntry: Entry) {
    if (!profile) return;
    setError("");
    setNotice("");
    if (entries.some((e) => e.tape_id === historyEntry.tape_id)) {
      setNotice("That tape is already active in your line.");
      return;
    }
    const { error: insertError } = await supabaseBrowser()
      .from("queue_entries")
      .insert({ host_id: profile.id, tape_id: historyEntry.tape_id, artist_id: historyEntry.artist_id, segment: "pool", readded_from: historyEntry.id });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setNotice("Back in rotation — the tape is in your pool again.");
    await loadConsole(profile.id);
  }

  if (gate === "loading") {
    return <main className="auth"><p className="muted">Checking your session…</p></main>;
  }

  if (gate === "login") {
    return (
      <main className="auth">
        <div className="eyebrow">HOST CONSOLE</div>
        <h1>Sign in first.</h1>
        <p className="muted">The console is for approved hosts and applicants.</p>
        <p style={{ marginTop: 18 }}><Link className="btn" href="/login">SIGN IN</Link></p>
      </main>
    );
  }

  if (gate === "pending") {
    return (
      <main className="auth">
        <div className="eyebrow">HOST CONSOLE</div>
        <h1>Application pending.</h1>
        <div className="notice">Your host application is in. Hosting is granted by approval — once you&apos;re approved, your console, line, and room open up here.</div>
        <p style={{ marginTop: 18 }}><Link className="btn secondary" href="/hosts">BROWSE HOSTS</Link></p>
      </main>
    );
  }

  if (gate === "apply") {
    return (
      <main className="auth">
        <Link href="/hosts" className="muted">← Hosts</Link>
        <h1>Apply to host</h1>
        <p className="muted">Hosts run live review shows with their own dedicated line. Hosting is approved, not automatic — tell artists what your room is about.</p>
        {profile?.host_status === "denied" && (
          <div className="notice" style={{ margin: "16px 0" }}>Your last application wasn&apos;t approved. You can update it and apply again.</div>
        )}
        <form className="form" onSubmit={apply} style={{ marginTop: 18 }}>
          <label>
            About your show
            <textarea required value={appBio} onChange={(e) => setAppBio(e.target.value)} placeholder="What do you play, how do you review, when do you go live?" />
          </label>
          <label>
            Genres
            <input value={appGenres} onChange={(e) => setAppGenres(e.target.value)} placeholder="e.g. Trap, R&B, AI & Hybrid" />
          </label>
          <label>
            TikTok profile or live link
            <input value={appTiktok} onChange={(e) => setAppTiktok(e.target.value)} placeholder="https://www.tiktok.com/@you" />
          </label>
          <button className="btn" disabled={busy}>{busy ? "SENDING…" : "SUBMIT APPLICATION"}</button>
          {error && <div className="notice">{error}</div>}
        </form>
      </main>
    );
  }

  // ---- approved host console ----
  function renderEntryRow(entry: Entry) {
    return (
      <div key={entry.id} style={{ borderTop: "1px solid #3a2358", padding: "14px 0" }}>
        <p style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", margin: 0 }}>
          <span>
            {entry.checked_in ? "🟢 " : "⚪ "}
            <strong>{tapes[entry.tape_id]?.title ?? "Tape"}</strong> — {artists[entry.artist_id] ?? "Artist"}
            {entry.segment === "paid" ? ` · 💵 $${(entry.amount_cents / 100).toFixed(2)}` : ""}
            {entry.pinned ? " · 📌 HOST PICK" : ""}
            {entry.readded_from ? " · ↩ RETURN" : ""}
          </span>
          <span className="muted">{entry.status === "waiting_on_artist" ? "WAITING ON ARTIST" : `in line since ${fmtWhen(entry.entered_at)}`}</span>
        </p>
        <p style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {!nowPlaying && entry.status === "queued" && (
            <button className="btn" onClick={() => patchEntry(entry.id, { status: "playing" })}>SERVE</button>
          )}
          {entry.status === "queued" && (
            <button className="btn secondary" onClick={() => patchEntry(entry.id, { pinned: !entry.pinned })}>{entry.pinned ? "UNPIN" : "PIN — HOST PICK"}</button>
          )}
          {entry.status === "queued" && (
            <button className="btn secondary" onClick={() => patchEntry(entry.id, { status: "waiting_on_artist" })}>TAG WAITING ON ARTIST</button>
          )}
          {entry.status === "waiting_on_artist" && (
            <button className="btn secondary" onClick={() => patchEntry(entry.id, { status: "queued" })}>UNTAG</button>
          )}
          <button className="btn secondary" onClick={() => patchEntry(entry.id, { status: "removed" })}>REMOVE</button>
        </p>
      </div>
    );
  }

  const lineWaiting = entries.filter((e) => e.status !== "playing");
  // Paid segment on top: queued by amount (first payment wins ties); entries
  // tagged Waiting on Artist sink to the bottom of the segment.
  const paidLine = lineWaiting
    .filter((e) => e.segment === "paid")
    .sort((a, b) => {
      const aw = a.status === "waiting_on_artist" ? 1 : 0;
      const bw = b.status === "waiting_on_artist" ? 1 : 0;
      if (aw !== bw) return aw - bw;
      if (b.amount_cents !== a.amount_cents) return b.amount_cents - a.amount_cents;
      return new Date(a.entered_at).getTime() - new Date(b.entered_at).getTime();
    });
  const poolLine = lineWaiting
    .filter((e) => e.segment !== "paid")
    .sort((a, b) => {
      const rank = (s: string) => (s === "queued" ? 0 : 1);
      const diff = rank(a.status) - rank(b.status);
      if (diff !== 0) return diff;
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(a.entered_at).getTime() - new Date(b.entered_at).getTime();
    });

  return (
    <main className="review">
      <Link href={`/host/${profile?.id}`} className="muted">← Your public host page</Link>
      <div className="eyebrow" style={{ marginTop: 18 }}>HOST CONSOLE</div>
      <h1>{profile?.display_name}&apos;s room control</h1>
      {notice && <div className="notice" style={{ marginTop: 14 }}>{notice}</div>}
      {error && <div className="notice" style={{ marginTop: 14 }}>{error}</div>}

      <div className="step">
        <h2>{room?.is_live ? "● You are LIVE" : "Go live"}</h2>
        <div className="form">
          <label>
            Show title
            <input value={roomTitle} onChange={(e) => setRoomTitle(e.target.value)} placeholder="e.g. Friday Night Reviews" />
          </label>
          <label>
            TikTok Live link
            <input value={roomTiktok} onChange={(e) => setRoomTiktok(e.target.value)} placeholder="https://www.tiktok.com/@you/live" />
          </label>
          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="checkbox" checked={hideQueue} onChange={(e) => setHideQueue(e.target.checked)} style={{ width: "auto" }} />
            Hide my line from the public board
          </label>
        </div>
        <p style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          {room?.is_live ? (
            <button className="btn secondary" disabled={busy} onClick={endShow}>END SHOW</button>
          ) : (
            <button className="btn" disabled={busy} onClick={goLive}>GO LIVE</button>
          )}
          {room?.is_live && (
            <button className="btn secondary" disabled={busy} onClick={goLive}>SAVE SHOW SETTINGS</button>
          )}
        </p>
      </div>

      <div className="step">
        <h2>Your host profile</h2>
        <p className="muted">What artists see on your public host page and in the directory. (Your per-show TikTok Live link is set in the Go Live card above.)</p>
        <div className="form">
          <label>
            TikTok profile
            <input value={appTiktok} onChange={(e) => setAppTiktok(e.target.value)} placeholder="https://www.tiktok.com/@you" />
          </label>
          <label>
            Genres
            <input value={appGenres} onChange={(e) => setAppGenres(e.target.value)} placeholder="Hip-Hop / R&B" />
          </label>
          <label>
            Bio
            <input value={appBio} onChange={(e) => setAppBio(e.target.value)} placeholder="What your room is about" />
          </label>
          <label>
            PayPal payout email
            <input value={appPaypal} onChange={(e) => setAppPaypal(e.target.value)} placeholder="you@paypal.example" />
          </label>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>Paid line entries (Skippers &amp; Tippers) are paid straight to this PayPal email — set it before you take paid entries. The platform takes no cut.</p>
        <p style={{ marginTop: 14 }}>
          <button className="btn" disabled={busy} onClick={saveHostProfile}>SAVE HOST PROFILE</button>
        </p>
      </div>

      {nowPlaying && (
        <div className="step">
          <h2>Now playing</h2>
          <p>
            <strong>{tapes[nowPlaying.tape_id]?.title ?? "Tape"}</strong> — {artists[nowPlaying.artist_id] ?? "Artist"}
            {nowPlaying.segment === "paid" ? ` · 💵 $${(nowPlaying.amount_cents / 100).toFixed(2)} paid entry` : ""}
          </p>
          {tapes[nowPlaying.tape_id]?.audio_url ? (
            <audio
              key={nowPlaying.id}
              ref={audioRef}
              className="player"
              controls
              preload="auto"
              src={tapes[nowPlaying.tape_id]?.audio_url ?? undefined}
              onTimeUpdate={(e) => {
                playedRef.current = Math.max(playedRef.current, e.currentTarget.currentTime);
                setPlayedDisplay(Math.floor(playedRef.current));
              }}
            />
          ) : (
            <div className="notice">This tape has no audio file.</div>
          )}
          <p className="muted">Played this session: {fmtDuration(playedDisplay)} · checked-in listeners right now: {new Set(entries.filter((e) => e.checked_in).map((e) => e.artist_id)).size}</p>
          <button className="btn" disabled={busy} onClick={markPlayed}>MARK PLAYED &amp; WRITE REVIEW</button>
        </div>
      )}

      <div className="step">
        <h2>Your line ({lineWaiting.length} waiting)</h2>
        {!nowPlaying && (
          <p style={{ marginBottom: 16 }}>
            <button className="btn" onClick={playNext} disabled={entries.every((e) => e.status !== "queued")}>
              ▶ PLAY NEXT — PICK, THEN PAID, THEN THE DRAW
            </button>
          </p>
        )}
        {lineWaiting.length === 0 ? (
          <p className="muted">Your line is empty. Share your host page and let artists join the pool.</p>
        ) : (
          <>
            {paidLine.length > 0 && (
              <>
                <h3 style={{ margin: "6px 0 4px" }}>💵 Skippers &amp; Tippers — paid line</h3>
                <p className="muted">Amounts are your receipts — artists never see what anyone else paid. Paid entries serve in this order, check-in or not; tag someone Waiting on Artist to hold them at the bottom.</p>
                {paidLine.map((entry) => renderEntryRow(entry))}
              </>
            )}
            {poolLine.length > 0 && (
              <>
                <h3 style={{ margin: "18px 0 4px" }}>🎲 The Random Pool — free</h3>
                <p className="muted">Served by weighted draw among checked-in artists; a pin jumps the pool only, never the paid line.</p>
                {poolLine.map((entry) => renderEntryRow(entry))}
              </>
            )}
          </>
        )}
      </div>

      <div className="step">
        <h2>History — played in your room</h2>
        {history.length === 0 ? (
          <p className="muted">Nothing played yet. Your history builds as the show runs — and songs can come back from here.</p>
        ) : (
          history.map((entry) => (
            <p key={entry.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <span>
                <strong>{tapes[entry.tape_id]?.title ?? "Tape"}</strong> — {artists[entry.artist_id] ?? "Artist"}
                <span className="muted"> · played {fmtWhen(entry.played_at)} · heard {fmtDuration(entry.duration_played_seconds)} · {entry.listener_count ?? 0} listeners{entry.segment === "paid" ? ` · 💵 $${(entry.amount_cents / 100).toFixed(2)} received` : ""}</span>
              </span>
              <button
                className="btn secondary"
                disabled={entries.some((e) => e.tape_id === entry.tape_id)}
                onClick={() => reAdd(entry)}
              >
                {entries.some((e) => e.tape_id === entry.tape_id) ? "IN YOUR LINE" : "RE-ADD TO POOL"}
              </button>
            </p>
          ))
        )}
      </div>
      <p style={{ marginTop: 18 }}>
        <Link className="btn secondary" href={`/room/${profile?.id}`}>OPEN YOUR ROOM VIEW</Link>
      </p>
    </main>
  );
}
