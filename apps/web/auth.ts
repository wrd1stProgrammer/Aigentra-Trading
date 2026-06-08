import NextAuth, { type DefaultSession, type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

declare module "next-auth" {
  interface Session {
    user?: {
      id?: string;
    } & DefaultSession["user"];
  }
}

export const authSetupComplete = Boolean(process.env.AUTH_SECRET && process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

const authConfig = {
  providers: [Google],
  pages: {
    signIn: "/login"
  },
  session: {
    strategy: "jwt"
  },
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? (process.env.NODE_ENV === "production" ? undefined : "atl-local-development-secret"),
  callbacks: {
    session({ session, token }) {
      const fallbackId = typeof session.user?.email === "string" ? session.user.email : undefined;
      const userId = typeof token.sub === "string" ? token.sub : fallbackId;
      if (session.user && userId) session.user.id = userId;
      return session;
    }
  }
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
