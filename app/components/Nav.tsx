'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

// "Join Tracker" is elevated to the nav's primary action button; every other
// destination stays a plain link.
const LINKS = [
  { href: '/',             label: 'Home'         },
  { href: '/contributors', label: 'Contributors' },
  { href: '/repo-activity', label: 'Repo Activity'},
  { href: '/issues',       label: 'Issues'       },
  { href: '/programs',     label: 'Programs'     },
  { href: '/achievers',    label: 'Hall of Fame' },
  { href: '/get-started',  label: 'Get Started'  },
  { href: '/check-work',   label: 'Check My Work'},
];

interface Session {
  authenticated: boolean;
  user?: {
    username: string;
    name: string;
    avatarUrl: string;
  };
}

function GitHubIcon() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  );
}

// The mark is its own tile — a solid squircle with the lens cut out of it —
// so it fills the 32px footprint directly instead of sitting on a blue chip.
function LogoMark() {
  return (
    <svg
      className="w-8 h-8 text-brand-500 flex-shrink-0"
      viewBox="0 0 100 100"
      role="img"
      aria-label="Opensource Tracker"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M 34 10 H 66 A 24 24 0 0 1 90 34 V 66 A 24 24 0 0 1 66 90 H 34 A 24 24 0 0 1 10 66 V 34 A 24 24 0 0 1 34 10 Z M 58 40 m -19 0 a 19 19 0 1 0 38 0 a 19 19 0 1 0 -38 0"
      />
      <circle cx="58" cy="40" r="7" fill="currentColor" />
    </svg>
  );
}

