import type { MarketplaceAgentPreset } from "@/features/organization/types/api";

const SIZE_CLASS = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
} as const;

export default function MarketplaceAgentAvatar({
  preset,
  size = "md",
}: {
  preset: MarketplaceAgentPreset;
  size?: keyof typeof SIZE_CLASS;
}) {
  const dim = SIZE_CLASS[size];
  const initials = preset.name.trim().charAt(0).toUpperCase() || "A";

  if (preset.iconUrl) {
    return <img src={preset.iconUrl} alt="" className={`${dim} shrink-0 rounded-lg object-cover`} />;
  }

  return (
    <div
      className={`flex ${dim} shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-[#f8f9fa] font-semibold text-[#1e3a5f]`}
    >
      {initials}
    </div>
  );
}
