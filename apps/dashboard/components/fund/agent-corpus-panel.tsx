import { getCorpusOverview, type CorpusDocRow } from "@wunderstack/analytics";
import { Card, Chip, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@wunderstack/ui";
import { ApproveCorpusForm } from "@/components/fund/approve-corpus-form";
import { buildCorpusDecision, type CorpusDecision } from "@/lib/agent-profile";
import { formatCount } from "@/lib/overview";
import { getReleaseManifest } from "@/lib/release-manifest";

const dateTime = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" });
const nnb = (value: string | null) => value ?? "n.n.b.";

export async function AgentCorpusPanel({
  fundKey,
  agentKey,
  pinnedReleaseTag,
  canWrite,
}: {
  fundKey: string;
  agentKey: string;
  pinnedReleaseTag: string | null;
  canWrite: boolean;
}) {
  const docs = await getCorpusOverview(fundKey, agentKey);
  const manifest = getReleaseManifest(agentKey);
  const decision = buildCorpusDecision({
    documentVersions: docs.map((doc) => doc.version),
    pinnedReleaseTag,
    gateResult: manifest.stub || manifest.gateStatus === "unknown" ? null : manifest.gateStatus,
    gateEvaluatedAt: null,
    artefactUrl: null,
  });

  return (
    <div className="flex flex-col gap-6">
      <SourcesCard docs={docs} />
      <GateAndApprovalCard decision={decision} fundKey={fundKey} agentKey={agentKey} canWrite={canWrite} />
    </div>
  );
}

function SourcesCard({ docs }: { docs: CorpusDocRow[] }) {
  const chunks = docs.reduce((sum, doc) => sum + doc.chunkCount, 0);
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h3 className="text-sm font-semibold">Bronnen</h3>
        <p className="mt-1 text-sm text-text-muted">
          {docs.length === 0
            ? "Nog geen documenten voor deze agent."
            : `${formatCount(docs.length)} bronnen · ${formatCount(chunks)} chunks`}
        </p>
      </div>
      {docs.length === 0 ? null : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bron</TableHead>
              <TableHead>Versie</TableHead>
              <TableHead>Chunks</TableHead>
              <TableHead>Ingest</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.map((doc) => (
              <TableRow key={`${doc.sourceUri}-${doc.version}`}>
                <TableCell>
                  <div className="font-medium">{doc.title}</div>
                  <div className="break-all font-mono text-xs text-text-muted">{doc.sourceUri}</div>
                </TableCell>
                <TableCell className="font-mono text-xs">{doc.version || "n.n.b."}</TableCell>
                <TableCell>{formatCount(doc.chunkCount)}</TableCell>
                <TableCell className="whitespace-nowrap text-text-muted">
                  {dateTime.format(doc.ingestedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

function GateAndApprovalCard({
  decision,
  fundKey,
  agentKey,
  canWrite,
}: {
  decision: CorpusDecision;
  fundKey: string;
  agentKey: string;
  canWrite: boolean;
}) {
  const version = decision.corpusVersion;
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h3 className="text-sm font-semibold">Gate-uitslag en goedkeuring</h3>
        <p className="mt-1 text-sm text-text-muted">
          Wat de gate zei over deze corpusversie. Drempels en checks staan bij het agenttype op
          platformniveau — niet hier.
        </p>
      </div>
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-text-muted">Corpusversie</dt>
          <dd className="font-mono">{nnb(version)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Uitslag</dt>
          <dd>
            <Chip variant="refusal">{nnb(decision.gate.result)}</Chip>
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Datum</dt>
          <dd>
            {decision.gate.evaluatedAt ? dateTime.format(decision.gate.evaluatedAt) : "n.n.b."}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Artefact</dt>
          <dd>
            {decision.gate.artefactUrl ? (
              <a href={decision.gate.artefactUrl} className="text-primary hover:underline">
                Open
              </a>
            ) : (
              "n.n.b."
            )}
          </dd>
        </div>
      </dl>
      <p className="text-xs text-text-subtle">
        Goedkeuring en uitslag verwijzen naar dezelfde versie
        {version ? ` (${version})` : " (n.n.b.)"}.
      </p>
      {version && canWrite ? (
        <ApproveCorpusForm
          fundKey={fundKey}
          agentKey={agentKey}
          corpusVersion={version}
          approved={decision.approval.approved}
        />
      ) : version && decision.approval.approved ? (
        <p className="text-sm text-state-verified-fg">
          Goedgekeurd voor corpusversie <code className="font-mono">{version}</code>.
        </p>
      ) : (
        <p className="text-sm text-text-muted">
          {version
            ? "Nog niet goedgekeurd."
            : "Geen corpusversie om goed te keuren."}
        </p>
      )}
    </Card>
  );
}
