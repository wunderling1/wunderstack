import {
  eq,
  funds as fundsTable,
  getDb,
  getFund,
  getInstance,
  getLatestFundDump,
  listFundUsers,
  listInstances,
  listLti11Consumers,
  listScenarios,
} from "@wunderstack/db";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import {
  CONFIG_REVALIDATE_SECONDS,
  FUNDS_INDEX_TAG,
  fundConfigTag,
  instanceConfigTag,
} from "./config-cache";

function cached<T>(
  keyParts: string[],
  tags: string[],
  fn: () => Promise<T>,
): Promise<T> {
  return unstable_cache(fn, keyParts, {
    revalidate: CONFIG_REVALIDATE_SECONDS,
    tags,
  })();
}

/**
 * Per-request dedupe (`cache`) plus a 30s Data Cache for control-plane reads.
 * KPI queries go through `@wunderstack/analytics` and must not use these wrappers.
 */
export const getFundCached = cache((fundKey: string) =>
  cached(["dashboard-get-fund", fundKey], [fundConfigTag(fundKey)], () => getFund(fundKey)),
);

export const getInstanceCached = cache((fundKey: string, agentKey: string) =>
  cached(
    ["dashboard-get-instance", fundKey, agentKey],
    [fundConfigTag(fundKey), instanceConfigTag(fundKey, agentKey)],
    () => getInstance(fundKey, agentKey),
  ),
);

export const listInstancesCached = cache((fundKey: string) =>
  cached(["dashboard-list-instances", fundKey], [fundConfigTag(fundKey)], () =>
    listInstances(fundKey),
  ),
);

export const listFundUsersCached = cache((fundKey: string) =>
  cached(["dashboard-list-fund-users", fundKey], [fundConfigTag(fundKey)], () =>
    listFundUsers(fundKey),
  ),
);

export const listScenariosCached = cache((fundKey: string) =>
  cached(["dashboard-list-scenarios", fundKey], [fundConfigTag(fundKey)], () =>
    listScenarios(fundKey),
  ),
);

export const listLti11ConsumersCached = cache((fundKey: string) =>
  cached(["dashboard-list-lti-consumers", fundKey], [fundConfigTag(fundKey)], () =>
    listLti11Consumers(fundKey),
  ),
);

export const getLatestFundDumpCached = cache(async (fundKey: string) => {
  const row = await cached(["dashboard-latest-dump", fundKey], [fundConfigTag(fundKey)], () =>
    getLatestFundDump(fundKey),
  );
  if (!row) {
    return null;
  }
  return { ...row, occurredAt: new Date(row.occurredAt) };
});

export const listActiveFundOptionsCached = cache(() =>
  cached(["dashboard-active-funds"], [FUNDS_INDEX_TAG], async () => {
    const rows = await getDb()
      .select({ key: fundsTable.key, name: fundsTable.name })
      .from(fundsTable)
      .where(eq(fundsTable.status, "active"))
      .orderBy(fundsTable.key);
    return rows.map((row) => ({
      key: row.key,
      name: row.name ?? row.key,
    }));
  }),
);
