import type { DashboardRole } from "@/lib/roles";

export type Area = "fund" | "admin";

export interface SessionShape {
  user?: { role: DashboardRole; tenantId: string | null } | null;
}

export type AccessDecision = { allow: true } | { allow: false; redirectTo: string };

/**
 * Pure role-gate for the two dashboard areas (Fase 3). Kept dependency-free so it is unit-testable —
 * this is the DoD's "admin-routes/-data aantoonbaar geweigerd" evidence. Area layouts call this and
 * redirect on deny; because the check runs server-side in every protected layout, a fund session can
 * never render admin data.
 */
export function decideAccess(session: SessionShape | null, area: Area): AccessDecision {
  const user = session?.user;
  if (!user) return { allow: false, redirectTo: "/login" };

  if (area === "admin") {
    return user.role === "admin" ? { allow: true } : { allow: false, redirectTo: "/" };
  }

  // Fund area: tenant-scoped. Admins have no tenant, so they are sent to their own overview.
  if (user.role === "admin") return { allow: false, redirectTo: "/admin" };
  if (!user.tenantId) return { allow: false, redirectTo: "/login" };
  return { allow: true };
}
