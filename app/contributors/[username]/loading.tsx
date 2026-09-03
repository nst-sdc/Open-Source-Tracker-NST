/**
 * Placeholder shown while a profile is fetched. It is deliberately a tracing of
 * the real page — same widths, same card rhythm, same light ground — so the
 * swap to real content doesn't move anything. It was previously left over from
 * the old dark theme, which meant every visit to a profile flashed a near-black
 * screen before the white page arrived.
 */
function Bar({ className }: { className: string }) {
  return <div className={`bg-panel-2 rounded ${className}`} />;
}

export default function ContributorLoading() {
  return (
    <main className="min-h-screen bg-panel animate-pulse">
      <div className="max-w-4xl mx-auto px-4 md:px-6 pt-7">
        <Bar className="h-4 w-28 rounded-full" />
      </div>

      {/* Identity card */}
      <div className="max-w-4xl mx-auto px-4 md:px-6 pt-4">
        <div className="bg-ground border border-line rounded-2xl shadow-card p-6 md:p-7">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <div className="w-24 h-24 rounded-full bg-panel-2 shrink-0" />
            <div className="flex-1 w-full text-center sm:text-left">
              <Bar className="h-7 w-44 mx-auto sm:mx-0" />
              <Bar className="h-4 w-56 mt-2.5 mx-auto sm:mx-0" />
              <Bar className="h-4 w-72 max-w-full mt-3.5 mx-auto sm:mx-0" />
              <div className="flex flex-wrap gap-1.5 mt-4 justify-center sm:justify-start">
                {['w-20', 'w-24', 'w-28', 'w-24'].map((w, i) => (
                  <Bar key={i} className={`h-6 rounded-full ${w}`} />
                ))}
              </div>
              <Bar className="h-9 w-64 max-w-full mt-5 rounded-[11px] mx-auto sm:mx-0" />
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-ground border border-line rounded-2xl shadow-card px-4 pt-4 pb-3.5">
              <Bar className="h-7 w-12 mx-auto" />
              <Bar className="h-3 w-14 mx-auto mt-2.5" />
            </div>
          ))}
        </div>

        {/* Contribution history */}
        <div className="bg-ground border border-line rounded-2xl shadow-card p-5 mt-4">
          <div className="flex items-center justify-between">
            <Bar className="h-4 w-36" />
            <Bar className="h-3 w-52 max-w-[45%]" />
          </div>
          <Bar className="h-3 w-56 max-w-full mt-3.5" />
          <Bar className="h-[152px] w-full mt-3 rounded-lg" />
        </div>
      </div>

      {/* Pull request list */}
      <div className="max-w-4xl mx-auto px-4 md:px-6 mt-6 pb-20 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-ground border border-line rounded-xl shadow-card p-4 flex gap-4">
            <Bar className="h-6 w-20 rounded-full shrink-0" />
            <div className="flex-1">
              <Bar className="h-4 w-3/4" />
              <Bar className="h-3 w-24 mt-2.5" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
