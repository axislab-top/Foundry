import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle } from "lucide-react";

const ERROR_MESSAGES: Record<string, string> = {
  wechat_login_failed: "微信登录失败，请重试或使用邮箱登录。",
  access_denied: "您已取消授权。",
  invalid_callback: "登录回调无效，请重新登录。",
};

export default function AuthErrorPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const message = useMemo(() => {
    const code = searchParams.get("error") ?? "unknown";
    return ERROR_MESSAGES[code] ?? `登录遇到问题（${code}），请重试。`;
  }, [searchParams]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#020202] px-6 text-center">
      <div className="mb-4 inline-flex rounded-full border border-red-500/20 bg-red-500/10 p-4">
        <AlertCircle size={40} className="text-red-400" />
      </div>
      <h1 className="mb-2 text-xl font-medium text-white">登录失败</h1>
      <p className="mb-8 max-w-md text-sm leading-relaxed text-gray-400">{message}</p>
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
