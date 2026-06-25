import { CircleDollarSign } from "lucide-react";

export default function CostsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <CircleDollarSign className="mb-3 h-10 w-10 text-gray-300" />
      <p className="text-sm font-medium text-gray-700">暂无 AI 成本数据</p>
      <p className="mt-1 max-w-sm text-xs text-gray-500">
        当 Agent 产生 LLM 或 Skill 消费后，将在此按「每个 Agent 每天一条」展示用量明细。
      </p>
    </div>
  );
}