export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Load session info on mount and when path changes
  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch('/api/auth/session');
        if (res.ok) {
          const data = await res.json();
          setSession(data);
        }
      } catch (err) {
        console.error('Failed to load session:', err);
      }
    }
    checkSession();
  }, [path]);

  // Close menus on route change
  useEffect(() => {
    setOpen(false);
    setDropdownOpen(false);
  }, [path]);

  // Close profile dropdown on click outside
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClose = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#user-profile-dropdown-container')) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClose);
    return () => document.removeEventListener('click', handleClose);
  }, [dropdownOpen]);

  // Prevent body scroll when menu open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-line bg-white/90 backdrop-blur-md">
        <div className="w-full px-4 md:px-8 flex items-center justify-between gap-4" style={{ height: 60 }}>
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <LogoMark />
            <span className="text-[15px] font-[650] tracking-[-0.01em] text-ink group-hover:text-brand-600 transition-colors whitespace-nowrap">
              Opensource Tracker
            </span>
            <span className="text-[10px] font-[650] text-brand-600 bg-brand-0 rounded-md px-1.5 py-0.5 tracking-[0.04em] hidden sm:inline">
              NST
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden lg:flex items-center gap-1 overflow-x-auto scrollbar-none flex-1 min-w-0 justify-center mx-4">
            {LINKS.map(({ href, label }) => {
              const active = href === '/' ? path === '/' : path === href || path.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-[13.5px] transition-colors ${
                    active
                      ? 'bg-brand-0 text-brand-600 font-[550]'
                      : 'text-ink-soft font-[450] hover:text-ink hover:bg-panel'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Primary action */}
            <Link
              href="/join"
              className="hidden sm:flex items-center h-9 px-4 rounded-[10px] bg-brand-500 hover:bg-brand-600 text-white text-[13.5px] font-[550] shadow-brand-btn transition-colors whitespace-nowrap"
            >
              Join the tracker
            </Link>

            {/* GitHub Session Info / Sign In */}
            {session && (
              session.authenticated && session.user ? (
                <div id="user-profile-dropdown-container" className="relative">
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex items-center gap-2 bg-white border border-line-strong hover:border-line-heavy hover:bg-panel px-2.5 py-1.5 rounded-[10px] transition-colors whitespace-nowrap shrink-0"
                  >
                    <img
                      src={session.user.avatarUrl}
                      alt={session.user.name}
                      className="w-[22px] h-[22px] rounded-full border border-line shrink-0"
                    />
                    <span className="text-ink-mid text-xs font-[500] hidden md:inline max-w-[100px] truncate">
                      @{session.user.username}
                    </span>
                    <svg className={`w-3 h-3 text-ink-faint transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {dropdownOpen && (
                    <div className="absolute right-0 mt-2 w-52 rounded-xl bg-white border border-line p-1.5 shadow-pop flex flex-col gap-0.5">
                      <div className="px-3 py-2 border-b border-line mb-1">
                        <div className="text-ink text-xs font-[650] truncate">{session.user.name}</div>
                        <div className="text-ink-soft text-[10px] truncate">@{session.user.username}</div>
                      </div>
                      <Link
                        href={`/contributors/${session.user.username}`}
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-[500] text-ink-mid hover:text-ink hover:bg-panel transition-colors"
                      >
                        <svg className="w-3.5 h-3.5 text-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Profile
                      </Link>
                      <Link
                        href={`/check-work/${session.user.username}`}
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-[500] text-ink-mid hover:text-ink hover:bg-panel transition-colors"
                      >
                        <svg className="w-3.5 h-3.5 text-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                        </svg>
                        Your Activity
                      </Link>
                      <div className="h-px bg-line my-1" />
                      <a
                        href="/api/auth/logout"
                        className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-[500] text-error-500 hover:bg-error-0 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Sign Out
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <a
                  href="/api/auth/github"
                  className="flex items-center gap-2 px-3.5 h-9 rounded-[10px] text-[13px] font-[550] bg-white border border-line-strong hover:border-line-heavy hover:bg-panel text-ink transition-colors whitespace-nowrap shrink-0"
                >
                  <GitHubIcon />
                  <span>Sign In</span>
                </a>
              )
            )}

            {/* Mobile hamburger */}
            <button
              onClick={() => setOpen((o) => !o)}
              aria-label="Toggle menu"
              className="lg:hidden w-9 h-9 flex flex-col items-center justify-center gap-1.5 rounded-lg border border-line-strong hover:bg-panel transition-colors"
            >
              <span className={`block h-[1.5px] w-4 bg-ink-mid transition-all duration-200 ${open ? 'rotate-45 translate-y-[7px]' : ''}`} />
              <span className={`block h-[1.5px] w-4 bg-ink-mid transition-all duration-200 ${open ? 'opacity-0' : ''}`} />
              <span className={`block h-[1.5px] w-4 bg-ink-mid transition-all duration-200 ${open ? '-rotate-45 -translate-y-[7px]' : ''}`} />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile slide-out menu */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={() => setOpen(false)} />
          {/* Panel */}
          <div className="absolute top-[60px] left-0 right-0 bg-white border-b border-line shadow-pop max-h-[calc(100vh-60px)] overflow-y-auto">
            <div className="flex flex-col py-2 px-2">
              {LINKS.map(({ href, label }) => {
                const active = href === '/' ? path === '/' : path === href || path.startsWith(href + '/');
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${
                      active ? 'bg-brand-0 text-brand-600 font-[550]' : 'text-ink-soft font-[450] hover:text-ink hover:bg-panel'
                    }`}
                  >
                    {label}
                    {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-500" />}
                  </Link>
                );
              })}

              <Link
                href="/join"
                className="flex items-center justify-center gap-2 mx-2 mt-2 px-4 py-3 rounded-xl text-sm font-[550] bg-brand-500 text-white shadow-brand-btn"
              >
                Join the tracker
              </Link>

              {/* Mobile GitHub Auth Link */}
              {session && (
                <div className="border-t border-line mt-3 pt-2 px-2 pb-2">
                  {session.authenticated && session.user ? (
                    <div className="flex flex-col gap-2 p-3 bg-panel border border-line rounded-xl">
                      <div className="flex items-center gap-3 pb-3 border-b border-line-strong">
                        <img
                          src={session.user.avatarUrl}
                          alt={session.user.name}
                          className="w-9 h-9 rounded-full border border-line"
                        />
                        <div>
                          <div className="text-ink text-sm font-[550]">{session.user.name}</div>
                          <div className="text-ink-soft text-xs">@{session.user.username}</div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 pt-1">
                        <Link
                          href={`/contributors/${session.user.username}`}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-[500] text-ink-mid hover:text-ink hover:bg-white transition-colors"
                        >
                          <svg className="w-3.5 h-3.5 text-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          Profile
                        </Link>
                        <Link
                          href={`/check-work/${session.user.username}`}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-[500] text-ink-mid hover:text-ink hover:bg-white transition-colors"
                        >
                          <svg className="w-3.5 h-3.5 text-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                          </svg>
                          Your Activity
                        </Link>
                        <a
                          href="/api/auth/logout"
                          className="flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-[500] text-error-500 hover:bg-error-0 transition-colors mt-1"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                          Sign Out
                        </a>
                      </div>
                    </div>
                  ) : (
                    <a
                      href="/api/auth/github"
                      className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-[550] bg-white text-ink border border-line-strong hover:bg-panel transition-colors"
                    >
                      <GitHubIcon />
                      Sign In with GitHub
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
