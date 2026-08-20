import { redirect } from 'next/navigation';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminEntryPage() {
  const [user, isAdmin] = await Promise.all([getSessionUser(), checkAdminAuth()]);

  if (isAdmin) {
    redirect('/admin/dashboard');
  }

  return (
    <main className="min-h-screen bg-[#030712] flex items-center justify-center px-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-purple-600/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-8 backdrop-blur-sm shadow-2xl shadow-black/40 text-center">
          <div className="flex items-center justify-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/30 to-blue-500/20 border border-purple-500/30 flex items-center justify-center">
              <svg className="w-7 h-7 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-white mb-1">Admin Access</h1>

          {user ? (
            <>
              <p className="text-white/40 text-sm mb-1">
                Signed in as <span className="text-white/70 font-medium">@{user.username}</span>
              </p>
              <p className="text-white/35 text-sm">
                This account isn&apos;t on the admin list. Ask an existing admin to add you from the
                dashboard&apos;s Admins tab.
              </p>
            </>
          ) : (
            <>
              <p className="text-white/35 text-sm mb-8">
                Admin access is tied to your GitHub account. Sign in first — if that account is on the
                admin list, you&apos;ll land straight in the dashboard.
              </p>
              <a
                href="/api/auth/github"
                className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-purple-900/30 hover:shadow-purple-900/50 hover:-translate-y-0.5"
              >
                Sign in with GitHub
              </a>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
