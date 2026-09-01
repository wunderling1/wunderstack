import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SettingsView } from "@/components/fund/settings";
import { loadSettingsModel } from "@/lib/settings-load";

export const dynamic = "force-dynamic";
export default async function InstellingenPage() {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) redirect("/login");
  const model = await loadSettingsModel(tenantId);
  if (!model) return null;
  return <SettingsView model={model} canWrite={false} />;
}
