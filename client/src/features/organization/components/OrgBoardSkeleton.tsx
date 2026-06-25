export default function OrgBoardSkeleton() {
  return (
    <div className="flex h-full flex-col p-5">
      <div className="mx-auto mb-6 h-16 w-48 animate-pulse rounded-xl bg-gray-200" />
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-52 animate-pulse rounded-xl bg-gray-200/80" />
        ))}
      </div>
    </div>
  );
}
