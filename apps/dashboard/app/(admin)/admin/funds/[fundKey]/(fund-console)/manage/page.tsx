import { Card } from "@wunderstack/ui";
import { notFound } from "next/navigation";
import { getFundCached, getLatestFundDumpCached } from "@/lib/fund-lookups";
import { parseFundKey } from "@/lib/route-params";
import { DeactivateForm, DumpForm, UpdateNameForm } from "../../manage-forms";

const dateTime = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" });

export default async function FundManagePage({
  params,
}: {
  params: Promise<{ fundKey: string }>;
}) {
  const { fundKey: raw } = await params;
  const fundKey = parseFundKey(raw);
  if (!fundKey) notFound();

  const fund = await getFundCached(fundKey);
  if (!fund) notFound();

  const latestDump = await getLatestFundDumpCached(fundKey);
  const active = fund.status === "active";
  const displayName = fund.name ?? fund.key;

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4 p-5">
        <h3 className="text-sm font-semibold">Weergavenaam</h3>
        <UpdateNameForm fundKey={fund.key} name={displayName} />
      </Card>

      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold">Dump en deactiveren</h3>
        <Card className="flex flex-col gap-3 p-5">
          <p className="text-sm text-text-muted">
            <code className="font-mono">pg_dump --no-owner --no-acl -n {fund.schemaName}</code>. De
            audit bewaart alleen omvang en sha256, niet de dump zelf.
          </p>
          {latestDump ? (
            <p className="text-sm text-text">
              Laatste dump: {dateTime.format(latestDump.occurredAt)}
              {latestDump.bytes !== null
                ? ` · ${latestDump.bytes.toLocaleString("nl-NL")} bytes`
                : ""}
              {latestDump.sha256 ? (
                <>
                  {" "}
                  · sha256{" "}
                  <code className="font-mono text-xs">{latestDump.sha256.slice(0, 12)}…</code>
                </>
              ) : null}
            </p>
          ) : (
            <p className="text-sm text-text-muted">Nog geen dump-auditregel voor dit fonds.</p>
          )}
          <DumpForm fundKey={fund.key} />
        </Card>
        {active ? (
          <Card className="p-5">
            <DeactivateForm fundKey={fund.key} hasDump={latestDump !== null} />
          </Card>
        ) : null}
      </section>
    </div>
  );
}
