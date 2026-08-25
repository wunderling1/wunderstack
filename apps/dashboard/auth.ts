import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyPassword } from "@/lib/password";
import type { DashboardRole } from "@/lib/roles";
import { getUserByEmail } from "@/lib/users";

/**
 * Auth.js (NextAuth v5) for the dashboard. Sovereign Credentials login against our own `users` table;
 * JWT sessions carry `role` + `tenantId` + `mustChangePassword` so route gates need no DB round-trip
 * per request. No adapter/DB session store, no external IdP (see DECISION-dashboard-auth.md).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (credentials) => {
        const email = typeof credentials?.email === "string" ? credentials.email : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;
        const user = await getUserByEmail(email);
        if (!user || !verifyPassword(password, user.passwordHash)) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.tenantId = user.tenantId;
        token.mustChangePassword = user.mustChangePassword;
      }
      return token;
    },
    session({ session, token }) {
      session.user.role = token.role as DashboardRole;
      session.user.tenantId = (token.tenantId ?? null) as string | null;
      session.user.mustChangePassword = Boolean(token.mustChangePassword);
      return session;
    },
  },
});
