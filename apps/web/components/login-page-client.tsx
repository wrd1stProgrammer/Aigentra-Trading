"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { type FormEvent, useState } from "react";
import { ArrowLeft, Eye, EyeSlash, GoogleLogo, ShieldCheck } from "@phosphor-icons/react";
import { useAppContext } from "@/components/app-provider";
import { safeInternalPath } from "@/lib/safe-redirect";

type LoginPageClientProps = {
  readonly nextPath: string;
  readonly googleConfigured: boolean;
  readonly credentialsConfigured: boolean;
};

const copy: Record<"ko" | "en", {
  signinTitle: string;
  signinSubtitle: string;
  googleCta: string;
  emailLabel: string;
  passwordLabel: string;
  forgotCta: string;
  signinSubmit: string;
  noAccount: string;
  signupLink: string;
  signupTitle: string;
  nameLabel: string;
  confirmPasswordLabel: string;
  termsAccept: string;
  signupSubmit: string;
  hasAccount: string;
  signinLink: string;
  forgotTitle: string;
  forgotSubtitle: string;
  forgotSubmit: string;
  rememberPassword: string;
  googleMissing: string;
  emailMissing: string;
  invalidCredentials: string;
  passwordMismatch: string;
  passwordTooShort: string;
  termsRequired: string;
  accountExists: string;
  signupFailed: string;
  signinFailed: string;
  passwordResetUnavailable: string;
  submitting: string;
}> = {
  ko: {
    signinTitle: "로그인",
    signinSubtitle: "AI Trader League 알림과 리그 데이터를 확인합니다.",
    googleCta: "Google로 계속하기",
    emailLabel: "이메일",
    passwordLabel: "비밀번호",
    forgotCta: "비밀번호를 잊으셨나요?",
    signinSubmit: "로그인",
    noAccount: "아직 계정이 없나요?",
    signupLink: "계정 만들기",
    
    signupTitle: "계정 만들기",
    nameLabel: "이름",
    confirmPasswordLabel: "비밀번호 확인",
    termsAccept: "이용약관, 면책조항, 법적 고지 및 개인정보 처리방침에 동의합니다.",
    signupSubmit: "계정 만들기",
    hasAccount: "이미 계정이 있나요?",
    signinLink: "로그인",

    forgotTitle: "비밀번호 재설정",
    forgotSubtitle: "이메일 로그인 계정은 현재 재설정 기능을 준비 중입니다.",
    forgotSubmit: "재설정 상태 확인",
    rememberPassword: "비밀번호가 기억나셨나요?",

    googleMissing: "Google OAuth 설정 필요",
    emailMissing: "이메일 로그인 설정 필요",
    invalidCredentials: "이메일 또는 비밀번호가 올바르지 않습니다.",
    passwordMismatch: "비밀번호 확인이 일치하지 않습니다.",
    passwordTooShort: "비밀번호는 8자 이상이어야 합니다.",
    termsRequired: "약관 동의가 필요합니다.",
    accountExists: "이미 가입된 이메일입니다. 로그인해 주세요.",
    signupFailed: "회원가입을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    signinFailed: "로그인을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    passwordResetUnavailable: "비밀번호 재설정은 준비 중입니다. 지금은 Google 로그인 또는 새 계정 생성을 이용해 주세요.",
    submitting: "처리 중"
  },
  en: {
    signinTitle: "Sign in",
    signinSubtitle: "Sign in to access AI Trader League",
    googleCta: "Continue with Google",
    emailLabel: "Email",
    passwordLabel: "Password",
    forgotCta: "Forgot password?",
    signinSubmit: "Sign in",
    noAccount: "Don't have an account?",
    signupLink: "Sign up",

    signupTitle: "Create an account",
    nameLabel: "Name",
    confirmPasswordLabel: "Confirm password",
    termsAccept: "I accept the Terms of Service, the Disclaimer, the Legal Notices and the Privacy Policy",
    signupSubmit: "Create my account",
    hasAccount: "Already have an account?",
    signinLink: "Sign in",

    forgotTitle: "Forgot password",
    forgotSubtitle: "Password reset for email accounts is being prepared.",
    forgotSubmit: "Check reset status",
    rememberPassword: "Remember your password?",

    googleMissing: "Google OAuth Config Missing",
    emailMissing: "Email sign-in config missing",
    invalidCredentials: "Email or password is incorrect.",
    passwordMismatch: "Password confirmation does not match.",
    passwordTooShort: "Password must be at least 8 characters.",
    termsRequired: "Please accept the terms first.",
    accountExists: "This email is already registered. Please sign in.",
    signupFailed: "Could not create the account. Please try again shortly.",
    signinFailed: "Could not sign in. Please try again shortly.",
    passwordResetUnavailable: "Password reset is not available yet. Please use Google sign-in or create a new account.",
    submitting: "Working"
  }
};

