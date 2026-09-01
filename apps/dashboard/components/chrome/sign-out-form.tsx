"use client";

import { Button } from "@wunderstack/ui";
import { signOutDashboard } from "./sign-out-action";

export function SignOutForm() {
  return (
    <form action={signOutDashboard}>
      <Button variant="ghost" shape="control" className="w-full justify-start" type="submit">
        Uitloggen
      </Button>
    </form>
  );
}
