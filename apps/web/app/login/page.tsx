import { redirect } from "next/navigation";
import { auth, authSetupComplete, googleAuthConfigured } from "@/auth";
import { LoginPageClient } from "@/components/login-page-client";
import { safeInternalPath } from "@/lib/safe-redirect";

type LoginPageProps = {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextValue = params?.next;
  const nextPath = safeInternalPath(nextValue, "/leaderboard");
  const session = authSetupComplete ? await auth() : null;
  if (session?.user) redirect(nextPath);

  return <LoginPageClient nextPath={nextPath} googleConfigured={googleAuthConfigured} credentialsConfigured={authSetupComplete} />;
}
