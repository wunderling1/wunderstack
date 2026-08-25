import {
  FUND_KEY_RE,
  getFund,
  getLatestFundDump,
  listFundUsers,
  listInstances,
} from "@wunderstack/db";
import { AGENT_KEY_LABELS, AGENT_KEYS } from "@wunderstack/shared";
import { Card, Chip, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@wunderstack/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { agentLabel } from "@/lib/release-manifest";
import {
  AddAgentForm,
  AddUserForm,
  ChangeEmailForm,
  DeactivateForm,
  DumpForm,
  ResetPasswordForm,
  UpdateNameForm,
} from "./manage-forms";

export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" });

export default async function FundManagePage({
  params,
}: {
  params: Promise<{ fundKey: string }>;
}) {
  const { fundKey: raw } = await params;
  const fundKey = raw.toLowerCase();
  if (!FUND_KEY_RE.test(fundKey)) {
    notFound();
  }

  const fund = await getFund(fundKey);
  if (!fund) {
    notFound();
  }

  const [instances, accounts, latestDump] = await Promise.all([
    listInstances(fundKey),
    listFundUsers(fundKey),
    getLatestFundDump(fundKey),
  ]);

  const present = new Set(instances.map((row) => row.agentKey));
  const remainingAgents = AGENT_KEYS.filter((id) => !present.has(id)).map((id) => ({
    id,
    label: AGENT_KEY_LABELS[id],
  }));
  const active = fund.status === "active";
  const displayName = fund.name ?? fund.key;

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-start gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold">{displayName}</h2>
          <p className="mt-1 font-mono text-sm text-text-muted">{fund.key}</p>
        </div>
        <Link
          href="/admin/funds"
          className="ml-auto whitespace-nowrap text-sm text-text-muted hover:text-text"
        >
          ← Fondsen
        </Link>
      </div>

      {!active ? (
        <Card className="bg-state-caution-bg p-4 text-sm text-text">
          <p className="font-medium">Gedeactiveerd</p>
          <p className="mt-1 text-text-muted">
            Status is inactief. Schema en accounts blijven staan. Hard delete (
            <code className="font-mono">DROP SCHEMA</code>) is geen deel van deze slice.
          </p>
        </Card>
      ) : null}

      <Card className="flex flex-col gap-4 p-5">
        <h3 className="text-sm font-semibold">Weergavenaam</h3>
        <UpdateNameForm fundKey={fund.key} name={displayName} />
      </Card>

      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold">Agents</h3>
        {instances.length === 0 ? (
          <p className="text-sm text-text-subtle">Nog geen agent-instances.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Public key</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instances.map((row) => (
                <TableRow key={row.agentKey}>
                  <TableCell>{agentLabel(row.agentKey)}</TableCell>
                  <TableCell>
                    <Chip variant={row.status === "active" ? "verified" : "refusal"}>{row.status}</Chip>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.publicKey}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-text-subtle">
          CORS, theming en key-rotatie blijven op{" "}
          <Link href="/admin/embed" className="text-primary hover:underline">
            /admin/embed
          </Link>
          .
        </p>
        {active ? (
          <Card className="p-5">
            <AddAgentForm fundKey={fund.key} agents={remainingAgents} />
          </Card>
        ) : null}
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold">Accounts</h3>
        <p className="text-sm text-text-muted">
          Wachtwoorden zijn niet in te zien — alleen resetten. Het nieuwe wachtwoord wordt één keer
          getoond.
        </p>
        {accounts.length === 0 ? (
          <p className="text-sm text-text-subtle">Nog geen fondsaccounts.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {accounts.map((user) => (
              <Card key={user.id} className="flex flex-col gap-3 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm">{user.email}</span>
                  <Chip variant="caution">{user.role}</Chip>
                  {user.mustChangePassword ? (
                    <Chip variant="caution">Moet wachtwoord wijzigen</Chip>
                  ) : null}
                </div>
                <ChangeEmailForm fundKey={fund.key} userId={user.id} email={user.email} />
                <ResetPasswordForm fundKey={fund.key} userId={user.id} email={user.email} />
              </Card>
            ))}
          </div>
        )}
        {active ? (
          <Card className="p-5">
            <h4 className="text-sm font-semibold">Extra fondsaccount</h4>
            <p className="mt-1 mb-3 text-sm text-text-muted">Alleen platform-admin. Geen wachtwoord-inzage.</p>
            <AddUserForm fundKey={fund.key} />
          </Card>
        ) : null}
      </section>

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
