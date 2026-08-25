import { updateUserPassword } from "@wunderstack/db";
import { Button, Card, Field } from "@wunderstack/ui";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { decideAccess } from "@/lib/authz";
import { hashPassword, verifyPassword } from "@/lib/password";
import { getUserByEmail } from "@/lib/users";

export const dynamic = "force-dynamic";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function PasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  const decision = decideAccess(session, "password");
  if (!decision.allow) redirect(decision.redirectTo);

  const { error } = await searchParams;

  async function changePassword(formData: FormData) {
    "use server";
    const currentSession = await auth();
    if (!decideAccess(currentSession, "password").allow || !currentSession?.user?.email) {
      redirect("/login");
    }

    const current = String(formData.get("current") ?? "");
    const next = String(formData.get("next") ?? "");
    const confirm = String(formData.get("confirm") ?? "");
    const email = currentSession.user.email;

    if (!current || !next || next.length < 12 || next !== confirm) {
      await delay(400);
      redirect("/password?error=1");
    }

    const user = await getUserByEmail(email);
    if (!user || !verifyPassword(current, user.passwordHash)) {
      await delay(400);
      redirect("/password?error=1");
    }

    await updateUserPassword({ email, passwordHash: hashPassword(next) });

    try {
      await signIn("credentials", {
        email,
        password: next,
        redirectTo: user.role === "admin" ? "/admin" : "/",
      });
    } catch (err) {
      if (err instanceof AuthError) {
        redirect("/login?error=1");
      }
      throw err;
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="font-display text-xl font-semibold">Wachtwoord wijzigen</h1>
        <p className="mt-1 text-sm text-text-muted">
          Je moet je tijdelijke wachtwoord wijzigen voordat je verder kunt.
        </p>
        <form action={changePassword} className="mt-6 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-muted">Huidig wachtwoord</span>
            <Field type="password" name="current" required autoComplete="current-password" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-muted">Nieuw wachtwoord</span>
            <Field type="password" name="next" required autoComplete="new-password" minLength={12} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-muted">Bevestig nieuw wachtwoord</span>
            <Field
              type="password"
              name="confirm"
              required
              autoComplete="new-password"
              minLength={12}
            />
          </label>
          {error ? (
            <p className="text-sm text-state-danger-fg" role="alert">
              Wachtwoord wijzigen mislukt. Controleer je huidige wachtwoord en of de nieuwe
              wachtwoorden overeenkomen (minimaal 12 tekens).
            </p>
          ) : null}
          <Button type="submit" className="mt-2">
            Wachtwoord opslaan
          </Button>
        </form>
      </Card>
    </main>
  );
}
