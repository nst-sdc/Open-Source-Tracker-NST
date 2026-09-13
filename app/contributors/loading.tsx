/**
 * Placeholder for /contributors while the leaderboard loads.
 *
 * It traces the live page at every width, so nothing moves when the real
 * content arrives. The previous version was left over from the old violet
 * contest design: it flashed a purple hero the page no longer has, and its
 * podium row was three fixed 96px columns with wide gaps and no way to wrap,
 * which made it 384px wide and scrolled the whole page sideways on phones.
 */
export default function ContributorsLoading() {
  return (
    <main className="min-h-screen bg-panel pb-20">
      {/* Hero */}
      <div className="bg-ground border-b border-line">
        <div className="max-w-6xl mx-auto px-4 md:px-6 pt-8 pb-12">
          <div className="flex items-center justify-between gap-3">
            <div className="h-9 w-32 max-w-[45%] bg-panel-2 rounded-full animate-pulse" />
            <div className="h-9 w-40 max-w-[45%] bg-panel-2 rounded-[9px] animate-pulse" />
          </div>
          <div className="flex flex-col items-center gap-3 mt-6 mb-10">
            <div className="h-6 w-56 max-w-full bg-panel-2 rounded-full animate-pulse" />
            <div className="h-11 w-80 max-w-full bg-panel-2 rounded-xl animate-pulse" />
            <div className="h-4 w-96 max-w-full bg-panel-2 rounded animate-pulse" />
          </div>

          {/* Podium: stacked on phones, three across from md, like the real one */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6 max-w-4xl mx-auto items-end pt-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="bg-ground border border-line rounded-2xl shadow-card p-5 flex flex-col items-center"
              >
                <div className="h-6 w-24 bg-panel-2 rounded-full animate-pulse" />
                <div className="mt-4 w-[72px] h-[72px] rounded-full bg-panel-2 animate-pulse" />
                <div className="mt-3.5 h-4 w-32 max-w-full bg-panel-2 rounded animate-pulse" />
                <div className="mt-2 h-3 w-24 max-w-full bg-panel-2 rounded animate-pulse" />
                <div className="mt-4 pt-3.5 border-t border-line w-full grid grid-cols-2 gap-2">
                  <div className="h-8 bg-panel-2 rounded animate-pulse" />
                  <div className="h-8 bg-panel-2 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA band */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 mt-6">
        <div className="h-[86px] bg-ground border border-line rounded-2xl shadow-card animate-pulse" />
      </div>

      {/* Summary strip */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 mt-6">
        <div className="bg-ground border border-line rounded-2xl shadow-card grid grid-cols-2 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`px-5 py-4 ${i > 0 ? 'md:border-l md:border-line' : ''}`}>
              <div className="h-6 w-14 bg-panel rounded animate-pulse" />
              <div className="h-3 w-20 bg-panel rounded animate-pulse mt-2" />
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 mt-6">
        <div className="bg-ground border border-line rounded-2xl shadow-card overflow-hidden">
          <div className="h-11 bg-panel" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 md:gap-4 px-3 md:px-5 py-3 border-t border-panel">
              <div className="h-7 w-10 bg-panel rounded-full animate-pulse shrink-0" />
              <div className="w-8 h-8 md:w-[38px] md:h-[38px] rounded-full bg-panel animate-pulse shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="h-3.5 w-36 max-w-full bg-panel rounded animate-pulse" />
                <div className="h-3 w-24 max-w-full bg-panel rounded animate-pulse mt-1.5" />
              </div>
              <div className="h-4 w-10 bg-panel rounded animate-pulse shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
