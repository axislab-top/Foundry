export default function MemberChip({
  name,
  role,
  status,
  variant,
  accentColor,
  selected,
  onClick,
}: {
  name: string;
  role: string;
  status: "running" | "idle";
  variant: "director" | "employee";
  accentColor: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
        selected
          ? "border-transparent bg-white shadow-sm"
          : variant === "director"
            ? "border-amber-100 bg-amber-50/50 hover:bg-amber-50"
            : "border-gray-100 bg-gray-50/80 hover:bg-gray-50"
      }`}
      style={selected ? { boxShadow: `0 0 0 1.5px ${accentColor}` } : undefined}
    >
      <span
        className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${status === "running" ? "bg-emerald-400" : "bg-gray-300"}`}
      />
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-medium text-gray-700">{name}</span>
        <span className="block truncate text-[10px] text-gray-400">{role}</span>
      </span>
    </button>
  );
}
