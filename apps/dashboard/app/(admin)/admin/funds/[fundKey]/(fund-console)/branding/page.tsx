import { redirect } from "next/navigation";
import { parseFundKey } from "@/lib/route-params";

/** Legacy Huisstijl tab — content lives on Instellingen. */
export default async function BrandingRedirect({
  params,
}: {
  params: Promise<{ fundKey: string }>;
}) {
  const { fundKey: raw } = await params;
  const fundKey = parseFundKey(raw);
  redirect(fundKey ? `/admin/funds/${fundKey}/settings` : "/admin");
}
