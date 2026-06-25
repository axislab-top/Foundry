import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  Bot,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { redirectToWechatLogin } from "@/features/auth/api/authApi";
import * as companiesApi from "@/features/auth/api/companiesApi";
import type { CompanyListItem } from "@/features/auth/api/companiesApi";
import CompanySelectView from "@/features/auth/components/CompanySelectView";
import { useCompanyCreationQuota } from "@/features/auth/hooks/useCompanyCreationQuota";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { resolvePostAuthDestination, consumeAuthReturnTo, consumeSessionExpiredNotice } from "@/shared/auth/postAuthRedirect";
import {
  isCompanyWizardEnabled,
  isDemoRecordingEnabled,
  isRegisterEmailVerificationEnabled,
} from "@/shared/config/env";
import { MIN_PASSWORD_LENGTH, isValidEmail } from "@/shared/auth/validation";
import { useCompanyStore } from "@/shared/store/companyStore";
import styles from "./AuthPage.module.css";

type View = "login" | "register" | "company-select";

type LoginErrors = { email?: string; password?: string };
type RegisterErrors = {
  username?: string;
  email?: string;
  verificationCode?: string;
  password?: string;
};

type AuthLocationState = {
  from?: string;
  registered?: boolean;
  registeredEmail?: string;
  sessionExpired?: boolean;
};

function viewFromPath(pathname: string): View {
  if (pathname.startsWith("/register")) return "register";
  if (pathname.startsWith("/company-select")) return "company-select";
  return "login";
}

