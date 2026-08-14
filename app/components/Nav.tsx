'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';


const LINKS = [
  { href: '/',             label: 'Home'         },
  { href: '/contributors', label: 'Contributors' },
  { href: '/join',         label: 'Join Tracker' },
  { href: '/check-work',   label: 'Check My Work'},
  { href: '/repo-activity', label: 'Repo Activity'},
  { href: '/achievers',    label: 'Hall of Fame' },
  { href: '/programs',     label: 'Programs'     },
  { href: '/get-started',  label: 'Get Started'  },
  { href: '/issues',       label: 'Issues'       },
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
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#030712]/90 backdrop-blur-md">
        <div className="w-full px-6 md:px-8 flex items-center justify-between gap-4" style={{ height: 52 }}>
          {/* Logo */}
          <Link href="/" className="text-sm font-semibold text-white/80 hover:text-white transition-colors shrink-0">
            Opensource Tracker{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
              NST
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-0.5 overflow-x-auto scrollbar-none flex-1 min-w-0 justify-center mx-4">
            {LINKS.map(({ href, label }) => {
              const active = href === '/' ? path === '/' : path === href || path.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-sm transition-all ${
                    active
                      ? 'bg-white/[0.07] text-white'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            {/* GitHub Session Info / Sign In */}
            {session && (
              session.authenticated && session.user ? (
                <div id="user-profile-dropdown-container" className="relative">
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12] px-2.5 py-1.5 rounded-xl transition-all whitespace-nowrap shrink-0"
                  >
                    <img
                      src={session.user.avatarUrl}
                      alt={session.user.name}
                      className="w-5.5 h-5.5 rounded-full border border-white/15 shrink-0"
                    />
                    <span className="text-white/70 text-xs hidden md:inline max-w-[100px] truncate">
                      @{session.user.username}
                    </span>
                    <svg className={`w-3 h-3 text-white/40 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {dropdownOpen && (
                    <div className="absolute right-0 mt-2 w-52 rounded-xl bg-[#0f172a] border border-white/[0.08] p-1.5 shadow-xl shadow-black/80 flex flex-col gap-0.5 animate-in fade-in slide-in-from-top-2 duration-150">
                      <div className="px-3 py-2 border-b border-white/[0.06] mb-1">
                        <div className="text-white text-xs font-semibold truncate">{session.user.name}</div>
                        <div className="text-white/40 text-[10px] truncate">@{session.user.username}</div>
                      </div>
                      <Link
                        href={`/contributors/${session.user.username}`}
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-white/70 hover:text-white hover:bg-white/[0.05] transition-all"
                      >
                        <svg className="w-3.5 h-3.5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Profile
                      </Link>
                      <Link
                        href={`/check-work/${session.user.username}`}
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-white/70 hover:text-white hover:bg-white/[0.05] transition-all"
                      >
                        <svg className="w-3.5 h-3.5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                        </svg>
                        Your Activity
                      </Link>
                      <div className="h-px bg-white/[0.06] my-1" />
                      <a
                        href="/api/auth/logout"
                        className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-all"
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
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.08] hover:border-white/[0.15] text-white/90 transition-all shadow-md shadow-black/10 whitespace-nowrap shrink-0"
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
              className="md:hidden w-8 h-8 flex flex-col items-center justify-center gap-1.5 rounded-lg hover:bg-white/[0.05] transition-all"
            >
              <span className={`block h-px w-4 bg-white/50 transition-all duration-200 ${open ? 'rotate-45 translate-y-[7px]' : ''}`} />
              <span className={`block h-px w-4 bg-white/50 transition-all duration-200 ${open ? 'opacity-0' : ''}`} />
              <span className={`block h-px w-4 bg-white/50 transition-all duration-200 ${open ? '-rotate-45 -translate-y-[7px]' : ''}`} />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile slide-out menu */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          {/* Panel */}
          <div className="absolute top-[52px] left-0 right-0 bg-[#030712] border-b border-white/[0.08] shadow-2xl shadow-black/40">
            <div className="flex flex-col py-2 px-2">
              {LINKS.map(({ href, label }) => {
                const active = href === '/' ? path === '/' : path === href || path.startsWith(href + '/');
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all ${
                      active ? 'bg-white/[0.07] text-white font-medium' : 'text-white/50 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    {label}
                    {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-400" />}
                  </Link>
                );
              })}

              {/* Mobile GitHub Auth Link */}
              {session && (
                <div className="border-t border-white/[0.08] mt-2 pt-2 px-2 pb-2">
                  {session.authenticated && session.user ? (
                    <div className="flex flex-col gap-2 p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                      <div className="flex items-center gap-3 pb-3 border-b border-white/[0.06]">
                        <img
                          src={session.user.avatarUrl}
                          alt={session.user.name}
                          className="w-8.5 h-8.5 rounded-full border border-white/10"
                        />
                        <div>
                          <div className="text-white text-sm font-medium">{session.user.name}</div>
                          <div className="text-white/40 text-xs">@{session.user.username}</div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 pt-1">
                        <Link
                          href={`/contributors/${session.user.username}`}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-2 px-2 py-2 rounded-lg text-xs text-white/70 hover:text-white hover:bg-white/[0.04] transition-all"
                        >
                          <svg className="w-3.5 h-3.5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          Profile
                        </Link>
                        <Link
                          href={`/check-work/${session.user.username}`}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-2 px-2 py-2 rounded-lg text-xs text-white/70 hover:text-white hover:bg-white/[0.04] transition-all"
                        >
                          <svg className="w-3.5 h-3.5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                          </svg>
                          Your Activity
                        </Link>
                        <a
                          href="/api/auth/logout"
                          className="flex items-center gap-2 px-2 py-2 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-all mt-1"
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
                      className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-white/5 text-white/80 border border-white/10 hover:bg-white/10 hover:text-white transition-all"
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
