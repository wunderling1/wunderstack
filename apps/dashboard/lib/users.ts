import { eq, getDb, users } from "@wunderstack/db";
import type { DashboardRole } from "@/lib/roles";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  role: DashboardRole;
  tenantId: string | null;
  mustChangePassword: boolean;
}

/** Look up a dashboard user by email (login). Read-only; the dashboard never writes users here. */
export async function getUserByEmail(email: string): Promise<AuthUser | null> {
  const [row] = await getDb()
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.passwordHash,
    role: row.role === "admin" ? "admin" : "fund",
    tenantId: row.tenantId,
    mustChangePassword: row.mustChangePassword,
  };
}
