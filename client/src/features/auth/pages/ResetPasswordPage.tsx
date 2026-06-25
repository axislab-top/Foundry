import React, { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Lock } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { MIN_PASSWORD_LENGTH } from "@/shared/auth/validation";
import styles from "@/features/auth/AuthPage.module.css";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { resetPassword } = useAuth();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [success, setSuccess] = useState<string | undefined>();

  const tokenMissing = useMemo(() => !token.trim(), [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setFieldErrors({});
    setSuccess(undefined);

    if (tokenMissing) {
      setError("重置链接无效，请重新申请密码重置。");
      return;
    }

    setLoading(true);
    const result = await resetPassword(token, password, confirmPassword);
    setLoading(false);

    if (!result.ok) {
      if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      if (result.message) setError(result.message);
      return;
    }

    setSuccess(result.message);
    window.setTimeout(() => navigate("/login", { replace: true }), 1800);
  };

  return (
    <div className={styles.page}>
      <div className={styles.container} style={{ minHeight: 560, width: 480, maxWidth: "100%" }}>
        <div className={styles.formContainer} style={{ position: "relative", width: "100%" }}>
          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.formInner}>
              <div className={styles.formHeader}>
                <div className={styles.brandMark} aria-hidden="true">
                  F
                </div>
                <h1 className={styles.title}>设置新密码</h1>
                <p className={styles.hint} style={{ margin: "8px 0 0" }}>
                  请输入您的新密码（至少 {MIN_PASSWORD_LENGTH} 位）
                </p>
              </div>

              {tokenMissing ? (
                <div className={styles.globalError}>重置链接无效或已过期，请重新申请。</div>
              ) : null}

              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <label className={styles.label}>新密码</label>
                </div>
                <div className={styles.inputWrap}>
                  <span className={styles.leftIcon} aria-hidden="true">
                    <Lock size={18} />
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder={`至少 ${MIN_PASSWORD_LENGTH} 位字符`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={tokenMissing || Boolean(success)}
                    className={`${styles.input} ${styles.inputWithLeftIcon} ${styles.inputWithRightIcon} ${
                      fieldErrors.password ? styles.inputError : ""
                    }`.trim()}
                  />
                  <button
                    type="button"
                    className={styles.rightIconButton}
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {fieldErrors.password ? (
                  <span className={styles.errorMessage}>{fieldErrors.password}</span>
                ) : null}
              </div>

              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <label className={styles.label}>确认新密码</label>
                </div>
                <div className={styles.inputWrap}>
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="再次输入密码"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={tokenMissing || Boolean(success)}
                    className={`${styles.input} ${fieldErrors.confirmPassword ? styles.inputError : ""}`.trim()}
                  />
                </div>
                {fieldErrors.confirmPassword ? (
                  <span className={styles.errorMessage}>{fieldErrors.confirmPassword}</span>
                ) : null}
              </div>

              {error ? <div className={styles.globalError}>{error}</div> : null}
              {success ? (
                <div
                  className={styles.globalError}
                  style={{
                    borderColor: "rgba(37,99,235,0.22)",
                    background: "rgba(37,99,235,0.06)",
                    color: "#1e40af",
                  }}
                >
                  {success}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading || tokenMissing || Boolean(success)}
                className={styles.primaryButton}
              >
                {loading ? "提交中..." : "确认重置"}
              </button>

              <p className={styles.hint} style={{ textAlign: "center", margin: 0 }}>
                <Link to="/login" className={styles.link}>
                  返回登录
                </Link>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
