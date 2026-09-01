import { AGENT_KEY_LABELS } from "@wunderstack/shared";
import {
  getFundCached,
  getLatestFundDumpCached,
  listFundUsersCached,
  listInstancesCached,
} from "@/lib/fund-lookups";

export interface SettingsTheme {
  primary?: string;
  accent?: string;
  radius?: string;
  logo?: string;
}

export interface SettingsAccount {
  id: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
}

export interface SettingsDump {
  occurredAt: Date;
  bytes: number | null;
  sha256: string | null;
}

export interface SettingsModel {
  fundKey: string;
  displayName: string;
  schemaName: string;
  active: boolean;
  theme: SettingsTheme;
  agentNames: string[];
  accounts: SettingsAccount[];
  latestDump: SettingsDump | null;
}

export async function loadSettingsModel(fundKey: string): Promise<SettingsModel | null> {
  const fund = await getFundCached(fundKey);
  if (!fund) return null;

  const [instances, accounts, latestDump] = await Promise.all([
    listInstancesCached(fundKey),
    listFundUsersCached(fundKey),
    getLatestFundDumpCached(fundKey),
  ]);

  const theme = (fund.theme ?? {}) as SettingsTheme;

  return {
    fundKey: fund.key,
    displayName: fund.name ?? fund.key,
    schemaName: fund.schemaName,
    active: fund.status === "active",
    theme,
    agentNames: instances.map(
      (row) => AGENT_KEY_LABELS[row.agentKey as keyof typeof AGENT_KEY_LABELS] ?? row.agentKey,
    ),
    accounts: accounts.map((user) => ({
      id: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    })),
    latestDump: latestDump
      ? {
          occurredAt: latestDump.occurredAt,
          bytes: latestDump.bytes,
          sha256: latestDump.sha256,
        }
      : null,
  };
}
