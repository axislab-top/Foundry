import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Fingerprint, Loader2 } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/useAuth";

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { completeOAuthLogin, hydrated } = useAuth();
  const [error, setError] = useState<string | undefined>();

  const tokens = useMemo(() => {
    const accessToken = searchParams.get("access_token") ?? searchParams.get("accessToken");
    const refreshToken = searchParams.get("refresh_token") ?? searchParams.get("refreshToken");
    if (!accessToken?.trim() || !refreshToken?.trim()) return null;
    const expiresInRaw = searchParams.get("expires_in") ?? searchParams.get("expiresIn");
    const expiresIn = expiresInRaw ? Number.parseInt(expiresInRaw, 10) : undefined;
    return {
      accessToken: accessToken.trim(),
      refreshToken: refreshToken.trim(),
      expiresIn: Number.isFinite(expiresIn) ? expiresIn : undefined,
    };
  }, [searchParams]);

  const from = searchParams.get("state") ?? undefined;

  useEffect(() => {
    if (!hydrated) return;
    if (!tokens) {
      setError("登录回调缺少有效令牌，请重新登录。");
      return;
    }
    completeOAuthLogin(tokens, from);
  }, [completeOAuthLogin, from, hydrated, tokens]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#020202] px-6 text-center text-gray-300">
        <p className="mb-6 text-sm text-red-300">{error}</p>
        <button
          type="button"
          onClick={() => navigate("/login", { replace: true })}
          className="rounded-xl bg-cyan-500 px-6 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400"
        >
          返回登录
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#020202] px-6 text-center text-gray-300">
      <div className="mb-4 inline-flex rounded-full border border-cyan-500/20 bg-cyan-500/10 p-4">
        <Fingerprint size={40} className="text-cyan-400" />
      </div>
      <Loader2 className="mb-3 h-6 w-6 animate-spin text-cyan-400" />
      <p className="text-sm text-gray-400">正在完成登录…</p>
    </div>
  );
}
