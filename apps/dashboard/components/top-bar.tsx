import { Button } from "@wunderstack/ui";
import type { ReactNode } from "react";
import { signOut } from "@/auth";

export function TopBar({
  title,
  subtitle,
  nav,
}: {
  title: string;
  subtitle?: string;
  nav?: ReactNode;
}) {
  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-6 px-6 py-4">
        <div>
          <h1 className="text-sm font-semibold leading-tight">{title}</h1>
          {subtitle ? <p className="text-xs text-text-muted">{subtitle}</p> : null}
        </div>
        {nav ? <nav className="flex items-center gap-4 text-sm text-text-muted">{nav}</nav> : null}
        <form action={logout} className="ml-auto">
          <Button variant="ghost" size="default" type="submit">
            Uitloggen
          </Button>
        </form>
      </div>
    </header>
  );
}
