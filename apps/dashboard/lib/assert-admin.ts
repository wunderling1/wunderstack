import { auth } from "@/auth";
import { decideAccess } from "@/lib/authz";

/** Server-action gate: only platform admins may write. Throws Error("forbidden") otherwise. */
export async function assertAdmin(): Promise<void> {
  const session = await auth();
  if (!decideAccess(session, "admin").allow) {
    throw new Error("forbidden");
  }
}
