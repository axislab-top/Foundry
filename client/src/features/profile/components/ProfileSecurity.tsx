import { KeyRound, LogOut, Shield, User } from "lucide-react";
import type { DecodedJwtPayload } from "@/shared/auth/decodeJwtPayload";

type ProfileSecurityProps = {
  profile: DecodedJwtPayload | null;
  accountTypeLabel: string;
  resetSending: boolean;
  resetMessage?: string;
  loggingOut: boolean;
  onRequestPasswordReset: () => void;
  onLogout: () => void;
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-50 py-3 last:border-b-0">
      <span className="shrink-0 text-sm text-gray-500">{label}</span>
      <span className="text-right text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
}

export default function ProfileSecurity({
  profile,
  accountTypeLabel,
  resetSending,
  resetMessage,
  loggingOut,
  onRequestPasswordReset,
  onLogout,
}: ProfileSecurityProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <User className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">账号信息</h3>
        </div>
        <p className="mb-3 text-xs text-gray-500">Account Details — 基础身份信息</p>
        <InfoRow label="用户名" value={profile?.username?.trim() || "—"} />
        <InfoRow label="邮箱" value={profile?.email?.trim() || "—"} />
        <InfoRow label="账号类型" value={accountTypeLabel} />
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <Shield className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">安全操作</h3>
        </div>
        <p className="text-xs leading-relaxed text-gray-500">
          Security — 向注册邮箱发送密码重置链接；退出后需重新登录验证身份。
        </p>
        {resetMessage ? (
          <p className="mt-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            {resetMessage}
          </p>
        ) : null}
        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={onRequestPasswordReset}
            disabled={resetSending || !profile?.email?.trim()}
            className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-gray-500" />
              {resetSending ? "发送中…" : "发送密码重置邮件"}
            </span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            disabled={loggingOut}
            className="flex w-full items-center justify-between rounded-lg border border-red-100 bg-red-50/60 px-4 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex items-center gap-2">
              <LogOut className="h-4 w-4" />
              {loggingOut ? "退出中…" : "退出登录"}
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}
