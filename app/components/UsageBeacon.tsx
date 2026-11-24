'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const VISITOR_KEY = 'ost_visitor';

/** A random id kept in this browser so a visitor is counted once a day, not
 *  once per page. It is only ever added to a HyperLogLog on the server,
 *  which cannot give it back (lib/usage.ts). */
function visitor(): { id: string | null; fresh: boolean } {
  try {
    const known = localStorage.getItem(VISITOR_KEY);
    if (known) return { id: known, fresh: false };
    const id = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, id);
    return { id, fresh: true };
  } catch {
    return { id: null, fresh: false }; // storage blocked: the server falls back
  }
}

/** Reports each page view to /api/usage. Renders nothing. */
export default function UsageBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith('/admin')) return;
    const { id, fresh } = visitor();
    const body = JSON.stringify({ p: pathname, r: document.referrer, v: id, n: fresh });
    try {
      if (!navigator.sendBeacon?.('/api/usage', body)) {
        void fetch('/api/usage', { method: 'POST', body, keepalive: true }).catch(() => {});
      }
    } catch {
      // Counting is best effort.
    }
  }, [pathname]);

  return null;
}
