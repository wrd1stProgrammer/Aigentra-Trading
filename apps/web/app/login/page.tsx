import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, authSetupComplete, googleAuthConfigured } from "@/auth";
import { LoginPageClient } from "@/components/login-page-client";
import { safeInternalPath } from "@/lib/safe-redirect";
import { createNoindexMetadata } from "@/lib/seo";

type LoginPageProps = {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = createNoindexMetadata("Login", "/login");

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextValue = params?.next;
  const nextPath = safeInternalPath(nextValue, "/leaderboard");
  const session = authSetupComplete ? await auth() : null;
  if (session?.user) redirect(nextPath);

  return <LoginPageClient nextPath={nextPath} googleConfigured={googleAuthConfigured} credentialsConfigured={authSetupComplete} />;
}
