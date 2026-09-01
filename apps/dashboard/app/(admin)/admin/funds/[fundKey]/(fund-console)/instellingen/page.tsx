import { notFound } from "next/navigation";
import { SettingsView } from "@/components/fund/settings";
import { parseFundKey } from "@/lib/route-params";
import { loadSettingsModel } from "@/lib/settings-load";

export const dynamic = "force-dynamic";

export default async function AdminInstellingenPage({
  params,
}: {
  params: Promise<{ fundKey: string }>;
}) {
  const { fundKey: raw } = await params;
  const fundKey = parseFundKey(raw);
  if (!fundKey) notFound();

  const model = await loadSettingsModel(fundKey);
  if (!model) notFound();

  return <SettingsView model={model} canWrite />;
}
