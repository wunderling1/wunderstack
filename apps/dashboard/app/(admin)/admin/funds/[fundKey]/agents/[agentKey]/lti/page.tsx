import { Card, Chip, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@wunderstack/ui";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { listLti11ConsumersCached, listScenariosCached } from "@/lib/fund-lookups";
import { parseAgentKey, parseFundKey } from "@/lib/route-params";
import { CreateLtiConsumerForm, DeactivateLtiConsumerForm, LtiPassbackToggle } from "./lti-forms";

function launchBase(): string | null {
  return env.ROLEPLAY_PUBLIC_URL ? env.ROLEPLAY_PUBLIC_URL.replace(/\/$/, "") : null;
}

function launchPath(slug: string): string {
  return `/api/lti11/launch/gesprek/${slug}`;
}

export default async function RoleplayLtiPage({
  params,
}: {
  params: Promise<{ fundKey: string; agentKey: string }>;
}) {
  const { fundKey: rawFund, agentKey: rawAgent } = await params;
  const fundKey = parseFundKey(rawFund);
  const agentKey = parseAgentKey(rawAgent);
  if (!fundKey || agentKey !== "roleplay") notFound();

  const [consumers, scenarios] = await Promise.all([
    listLti11ConsumersCached(fundKey),
    listScenariosCached(fundKey),
  ]);
  const published = scenarios.filter((row) => row.status === "published");
  const origin = launchBase();

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4 p-5">
        <div>
          <h3 className="text-sm font-semibold">LTI 1.1</h3>
          <p className="mt-1 text-sm text-text-muted">
            Het LMS POSTet naar de launch-URL hieronder. Geen leerlingaccounts: alleen een
            ondoorzichtig pseudoniem. Cijferteruggave is per koppeling opt-in en gebruikt het bestaande
            gewogen cijfer (0–1), geen nieuwe geslaagd/gezakt-drempel.
          </p>
        </div>
        <CreateLtiConsumerForm fundKey={fundKey} />
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h3 className="text-sm font-semibold">Launch-URL per gepubliceerd scenario</h3>
        {origin ? null : (
          <p className="text-sm text-text-muted">
            Zet <code className="font-mono">ROLEPLAY_PUBLIC_URL</code> om de volledige URL te tonen.
          </p>
        )}
        {published.length === 0 ? (
          <p className="text-sm text-text-subtle">Publiceer eerst een scenario.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scenario</TableHead>
                <TableHead>Launch-URL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {published.map((row) => {
                const path = launchPath(row.slug);
                const href = origin ? `${origin}${path}` : path;
                return (
                  <TableRow key={row.slug}>
                    <TableCell>{row.title.trim() || row.slug}</TableCell>
                    <TableCell className="font-mono text-xs break-all">{href}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h3 className="text-sm font-semibold">Koppelingen</h3>
        {consumers.length === 0 ? (
          <p className="text-sm text-text-subtle">Nog geen LMS-koppeling.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>Consumer key</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cijferteruggave</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {consumers.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell className="font-mono text-xs">{row.consumerKey}</TableCell>
                  <TableCell>
                    <Chip variant={row.status === "active" ? "verified" : "refusal"}>
                      {row.status === "active" ? "Actief" : "Inactief"}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    {row.status === "active" ? (
                      <LtiPassbackToggle
                        fundKey={fundKey}
                        consumerId={row.id}
                        enabled={row.gradePassbackEnabled}
                      />
                    ) : (
                      row.gradePassbackEnabled ? "Aan" : "Uit"
                    )}
                  </TableCell>
                  <TableCell>
                    {row.status === "active" ? (
                      <DeactivateLtiConsumerForm fundKey={fundKey} consumerId={row.id} />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
