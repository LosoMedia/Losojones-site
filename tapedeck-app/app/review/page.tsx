"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "../../lib/supabase";

const steps: [string, string[]][] = [
  ["First Impression", ["What was the strongest part of the Tape?", "What emotion or feeling did the Tape create for you?", "What stood out to you most?"]],
  ["Craft & Performance", ["What specifically worked well in the writing or performance?"]],
  ["Production", ["What production element could be improved?"]],
  ["Constructive Feedback", ["What specifically would you change?", "Why do you think that change would improve the Tape?"]],
  ["Final Assessment", ["Who do you think this Tape would appeal to?", "Give the artist one actionable piece of advice."]],
];

const scoreKeys = ["songwriting", "performance", "production", "clarity"] as const;
type ScoreKey = (typeof scoreKeys)[number];

function questionKey(question: string) {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

type TapeInfo = { id: string; title: string; artist_id: string };

function ReviewForm() {
  const searchParams = useSearchParams();
  const tapeId = searchParams.get("tape");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [scores, setScores] = useState<Record<ScoreKey, number>>({ songwriting: 8, performance: 8, production: 8, clarity: 8 });
  const [improvementArea, setImprovementArea] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [tape, setTape] = useState<TapeInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!tapeId) {
      setLoadError("No tape was selected for review. Pick one from Discover first.");
      return;
    }
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          window.location.href = "/login";
          return;
        }
        setUserId(userData.user.id);
        const { data, error } = await supabase.from("tapes").select("id,title,artist_id").eq("id", tapeId).single();
        if (error) throw error;
        setTape(data as TapeInfo);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Unable to load this tape.");
      }
    })();
  }, [tapeId]);

  const current = steps[step];
  const isLast = step === steps.length - 1;
  const answersComplete = current[1].every((q) => (answers[q] || "").trim().length >= 20);
  const complete = answersComplete && (!isLast || improvementArea.trim().length > 0);
  const ownTape = Boolean(tape && userId && tape.artist_id === userId);

  function set(q: string, v: string) {
    setAnswers((a) => ({ ...a, [q]: v }));
  }

  async function submit() {
    if (!tapeId || !userId) return;
    setBusy(true);
    setSubmitError("");
    try {
      const supabase = supabaseBrowser();
      const { data: review, error } = await supabase
        .from("reviews")
        .insert({ tape_id: tapeId, reviewer_id: userId, status: "submitted", submitted_at: new Date().toISOString() })
        .select("id")
        .single();
      if (error) throw error;

      const answerRows = steps.flatMap((s, i) =>
        s[1].map((q) => ({ review_id: review.id, step: i + 1, question_key: questionKey(q), answer: (answers[q] || "").trim() }))
      );
      const { error: answersError } = await supabase.from("review_answers").insert(answerRows);
      if (answersError) throw answersError;

      const { error: scoresError } = await supabase.from("review_scores").insert({
        review_id: review.id,
        songwriting: scores.songwriting,
        performance: scores.performance,
        production: scores.production,
        clarity: scores.clarity,
        improvement_area: improvementArea.trim(),
      });
      if (scoresError) throw scoresError;

      setDone(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Unable to submit your review.");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <main className="review">
        <div className="eyebrow">GUIDED REVIEW</div>
        <h1>Review a Tape</h1>
        <div className="notice">{loadError}</div>
        <p style={{ marginTop: 22 }}>
          <Link className="btn" href="/discover">GO TO DISCOVER</Link>
        </p>
      </main>
    );
  }

  if (done) {
    return (
      <main className="review">
        <div className="eyebrow">GUIDED REVIEW</div>
        <h1>Review submitted.</h1>
        <div className="notice">Your review{tape ? ` for “${tape.title}”` : ""} is saved. The artist can now read your answers and scores.</div>
        <p style={{ display: "flex", gap: 12, marginTop: 22, flexWrap: "wrap" }}>
          {tapeId && <Link className="btn" href={`/tape/${tapeId}`}>BACK TO THE TAPE</Link>}
          <Link className="btn secondary" href="/discover">DISCOVER MORE TAPES</Link>
        </p>
      </main>
    );
  }

  if (!tape) {
    return (
      <main className="review">
        <p className="muted">Loading tape…</p>
      </main>
    );
  }

  if (ownTape) {
    return (
      <main className="review">
        <div className="eyebrow">GUIDED REVIEW</div>
        <h1>Review: {tape.title}</h1>
        <div className="notice">You can&apos;t review your own tape. Reviews on Tape Deck come from other artists and listeners.</div>
        <p style={{ marginTop: 22 }}>
          <Link className="btn" href="/discover">FIND A TAPE TO REVIEW</Link>
        </p>
      </main>
    );
  }

  return (
    <main className="review">
      <div className="eyebrow">GUIDED REVIEW</div>
      <h1>Review: {tape.title}</h1>
      <p className="muted">Every step must be completed before the next one unlocks.</p>
      <div className="progress"><span style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
      <p className="muted">Step {step + 1} of {steps.length}</p>
      <section className="step">
        <h2>{current[0]}</h2>
        {current[1].map((q) => (
          <div className="question" key={q}>
            <label>{q}</label>
            <textarea value={answers[q] || ""} onChange={(e) => set(q, e.target.value)} placeholder="Be specific. Name what you heard, what worked, and why." minLength={20} />
          </div>
        ))}
        {isLast && (
          <>
            {scoreKeys.map((key) => (
              <div className="question" key={key}>
                <label style={{ textTransform: "capitalize" }}>{key} — score out of 10</label>
                <div className="range">
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={scores[key]}
                    onChange={(e) => setScores((s) => ({ ...s, [key]: Number(e.target.value) }))}
                  />
                  <output>{scores[key]} / 10</output>
                </div>
              </div>
            ))}
            <div className="question">
              <label>Biggest area to improve</label>
              <textarea value={improvementArea} onChange={(e) => setImprovementArea(e.target.value)} placeholder="Name the one area that would level this Tape up the most, and why." />
            </div>
          </>
        )}
        <div className="actions">
          <button className="btn secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>BACK</button>
          {step < steps.length - 1 ? (
            <button className="btn" disabled={!complete} onClick={() => setStep((s) => s + 1)}>CONTINUE</button>
          ) : (
            <button className="btn" disabled={!complete || busy} onClick={submit}>{busy ? "SUBMITTING…" : "SUBMIT REVIEW"}</button>
          )}
        </div>
        {submitError && <div className="notice" style={{ marginTop: 18 }}>{submitError}</div>}
      </section>
    </main>
  );
}

export default function Review() {
  return (
    <Suspense
      fallback={
        <main className="review">
          <p className="muted">Loading…</p>
        </main>
      }
    >
      <ReviewForm />
    </Suspense>
  );
}
