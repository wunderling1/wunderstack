import type { DashboardRole } from "@/lib/roles";

export type Area = "fund" | "admin" | "password";

export interface SessionShape {
  user?: {
    role: DashboardRole;
    tenantId: string | null;
    mustChangePassword?: boolean;
  } | null;
}

export type AccessDecision = { allow: true } | { allow: false; redirectTo: string };

/**
 * Pure role-gate for dashboard areas. Kept dependency-free so it is unit-testable.
 * When mustChangePassword is set, fund and admin are denied — only /password is allowed.
 */
export function decideAccess(session: SessionShape | null, area: Area): AccessDecision {
  const user = session?.user;
  if (!user) return { allow: false, redirectTo: "/login" };

  if (user.mustChangePassword) {
    if (area === "password") return { allow: true };
    return { allow: false, redirectTo: "/password" };
  }

  if (area === "password") {
    // Already changed — send them to their home area.
    return {
      allow: false,
      redirectTo: user.role === "admin" ? "/admin" : "/",
    };
  }

  if (area === "admin") {
    return user.role === "admin" ? { allow: true } : { allow: false, redirectTo: "/" };
  }

  // Fund area: tenant-scoped. Admins have no tenant, so they are sent to their own overview.
  if (user.role === "admin") return { allow: false, redirectTo: "/admin" };
  if (!user.tenantId) return { allow: false, redirectTo: "/login" };
  return { allow: true };
}
