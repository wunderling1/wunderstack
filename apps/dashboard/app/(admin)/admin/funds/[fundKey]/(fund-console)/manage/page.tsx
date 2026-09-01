import { redirect } from "next/navigation";
import { parseFundKey } from "@/lib/route-params";

/** Legacy Beheer tab — content lives on Instellingen. */
export default async function ManageRedirect({
  params,
}: {
  params: Promise<{ fundKey: string }>;
}) {
  const { fundKey: raw } = await params;
  const fundKey = parseFundKey(raw);
  redirect(fundKey ? `/admin/funds/${fundKey}/instellingen` : "/admin");
}
