'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { TOUR_STEPS, tourHref } from '@/lib/tour-steps';
import { KAIRI_SHORT_NAME } from '@/lib/kairi';

/**
 * The guided tour: when the URL carries `?tour=<n>`, spotlight the element
 * marked `data-tour` for step n and show Kairi's text beside it, with Back,
 * Next and an optional spoken narration (the browser's own voice, like the
 * one Cable Atlas uses; remembered in localStorage "tourVoice"). Next on
 * the last step of a page navigates to the next page with the next index,
 * so the tour runs across the live site.
 */
const VOICE_KEY = 'tourVoice';
const PAD = 8;

export default function GuidedTour() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const raw = params.get('tour');
  const index = raw === null ? null : Math.max(0, Math.min(TOUR_STEPS.length - 1, Number(raw) || 0));
  const step = index === null ? null : TOUR_STEPS[index];
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);
  const [voice, setVoice] = useState(false);
  const target = useRef<Element | null>(null);

  useEffect(() => {
    // After mount, so the server and first client render agree.
    const t = setTimeout(() => { try { setVoice(localStorage.getItem(VOICE_KEY) !== 'off'); } catch { /* private mode */ } }, 0);
    return () => clearTimeout(t);
  }, []);

  // Find the element for this step (it may arrive after a client fetch), scroll it into view, measure it.
  useEffect(() => {
    target.current = null;
    let cancelled = false;
    let tries = 0;
    const reset = setTimeout(() => { setRect(null); setMissing(false); }, 0);
    if (!step) return () => clearTimeout(reset);
    // A target can exist before it has content (a grid that fills in on the
    // client), so keep measuring until it has a size, and follow it as the
    // page settles: a ResizeObserver on the element plus scroll/resize.
    let scrolled = false;
    let observer: ResizeObserver | null = null;
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
      else setMissing(true);
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

  // Narration: the browser's own voice reads the step; off is remembered.
  useEffect(() => {
    if (!step || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    if (!voice) return;
    const u = new SpeechSynthesisUtterance(`${step.title}. ${step.text}`);
    u.rate = 1; u.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const en = voices.find((v) => /en-(IN|GB)/i.test(v.lang)) ?? voices.find((v) => v.lang.startsWith('en'));
    if (en) u.voice = en;
    window.speechSynthesis.speak(u);
    return () => window.speechSynthesis.cancel();
  }, [step, voice]);

  const go = useCallback((i: number) => router.push(tourHref(i)), [router]);
  const close = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    const q = new URLSearchParams(params.toString());
    q.delete('tour');
    router.replace(q.size ? `${pathname}?${q}` : pathname);
  }, [params, pathname, router]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight' && index < TOUR_STEPS.length - 1) go(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, go, close]);

  if (index === null || !step) return null;
  const last = index === TOUR_STEPS.length - 1;
  const toggleVoice = () => {
    const next = !voice;
    setVoice(next);
    try { localStorage.setItem(VOICE_KEY, next ? 'on' : 'off'); } catch { /* ignore */ }
  };

  // Card placement: under the spotlight when there is room, else above, else centred.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const cardW = Math.min(400, vw - 32);
  let cardStyle: CSSProperties;
  if (rect) {
    const below = rect.bottom + PAD + 12;
    const above = rect.top - PAD - 12;
    const left = Math.max(16, Math.min(rect.left, vw - cardW - 16));
    const cardH = 240;
    if (below + cardH < vh) cardStyle = { top: below, left, width: cardW };
    else if (above - cardH > 0) cardStyle = { top: above - cardH, left, width: cardW };
    else cardStyle = { bottom: 16, left: Math.min(left, vw - cardW - 16), width: cardW };
  } else {
    cardStyle = { bottom: 24, left: '50%', transform: 'translateX(-50%)', width: cardW };
  }

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-label={`Tour step ${index + 1} of ${TOUR_STEPS.length}`}>
      {/* One dimming layer with a hole cut for the target, so it never depends on shadow spread or timing. */}
      <div
        className="absolute inset-0 transition-[clip-path] duration-300"
        onClick={close}
        style={{
          background: 'rgba(11, 12, 14, 0.55)',
          ...(rect ? { clipPath: `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${rect.left - PAD}px ${rect.top - PAD}px, ${rect.right + PAD}px ${rect.top - PAD}px, ${rect.right + PAD}px ${rect.bottom + PAD}px, ${rect.left - PAD}px ${rect.bottom + PAD}px, ${rect.left - PAD}px ${rect.top - PAD}px)` } : {}),
        }}
      />
      {rect && (
        <div className="absolute rounded-2xl ring-2 ring-brand-500 pointer-events-none transition-all duration-300" style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
      )}
      <div className="absolute rounded-2xl bg-ground border border-line shadow-pop p-4 text-[13px]" style={cardStyle}>
        <div className="flex items-center gap-2 mb-2">
          <span className="h-7 w-7 rounded-full bg-brand-0 border border-brand-100 flex items-center justify-center text-[11px] font-[700] text-brand-600">K</span>
          <div className="leading-tight">
            <div className="font-[650] text-ink">{KAIRI_SHORT_NAME}</div>
            <div className="text-[11px] text-ink-soft">Step {index + 1} of {TOUR_STEPS.length}</div>
          </div>
          <button type="button" onClick={toggleVoice} title={voice ? 'Mute narration' : 'Unmute narration'} className="ml-auto text-ink-soft hover:text-ink text-base" aria-pressed={voice}>{voice ? '🔊' : '🔇'}</button>
          <button type="button" onClick={close} aria-label="Close the tour" className="text-ink-soft hover:text-ink text-lg leading-none">×</button>
        </div>
        <h2 className="text-ink font-[650] text-[15px]">{step.title}</h2>
        <p className="mt-1.5 text-ink-mid leading-relaxed">{step.text}</p>
        {missing && <p className="mt-2 text-[11.5px] text-ink-faint">I can’t find this part on the page right now; the text above still applies.</p>}
        <div className="mt-3 flex items-center gap-1.5">
          {TOUR_STEPS.map((_, i) => <button key={i} type="button" aria-label={`Go to step ${i + 1}`} onClick={() => go(i)} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-brand-500' : 'w-1.5 bg-line-strong hover:bg-ink-faint'}`} />)}
          <div className="ml-auto flex gap-2">
            <button type="button" disabled={index === 0} onClick={() => go(index - 1)} className="px-3 py-1.5 rounded-lg border border-line text-ink-mid disabled:opacity-40 hover:border-line-strong">Back</button>
            {last ? (
              <button type="button" onClick={close} className="px-3 py-1.5 rounded-lg bg-brand-solid hover:bg-brand-solid-hover text-white font-[550]">Done</button>
            ) : (
              <button type="button" onClick={() => go(index + 1)} className="px-3 py-1.5 rounded-lg bg-brand-solid hover:bg-brand-solid-hover text-white font-[550]">Next</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
