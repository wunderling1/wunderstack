import { closeDb, eq, getDb, users } from "@wunderstack/db";
import { hashPassword } from "../lib/password.js";

/**
 * Seed / update a dashboard user. Run with the read-write DATABASE_URL (the dashboard itself connects
 * read-only). Passwords are hashed with node:crypto scrypt (see lib/password.ts).
 *
 *   pnpm --filter dashboard create-user --email=you@wunderling.nl --password=secret --role=admin
 *   pnpm --filter dashboard create-user --email=fonds@oomt.nl --password=secret --role=fund --tenant=oomt
 */
function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  const email = arg("email");
  const password = arg("password");
  const role = arg("role") ?? "fund";
  const tenant = arg("tenant") ?? null;

  if (!email || !password) {
    console.error(
      "Usage: create-user --email=<email> --password=<pw> --role=admin|fund [--tenant=<id>]",
    );
    process.exit(1);
  }
  if (role !== "admin" && role !== "fund") {
    console.error("role must be 'admin' or 'fund'.");
    process.exit(1);
  }
  if (role === "fund" && !tenant) {
    console.error("fund users require --tenant=<id>.");
    process.exit(1);
  }

  const db = getDb();
  const emailLc = email.toLowerCase();
  const values = {
    email: emailLc,
    passwordHash: hashPassword(password),
    role,
    tenantId: role === "admin" ? null : tenant,
  };

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, emailLc)).limit(1);
  if (existing[0]) {
    await db.update(users).set(values).where(eq(users.email, emailLc));
    console.log(`Updated ${role} user ${emailLc}${tenant ? ` (tenant=${tenant})` : ""}.`);
  } else {
    await db.insert(users).values(values);
    console.log(`Created ${role} user ${emailLc}${tenant ? ` (tenant=${tenant})` : ""}.`);
  }

  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
