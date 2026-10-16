import Link from "next/link";

export default function Dashboard() {
  return (
    <main className="auth">
      <div className="eyebrow">TAPE DECK DASHBOARD</div>
      <h1>Your creative home.</h1>
      <p className="muted">Your tapes, review assignments, reputation and account tools belong here.</p>
      <div className="grid" style={{ padding: "20px 0", gridTemplateColumns: "1fr" }}>
        <div className="card">
          <h2>My Tapes</h2>
          <p>Upload your music and keep it attached to your account.</p>
          <Link className="btn" href="/dashboard/upload">DROP A TAPE</Link>
        </div>
        <div className="card">
          <h2>Reviews</h2>
          <p>Give creators structured, constructive feedback on their work.</p>
          <Link className="btn secondary" href="/review">OPEN REVIEW ENGINE</Link>
        </div>
        <div className="card">
          <h2>Reviewer Reputation</h2>
          <p>Helpful, constructive reviews will contribute to a separate reviewer reputation score.</p>
        </div>
      </div>
    </main>
  );
}
