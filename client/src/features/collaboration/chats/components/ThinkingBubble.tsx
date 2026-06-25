import { motion } from "framer-motion";

export type ThinkingSenderProfile = {
  name: string;
  avatarText: string;
  avatarClass: string;
  roleLabel?: string;
};

const CEO_LAYER_LABEL: Record<string, string> = {
  L1: "战略层",
  L2: "协调层",
  L3: "监控层",
};

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block h-1 w-1 rounded-full bg-gray-400"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}

export default function ThinkingBubble({
  sender,
  ceoLayer,
  isSlow,
}: {
  sender: ThinkingSenderProfile;
  ceoLayer?: string;
  isSlow?: boolean;
}) {
  const layerLabel = ceoLayer ? CEO_LAYER_LABEL[ceoLayer] ?? ceoLayer : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.2 }}
      className="flex items-start gap-2.5"
    >
      <div
        className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold shadow-sm ${sender.avatarClass}`}
      >
        {sender.avatarText}
      </div>
      <div className="flex min-w-0 max-w-[80%] flex-col">
        <div className="mb-1 flex items-center gap-1.5">
          {layerLabel ? (
            <span className="rounded bg-indigo-50 px-1.5 py-px text-[9px] font-medium text-indigo-600">
              {layerLabel}
            </span>
          ) : sender.roleLabel ? (
            <span className="rounded bg-gray-100 px-1.5 py-px text-[9px] font-medium text-gray-500">
              {sender.roleLabel}
            </span>
          ) : null}
          <span className="text-[11px] font-medium text-gray-500">{sender.name}</span>
        </div>
        <div className="rounded-2xl rounded-tl-md border border-gray-100 bg-gray-50 px-3.5 py-2.5 shadow-sm">
          <div className="flex items-center gap-1.5 text-[12px] text-gray-500">
            <ThinkingDots />
            <span>{isSlow ? "响应较慢，请稍候…" : "正在思考…"}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
