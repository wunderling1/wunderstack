import type { DefaultSession } from "next-auth";
import type { DashboardRole } from "@/lib/roles";

declare module "next-auth" {
  interface Session {
    user: {
      role: DashboardRole;
      /** Null for admin (cross-tenant); the scoped tenant for a fund user (D15 key). */
      tenantId: string | null;
    } & DefaultSession["user"];
  }
  interface User {
    role: DashboardRole;
    tenantId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: DashboardRole;
    tenantId: string | null;
  }
}

// The jwt callback's `user` is `User | AdapterUser`; augment the adapter shape too so `user.role`
// typechecks even though we use JWT sessions (no adapter) in practice.
declare module "@auth/core/adapters" {
  interface AdapterUser {
    role: DashboardRole;
    tenantId: string | null;
  }
}
