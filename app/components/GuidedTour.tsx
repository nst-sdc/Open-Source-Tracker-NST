'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { TOUR_STEPS, tourHref } from '@/lib/tour-steps';
import { KAIRI_SHORT_NAME } from '@/lib/kairi';

/**
 * Kairi's film. When the URL carries `?tour=<n>`, the page dims, the scene's
 * element is spotlit, and Kairi's line appears as a caption and is spoken
 * by the browser's voice (a woman's English voice where the device has
 * one). When the line ends the next scene starts on its own, crossing
 * pages through the `tour` parameter. Controls: pause/play, mute, skip,
 * and leave. Browsers only speak after the person has interacted with the
 * page, so a visit that lands straight on a scene shows a Play button.
 */
const VOICE_KEY = 'tourVoice';
const PAD = 8;
const WORDS_PER_SECOND = 2.6;

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const english = voices.filter((v) => /^en/i.test(v.lang));
  const womanly = /female|woman|samantha|karen|moira|tessa|veena|zira|aria|jenny|neerja|aditi|kajal|ananya|serena|fiona|susan|allison|ava|emma|libby|sonia|heera|google uk english female|google us english/i;
  return english.find((v) => womanly.test(v.name) && /en-(IN|GB)/i.test(v.lang))
    ?? english.find((v) => womanly.test(v.name))
    ?? english.find((v) => /en-IN/i.test(v.lang))
    ?? english[0] ?? voices[0];
}

