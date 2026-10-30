"use client";
import { useEffect, useRef, useState } from "react";

type DeckPlayerProps = {
  src: string;
  title?: string;
  artist?: string;
  autoPlay?: boolean;
  onTimeUpdate?: (currentTime: number) => void;
  onEnded?: () => void;
};

function fmtTime(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function DeckPlayer({ src, title, artist, autoPlay, onTimeUpdate, onEnded }: DeckPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);

  // Reset when a new tape is loaded into the deck.
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setHasError(false);
  }, [src]);

  // Best-effort autoplay — browsers may refuse; the big button stays ready.
  useEffect(() => {
    if (!autoPlay) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.play().catch(() => undefined);
  }, [autoPlay, src]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio || hasError) return;
    if (audio.paused) {
      audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }

  function seekTo(clientX: number, track: HTMLDivElement) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setCurrentTime(audio.currentTime);
  }

  function seekBy(delta: number) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.min(audio.duration, Math.max(0, audio.currentTime + delta));
    setCurrentTime(audio.currentTime);
  }

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="deck">
      <audio
        ref={audioRef}
        className="deck-audio"
        src={src}
        preload={autoPlay ? "auto" : "metadata"}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime);
          onTimeUpdate?.(e.currentTarget.currentTime);
        }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => {
          setIsPlaying(false);
          onEnded?.();
        }}
        onError={() => {
          setHasError(true);
          setIsPlaying(false);
        }}
      />

      <div className="deck-label">
        <span className="deck-title">{title || "Untitled tape"}</span>
        <span className="deck-artist">{artist || "Tape Deck"}</span>
      </div>

      <div className="deck-window" aria-hidden="true">
        <div className={`deck-reel${isPlaying ? " spin" : ""}`} />
        <div className="deck-band" />
        <div className={`deck-reel right${isPlaying ? " spin" : ""}`} />
      </div>

      <div className="deck-controls">
        <button
          type="button"
          className="deck-play"
          onClick={toggle}
          disabled={hasError}
          aria-label={isPlaying ? `Pause ${title || "tape"}` : `Play ${title || "tape"}`}
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>

        <div className="deck-trackwrap">
          <div
            className="deck-track"
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration) || 0}
            aria-valuenow={Math.round(currentTime)}
            aria-valuetext={`${fmtTime(currentTime)} of ${fmtTime(duration)}`}
            tabIndex={0}
            onClick={(e) => seekTo(e.clientX, e.currentTarget)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") { e.preventDefault(); seekBy(5); }
              if (e.key === "ArrowLeft") { e.preventDefault(); seekBy(-5); }
            }}
          >
            <div className="deck-fill" style={{ width: `${progress}%` }} />
            <div className="deck-knob" style={{ left: `${progress}%` }} />
          </div>
          <div className="deck-times">
            <span className="deck-now">{fmtTime(currentTime)}</span>
            <span>{fmtTime(duration)}</span>
          </div>
        </div>
      </div>

      {hasError && <div className="deck-error">⚠ This tape&apos;s audio couldn&apos;t be loaded.</div>}
    </div>
  );
}
