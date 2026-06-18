"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { ArrowLeft, Eye, EyeSlash, GoogleLogo, ShieldCheck } from "@phosphor-icons/react";
import { useAppContext } from "@/components/app-provider";
import { safeInternalPath } from "@/lib/safe-redirect";

type LoginPageClientProps = {
  readonly nextPath: string;
  readonly googleConfigured: boolean;
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
  demoNotice: string;
  googleMissing: string;
}> = {
  ko: {
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
    termsAccept: "이용약관, 면책조항, 법적 고지 및 개인정보 처리방침에 동의합니다.",
    signupSubmit: "Create my account",
    hasAccount: "Already have an account?",
    signinLink: "Sign in",

    forgotTitle: "Forgot password",
    forgotSubtitle: "Enter your email address and we'll send you a link to reset your password.",
    forgotSubmit: "Send link",
    rememberPassword: "Remember your password?",

    demoNotice: "데모 모드: 실제 이메일 로그인은 데모 단계입니다. Google 로그인을 이용해 주세요.",
    googleMissing: "Google OAuth 설정 필요"
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
    forgotSubtitle: "Enter your email address and we'll send you a link to reset your password.",
    forgotSubmit: "Send link",
    rememberPassword: "Remember your password?",

    demoNotice: "Demo Mode: Email authentication is mocked in this layout. Please use Google Login.",
    googleMissing: "Google OAuth Config Missing"
  }
};

export function LoginPageClient({ nextPath, googleConfigured }: LoginPageClientProps) {
  const { locale } = useAppContext();
  const text = locale === "ko" ? copy.ko : copy.en;
  const callbackUrl = safeInternalPath(nextPath);

  // Modes: "signin" | "signup" | "forgot"
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");

  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Password visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Fake Submit Handler for demo
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert(text.demoNotice);
  };

  return (
    <div 
      className="relative flex min-h-[100dvh] w-full items-center justify-center bg-[#070808] px-4 py-20 text-white select-none sm:py-12"
      style={{
        backgroundImage: "radial-gradient(circle at 50% 50%, rgba(16,185,129,0.04), transparent 70%)"
      }}
    >
      {/* Top Left Home navigation for escape hatch (Softened visual footprint) */}
      <div className="absolute left-4 right-4 top-4 z-10 sm:left-6 sm:right-auto sm:top-6">
        <Link 
          href="/" 
          className="focus-ring inline-flex max-w-full items-center gap-1.5 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3.5 py-2 text-xs font-semibold text-zinc-500 transition duration-200 hover:bg-white/[0.06] hover:text-zinc-300"
        >
          <ArrowLeft size={13} weight="bold" />
          <span className="truncate">Back to Aigentra Trading</span>
        </Link>
      </div>

      <div className="w-full max-w-[400px] z-10 transition-all duration-300">
        <div className="rounded-2xl border border-white/[0.05] bg-[#0c0d0d]/90 p-5 shadow-[0_32px_96px_rgba(0,0,0,0.85),inset_0_1px_1px_rgba(255,255,255,0.01)] backdrop-blur-xl sm:p-8 md:p-9">
          
          {/* Sign In Mode */}
          {mode === "signin" && (
            <div className="animate-fade-in-up">
              <h2 className="text-center text-2xl font-bold tracking-tight text-white">{text.signinTitle}</h2>
              <p className="mt-1.5 text-center text-xs text-zinc-500 tracking-wide">{text.signinSubtitle}</p>

              {/* Google CTA */}
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

              {/* Divider */}
              <div className="mt-6 flex items-center justify-between gap-4">
                <div className="h-px w-full bg-zinc-800/60" />
                <span className="font-mono text-[9px] tracking-widest text-zinc-600 uppercase">OR</span>
                <div className="h-px w-full bg-zinc-800/60" />
              </div>

              {/* Email Form */}
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
                      onClick={() => setMode("forgot")}
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
                      placeholder="Your password"
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

                <button
                  type="submit"
                  className="w-full py-3 mt-6 rounded-lg bg-[#00c07f] hover:bg-[#00d68f] text-white font-semibold text-sm tracking-wide transition duration-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-[0_4px_20px_rgba(0,192,127,0.25)] hover:shadow-[0_4px_30px_rgba(0,192,127,0.4)]"
                >
                  {text.signinSubmit}
                </button>
              </form>

              {/* Bottom Navigation */}
              <div className="mt-8 text-center text-xs text-zinc-500">
                <span>{text.noAccount} </span>
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className="focus-ring font-semibold text-zinc-300 hover:text-emerald-400 underline underline-offset-4 transition"
                >
                  {text.signupLink}
                </button>
              </div>
            </div>
          )}

          {/* Sign Up Mode (Create an Account) */}
          {mode === "signup" && (
            <div className="animate-fade-in-up">
              <h2 className="text-center text-2xl font-bold tracking-tight text-white">{text.signupTitle}</h2>

              {/* Google CTA */}
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

              {/* Divider */}
              <div className="mt-6 flex items-center justify-between gap-4">
                <div className="h-px w-full bg-zinc-800/60" />
                <span className="font-mono text-[9px] tracking-widest text-zinc-600 uppercase">OR</span>
                <div className="h-px w-full bg-zinc-800/60" />
              </div>

              {/* Credentials Form */}
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="signup-name" className="block text-xs font-semibold text-zinc-400 mb-1.5">
                    {text.nameLabel}
                  </label>
                  <input
                    id="signup-name"
                    type="text"
                    required
                    placeholder="Your name"
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
                      placeholder="Minimum 8 characters"
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
                      placeholder="Repeat your password"
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

                {/* Terms checkbox */}
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

                <button
                  type="submit"
                  className="w-full py-3 mt-6 rounded-lg bg-[#00c07f] hover:bg-[#00d68f] text-white font-semibold text-sm tracking-wide transition duration-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-[0_4px_20px_rgba(0,192,127,0.25)] hover:shadow-[0_4px_30px_rgba(0,192,127,0.4)]"
                >
                  {text.signupSubmit}
                </button>
              </form>

              {/* Bottom Navigation */}
              <div className="mt-8 text-center text-xs text-zinc-500">
                <span>{text.hasAccount} </span>
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className="focus-ring font-semibold text-zinc-300 hover:text-emerald-400 underline underline-offset-4 transition"
                >
                  {text.signinLink}
                </button>
              </div>
            </div>
          )}

          {/* Forgot Password Mode */}
          {mode === "forgot" && (
            <div className="animate-fade-in-up">
              <h2 className="text-2xl font-bold tracking-tight text-white">{text.forgotTitle}</h2>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500 break-keep">{text.forgotSubtitle}</p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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

                <button
                  type="submit"
                  className="w-full py-3 mt-6 rounded-lg bg-[#00c07f] hover:bg-[#00d68f] text-white font-semibold text-sm tracking-wide transition duration-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-[0_4px_20px_rgba(0,192,127,0.25)] hover:shadow-[0_4px_30px_rgba(0,192,127,0.4)]"
                >
                  {text.forgotSubmit}
                </button>
              </form>

              {/* Bottom Navigation */}
              <div className="mt-8 text-center text-xs text-zinc-500">
                <span>{text.rememberPassword} </span>
                <button
                  type="button"
                  onClick={() => setMode("signin")}
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