export default function GuidedTour() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const raw = params.get('tour');
  const index = raw === null ? null : Math.max(0, Math.min(TOUR_STEPS.length - 1, Number(raw) || 0));
  const step = index === null ? null : TOUR_STEPS[index];
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [voice, setVoice] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [needsPlay, setNeedsPlay] = useState(false);
  const [progress, setProgress] = useState(0);
  const target = useRef<Element | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      try { setVoice(localStorage.getItem(VOICE_KEY) !== 'off'); } catch { /* private mode */ }
      // Speech needs a prior gesture on this document; without one, ask for a click.
      const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } };
      if (nav.userActivation && !nav.userActivation.hasBeenActive) { setNeedsPlay(true); setPlaying(false); }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Find and follow the scene's element: it may fill in on the client, so measure until it has a size.
  useEffect(() => {
    target.current = null;
    let cancelled = false;
    let tries = 0;
    let scrolled = false;
    let observer: ResizeObserver | null = null;
    const reset = setTimeout(() => setRect(null), 0);
    if (!step) return () => clearTimeout(reset);
    const measure = () => {
      const el = target.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      if (!scrolled) { scrolled = true; el.scrollIntoView({ block: 'center', behavior: 'auto' }); setRect(el.getBoundingClientRect()); return; }
      setRect(r);
    };
    const find = () => {
      if (cancelled) return;
      const el = document.querySelector(`[data-tour="${step.anchor}"]`);
      if (el) {
        target.current = el;
        if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(measure); observer.observe(el); }
        measure();
        return;
      }
      if (++tries < 40) setTimeout(find, 100);
    };
    find();
    const ticker = setInterval(measure, 300);
    const stopTicker = setTimeout(() => clearInterval(ticker), 6000);
    const onChange = () => measure();
    window.addEventListener('scroll', onChange, { passive: true });
    window.addEventListener('resize', onChange);
    return () => {
      cancelled = true; clearTimeout(reset); clearInterval(ticker); clearTimeout(stopTicker); observer?.disconnect();
      window.removeEventListener('scroll', onChange); window.removeEventListener('resize', onChange);
    };
  }, [step]);

  const go = useCallback((i: number) => router.push(tourHref(i)), [router]);
  const leave = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    const q = new URLSearchParams(params.toString());
    q.delete('tour');
    router.replace(q.size ? `${pathname}?${q}` : pathname);
  }, [params, pathname, router]);

  // The scene plays: speak the line (or wait its reading time when muted), then move on.
  useEffect(() => {
    if (index === null || !step || !playing) return;
    const last = index === TOUR_STEPS.length - 1;
    const next = () => { if (last) leave(); else go(index + 1); };
    const words = step.text.split(/\s+/).length;
    const fallbackMs = Math.max(6000, (words / WORDS_PER_SECOND) * 1000 + 1200);
    const startedAt = Date.now();
    const prog = setInterval(() => setProgress(Math.min(1, (Date.now() - startedAt) / fallbackMs)), 100);
    let spoke = false;
    if (voice && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(step.text);
      const v = pickVoice();
      if (v) u.voice = v;
      u.rate = 0.95;
      u.pitch = 1.05;
      u.onend = () => { if (spoke) { clearTimeout(advanceTimer.current!); advanceTimer.current = setTimeout(next, 700); } };
      u.onstart = () => { spoke = true; };
      u.onerror = () => { /* fall back to the timer */ };
      window.speechSynthesis.speak(u);
    }
    advanceTimer.current = setTimeout(next, fallbackMs + (voice ? 4000 : 0));
    return () => {
      clearInterval(prog);
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, [index, step, playing, voice, go, leave]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') leave();
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); setNeedsPlay(false); }
      if (e.key === 'ArrowRight' && index < TOUR_STEPS.length - 1) go(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, go, leave]);

  if (index === null || !step) return null;
  const toggleVoice = () => {
    const next = !voice;
    setVoice(next);
    try { localStorage.setItem(VOICE_KEY, next ? 'on' : 'off'); } catch { /* ignore */ }
  };
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const captionW = Math.min(720, vw - 32);
  const captionStyle: CSSProperties = { bottom: 24, left: '50%', transform: 'translateX(-50%)', width: captionW };

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-label={`Kairi's tour, scene ${index + 1} of ${TOUR_STEPS.length}`}>
      <div
        className="absolute inset-0 transition-[clip-path] duration-500"
        style={{
          background: 'rgba(11, 12, 14, 0.6)',
          ...(rect ? { clipPath: `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${rect.left - PAD}px ${rect.top - PAD}px, ${rect.right + PAD}px ${rect.top - PAD}px, ${rect.right + PAD}px ${rect.bottom + PAD}px, ${rect.left - PAD}px ${rect.bottom + PAD}px, ${rect.left - PAD}px ${rect.top - PAD}px)` } : {}),
        }}
      />
      {rect && (
        <div className="absolute rounded-2xl ring-2 ring-brand-500 pointer-events-none transition-all duration-500" style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
      )}

      {needsPlay && (
        <button
          type="button"
          onClick={() => { setNeedsPlay(false); setPlaying(true); }}
          className="absolute inset-0 flex flex-col items-center justify-center text-white"
          aria-label="Play Kairi's tour"
        >
          <span className="w-20 h-20 rounded-full bg-brand-solid shadow-brand-btn flex items-center justify-center">
            <svg className="w-9 h-9 ml-1" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          </span>
          <span className="mt-4 text-lg font-[600]">Play</span>
          <span className="text-sm text-white/80">About four minutes, with {KAIRI_SHORT_NAME} narrating</span>
        </button>
      )}

      {/* Caption bar: Kairi's line, a thin progress line, and the few controls a film needs. */}
      <div className="absolute rounded-2xl bg-ground/95 backdrop-blur border border-line shadow-pop px-5 py-4" style={captionStyle}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 h-9 w-9 shrink-0 rounded-full bg-brand-0 border border-brand-100 flex items-center justify-center text-[13px] font-[700] text-brand-600">K</span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-[650] uppercase tracking-wider text-ink-soft">{KAIRI_SHORT_NAME}</div>
            <p className="mt-0.5 text-[15px] leading-relaxed text-ink">{step.text}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-1 flex-1 rounded-full bg-panel overflow-hidden" aria-hidden="true">
            <div className="h-full bg-brand-500 transition-[width] duration-100" style={{ width: `${Math.round(((index + progress) / TOUR_STEPS.length) * 100)}%` }} />
          </div>
          <button type="button" onClick={() => { setPlaying((p) => !p); setNeedsPlay(false); }} className="text-ink-mid hover:text-ink text-sm w-7 text-center" title={playing ? 'Pause' : 'Play'} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
          <button type="button" onClick={toggleVoice} className="text-ink-mid hover:text-ink text-sm w-7 text-center" title={voice ? 'Mute narration' : 'Unmute narration'} aria-pressed={voice}>{voice ? '🔊' : '🔇'}</button>
          {index < TOUR_STEPS.length - 1 && <button type="button" onClick={() => go(index + 1)} className="text-ink-mid hover:text-ink text-xs font-[550]" title="Skip to the next scene">Skip</button>}
          <button type="button" onClick={leave} className="text-ink-soft hover:text-ink text-xs font-[550]" aria-label="Leave the tour">Leave</button>
        </div>
      </div>
    </div>
  );
}
