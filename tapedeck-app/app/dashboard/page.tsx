"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase";
import SignOutButton from "../../components/SignOutButton";
import PayPalButton, { type PayPalResult } from "../../components/PayPalButton";
import { paidEntriesConfigured } from "../../lib/paypal";

type LineEntry = {
  id: string;
  host_id: string;
  tape_id: string;
  segment: string;
  amount_cents: number;
  payment_id: string | null;
  status: string;
  entered_at: string;
  played_at: string | null;
};

type HostOption = { id: string; display_name: string; line_min_cents: number };

type PaymentRow = { id: string; provider_capture_id: string | null; status: string };

const ACTIVE = ["queued", "playing", "waiting_on_artist"];
const FOURTEEN_DAYS_MS = 14 * 24 * 3600 * 1000;

function fmtWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function statusLabel(status: string, segment?: string) {
  if (status === "playing") return "NOW PLAYING";
  if (status === "waiting_on_artist") return "WAITING ON ARTIST";
  return segment === "paid" ? "PAID LINE" : "IN THE POOL";
}

// 14-day no-show protection (spec §4/D3): a paid entry still standing unplayed
// after 14 days earns the artist a full refund or a free transfer.
function noShowEligible(entry: LineEntry) {
  return (
    entry.segment === "paid" &&
    (entry.status === "queued" || entry.status === "waiting_on_artist") &&
    Date.now() - new Date(entry.entered_at).getTime() > FOURTEEN_DAYS_MS
  );
}

