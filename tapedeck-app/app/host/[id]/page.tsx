"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabaseBrowser } from "../../../lib/supabase";
import PayPalButton, { type PayPalResult } from "../../../components/PayPalButton";
import { paidEntriesConfigured } from "../../../lib/paypal";

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
  paypal_email: string | null;
  is_host: boolean;
};

type Room = { id: string; title: string | null; tiktok_url: string | null; is_live: boolean; hide_queue: boolean };

type BoardEntry = {
  id: string;
  tape_id: string;
  artist_id: string;
  segment: string;
  status: string;
  checked_in: boolean;
  pinned: boolean;
  entered_at: string;
  readded_from: string | null;
  paid_rank: number | null;
};

type MyTape = { id: string; title: string };

const ACTIVE = ["queued", "playing", "waiting_on_artist"];

function statusLabel(entry: BoardEntry) {
  if (entry.status === "playing") return "NOW PLAYING";
  if (entry.status === "waiting_on_artist") return "WAITING ON ARTIST";
  return entry.segment === "paid" ? "PAID LINE" : "IN THE POOL";
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
  const [joinSegment, setJoinSegment] = useState<"pool" | "paid">("pool");
  const [paidAmount, setPaidAmount] = useState("");
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
      .select("id,display_name,host_bio,genres,tiktok_url,line_min_cents,tip_paypal,tip_venmo,tip_cashapp,tip_chime,paypal_email,is_host")
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
      .select("id,tape_id,artist_id,segment,status,checked_in,pinned,entered_at,readded_from,paid_rank")
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

  // Fires after PayPal capture + server verification (see PayPalButton). The
  // payment row is written first, then the entry that spends it.
  async function handlePaidSuccess(result: PayPalResult) {
    if (!userId || !selectedTape || !id) return;
    setBusy(true);
    setError("");
    setNotice("");
    const supabase = supabaseBrowser();
    const { data: payment, error: payError } = await supabase
      .from("payments")
      .insert({
        user_id: userId,
        provider: "paypal",
        provider_txn_id: result.orderId,
        provider_capture_id: result.captureId,
        amount_cents: result.amountCents,
        platform_fee_cents: 0,
        host_amount_cents: result.amountCents,
        status: result.verified ? "completed" : "pending_verification",
      })
      .select("id")
      .single();
    if (payError || !payment) {
      setBusy(false);
      setError(payError?.message ?? "Your payment went through at PayPal but couldn't be recorded — contact the platform with your PayPal receipt.");
      return;
    }
    if (!result.verified) {
      setBusy(false);
      setNotice("Payment received — your entry activates once the host's PayPal is fully connected.");
      return;
    }
    const { data: entry, error: entryError } = await supabase
      .from("queue_entries")
      .insert({
        host_id: id,
        tape_id: selectedTape,
        artist_id: userId,
        segment: "paid",
        amount_cents: result.amountCents,
        payment_id: payment.id,
      })
      .select("id")
      .single();
    if (entryError || !entry) {
      setBusy(false);
      setError(`Your payment is recorded, but joining the line failed: ${entryError?.message ?? "unknown error"}. Contact the platform with your PayPal receipt.`);
      return;
    }
    await supabase.from("payments").update({ queue_entry_id: entry.id }).eq("id", payment.id);
    setBusy(false);
    setNotice("You're in the paid line — Skippers & Tippers. Positions move by amount, then by who paid first. Paid tapes serve even before check-in, but be in the room when yours comes up.");
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
  // Paid segment sits on top, in exact paid_rank order; a paid entry tagged
  // Waiting on Artist sinks to the bottom of the paid segment (spec §4).
  const paidEntries = board
    .filter((e) => e.segment === "paid" && e.status !== "playing")
    .sort((a, b) => {
      const aw = a.status === "waiting_on_artist" ? 1 : 0;
      const bw = b.status === "waiting_on_artist" ? 1 : 0;
      if (aw !== bw) return aw - bw;
      return (a.paid_rank ?? 999) - (b.paid_rank ?? 999);
    });
  const poolEntries = board.filter((e) => e.segment !== "paid" && e.status !== "playing");
  const minCents = Math.max(300, host?.line_min_cents ?? 300);
  const paidCents = Math.round((parseFloat(paidAmount) || 0) * 100);
  const paidValid = paidCents >= minCents;

  return (
    <main className="review">
      <Link href="/hosts" className="muted">← Hosts</Link>
      <div className="eyebrow" style={{ marginTop: 18 }}>{room?.is_live ? "● LIVE NOW" : "HOST"}</div>
      <h1>{host.display_name}</h1>
      <p className="muted">{host.genres || "All genres"} · Line minimum ${(minCents / 100).toFixed(2)}</p>
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
            {paidEntries.length > 0 && (
              <>
                <p className="muted" style={{ marginTop: 10 }}>💵 SKIPPERS &amp; TIPPERS — paid line, exact order. Amounts stay private; position is earned by amount, then by who paid first.</p>
                {paidEntries.map((entry) => (
                  <p key={entry.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <span>
                      {entry.status !== "waiting_on_artist" && entry.paid_rank ? <strong>#{entry.paid_rank} </strong> : ""}
                      {entry.checked_in ? "🟢 " : "⚪ "}
                      {tapeTitles[entry.tape_id] ?? "Tape"} — {artistNames[entry.artist_id] ?? "Artist"}
                      {entry.pinned ? " · 📌 HOST PICK" : ""}
                    </span>
                    <span className="muted">{statusLabel(entry)}</span>
                  </p>
                ))}
              </>
            )}
            <p className="muted" style={{ marginTop: 10 }}>{poolEntries.filter((e) => e.status === "queued").length} in the pool · the host draws at random, and checking in makes you drawable.</p>
            {poolEntries.map((entry) => (
              <p key={entry.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span>
                  {entry.checked_in ? "🟢 " : "⚪ "}
                  {tapeTitles[entry.tape_id] ?? "Tape"} — {artistNames[entry.artist_id] ?? "Artist"}
                  {entry.pinned ? " · 📌 HOST PICK" : ""}
                  {entry.readded_from ? " · ↩ BACK IN ROTATION" : ""}
                </span>
                <span className="muted">{statusLabel(entry)}</span>
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
            <div className="question">
              <label htmlFor="segment-select">Line</label>
              <select id="segment-select" value={joinSegment} onChange={(e) => setJoinSegment(e.target.value as "pool" | "paid")}>
                <option value="pool">Random Pool — FREE</option>
                <option value="paid">Skippers &amp; Tippers — PAID</option>
              </select>
            </div>
            {joinSegment === "pool" ? (
              <button className="btn" disabled={busy || !selectedTape} onClick={joinLine}>{busy ? "JOINING…" : "JOIN THE POOL — FREE"}</button>
            ) : !host.paypal_email ? (
              <div className="notice">This host hasn&apos;t set up paid entries yet.</div>
            ) : !paidEntriesConfigured() ? (
              <>
                <button className="btn" disabled>PAID ENTRIES OPEN SOON</button>
                <p className="muted" style={{ marginTop: 10 }}>Paid entries open soon — the free pool is live right now.</p>
              </>
            ) : (
              <>
                <div className="question">
                  <label htmlFor="paid-amount">Your amount (USD) — this host&apos;s minimum is ${(minCents / 100).toFixed(2)}</label>
                  <input
                    id="paid-amount"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder={(minCents / 100).toFixed(2)}
                  />
                </div>
                <p className="muted">Higher amounts sit higher in the paid line; ties go to whoever paid first. Your payment goes straight to the host through PayPal — the platform takes no cut. Paying buys position, never a verdict.</p>
                {paidValid ? (
                  <PayPalButton
                    amountCents={paidCents}
                    payeeEmail={host.paypal_email}
                    description="Tape Deck paid line entry"
                    onSuccess={handlePaidSuccess}
                    onError={(message) => setError(message)}
                  />
                ) : (
                  <p className="muted" style={{ marginTop: 10 }}>Enter at least ${(minCents / 100).toFixed(2)} to unlock the PayPal button.</p>
                )}
              </>
            )}
          </>
        )}
        {notice && <div className="notice" style={{ marginTop: 14 }}>{notice}</div>}
        {error && <div className="notice" style={{ marginTop: 14 }}>{error}</div>}
      </div>
    </main>
  );
}
