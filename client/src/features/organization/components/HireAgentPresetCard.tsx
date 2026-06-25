import { Bot, Check, Star } from "lucide-react";
import type { MarketplaceAgentPreset } from "@/features/organization/types/api";
import {
  getAgentCategoryLabel,
  getDepartmentRelevanceLabel,
  getDisplayCategory,
  getPresetPalette,
  getPriceLabel,
} from "@/features/marketplace/utils/viewModel";

export default function HireAgentPresetCard({
  preset,
  selected,
  relevanceScore,
  isDirector,
  disabled,
  onSelect,
}: {
  preset: MarketplaceAgentPreset;
  selected: boolean;
  relevanceScore: number;
  isDirector: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  const palette = getPresetPalette(preset);
  const displayCategory = getDisplayCategory(preset);
  const priceLabel = getPriceLabel(preset);
  const relevanceLabel = getDepartmentRelevanceLabel(relevanceScore);
  const tags =
    preset.skillTags.length > 0 ? preset.skillTags : preset.departmentRoles;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`w-full rounded-xl border p-3.5 text-left transition-colors disabled:opacity-50 ${
        selected
          ? isDirector
            ? "border-amber-300 bg-amber-50/50 ring-1 ring-amber-200"
            : "border-[#1e3a5f]/30 bg-blue-50/40 ring-1 ring-[#1e3a5f]/20"
          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/80"
      }`}
    >
      <div className="flex items-start gap-3">
        {preset.iconUrl ? (
          <img
            src={preset.iconUrl}
            alt=""
            className="h-11 w-11 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: palette.color }}
          >
            <Bot className="h-5 w-5" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-semibold text-gray-900">{preset.name}</h4>
                {preset.rating != null ? (
                  <span className="flex items-center gap-0.5 text-[11px] text-amber-500">
                    <Star className="h-3 w-3 fill-amber-400" />
                    {preset.rating.toFixed(1)}
                  </span>
                ) : null}
              </div>
              {preset.expertise ? (
                <p className="mt-0.5 text-xs text-gray-600">{preset.expertise}</p>
              ) : null}
            </div>
            {selected ? (
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  isDirector ? "bg-amber-100 text-amber-800" : "bg-[#1e3a5f] text-white"
                }`}
              >
                <Check className="h-3 w-3" />
                已选
              </span>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
              {displayCategory}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                isDirector ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"
              }`}
            >
              {getAgentCategoryLabel(preset.agentCategory)}
            </span>
            {relevanceLabel ? (
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
                {relevanceLabel}
              </span>
            ) : null}
          </div>

          <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-gray-500">
            {preset.description ?? preset.expertise ?? "暂无描述"}
          </p>

          {tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.slice(0, 5).map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-500"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-400">
            <span className="text-gray-500">{preset.boundModelName ?? "默认模型"}</span>
            <span>·</span>
            <span>{preset.usageCount.toLocaleString()} 次使用</span>
            {priceLabel ? (
              <>
                <span>·</span>
                <span className="font-medium text-gray-600">{priceLabel}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}
