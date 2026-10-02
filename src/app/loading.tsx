export default function Loading() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading">
      <div className="space-y-3">
        <div className="skeleton h-5 w-40" />
        <div className="skeleton h-11 w-80 max-w-full" />
        <div className="skeleton h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-12">
        <div className="skeleton col-span-2 h-36 lg:col-span-5" />
        <div className="skeleton h-36 lg:col-span-3" />
        <div className="skeleton h-36 lg:col-span-2" />
        <div className="skeleton h-36 lg:col-span-2" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="skeleton h-44 lg:col-span-2" />
        <div className="skeleton h-44" />
      </div>
      <div className="skeleton h-72" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
