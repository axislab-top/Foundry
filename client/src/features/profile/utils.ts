import type { DecodedJwtPayload } from "@/shared/auth/decodeJwtPayload";

export function resolveDisplayName(profile: DecodedJwtPayload | null) {
  return profile?.username?.trim() || profile?.email?.split("@")[0] || "用户";
}

export function resolveAvatarLabel(displayName: string) {
  return displayName.charAt(0).toUpperCase() || "U";
}

export function resolveRoleLabel(profile: DecodedJwtPayload | null) {
  if (profile?.roles?.length) return profile.roles.join("、");
  return "成员";
}

export function resolveAccountTypeLabel(profile: DecodedJwtPayload | null) {
  return profile?.authType === "admin" ? "管理员" : "普通用户";
}

export function formatDateTime(epochMs: number | undefined) {
  if (!epochMs) return "—";
  return new Date(epochMs).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function resolveCompanyName(item: { displayName?: string; name?: string; id: string }) {
  return item.displayName?.trim() || item.name?.trim() || `Company ${item.id}`;
}