export default function Dashboard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [loading, setLoading] = useState(true);
  const [myLines, setMyLines] = useState<LineEntry[]>([]);
  const [myHistory, setMyHistory] = useState<LineEntry[]>([]);
  const [hostNames, setHostNames] = useState<Record<string, string>>({});
  const [hostPaypal, setHostPaypal] = useState<Record<string, string | null>>({});
  const [allHosts, setAllHosts] = useState<HostOption[]>([]);
  const [paidRanks, setPaidRanks] = useState<Record<string, number>>({});
  const [tapeTitles, setTapeTitles] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [topUpEntryId, setTopUpEntryId] = useState<string | null>(null);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [transferTargets, setTransferTargets] = useState<Record<string, string>>({});

  const loadAll = useCallback(async (me: string) => {
    const supabase = supabaseBrowser();

    const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", me).single();
    setIsHost(!!profile?.is_host);

    const { data: linesData } = await supabase
      .from("queue_entries")
      .select("id,host_id,tape_id,segment,amount_cents,payment_id,status,entered_at,played_at")
      .eq("artist_id", me)
      .in("status", ACTIVE)
      .order("entered_at", { ascending: true });
    const lines = (linesData ?? []) as LineEntry[];
    setMyLines(lines);

    const { data: historyData } = await supabase
      .from("queue_entries")
      .select("id,host_id,tape_id,segment,amount_cents,payment_id,status,entered_at,played_at")
      .eq("artist_id", me)
      .eq("status", "played")
      .order("played_at", { ascending: false })
      .limit(20);
    const playedHistory = (historyData ?? []) as LineEntry[];
    setMyHistory(playedHistory);

    // Paid positions come from the public board view — the base table only
    // ever shows an artist their own entries, so ranks can't be computed there.
    const paidActive = lines.filter((e) => e.segment === "paid");
    if (paidActive.length > 0) {
      const { data: boardData } = await supabase
        .from("queue_board")
        .select("id,paid_rank")
        .in("id", paidActive.map((e) => e.id));
      const ranks: Record<string, number> = {};
      for (const row of (boardData ?? []) as { id: string; paid_rank: number | null }[]) {
        if (row.paid_rank != null) ranks[row.id] = row.paid_rank;
      }
      setPaidRanks(ranks);

      const { data: hostsData } = await supabase
        .from("profiles")
        .select("id,display_name,line_min_cents")
        .eq("is_host", true)
        .order("display_name", { ascending: true });
      setAllHosts((hostsData ?? []) as HostOption[]);
    }

    const all = [...lines, ...playedHistory];
    if (all.length > 0) {
      const hostIds = [...new Set(all.map((e) => e.host_id))];
      const tapeIds = [...new Set(all.map((e) => e.tape_id))];
      const { data: hostsData } = await supabase.from("profiles").select("id,display_name,paypal_email").in("id", hostIds);
      const names: Record<string, string> = {};
      const paypals: Record<string, string | null> = {};
      for (const h of (hostsData ?? []) as { id: string; display_name: string; paypal_email: string | null }[]) {
        names[h.id] = h.display_name;
        paypals[h.id] = h.paypal_email;
      }
      setHostNames(names);
      setHostPaypal(paypals);
      const { data: tapesData } = await supabase.from("tapes").select("id,title").in("id", tapeIds);
      const titles: Record<string, string> = {};
      for (const t of (tapesData ?? []) as { id: string; title: string }[]) titles[t.id] = t.title;
      setTapeTitles(titles);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          setLoading(false);
          return;
        }
        setUserId(userData.user.id);
        await loadAll(userData.user.id);
      } catch {
        // Dashboard sections are additive; a failed fetch just leaves them empty.
      } finally {
        setLoading(false);
      }
    })();
  }, [loadAll]);

  async function handleTopUpSuccess(entry: LineEntry, result: PayPalResult) {
    if (!userId) return;
    setError("");
    setNotice("");
    const supabase = supabaseBrowser();
    const { error: payError } = await supabase.from("payments").insert({
      user_id: userId,
      queue_entry_id: entry.id,
      provider: "paypal",
      provider_txn_id: result.orderId,
      provider_capture_id: result.captureId,
      amount_cents: result.amountCents,
      platform_fee_cents: 0,
      host_amount_cents: result.amountCents,
      status: result.verified ? "completed" : "pending_verification",
    });
    if (payError) {
      setError(payError.message);
      return;
    }
    if (!result.verified) {
      setNotice("Payment received — your top-up applies once the host's PayPal is fully connected.");
      setTopUpEntryId(null);
      return;
    }
    const newTotal = entry.amount_cents + result.amountCents;
    const { error: updateError } = await supabase
      .from("queue_entries")
      .update({ amount_cents: newTotal })
      .eq("id", entry.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    // entered_at is untouched on purpose: the FIRST payment time keeps
    // breaking ties, exactly like the spec's top-up rule.
    setNotice(`Topped up — this entry now stands at ${fmtMoney(newTotal)} in ${hostNames[entry.host_id] ?? "the host"}'s paid line.`);
    setTopUpEntryId(null);
    setTopUpAmount("");
    await loadAll(userId);
  }

  async function requestRefund(entry: LineEntry) {
    if (!userId) return;
    setBusyId(entry.id);
    setError("");
    setNotice("");
    const supabase = supabaseBrowser();
    const { data: paysData } = await supabase
      .from("payments")
      .select("id,provider_capture_id,status")
      .eq("queue_entry_id", entry.id)
      .eq("status", "completed");
    const payments = (paysData ?? []) as PaymentRow[];
    if (payments.length === 0) {
      setBusyId(null);
      setError("No completed payment was found for this entry — contact the platform and we'll sort it out.");
      return;
    }
    let manualOnly = false;
    let failed = false;
    for (const payment of payments) {
      if (!payment.provider_capture_id) {
        manualOnly = true;
        continue;
      }
      try {
        const res = await fetch("/api/paypal/refund", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ captureId: payment.provider_capture_id }),
        });
        const json = (await res.json().catch(() => ({}))) as { refunded?: boolean; reason?: string };
        if (json.reason === "not_configured") {
          manualOnly = true;
        } else if (!json.refunded) {
          failed = true;
        } else {
          await supabase.from("payments").update({ status: "refunded" }).eq("id", payment.id);
        }
      } catch {
        failed = true;
      }
    }
    if (failed) {
      setBusyId(null);
      setError("PayPal didn't complete that refund — check your PayPal account, and contact the platform if anything looks off.");
      await loadAll(userId);
      return;
    }
    if (manualOnly) {
      await supabase
        .from("payments")
        .update({ status: "refund_requested" })
        .eq("queue_entry_id", entry.id)
        .eq("status", "completed");
      setBusyId(null);
      setNotice("Refund requested — the platform will process it manually.");
      await loadAll(userId);
      return;
    }
    await supabase.from("queue_entries").update({ status: "refunded" }).eq("id", entry.id);
    setBusyId(null);
    setNotice(`Refunded in full through PayPal — ${fmtMoney(entry.amount_cents)} back to you, and the entry has left the line.`);
    await loadAll(userId);
  }

  async function transferEntry(entry: LineEntry) {
    if (!userId) return;
    const targetId = transferTargets[entry.id];
    if (!targetId) {
      setError("Pick the host you want to transfer to first.");
      return;
    }
    setBusyId(entry.id);
    setError("");
    setNotice("");
    const supabase = supabaseBrowser();
    const { error: expireError } = await supabase.from("queue_entries").update({ status: "expired" }).eq("id", entry.id);
    if (expireError) {
      setBusyId(null);
      setError(expireError.message);
      return;
    }
    const { error: insertError } = await supabase.from("queue_entries").insert({
      host_id: targetId,
      tape_id: entry.tape_id,
      artist_id: userId,
      segment: "paid",
      amount_cents: entry.amount_cents,
      payment_id: entry.payment_id,
    });
    if (insertError) {
      // Roll the original entry back — a failed transfer changes nothing.
      await supabase.from("queue_entries").update({ status: entry.status }).eq("id", entry.id);
      setBusyId(null);
      setError(`Transfer didn't go through (${insertError.message}) — your entry is untouched. Your tape may already be standing in that host's line.`);
      return;
    }
    setBusyId(null);
    setNotice(`Transferred — your full ${fmtMoney(entry.amount_cents)} now stands in ${hostNames[targetId] ?? allHosts.find((h) => h.id === targetId)?.display_name ?? "the new host"}'s paid line. No new payment needed.`);
    await loadAll(userId);
  }

  function renderTopUp(entry: LineEntry) {
    if (topUpEntryId !== entry.id) {
      return (
        <button className="btn secondary" onClick={() => { setTopUpEntryId(entry.id); setTopUpAmount(""); setError(""); }}>
          TOP UP
        </button>
      );
    }
    const payee = hostPaypal[entry.host_id];
    const cents = Math.round((parseFloat(topUpAmount) || 0) * 100);
    return (
      <span style={{ display: "block", marginTop: 8 }}>
        {!payee ? (
          <span className="muted">This host hasn&apos;t set up paid entries yet.</span>
        ) : !paidEntriesConfigured() ? (
          <span className="muted">Paid entries open soon — top-ups reopen with them.</span>
        ) : (
          <>
            <label>
              Add (USD){" "}
              <input value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} inputMode="decimal" placeholder="5.00" style={{ width: 90 }} />
            </label>
            {cents > 0 ? (
              <PayPalButton
                amountCents={cents}
                payeeEmail={payee}
                description="Tape Deck paid line top-up"
                onSuccess={(result) => handleTopUpSuccess(entry, result)}
                onError={(message) => setError(message)}
              />
            ) : (
              <span className="muted" style={{ display: "block", marginTop: 8 }}>Enter an amount to top up — it adds to your current {fmtMoney(entry.amount_cents)} and re-sorts you by the new total.</span>
            )}
          </>
        )}
        <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => setTopUpEntryId(null)}>CANCEL</button>
      </span>
    );
  }

  function renderNoShow(entry: LineEntry) {
    const targets = allHosts.filter((h) => h.id !== entry.host_id && h.line_min_cents <= entry.amount_cents);
    return (
      <div style={{ marginTop: 8, borderTop: "1px dashed #3a2358", paddingTop: 10 }}>
        <p className="muted" style={{ margin: 0 }}>
          ⏳ 14-day no-show protection: this paid entry still hasn&apos;t been played. Take a full refund, or move the full amount to another host&apos;s line for free.
        </p>
        <p style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
          <button className="btn secondary" disabled={busyId === entry.id} onClick={() => requestRefund(entry)}>
            {busyId === entry.id ? "WORKING…" : "REQUEST REFUND"}
          </button>
          {targets.length > 0 ? (
            <>
              <select
                value={transferTargets[entry.id] ?? ""}
                onChange={(e) => setTransferTargets((prev) => ({ ...prev, [entry.id]: e.target.value }))}
              >
                <option value="">Transfer to…</option>
                {targets.map((h) => (
                  <option key={h.id} value={h.id}>{h.display_name}</option>
                ))}
              </select>
              <button className="btn secondary" disabled={busyId === entry.id || !transferTargets[entry.id]} onClick={() => transferEntry(entry)}>
                TRANSFER
              </button>
            </>
          ) : (
            <span className="muted">No other host&apos;s line minimum fits this amount right now.</span>
          )}
        </p>
      </div>
    );
  }

  return (
    <main className="auth">
      <div className="eyebrow">TAPE DECK DASHBOARD</div>
      <h1>Your creative home.</h1>
      <p className="muted">The dashboard shell is ready. Next it will load your profile, tapes, review assignments, reputation and billing from Supabase.</p>
      <div className="grid" style={{ padding: "20px 0", gridTemplateColumns: "1fr" }}>
        <div className="card">
          <h2>My Tapes</h2>
          <p>Create, edit and publish tapes from one account.</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="btn" href="/upload">DROP A TAPE</Link>
            <Link className="btn secondary" href="/discover">DISCOVER TAPES</Link>
            <Link className="btn secondary" href="/hosts">BROWSE HOSTS</Link>
            <Link className="btn secondary" href="/review">OPEN REVIEW ENGINE</Link>
          </div>
        </div>

        <div className="card">
          <h2>My Lines</h2>
          {notice && <div className="notice" style={{ marginBottom: 12 }}>{notice}</div>}
          {error && <div className="notice" style={{ marginBottom: 12 }}>{error}</div>}
          {loading ? (
            <p>Loading your lines…</p>
          ) : !userId ? (
            <p><Link href="/login" style={{ textDecoration: "underline" }}>Sign in</Link> to see the lines your tapes are standing in.</p>
          ) : myLines.length === 0 ? (
            <p>Your tapes aren&apos;t in any host&apos;s line yet. <Link href="/hosts" style={{ textDecoration: "underline" }}>Pick a room →</Link></p>
          ) : (
            myLines.map((entry) => (
              <div key={entry.id} style={{ borderTop: "1px solid #3a2358", padding: "12px 0" }}>
                <p style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", margin: 0 }}>
                  <span>
                    <strong>{tapeTitles[entry.tape_id] ?? "Tape"}</strong> — in {hostNames[entry.host_id] ?? "a host"}&apos;s line
                    <span className="muted"> · since {fmtWhen(entry.entered_at)}</span>
                    {entry.segment === "paid" && (
                      <span className="muted">
                        {" "}· 💵 {fmtMoney(entry.amount_cents)} paid
                        {entry.status === "queued" && paidRanks[entry.id] ? ` · paid position #${paidRanks[entry.id]}` : ""}
                      </span>
                    )}
                  </span>
                  <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span className="muted">{statusLabel(entry.status, entry.segment)}</span>
                    <Link className="btn secondary" href={`/room/${entry.host_id}`}>ROOM</Link>
                  </span>
                </p>
                {entry.segment === "paid" && entry.status !== "playing" && (
                  <div style={{ marginTop: 8 }}>{renderTopUp(entry)}</div>
                )}
                {noShowEligible(entry) && renderNoShow(entry)}
              </div>
            ))
          )}
        </div>

        <div className="card">
          <h2>My Play History</h2>
          {loading ? (
            <p>Loading history…</p>
          ) : myHistory.length === 0 ? (
            <p>No plays yet. When a host plays your tape live, it lands here — every room, every date.</p>
          ) : (
            myHistory.map((entry) => (
              <p key={entry.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span>
                  <strong>{tapeTitles[entry.tape_id] ?? "Tape"}</strong> — played by {hostNames[entry.host_id] ?? "a host"}
                  {entry.segment === "paid" ? <span className="muted"> · 💵 {fmtMoney(entry.amount_cents)} paid entry</span> : null}
                </span>
                <span className="muted">{fmtWhen(entry.played_at)}</span>
              </p>
            ))
          )}
        </div>

        <div className="card">
          <h2>{isHost ? "Your Host Room" : "Become a Host"}</h2>
          <p>{isHost
            ? "Your console runs your show: go live, work your line, play tapes, write the reviews."
            : "Hosts run live review shows with their own dedicated line. Hosting is granted by approval."}</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="btn" href="/console">{isHost ? "OPEN CONSOLE" : "APPLY TO HOST"}</Link>
            {isHost && userId && <Link className="btn secondary" href={`/host/${userId}`}>YOUR HOST PAGE</Link>}
            <Link className="btn secondary" href="/hosts">ALL HOSTS</Link>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}><SignOutButton /></div>
        <div className="card">
          <h2>Reviewer Reputation</h2>
          <p>Helpful, constructive reviews will contribute to a separate reviewer reputation score.</p>
        </div>
      </div>
    </main>
  );
}
