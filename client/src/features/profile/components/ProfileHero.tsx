import { BadgeCheck, Mail } from "lucide-react";
import type { DecodedJwtPayload } from "@/shared/auth/decodeJwtPayload";

type ProfileHeroProps = {
  displayName: string;
  avatarLabel: string;
  roleLabel: string;
  profile: DecodedJwtPayload | null;
  companyCount: number;
  activeCompanyName?: string;
};

export default function ProfileHero({
  displayName,
  avatarLabel,
  roleLabel,
  profile,
  companyCount,
  activeCompanyName,
}: ProfileHeroProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2d5a8e] px-5 py-5">
        <p className="text-xs font-medium uppercase tracking-wide text-blue-100/80">Account Profile</p>
        <h3 className="mt-1 text-xl font-bold text-white">个人中心</h3>
      </div>

      <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1e3a5f] to-[#3b82f6] text-2xl font-bold text-white shadow-inner">
          {avatarLabel}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-xl font-bold text-gray-900">{displayName}</h4>
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
              <BadgeCheck className="h-3 w-3" />
              {roleLabel}
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{profile?.email?.trim() || "未绑定邮箱"}</span>
          </p>
          <p className="mt-2 text-xs text-gray-400">
            当前工作空间：{activeCompanyName ?? "未选择公司"} · 已加入 {companyCount} 个
          </p>
        </div>
      </div>
    </div>
  );
}
