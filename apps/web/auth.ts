import NextAuth, { type DefaultSession, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";
import { PasswordAuthApiError, verifyPasswordAccount } from "@/lib/password-auth-api";

declare module "next-auth" {
  interface Session {
    user?: {
      id?: string;
    } & DefaultSession["user"];
  }
}

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200)
});

const authSecretConfigured = Boolean(process.env.AUTH_SECRET) || process.env.NODE_ENV !== "production";
export const googleAuthConfigured = authSecretConfigured && Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
export const authSetupComplete = authSecretConfigured;

const authProviders = [
  ...(googleAuthConfigured ? [Google] : []),
  Credentials({
    id: "credentials",
    name: "Email",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" }
    },
    async authorize(credentials) {
      const parsed = credentialsSchema.safeParse(credentials);
      if (!parsed.success) return null;
      try {
        const account = await verifyPasswordAccount(parsed.data);
        return { id: account.userId, email: account.email, name: account.name };
      } catch (error) {
        if (error instanceof PasswordAuthApiError && [400, 401, 404].includes(error.status)) {
          return null;
        }
        throw error;
      }
    }
  })
] satisfies NextAuthConfig["providers"];

const authConfig = {
  providers: authProviders,
  pages: {
    signIn: "/login"
  },
  session: {
    strategy: "jwt"
  },
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? (process.env.NODE_ENV === "production" ? undefined : "atl-local-development-secret"),
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      const fallbackId = typeof session.user?.email === "string" ? session.user.email : undefined;
      const userId = typeof token.sub === "string" ? token.sub : fallbackId;
      if (session.user && userId) session.user.id = userId;
      return session;
    }
  }
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
