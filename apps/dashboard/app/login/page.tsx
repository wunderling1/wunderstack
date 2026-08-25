import { Button, Card, Field } from "@wunderstack/ui";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    if (session.user.mustChangePassword) {
      redirect("/password");
    }
    redirect(session.user.role === "admin" ? "/admin" : "/");
  }

  const { error } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        redirectTo: "/",
      });
    } catch (err) {
      // signIn throws a NEXT_REDIRECT on success (must propagate) and an AuthError on bad credentials.
      if (err instanceof AuthError) {
        redirect("/login?error=1");
      }
      throw err;
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="font-display text-xl font-semibold">Wunderstack dashboard</h1>
        <p className="mt-1 text-sm text-text-muted">Log in om verder te gaan.</p>
        <form action={login} className="mt-6 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-muted">E-mail</span>
            <Field type="email" name="email" required autoComplete="email" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-muted">Wachtwoord</span>
            <Field type="password" name="password" required autoComplete="current-password" />
          </label>
          {error ? (
            <p className="text-sm text-state-danger-fg" role="alert">
              Onjuiste inloggegevens.
            </p>
          ) : null}
          <Button type="submit" className="mt-2">
            Inloggen
          </Button>
        </form>
      </Card>
    </main>
  );
}
