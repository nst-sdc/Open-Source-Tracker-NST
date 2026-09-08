'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Lenis from 'lenis';
import { KAIRI_PATH } from '@/lib/kairi';

/**
 * Site-wide smooth scrolling for ordinary, top-to-bottom pages.
 *
 * Lenis works by listening for `wheel` on the window, calling
 * preventDefault() on it, and animating the document's scroll position
 * itself. That is fine for a long marketing or leaderboard page. It is
 * actively hostile to an app shell, where the document does not scroll at
 * all and every scrollable region is a nested pane — a hijacked wheel event
 * there moves nothing, so scrolling appears completely dead.
 *
 * Two defences, because one was not enough:
 *
 * 1. ROUTES THAT MANAGE THEIR OWN SCROLLING OPT OUT ENTIRELY. On /kairi the
 *    page is pinned to the viewport and the transcript and chat list scroll
 *    independently, so there is nothing for Lenis to smooth and nothing to
 *    gain by having it in the loop. Not running it there means no amount of
 *    Lenis behaviour, in any browser, can break that page's scrolling.
 *
 * 2. EVERYWHERE ELSE, LENIS STANDS ASIDE FOR NESTED PANES. `allowNestedScroll`
 *    makes it walk the event path and bow out when the wheel is over
 *    something that can scroll in that direction — the assistant widget's
 *    message list, the mobile nav menu, the admin dropdowns. Those panes also
 *    carry `data-lenis-prevent`, which is an unconditional opt-out rather
 *    than a heuristic. Native scrolling is what they get, which is also the
 *    smoothest option available: it runs on the compositor rather than in JS.
 */
export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const selfManaged = pathname === KAIRI_PATH || pathname.startsWith(`${KAIRI_PATH}/`);

  useEffect(() => {
    if (selfManaged) return;
    // Someone who asks the OS for less motion should not get an easing
    // curve applied to every wheel tick. Native scrolling for them.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const lenis = new Lenis({
      duration: 1.0,
      lerp: 0.1, // Smooth interpolation (standard for Lenis)
      smoothWheel: true,
      allowNestedScroll: true,
    });

    // Connect Lenis to requestAnimationFrame loop, correctly updating the frame ID
    let rafId: number;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }

    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      // destroy() removes the wheel listener and the `lenis` classes it put
      // on <html>. Leaving either behind on the way into /kairi would keep
      // the hijack alive on a page that has no root scroll to hijack.
      lenis.destroy();
    };
  }, [selfManaged]);

  return <>{children}</>;
}
