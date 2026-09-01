import { redirect } from "next/navigation";
import { parseFundKey } from "@/lib/route-params";

/** Legacy Accounts tab — content lives on Instellingen. */
export default async function AccountsRedirect({
  params,
}: {
  params: Promise<{ fundKey: string }>;
}) {
  const { fundKey: raw } = await params;
  const fundKey = parseFundKey(raw);
  redirect(fundKey ? `/admin/funds/${fundKey}/instellingen` : "/admin");
}
