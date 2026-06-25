type Props = {
  kind: "success" | "error" | "info";
  message: string;
};

export default function MemoryToast({ kind, message }: Props) {
  const cls =
    kind === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : kind === "error"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-blue-200 bg-blue-50 text-blue-700";
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${cls}`}>
      {message}
    </div>
  );
}
