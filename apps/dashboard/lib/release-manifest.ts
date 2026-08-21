/**
 * Release-manifest seam (Fase 3, admin-view).
 *
 * The real per-agent release manifest — release tag, gate-run status, goldenset/corpus/profile/
 * invariant versions, threshold deviations — is produced by the release/gate pipeline, which lives in
 * the pulled-out gate-restructure spoor (PLAN-ui-ecosystem §7). Until that lands there is no honest
 * data source, so this returns a STUB: every gate/version field is null and gateStatus is "unknown".
 * The admin view renders these as "n.n.b." rather than inventing a green gate — red stays red (§1).
 *
 * Swap `getReleaseManifest` for the real provider (reading the release manifest by tag) when §7 ships;
 * the typed shape below is the contract the admin view already renders against.
 */

import { env } from "@/lib/env";

export type GateStatus = "green" | "amber" | "red" | "unknown";

export interface ThresholdDeviation {
  metric: string;
  note: string;
  adrUrl: string | null;
}

export interface ReleaseManifest {
  agentId: string;
  releaseTag: string | null;
  gateStatus: GateStatus;
  goldensetVersion: string | null;
  corpusVersion: string | null;
  profileVersion: string | null;
  invariantVersion: string | null;
  thresholdDeviations: ThresholdDeviation[];
  langfuseUrl: string | null;
  /** True while this is the pre-§7 stub (no real manifest source yet). */
  stub: boolean;
}

export interface KnownAgent {
  id: string;
  label: string;
}

/**
 * Minimal known-agents list so the admin overview shows the catalog even before any activity is
 * logged. Kept local (id + label only) so the dashboard never imports `@wunderstack/agents` and thus
 * never drags the Mastra runtime into a read-only surface. When §7 ships, the manifest becomes the
 * source of the agent list.
 */
export const KNOWN_AGENTS: KnownAgent[] = [
  { id: "cao", label: "CAO-agent" },
  { id: "arbo", label: "Arbocatalogus-agent" },
];

export function agentLabel(agentId: string): string {
  return KNOWN_AGENTS.find((agent) => agent.id === agentId)?.label ?? agentId;
}

export function getReleaseManifest(agentId: string): ReleaseManifest {
  return {
    agentId,
    releaseTag: null,
    gateStatus: "unknown",
    goldensetVersion: null,
    corpusVersion: null,
    profileVersion: null,
    invariantVersion: null,
    thresholdDeviations: [],
    langfuseUrl: langfuseWorkspaceUrl(),
    stub: true,
  };
}

/**
 * Link into Langfuse when a base URL is configured (else null → shown disabled). A project-scoped,
 * per-agent deep link needs the Langfuse project id, which the real manifest will carry (§7); until
 * then this lands in the configured Langfuse workspace rather than fabricating a 404 path.
 */
function langfuseWorkspaceUrl(): string | null {
  const base = env.LANGFUSE_BASE_URL;
  return base ? base.replace(/\/$/, "") : null;
}
