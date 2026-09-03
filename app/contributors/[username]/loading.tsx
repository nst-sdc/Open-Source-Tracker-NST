export default function ContributorLoading() {
  return (
    <main className="min-h-screen bg-panel">
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <div className="h-4 w-28 bg-panel-2 rounded-full animate-pulse" />
      </div>

      <div className="max-w-4xl mx-auto px-4 pt-8 pb-10">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div className="w-28 h-28 rounded-full bg-panel-2 flex-shrink-0 animate-pulse" />
          <div className="flex-1 pt-0.5 text-center sm:text-left">
            <div className="h-8 w-48 bg-panel-2 rounded-lg mb-2 mx-auto sm:mx-0 animate-pulse" />
            <div className="h-4 w-28 bg-panel-2 rounded mx-auto sm:mx-0 animate-pulse" />
            <div className="h-4 w-72 bg-panel-2 rounded mt-3 mx-auto sm:mx-0 animate-pulse" />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-panel border border-line rounded-xl p-4 animate-pulse">
              <div className="h-8 w-8 bg-panel-2 rounded mx-auto mb-2" />
              <div className="h-3 w-12 bg-panel-2 rounded mx-auto" />
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 pb-24 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-panel border border-line rounded-xl p-4 flex gap-4 animate-pulse"
          >
            <div className="h-6 w-16 bg-panel-2 rounded-full flex-shrink-0" />
            <div className="flex-1">
              <div className="h-4 w-3/4 bg-panel-2 rounded mb-2" />
              <div className="h-3 w-24 bg-panel-2 rounded" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
