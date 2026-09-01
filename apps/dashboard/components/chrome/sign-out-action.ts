"use server";

import { signOut } from "@/auth";

export async function signOutDashboard() {
  await signOut({ redirectTo: "/login" });
}
