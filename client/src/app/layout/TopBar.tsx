import { Link, useLocation } from "react-router-dom";
import { ChevronRight, User } from "lucide-react";
import { useMemo } from "react";
import { useAuthStore } from "@/shared/store/authStore";
import { decodeJwtPayload } from "@/shared/auth/decodeJwtPayload";
import { resolveAvatarLabel, resolveDisplayName } from "@/features/profile/utils";
import MobileDrawer from "@/app/layout/MobileDrawer";

export default function TopBar() {
  const location = useLocation();
  const accessToken = useAuthStore((s) => s.accessToken);
  const isProfileActive = location.pathname === "/profile";

  const profile = useMemo(() => decodeJwtPayload(accessToken), [accessToken]);
  const displayName = resolveDisplayName(profile);
  const avatarLabel = resolveAvatarLabel(displayName);

  return (
    <header className="flex h-14 items-center justify-between bg-white px-4 md:h-[79px] md:border-b md:border-gray-100 md:px-6">
      <div className="flex items-center gap-2">
        <MobileDrawer />
        <h1 className="text-sm font-semibold text-gray-900">工作空间</h1>
      </div>
      <Link
        to="/profile"
        aria-current={isProfileActive ? "page" : undefined}
        className={`group flex items-center gap-2.5 rounded-full border px-3 py-1.5 transition-colors ${
          isProfileActive
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
        }`}
      >
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ${
            isProfileActive ? "bg-blue-600" : "bg-gray-700 group-hover:bg-blue-600"
          }`}
        >
          {avatarLabel}
        </span>
        <div className="hidden min-w-0 sm:block">
          <span className="block truncate text-sm font-medium">{displayName}</span>
          <span className="block text-[11px] text-gray-400">个人中心</span>
        </div>
        <User className={`h-3.5 w-3.5 sm:hidden ${isProfileActive ? "text-blue-600" : "text-gray-400 group-hover:text-gray-600"}`} />
        <ChevronRight className={`hidden h-3.5 w-3.5 sm:block ${isProfileActive ? "text-blue-500" : "text-gray-300 group-hover:text-gray-400"}`} />
      </Link>
    </header>
  );
}
