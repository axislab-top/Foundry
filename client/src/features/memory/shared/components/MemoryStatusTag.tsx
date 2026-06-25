type Props = {
  status: "active" | "archived";
};

export default function MemoryStatusTag({ status }: Props) {
  if (status === "archived") {
    return (
      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
        已归档
      </span>
    );
  }
  return (
    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
      生效中
    </span>
  );
}