export default function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = (location.state ?? {}) as AuthLocationState;
  const [returnAfterLogin, setReturnAfterLogin] = useState<string | undefined>(
    () => locationState.from,
  );
  const postAuthFrom = returnAfterLogin;
  const userPickedCompanyRef = useRef(false);
  const { login, register, sendRegistrationVerificationCode, requestPasswordReset, sendResetPasswordCode, resetPasswordWithCode } = useAuth();
  const registerVerificationEnabled = isRegisterEmailVerificationEnabled();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const { activeCompany, setActiveCompany, clearActiveCompany } = useCompanyStore();
  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotError, setForgotError] = useState<string | undefined>();
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotStep, setForgotStep] = useState<"email" | "code" | "new-password">("email");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
  const [forgotCodeCooldown, setForgotCodeCooldown] = useState(0);
  const [forgotSuccess, setForgotSuccess] = useState<string | undefined>();
  const [registerSuccess, setRegisterSuccess] = useState(
    () => locationState.registered === true,
  );

  const [loginEmail, setLoginEmail] = useState(locationState.registeredEmail ?? "");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginErrors, setLoginErrors] = useState<LoginErrors>({});

  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regVerificationCode, setRegVerificationCode] = useState("");
  const [codeCooldown, setCodeCooldown] = useState(0);
  const [codeHint, setCodeHint] = useState<string | undefined>();
  const [sendCodeLoading, setSendCodeLoading] = useState(false);
  const [registerErrors, setRegisterErrors] = useState<RegisterErrors>({});

  const view = viewFromPath(location.pathname);

  // 移动端标签页状态：默认跟随路由
  const [mobileTab, setMobileTab] = useState<"login" | "register">(
    view === "register" ? "register" : "login",
  );

  // 路由变化时同步移动端标签
  useEffect(() => {
    if (view === "login" || view === "register") {
      setMobileTab(view);
    }
  }, [view]);

  useEffect(() => {
    if (view === "company-select" && !isDemoRecordingEnabled()) {
      userPickedCompanyRef.current = false;
    }
  }, [view]);

  useEffect(() => {
    if (!locationState.from) {
      const stashed = consumeAuthReturnTo();
      if (stashed) setReturnAfterLogin(stashed);
    }
    if (consumeSessionExpiredNotice()) {
      setError("登录状态已失效，请重新登录。登录后将回到您之前的页面。");
    }
  }, [locationState.from]);

  useEffect(() => {
    if (codeCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCodeCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [codeCooldown]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setRegisterSuccess(false);
    setLoginErrors({});
    setLoading(true);
    const result = await login(loginEmail, loginPassword, postAuthFrom);
    setLoading(false);
    if (!result.ok) {
      if (result.fieldErrors) setLoginErrors(result.fieldErrors);
      if (result.message) setError(result.message);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setRegisterSuccess(false);
    setRegisterErrors({});
    setLoading(true);
    const result = await register({
      username: regUsername,
      email: regEmail,
      password: regPassword,
      verificationCode: regVerificationCode,
    });
    setLoading(false);
    if (!result.ok) {
      if (result.fieldErrors) setRegisterErrors(result.fieldErrors);
      if (result.message) setError(result.message);
    }
  };

  const handleSendVerificationCode = async () => {
    setCodeHint(undefined);
    setRegisterErrors((prev) => ({ ...prev, verificationCode: undefined, email: undefined }));
    if (!regEmail.trim()) {
      setRegisterErrors((prev) => ({ ...prev, email: "请先填写邮箱" }));
      return;
    }
    if (!isValidEmail(regEmail)) {
      setRegisterErrors((prev) => ({ ...prev, email: "请输入有效的邮箱地址" }));
      return;
    }
    if (codeCooldown > 0) return;

    setSendCodeLoading(true);
    const result = await sendRegistrationVerificationCode(regEmail);
    setSendCodeLoading(false);
    if (!result.ok) {
      setCodeHint(undefined);
      setError(result.message);
      return;
    }
    setError(undefined);
    setCodeHint(result.message);
    setCodeCooldown(60);
  };

  const handleForgotPassword = async () => {
    setForgotError(undefined);
    setForgotSent(false);
    if (!forgotEmail.trim()) {
      setForgotError("请输入注册邮箱");
      return;
    }
    if (!isValidEmail(forgotEmail)) {
      setForgotError("请输入有效的邮箱地址");
      return;
    }
    setLoading(true);
    const result = await sendResetPasswordCode(forgotEmail);
    setLoading(false);
    if (!result.ok) {
      setForgotError(result.message);
      return;
    }
    setForgotSent(true);
    setForgotError(undefined);
    setForgotStep("code");
    setForgotCodeCooldown(60);
  };

  const handleVerifyForgotCode = async () => {
    setForgotError(undefined);
    if (!forgotCode.trim()) {
      setForgotError("请输入验证码");
      return;
    }
    if (!/^\d{6}$/.test(forgotCode.trim())) {
      setForgotError("请输入 6 位数字验证码");
      return;
    }
    setForgotStep("new-password");
  };

  const handleResetPasswordWithCode = async () => {
    setForgotError(undefined);
    setForgotSuccess(undefined);
    if (!forgotNewPassword.trim()) {
      setForgotError("请输入新密码");
      return;
    }
    if (forgotNewPassword.length < 6) {
      setForgotError("密码至少需要 6 位字符");
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotError("两次输入的密码不一致");
      return;
    }
    setLoading(true);
    const result = await resetPasswordWithCode(forgotEmail, forgotCode, forgotNewPassword, forgotConfirmPassword);
    setLoading(false);
    if (!result.ok) {
      setForgotError(result.message);
      return;
    }
    setForgotSuccess(result.message);
    window.setTimeout(() => {
      setForgotOpen(false);
      setForgotStep("email");
      setForgotEmail("");
      setForgotCode("");
      setForgotNewPassword("");
      setForgotConfirmPassword("");
      setForgotSuccess(undefined);
      navigate("/login", { replace: true });
    }, 1800);
  };

  useEffect(() => {
    if (forgotCodeCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setForgotCodeCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [forgotCodeCooldown]);

  const companiesQuery = useQuery({
    queryKey: ["my-companies"],
    queryFn: async () => {
      return await companiesApi.listMyCompanies({ page: 1, pageSize: 20 });
    },
    enabled: view === "company-select",
    staleTime: 10_000,
  });

  const quotaQuery = useCompanyCreationQuota(view === "company-select");

  useEffect(() => {
    if (view !== "company-select" || userPickedCompanyRef.current) return;

    // 演示录制：已有公司上下文时直接进应用，不等待公司列表 API
    if (isDemoRecordingEnabled()) {
      const companyId = activeCompany?.id?.trim();
      const isCompanyUuid =
        companyId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(companyId);
      if (isCompanyUuid) {
        const dest = resolvePostAuthDestination(postAuthFrom);
        if (location.pathname === dest) {
          userPickedCompanyRef.current = true;
          return;
        }
        userPickedCompanyRef.current = true;
        navigate(dest, { replace: true });
      }
      return;
    }

    if (!companiesQuery.data) return;
    const items = companiesQuery.data.items ?? [];
    if (items.length === 0) return;

    const matched = activeCompany?.id ? items.find((item) => item.id === activeCompany.id) : undefined;
    const selected = matched ?? items[0];
    if (!matched && activeCompany?.id) {
      clearActiveCompany();
    }
    const name = selected.displayName ?? selected.name ?? selected.id;
    setActiveCompany({ id: selected.id, name });
    userPickedCompanyRef.current = true;
    navigate(resolvePostAuthDestination(postAuthFrom), { replace: true });
  }, [
    view,
    companiesQuery.data,
    activeCompany?.id,
    clearActiveCompany,
    location.pathname,
    navigate,
    postAuthFrom,
    setActiveCompany,
  ]);

  const handleCompanySelect = (company: CompanyListItem) => {
    const name = company.displayName ?? company.name ?? company.id;
    userPickedCompanyRef.current = true;
    setActiveCompany({ id: company.id, name });
    navigate(resolvePostAuthDestination(postAuthFrom));
  };

  const handleMobileTabSwitch = (tab: "login" | "register") => {
    setMobileTab(tab);
    setForgotOpen(false);
    setForgotError(undefined);
    setError(undefined);
    setRegisterSuccess(false);
    navigate(tab === "register" ? "/register" : "/login", { replace: true });
  };

  if (view === "company-select") {
    return (
      <CompanySelectView
        isLoading={companiesQuery.isLoading}
        isError={companiesQuery.isError}
        companies={companiesQuery.data?.items ?? []}
        wizardEnabled={isCompanyWizardEnabled()}
        quota={quotaQuery.data}
        quotaLoading={quotaQuery.isLoading}
        onSelect={handleCompanySelect}
        onCreate={() => navigate("/company-create")}
        onRefresh={() => {
          void companiesQuery.refetch();
          void quotaQuery.refetch();
        }}
      />
    );
  }

  if (view === "login" || view === "register") {
    const containerClassName = `${styles.container} ${view === "register" ? styles.rightPanelActive : ""}`.trim();
    return (
      <div className={styles.page}>
        <div className={containerClassName}>
          {/* 移动端标签页 */}
          <div className={styles.mobileTabBar}>
            <button
              type="button"
              className={`${styles.mobileTab} ${mobileTab === "login" ? styles.mobileTabActive : ""}`}
              onClick={() => handleMobileTabSwitch("login")}
            >
              登录
            </button>
            <button
              type="button"
              className={`${styles.mobileTab} ${mobileTab === "register" ? styles.mobileTabActive : ""}`}
              onClick={() => handleMobileTabSwitch("register")}
            >
              注册
            </button>
          </div>

          <div className={`${styles.formContainer} ${styles.signUpContainer} ${mobileTab !== "register" ? styles.mobileHidden : ""}`}>
            <form className={styles.form} onSubmit={handleRegister}>
              <div className={styles.formInner}>
                <div className={styles.formHeader}>
                  <div className={styles.brandMark} aria-hidden="true">
                    F
                  </div>
                  <h1 className={styles.title}>创建新账号</h1>
                  <p className={styles.hint} style={{ margin: "8px 0 0" }}>
                    开启您的 AI 协同办公之旅
                  </p>
                </div>

                <div className={styles.field}>
                  <div className={styles.labelRow}>
                    <label className={styles.label}>用户名</label>
                  </div>
                  <div className={styles.inputWrap}>
                    <input
                      type="text"
                      autoComplete="username"
                      placeholder="您的姓名"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      className={`${styles.input} ${registerErrors.username ? styles.inputError : ""}`.trim()}
                    />
                  </div>
                  {registerErrors.username ? <span className={styles.errorMessage}>{registerErrors.username}</span> : null}
                </div>

                <div className={styles.field}>
                  <div className={styles.labelRow}>
                    <label className={styles.label}>邮箱</label>
                  </div>
                  <div className={styles.inputWrap}>
                    <span className={styles.leftIcon} aria-hidden="true">
                      <Mail size={18} />
                    </span>
                    <input
                      type="email"
                      autoComplete="email"
                      placeholder="name@company.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className={`${styles.input} ${styles.inputWithLeftIcon} ${
                        registerErrors.email ? styles.inputError : ""
                      }`.trim()}
                    />
                  </div>
                  {registerErrors.email ? <span className={styles.errorMessage}>{registerErrors.email}</span> : null}
                </div>

                {registerVerificationEnabled ? (
                  <div className={styles.field}>
                    <div className={styles.labelRow}>
                      <label className={styles.label}>邮箱验证码</label>
                    </div>
                    <div className={styles.codeInputRow}>
                      <div className={styles.inputWrap}>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          placeholder="6 位数字"
                          value={regVerificationCode}
                          onChange={(e) => setRegVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          className={`${styles.input} ${
                            registerErrors.verificationCode ? styles.inputError : ""
                          }`.trim()}
                        />
                      </div>
                      <button
                        type="button"
                        className={styles.sendCodeButton}
                        disabled={sendCodeLoading || codeCooldown > 0 || loading}
                        onClick={() => void handleSendVerificationCode()}
                      >
                        {sendCodeLoading
                          ? "发送中..."
                          : codeCooldown > 0
                            ? `${codeCooldown}s`
                            : "获取验证码"}
                      </button>
                    </div>
                    {registerErrors.verificationCode ? (
                      <span className={styles.errorMessage}>{registerErrors.verificationCode}</span>
                    ) : (
                      <p className={styles.hint} style={{ margin: "4px 0 0" }}>
                        验证码将发送至上方邮箱，10 分钟内有效
                      </p>
                    )}
                    {codeHint && !registerErrors.verificationCode ? (
                      <p className={styles.hint} style={{ margin: "4px 0 0", color: "#059669" }}>
                        {codeHint}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className={styles.field}>
                  <div className={styles.labelRow}>
                    <label className={styles.label}>密码</label>
                  </div>
                  <div className={styles.inputWrap}>
                    <span className={styles.leftIcon} aria-hidden="true">
                      <Lock size={18} />
                    </span>
                    <input
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder={`至少 ${MIN_PASSWORD_LENGTH} 位字符`}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className={`${styles.input} ${styles.inputWithLeftIcon} ${styles.inputWithRightIcon} ${
                        registerErrors.password ? styles.inputError : ""
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
                  {registerErrors.password ? <span className={styles.errorMessage}>{registerErrors.password}</span> : null}
                </div>

                {error ? <div className={styles.globalError}>{error}</div> : null}

                <button type="submit" disabled={loading} className={styles.primaryButton}>
                  {loading ? "注册中..." : "注册账号"}
                </button>

                <p className={styles.hint} style={{ textAlign: "center", margin: 0 }}>
                  已有账号？{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setForgotOpen(false);
                      setForgotError(undefined);
                      navigate("/login");
                    }}
                    className={styles.link}
                  >
                    返回登录
                  </button>
                </p>
              </div>
            </form>
          </div>

          <div className={`${styles.formContainer} ${styles.signInContainer} ${mobileTab !== "login" ? styles.mobileHidden : ""}`}>
            <form className={styles.form} onSubmit={handleLogin}>
              <div className={styles.formInner}>
                <div className={styles.formHeader}>
                  <div className={styles.brandMark} aria-hidden="true">
                    F
                  </div>
                  <h1 className={styles.title}>
                    {forgotOpen
                      ? forgotStep === "email"
                        ? "找回密码"
                        : forgotStep === "code"
                          ? "输入验证码"
                          : "设置新密码"
                      : "欢迎回来"}
                  </h1>
                  <p className={styles.hint} style={{ margin: "8px 0 0" }}>
                    {forgotOpen
                      ? forgotStep === "email"
                        ? "输入您的注册邮箱，我们将发送验证码"
                        : forgotStep === "code"
                          ? "请输入邮箱中的 6 位验证码"
                          : "请设置您的新密码（至少 6 位）"
                      : "请输入您的账号信息以访问工作空间"}
                  </p>
                </div>

                {!forgotOpen ? (
                  <>
                    {registerSuccess ? (
                      <div
                        className={styles.globalError}
                        style={{
                          borderColor: "rgba(37,99,235,0.22)",
                          background: "rgba(37,99,235,0.06)",
                          color: "#1e40af",
                        }}
                      >
                        <p style={{ margin: 0 }}>注册成功，请使用邮箱登录。</p>
                        <p style={{ margin: "6px 0 0", fontSize: 13, color: "#3b5998" }}>
                          下一步：创建您的第一家 AI 公司，三分钟完成团队搭建。
                        </p>
                        <p style={{ margin: "4px 0 0", fontSize: 11, opacity: 0.85 }}>
                          Next: set up your first AI company in about 3 minutes.
                        </p>
                      </div>
                    ) : null}

                    <div className={styles.field}>
                      <div className={styles.labelRow}>
                        <label className={styles.label}>邮箱</label>
                      </div>
                      <div className={styles.inputWrap}>
                        <span className={styles.leftIcon} aria-hidden="true">
                          <Mail size={18} />
                        </span>
                        <input
                          type="email"
                          autoComplete="email"
                          placeholder="name@company.com"
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          className={`${styles.input} ${styles.inputWithLeftIcon} ${
                            loginErrors.email ? styles.inputError : ""
                          }`.trim()}
                        />
                      </div>
                      {loginErrors.email ? <span className={styles.errorMessage}>{loginErrors.email}</span> : null}
                    </div>

                    <div className={styles.field}>
                      <div className={styles.labelRow}>
                        <label className={styles.label}>密码</label>
                        <button
                          type="button"
                          onClick={() => {
                            setForgotOpen(true);
                            setForgotError(undefined);
                            setError(undefined);
                            setForgotEmail(loginEmail);
                          }}
                          className={styles.link}
                        >
                          忘记密码？
                        </button>
                      </div>
                      <div className={styles.inputWrap}>
                        <span className={styles.leftIcon} aria-hidden="true">
                          <Lock size={18} />
                        </span>
                        <input
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          placeholder="••••••••"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          className={`${styles.input} ${styles.inputWithLeftIcon} ${styles.inputWithRightIcon} ${
                            loginErrors.password ? styles.inputError : ""
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
                      {loginErrors.password ? (
                        <span className={styles.errorMessage}>{loginErrors.password}</span>
                      ) : null}
                    </div>

                    {error ? <div className={styles.globalError}>{error}</div> : null}

                    <button type="submit" disabled={loading} className={styles.primaryButton}>
                      {loading ? "登录中..." : "登录"}
                    </button>

                    <div className={styles.divider} aria-hidden="true">
                      <span className={styles.dividerLine} />
                      <span className={styles.dividerText}>或者通过</span>
                      <span className={styles.dividerLine} />
                    </div>

                    <button
                      type="button"
                      className={styles.socialButton}
                      disabled={loading}
                      onClick={() => redirectToWechatLogin(postAuthFrom)}
                    >
                      微信登录
                    </button>

                    <p className={styles.hint} style={{ textAlign: "center", margin: 0 }}>
                      还没有账号？{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setForgotOpen(false);
                          setForgotError(undefined);
                          setRegisterSuccess(false);
                          navigate("/register");
                        }}
                        className={styles.link}
                      >
                        立即注册
                      </button>
                    </p>
                  </>
                ) : (
                  <>
                    {forgotStep === "email" && (
                      <>
                        <div className={styles.field}>
                          <div className={styles.labelRow}>
                            <label className={styles.label}>注册邮箱</label>
                          </div>
                          <div className={styles.inputWrap}>
                            <span className={styles.leftIcon} aria-hidden="true">
                              <Mail size={18} />
                            </span>
                            <input
                              type="email"
                              autoComplete="email"
                              placeholder="name@company.com"
                              value={forgotEmail}
                              onChange={(e) => setForgotEmail(e.target.value)}
                              className={`${styles.input} ${styles.inputWithLeftIcon}`.trim()}
                            />
                          </div>
                        </div>

                        {forgotError ? <div className={styles.globalError}>{forgotError}</div> : null}

                        <button
                          type="button"
                          disabled={loading}
                          className={styles.primaryButton}
                          onClick={() => void handleForgotPassword()}
                        >
                          {loading ? "发送中..." : "发送验证码"}
                        </button>
                      </>
                    )}

                    {forgotStep === "code" && (
                      <>
                        <div className={styles.field}>
                          <div className={styles.labelRow}>
                            <label className={styles.label}>验证码</label>
                          </div>
                          <div className={styles.codeInputRow}>
                            <div className={styles.inputWrap}>
                              <input
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={6}
                                placeholder="6 位数字"
                                value={forgotCode}
                                onChange={(e) => setForgotCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                className={styles.input}
                              />
                            </div>
                            <button
                              type="button"
                              className={styles.sendCodeButton}
                              disabled={forgotCodeCooldown > 0 || loading}
                              onClick={() => void handleForgotPassword()}
                            >
                              {forgotCodeCooldown > 0 ? `${forgotCodeCooldown}s` : "重新发送"}
                            </button>
                          </div>
                          <p className={styles.hint} style={{ margin: "4px 0 0" }}>
                            验证码已发送至 {forgotEmail}，10 分钟内有效
                          </p>
                        </div>

                        {forgotError ? <div className={styles.globalError}>{forgotError}</div> : null}

                        <button
                          type="button"
                          disabled={loading}
                          className={styles.primaryButton}
                          onClick={() => void handleVerifyForgotCode()}
                        >
                          下一步
                        </button>
                      </>
                    )}

                    {forgotStep === "new-password" && (
                      <>
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
                              placeholder="至少 6 位字符"
                              value={forgotNewPassword}
                              onChange={(e) => setForgotNewPassword(e.target.value)}
                              className={`${styles.input} ${styles.inputWithLeftIcon} ${styles.inputWithRightIcon}`.trim()}
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
                              value={forgotConfirmPassword}
                              onChange={(e) => setForgotConfirmPassword(e.target.value)}
                              className={styles.input}
                            />
                          </div>
                        </div>

                        {forgotError ? <div className={styles.globalError}>{forgotError}</div> : null}
                        {forgotSuccess ? (
                          <div
                            className={styles.globalError}
                            style={{
                              borderColor: "rgba(37,99,235,0.22)",
                              background: "rgba(37,99,235,0.06)",
                              color: "#1e40af",
                            }}
                          >
                            {forgotSuccess}
                          </div>
                        ) : null}

                        <button
                          type="button"
                          disabled={loading || Boolean(forgotSuccess)}
                          className={styles.primaryButton}
                          onClick={() => void handleResetPasswordWithCode()}
                        >
                          {loading ? "提交中..." : "重置密码"}
                        </button>
                      </>
                    )}

                    <p className={styles.hint} style={{ textAlign: "center", margin: 0 }}>
                      记起密码了？{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setForgotOpen(false);
                          setForgotError(undefined);
                          setForgotStep("email");
                        }}
                        className={styles.link}
                      >
                        返回登录
                      </button>
                    </p>
                  </>
                )}
              </div>
            </form>
          </div>

          <div className={styles.overlayContainer}>
            <div className={styles.overlay}>
              <div className={`${styles.overlayPanel} ${styles.overlayLeft}`}>
                <div style={{ position: "relative", width: "100%", height: "100%" }}>
                  <div className={styles.overlayDecor1} aria-hidden="true" />
                  <div className={styles.overlayDecor2} aria-hidden="true" />
                  <h2 className={styles.overlayHeading}>
                    构建您的
                    <br />
                    专属 AI 组织
                  </h2>
                  <p className={styles.overlayText}>
                    从零搭建您的数字团队，让专业 Agent 协同运转，助您高效运营一人公司。
                  </p>
                  <div className={styles.overlayBadge}>
                    <Bot size={18} style={{ color: "rgba(219,234,254,0.95)" }} />
                    <span>200+ 专业领域 Agent 随时为您提供服务</span>
                  </div>
                  <div style={{ marginTop: 24 }}>
                    <button className={styles.ghostButton} type="button" onClick={() => navigate("/login")}>
                      返回登录
                    </button>
                  </div>
                </div>
              </div>
              <div className={`${styles.overlayPanel} ${styles.overlayRight}`}>
                <div style={{ position: "relative", width: "100%", height: "100%" }}>
                  <div className={styles.overlayDecor1} aria-hidden="true" />
                  <div className={styles.overlayDecor2} aria-hidden="true" />
                  <h2 className={styles.overlayHeading}>
                    嘿，朋友！
                    <br />
                    加入我们的旅程
                  </h2>
                  <p className={styles.overlayText}>点击这里输入您的个人详细信息并开始我们的旅程。</p>
                  <div style={{ marginTop: 24 }}>
                    <button className={styles.ghostButton} type="button" onClick={() => navigate("/register")}>
                      立即注册
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    );
  }

  return null;
}

