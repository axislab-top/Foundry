type Props = {
  warnings: string[];
};

export default function LoadWarningsBanner({ warnings }: Props) {
  if (warnings.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-[#f8f9fa] px-4 py-3">
      <p className="text-xs font-medium text-gray-700">部分数据未能加载</p>
      <ul className="mt-1 space-y-0.5 text-[11px] text-gray-500">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}
