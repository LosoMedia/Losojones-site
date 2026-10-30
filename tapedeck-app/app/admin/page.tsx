"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase";

type Applicant = {
  id: string;
  display_name: string;
  host_bio: string | null;
  genres: string | null;
  tiktok_url: string | null;
};

type HostRow = {
  id: string;
  display_name: string;
  is_host: boolean;
  host_status: string;
  host_bio: string | null;
  genres: string | null;
  tiktok_url: string | null;
  line_min_cents: number;
  tip_paypal: string | null;
  tip_venmo: string | null;
  tip_cashapp: string | null;
  tip_chime: string | null;
  paypal_email: string | null;
};

function HostEditor({ host, onChanged }: { host: HostRow; onChanged: () => void }) {
  const [bio, setBio] = useState(host.host_bio ?? "");
  const [genres, setGenres] = useState(host.genres ?? "");
  const [tiktok, setTiktok] = useState(host.tiktok_url ?? "");
  const [minDollars, setMinDollars] = useState(String((host.line_min_cents ?? 300) / 100));
  const [tipPaypal, setTipPaypal] = useState(host.tip_paypal ?? "");
  const [tipVenmo, setTipVenmo] = useState(host.tip_venmo ?? "");
  const [tipCashapp, setTipCashapp] = useState(host.tip_cashapp ?? "");
  const [tipChime, setTipChime] = useState(host.tip_chime ?? "");
  const [paypalEmail, setPaypalEmail] = useState(host.paypal_email ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    setBusy(true);
    setMsg("");
    const minCents = Math.max(300, Math.round((parseFloat(minDollars) || 3) * 100));
    const { error } = await supabaseBrowser()
      .from("profiles")
      .update({
        host_bio: bio.trim() || null,
        genres: genres.trim() || null,
        tiktok_url: tiktok.trim() || null,
        line_min_cents: minCents,
        tip_paypal: tipPaypal.trim() || null,
        tip_venmo: tipVenmo.trim() || null,
        tip_cashapp: tipCashapp.trim() || null,
        tip_chime: tipChime.trim() || null,
        paypal_email: paypalEmail.trim() || null,
      })
      .eq("id", host.id);
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setMsg("Saved — live now.");
    onChanged();
  }

  async function revoke() {
    setBusy(true);
    setMsg("");
    const { error } = await supabaseBrowser()
      .from("profiles")
      .update({ is_host: false, host_status: "denied" })
      .eq("id", host.id);
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    onChanged();
  }

  return (
    <div className="step">
      <h2>{host.display_name}</h2>
      <p className="muted">
        {host.is_host ? "Approved host" : `Status: ${host.host_status}`} ·{" "}
        <Link href={`/host/${host.id}`} style={{ textDecoration: "underline" }}>View host page</Link>
      </p>
      <div className="form" style={{ marginTop: 12 }}>
        <label>
          TikTok profile
          <input value={tiktok} onChange={(e) => setTiktok(e.target.value)} placeholder="https://www.tiktok.com/@host" />
        </label>
        <label>
          Genres
          <input value={genres} onChange={(e) => setGenres(e.target.value)} placeholder="Hip-Hop / R&B" />
        </label>
        <label>
          Bio
          <input value={bio} onChange={(e) => setBio(e.target.value)} placeholder="What this room is about" />
        </label>
        <label>
          Line minimum (USD, floor $3)
          <input value={minDollars} onChange={(e) => setMinDollars(e.target.value)} inputMode="decimal" />
        </label>
        <label>
          Tip — PayPal
          <input value={tipPaypal} onChange={(e) => setTipPaypal(e.target.value)} placeholder="paypal.me/…" />
        </label>
        <label>
          Tip — Venmo
          <input value={tipVenmo} onChange={(e) => setTipVenmo(e.target.value)} placeholder="@venmo" />
        </label>
        <label>
          Tip — Cash App
          <input value={tipCashapp} onChange={(e) => setTipCashapp(e.target.value)} placeholder="$cashtag" />
        </label>
        <label>
          Tip — Chime
          <input value={tipChime} onChange={(e) => setTipChime(e.target.value)} placeholder="$chime-sign" />
        </label>
        <label>
          PayPal payout email (paid line)
          <input value={paypalEmail} onChange={(e) => setPaypalEmail(e.target.value)} placeholder="host@paypal.example" />
        </label>
      </div>
      {msg && <div className="notice" style={{ marginTop: 12 }}>{msg}</div>}
      <p style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <button className="btn" disabled={busy} onClick={save}>SAVE CHANGES</button>
        {host.is_host && (
          <button className="btn secondary" disabled={busy} onClick={revoke}>REVOKE HOST</button>
        )}
      </p>
    </div>
  );
}

