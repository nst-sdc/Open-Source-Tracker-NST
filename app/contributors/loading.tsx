export default function ContributorsLoading() {
  return (
    <main className="min-h-screen bg-panel">
      {/* Contest hero skeleton */}
      <div className="bg-gradient-to-br from-violet-700 via-violet-800 to-violet-900 contest-grid">
        <div className="max-w-6xl mx-auto px-4 md:px-6 pt-8 pb-24">
          <div className="flex items-center justify-between">
            <div className="h-9 w-36 bg-panel-2 rounded-full animate-pulse" />
            <div className="h-10 w-32 bg-panel-2 rounded-[10px] animate-pulse" />
          </div>
          <div className="flex flex-col items-center mt-6 gap-3">
            <div className="h-4 w-48 bg-panel-2 rounded-full animate-pulse" />
            <div className="h-11 w-72 bg-panel-2 rounded-xl animate-pulse" />
          </div>
          <div className="flex items-start justify-center gap-12 md:gap-16 mt-8">
            {[72, 96, 72].map((size, i) => (
              <div key={i} className={`flex flex-col items-center gap-3 ${size === 72 ? 'pt-7' : ''}`}>
                <div className="rounded-full bg-panel-2 animate-pulse" style={{ width: size, height: size }} />
                <div className="h-3.5 w-24 bg-panel-2 rounded animate-pulse" />
                <div className="h-6 w-24 bg-panel-2 rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA band skeleton */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 -mt-12">
        <div className="h-[86px] bg-gradient-to-br from-violet-600 to-violet-700 rounded-2xl shadow-violet-band animate-pulse" />
      </div>

      {/* Summary strip skeleton */}
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

      {/* Table skeleton */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 mt-6 pb-20">
        <div className="bg-ground border border-line rounded-2xl shadow-card overflow-hidden">
          <div className="h-11 bg-panel" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3 border-t border-panel">
              <div className="h-7 w-10 bg-panel rounded-full animate-pulse" />
              <div className="w-[38px] h-[38px] rounded-full bg-panel animate-pulse shrink-0" />
              <div className="flex-1">
                <div className="h-3.5 w-36 bg-panel rounded animate-pulse" />
                <div className="h-3 w-24 bg-panel rounded animate-pulse mt-1.5" />
              </div>
              <div className="h-4 w-10 bg-panel rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