type FormMessageState = {
  readonly tone: "error" | "success";
  readonly text: string;
};

export function LoginPageClient({ nextPath, googleConfigured, credentialsConfigured }: LoginPageClientProps) {
  const { locale } = useAppContext();
  const text = locale === "ko" ? copy.ko : copy.en;
  const callbackUrl = safeInternalPath(nextPath, "/leaderboard");

  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<FormMessageState | null>(null);
  const signupBlocked = !credentialsConfigured || !termsAccepted;

  const navigateAfterAuth = (url?: string | null) => {
    window.location.assign(safeInternalPath(url ?? callbackUrl, "/leaderboard"));
  };

  const handleSigninSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormMessage(null);
    if (!credentialsConfigured) {
      setFormMessage({ tone: "error", text: text.emailMissing });
      return;
    }
    setSubmitting(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl
      });
      if (result?.ok) {
        navigateAfterAuth(result.url);
        return;
      }
      setFormMessage({ tone: "error", text: result?.error ? text.invalidCredentials : text.signinFailed });
    } catch {
      setFormMessage({ tone: "error", text: text.signinFailed });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignupSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormMessage(null);
    if (!credentialsConfigured) {
      setFormMessage({ tone: "error", text: text.emailMissing });
      return;
    }
    if (password.length < 8) {
      setFormMessage({ tone: "error", text: text.passwordTooShort });
      return;
    }
    if (password !== confirmPassword) {
      setFormMessage({ tone: "error", text: text.passwordMismatch });
      return;
    }
    if (!termsAccepted) {
      setFormMessage({ tone: "error", text: text.termsRequired });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      });
      const body: unknown = await safeJson(response);
      if (!response.ok) {
        setFormMessage({ tone: "error", text: signupErrorMessage(body, response.status, text) });
        return;
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl
      });
      if (result?.ok) {
        navigateAfterAuth(result.url);
        return;
      }
      setFormMessage({ tone: "error", text: text.signinFailed });
    } catch {
      setFormMessage({ tone: "error", text: text.signupFailed });
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormMessage({ tone: "error", text: text.passwordResetUnavailable });
  };

  return (
    <div 
      className="relative flex min-h-[100dvh] w-full items-center justify-center bg-[#070808] px-4 py-20 text-white select-none sm:py-12"
      style={{
        backgroundImage: "radial-gradient(circle at 50% 50%, rgba(16,185,129,0.04), transparent 70%)"
      }}
    >
      <div className="absolute left-4 top-4 z-10 sm:left-6 sm:top-6">
        <Link 
          href="/" 
          aria-label={locale === "ko" ? "홈으로 돌아가기" : "Back home"}
          className="focus-ring inline-grid size-10 place-items-center rounded-full border border-white/[0.08] bg-white/[0.03] text-zinc-400 transition duration-200 hover:bg-white/[0.07] hover:text-zinc-100"
        >
          <ArrowLeft size={16} weight="bold" />
        </Link>
      </div>

      <div className="w-full max-w-[400px] z-10 transition-all duration-300">
        <div className="rounded-2xl border border-white/[0.05] bg-[#0c0d0d]/90 p-5 shadow-[0_32px_96px_rgba(0,0,0,0.85),inset_0_1px_1px_rgba(255,255,255,0.01)] backdrop-blur-xl sm:p-8 md:p-9">
          {mode === "signin" && (
            <div className="animate-fade-in-up">
              <h2 className="text-center text-2xl font-bold tracking-tight text-white">{text.signinTitle}</h2>
              <p className="mt-1.5 text-center text-xs text-zinc-500 tracking-wide">{text.signinSubtitle}</p>

              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => void signIn("google", { callbackUrl })}
                  disabled={!googleConfigured}
                  className="focus-ring flex w-full items-center justify-center gap-2.5 rounded-lg border border-zinc-800 bg-transparent px-4 py-2.5 text-sm font-semibold text-zinc-200 transition duration-200 hover:bg-white/[0.03] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <GoogleLogo size={16} weight="bold" className="text-white" />
                  <span>{text.googleCta}</span>
                </button>
                {!googleConfigured && (
                  <p className="mt-2 text-center text-[10px] font-mono text-amber-500/80 flex items-center justify-center gap-1">
                    <ShieldCheck size={11} />
                    {text.googleMissing}
                  </p>
                )}
              </div>

              <div className="mt-6 flex items-center justify-between gap-4">
                <div className="h-px w-full bg-zinc-800/60" />
                <span className="font-mono text-[9px] tracking-widest text-zinc-600 uppercase">{locale === "ko" ? "또는" : "OR"}</span>
                <div className="h-px w-full bg-zinc-800/60" />
              </div>

              <form onSubmit={handleSigninSubmit} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="email" className="block text-xs font-semibold text-zinc-400 mb-1.5">
                    {text.emailLabel}
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="focus-ring w-full rounded-lg border border-zinc-800 bg-[#121313] px-3.5 py-2.5 text-sm text-white placeholder-zinc-700 focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/80 transition duration-200"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="password" className="block text-xs font-semibold text-zinc-400">
                      {text.passwordLabel}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setFormMessage(null);
                        setMode("forgot");
                      }}
                      className="focus-ring rounded text-xs font-semibold text-zinc-500 hover:text-emerald-400 transition"
                    >
                      {text.forgotCta}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder={locale === "ko" ? "비밀번호" : "Your password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="focus-ring w-full rounded-lg border border-zinc-800 bg-[#121313] pl-3.5 pr-11 py-2.5 text-sm text-white placeholder-zinc-700 focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/80 transition duration-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition"
                    >
                      {showPassword ? <EyeSlash size={15} weight="regular" /> : <Eye size={15} weight="regular" />}
                    </button>
                  </div>
                </div>

                <FormMessage message={formMessage} />

                <button
                  type="submit"
                  disabled={submitting || !credentialsConfigured}
                  className="w-full py-3 mt-6 rounded-lg bg-[#00c07f] hover:bg-[#00d68f] text-white font-semibold text-sm tracking-wide transition duration-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-[0_4px_20px_rgba(0,192,127,0.25)] hover:shadow-[0_4px_30px_rgba(0,192,127,0.4)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {submitting ? text.submitting : text.signinSubmit}
                </button>
              </form>

              <div className="mt-8 text-center text-xs text-zinc-500">
                <span>{text.noAccount} </span>
                <button
                  type="button"
                  onClick={() => {
                    setFormMessage(null);
                    setMode("signup");
                  }}
                  className="focus-ring font-semibold text-zinc-300 hover:text-emerald-400 underline underline-offset-4 transition"
                >
                  {text.signupLink}
                </button>
              </div>
            </div>
          )}

          {mode === "signup" && (
            <div className="animate-fade-in-up">
              <h2 className="text-center text-2xl font-bold tracking-tight text-white">{text.signupTitle}</h2>

              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => void signIn("google", { callbackUrl })}
                  disabled={!googleConfigured}
                  className="focus-ring flex w-full items-center justify-center gap-2.5 rounded-lg border border-zinc-800 bg-transparent px-4 py-2.5 text-sm font-semibold text-zinc-200 transition duration-200 hover:bg-white/[0.03] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <GoogleLogo size={16} weight="bold" className="text-white" />
                  <span>{text.googleCta}</span>
                </button>
              </div>

              <div className="mt-6 flex items-center justify-between gap-4">
                <div className="h-px w-full bg-zinc-800/60" />
                <span className="font-mono text-[9px] tracking-widest text-zinc-600 uppercase">{locale === "ko" ? "또는" : "OR"}</span>
                <div className="h-px w-full bg-zinc-800/60" />
              </div>

              <form onSubmit={handleSignupSubmit} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="signup-name" className="block text-xs font-semibold text-zinc-400 mb-1.5">
                    {text.nameLabel}
                  </label>
                  <input
                    id="signup-name"
                    type="text"
                    required
                    placeholder={locale === "ko" ? "이름" : "Your name"}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="focus-ring w-full rounded-lg border border-zinc-800 bg-[#121313] px-3.5 py-2.5 text-sm text-white placeholder-zinc-700 focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/80 transition duration-200"
                  />
                </div>

                <div>
                  <label htmlFor="signup-email" className="block text-xs font-semibold text-zinc-400 mb-1.5">
                    {text.emailLabel}
                  </label>
                  <input
                    id="signup-email"
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="focus-ring w-full rounded-lg border border-zinc-800 bg-[#121313] px-3.5 py-2.5 text-sm text-white placeholder-zinc-700 focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/80 transition duration-200"
                  />
                </div>

                <div>
                  <label htmlFor="signup-password" className="block text-xs font-semibold text-zinc-400 mb-1.5">
                    {text.passwordLabel}
                  </label>
                  <div className="relative">
                    <input
                      id="signup-password"
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder={locale === "ko" ? "8자 이상" : "Minimum 8 characters"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="focus-ring w-full rounded-lg border border-zinc-800 bg-[#121313] pl-3.5 pr-11 py-2.5 text-sm text-white placeholder-zinc-700 focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/80 transition duration-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition"
                    >
                      {showPassword ? <EyeSlash size={15} weight="regular" /> : <Eye size={15} weight="regular" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="signup-confirm" className="block text-xs font-semibold text-zinc-400 mb-1.5">
                    {text.confirmPasswordLabel}
                  </label>
                  <div className="relative">
                    <input
                      id="signup-confirm"
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      placeholder={locale === "ko" ? "비밀번호를 한 번 더 입력" : "Repeat your password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="focus-ring w-full rounded-lg border border-zinc-800 bg-[#121313] pl-3.5 pr-11 py-2.5 text-sm text-white placeholder-zinc-700 focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/80 transition duration-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition"
                    >
                      {showConfirmPassword ? <EyeSlash size={15} weight="regular" /> : <Eye size={15} weight="regular" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 mt-4">
                  <input
                    id="terms"
                    type="checkbox"
                    required
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="focus-ring mt-1 h-3.5 w-3.5 rounded border-zinc-800 bg-[#121313] text-emerald-500 focus:ring-emerald-500 transition duration-150"
                  />
                  <label htmlFor="terms" className="text-xs text-zinc-500 select-none leading-relaxed break-keep">
                    {locale === "ko" ? (
                      <>
                        <Link href="/terms" className="underline hover:text-zinc-300 transition">이용약관</Link>
                        ,{" "}
                        <Link href="/disclaimer" className="underline hover:text-zinc-300 transition">면책조항</Link>
                        ,{" "}
                        <Link href="/legal-notices" className="underline hover:text-zinc-300 transition">법적 고지</Link>
                        및{" "}
                        <Link href="/privacy-policy" className="underline hover:text-zinc-300 transition">개인정보 처리방침</Link>
                        에 동의합니다.
                      </>
                    ) : (
                      <>
                        I accept the{" "}
                        <Link href="/terms" className="underline hover:text-zinc-300 transition">Terms of Service</Link>
                        , the{" "}
                        <Link href="/disclaimer" className="underline hover:text-zinc-300 transition">Disclaimer</Link>
                        , the{" "}
                        <Link href="/legal-notices" className="underline hover:text-zinc-300 transition">Legal Notices</Link>
                        {" "}and the{" "}
                        <Link href="/privacy-policy" className="underline hover:text-zinc-300 transition">Privacy Policy</Link>
                        .
                      </>
                    )}
                  </label>
                </div>

                <FormMessage message={formMessage} />

                <button
                  type="submit"
                  disabled={submitting || signupBlocked}
                  className="w-full py-3 mt-6 rounded-lg bg-[#00c07f] hover:bg-[#00d68f] text-white font-semibold text-sm tracking-wide transition duration-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-[0_4px_20px_rgba(0,192,127,0.25)] hover:shadow-[0_4px_30px_rgba(0,192,127,0.4)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {submitting ? text.submitting : text.signupSubmit}
                </button>
              </form>

              <div className="mt-8 text-center text-xs text-zinc-500">
                <span>{text.hasAccount} </span>
                <button
                  type="button"
                  onClick={() => {
                    setFormMessage(null);
                    setMode("signin");
                  }}
                  className="focus-ring font-semibold text-zinc-300 hover:text-emerald-400 underline underline-offset-4 transition"
                >
                  {text.signinLink}
                </button>
              </div>
            </div>
          )}

          {mode === "forgot" && (
            <div className="animate-fade-in-up">
              <h2 className="text-2xl font-bold tracking-tight text-white">{text.forgotTitle}</h2>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500 break-keep">{text.forgotSubtitle}</p>

              <form onSubmit={handleForgotSubmit} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="forgot-email" className="block text-xs font-semibold text-zinc-400 mb-1.5">
                    {text.emailLabel}
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="focus-ring w-full rounded-lg border border-zinc-800 bg-[#121313] px-3.5 py-2.5 text-sm text-white placeholder-zinc-700 focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/80 transition duration-200"
                  />
                </div>

                <FormMessage message={formMessage} />

                <button
                  type="submit"
                  className="w-full py-3 mt-6 rounded-lg bg-[#00c07f] hover:bg-[#00d68f] text-white font-semibold text-sm tracking-wide transition duration-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-[0_4px_20px_rgba(0,192,127,0.25)] hover:shadow-[0_4px_30px_rgba(0,192,127,0.4)]"
                >
                  {text.forgotSubmit}
                </button>
              </form>

              <div className="mt-8 text-center text-xs text-zinc-500">
                <span>{text.rememberPassword} </span>
                <button
                  type="button"
                  onClick={() => {
                    setFormMessage(null);
                    setMode("signin");
                  }}
                  className="focus-ring font-semibold text-zinc-300 hover:text-emerald-400 underline underline-offset-4 transition"
                >
                  {text.signinLink}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function FormMessage({ message }: { readonly message: FormMessageState | null }) {
  if (!message) return null;
  const toneClass =
    message.tone === "error"
      ? "border-rose-400/20 bg-rose-400/10 text-rose-100"
      : "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
  return (
    <p className={`rounded-lg border px-3 py-2 text-xs font-semibold leading-5 ${toneClass}`}>
      {message.text}
    </p>
  );
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function signupErrorMessage(
  body: unknown,
  status: number,
  text: typeof copy.ko
) {
  const error = readError(body);
  if (status === 409 || error === "password_account_exists") return text.accountExists;
  if (error === "password_too_short") return text.passwordTooShort;
  return text.signupFailed;
}

function readError(input: unknown): string {
  if (typeof input !== "object" || input === null || !("error" in input)) return "";
  return typeof input.error === "string" ? input.error : "";
}
