export default function MemoryLoadingSkeleton() {
  return (
    <div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="animate-pulse border-b border-gray-100 px-4 py-3">
          <div className="flex justify-between gap-2">
            <div className="h-3.5 w-2/3 rounded bg-gray-100" />
            <div className="h-3 w-10 shrink-0 rounded bg-gray-50" />
          </div>
          <div className="mt-2 h-3 w-full rounded bg-gray-50" />
          <div className="mt-1 h-3 w-4/5 rounded bg-gray-50" />
          <div className="mt-2 h-4 w-14 rounded-full bg-gray-50" />
        </div>
      ))}
    </div>
  );
}
