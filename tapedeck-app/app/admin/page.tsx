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

export default function Admin() {
  const [gate, setGate] = useState<"loading" | "login" | "denied" | "ok">("loading");
  const [applicants, setApplicants] = useState<Applicant[]>([]);
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
    </main>
  );
}
