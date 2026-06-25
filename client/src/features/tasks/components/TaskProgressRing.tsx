export default function TaskProgressRing({ value, size = 32 }: { value: number; size?: number }) {
  const safeSize = typeof size === "number" && Number.isFinite(size) ? size : 32;
  const safeValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const pct = Math.max(0, Math.min(100, safeValue));
  const r = (safeSize - 4) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;
  const color =
    pct >= 100 ? "#10b981" : pct >= 60 ? "#0ea5e9" : pct >= 30 ? "#f59e0b" : "#94a3b8";

  return (
    <svg width={safeSize} height={safeSize} className="-rotate-90">
      <circle
        cx={safeSize / 2}
        cy={safeSize / 2}
        r={r}
        stroke="#e5e7eb"
        strokeWidth={3}
        fill="none"
      />
      {pct > 0 && (
        <circle
          cx={safeSize / 2}
          cy={safeSize / 2}
          r={r}
          stroke={color}
          strokeWidth={3}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      )}
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        className="rotate-90 origin-center fill-gray-700"
        style={{ fontSize: safeSize < 30 ? "9px" : "10px", fontWeight: 600 }}
      >
        {pct}
      </text>
    </svg>
  );
}
