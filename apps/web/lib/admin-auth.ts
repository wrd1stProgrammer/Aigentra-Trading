import { auth, authSetupComplete } from "@/auth";

export type AdminIdentity = {
  readonly userId: string;
  readonly email: string;
};

export class AdminAuthError extends Error {
  readonly status: 401 | 403;

  constructor(message: string, status: 401 | 403) {
    super(message);
    this.name = "AdminAuthError";
    this.status = status;
  }
}

export async function requireAdminIdentity(): Promise<AdminIdentity> {
  if (!authSetupComplete) throw new AdminAuthError("unauthorized", 401);

  const session = await auth();
  const email = session?.user?.email;
  const userId = session?.user?.id ?? email;
  if (!email || !userId) throw new AdminAuthError("unauthorized", 401);
  if (!isAdminEmail(email)) throw new AdminAuthError("forbidden", 403);
  return { userId, email };
}

export function isAdminEmail(email: string): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  return adminEmailSet().has(normalizedEmail);
}

function adminEmailSet(): ReadonlySet<string> {
  const emails = `${process.env.ADMIN_EMAILS ?? ""},${process.env.ADMIN_EMAIL ?? ""}`;
  return new Set(
    emails
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}