export default function Admin() {
  const [gate, setGate] = useState<"loading" | "login" | "denied" | "ok">("loading");
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [hosts, setHosts] = useState<HostRow[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    const supabase = supabaseBrowser();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setGate("login");
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userData.user.id)
      .single();
    if (!profile?.is_admin) {
      setGate("denied");
      return;
    }
    setGate("ok");
    const { data, error: fetchError } = await supabase
      .from("profiles")
      .select("id,display_name,host_bio,genres,tiktok_url")
      .eq("host_status", "applied")
      .order("display_name", { ascending: true });
    if (fetchError) {
      setError(fetchError.message);
      return;
    }
    setApplicants((data ?? []) as Applicant[]);
    const { data: hostData } = await supabase
      .from("profiles")
      .select("id,display_name,is_host,host_status,host_bio,genres,tiktok_url,line_min_cents,tip_paypal,tip_venmo,tip_cashapp,tip_chime,paypal_email")
      .neq("host_status", "none")
      .order("display_name", { ascending: true });
    setHosts((hostData ?? []) as HostRow[]);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Unable to load admin."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function decide(applicant: Applicant, approve: boolean) {
    setError("");
    setNotice("");
    const supabase = supabaseBrowser();
    const { error: updateError } = await supabase
      .from("profiles")
      .update(
        approve
          ? { is_host: true, host_status: "approved" }
          : { is_host: false, host_status: "denied" }
      )
      .eq("id", applicant.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setNotice(`${applicant.display_name} ${approve ? "approved as a host" : "denied"}.`);
    setApplicants((prev) => prev.filter((a) => a.id !== applicant.id));
    load().catch(() => {});
  }

  if (gate === "loading") {
    return <main className="auth"><p className="muted">Checking your session…</p></main>;
  }
  if (gate === "login") {
    return (
      <main className="auth">
        <div className="eyebrow">ADMIN</div>
        <h1>Sign in first.</h1>
        <p className="muted">Host approvals are owner-only.</p>
        <p style={{ marginTop: 18 }}><Link className="btn" href="/login">SIGN IN</Link></p>
      </main>
    );
  }
  if (gate === "denied") {
    return (
      <main className="auth">
        <div className="eyebrow">ADMIN</div>
        <h1>Not authorized.</h1>
        <div className="notice">This page is for the platform owner. If that&apos;s you, make your profile an admin from the database first (see the note at the end of phase1-live-queues.sql).</div>
      </main>
    );
  }

  return (
    <main className="review">
      <Link href="/dashboard" className="muted">← Dashboard</Link>
      <div className="eyebrow" style={{ marginTop: 18 }}>ADMIN</div>
      <h1>Host applications</h1>
      <p className="muted">Approving makes the reviewer a host with their own live line and console.</p>
      {notice && <div className="notice" style={{ marginTop: 16 }}>{notice}</div>}
      {error && <div className="notice" style={{ marginTop: 16 }}>{error}</div>}
      {applicants.length === 0 ? (
        <div className="notice" style={{ marginTop: 22 }}>No applications waiting.</div>
      ) : (
        applicants.map((applicant) => (
          <div className="step" key={applicant.id}>
            <h2>{applicant.display_name}</h2>
            <p className="muted">{applicant.genres || "No genres listed"}</p>
            {applicant.host_bio && <p>{applicant.host_bio}</p>}
            {applicant.tiktok_url && (
              <p><a href={applicant.tiktok_url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>{applicant.tiktok_url}</a></p>
            )}
            <p style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
              <button className="btn" onClick={() => decide(applicant, true)}>APPROVE HOST</button>
              <button className="btn secondary" onClick={() => decide(applicant, false)}>DENY</button>
            </p>
          </div>
        ))
      )}

      <h1 style={{ marginTop: 44 }}>All hosts</h1>
      <p className="muted">Edit any host&apos;s public info — TikTok profile, genres, bio, line minimum, tip links. Changes go live immediately.</p>
      {hosts.length === 0 ? (
        <div className="notice" style={{ marginTop: 22 }}>No hosts yet.</div>
      ) : (
        hosts.map((host) => <HostEditor key={host.id} host={host} onChanged={() => load().catch(() => {})} />)
      )}
    </main>
  );
}
