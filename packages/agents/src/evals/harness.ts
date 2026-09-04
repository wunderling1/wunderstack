/**
 * Shared eval harness mechanics — gate accumulator, prerequisite resolution, and simple check runners.
 * Agent-specific golden sets and gate run functions stay in cao.eval.ts (multi-agent entry via
 * agent-profile.ts). This module is the shared accumulator / credential resolution only.
 */
import { env } from "@wunderstack/shared";

import type { GateRequirement, GateSpec } from "./gates";
import type { GateReport } from "./report-writer";

export interface EvalCheck {
  name: string;
  ok: boolean;
  detail?: string;
  /**
   * When true, a red check is reported as WARN and does not fail the gate. Used for scaffold-content
   * quality floors on the PR path — measured and visible, not merge-blocking. See content-policy.ts.
   */
  advisory?: boolean;
}

export interface GateGroup {
  suffix: string;
  checks: EvalCheck[];
}

export type GateRunResult = EvalCheck[] | GateGroup[];

export interface EvalHarnessOptions {
  requireAll: boolean;
  requireDb: boolean;
}

/**
 * Human-readable why a gate was skipped (credentials/DB missing and not required on this job).
 * Exported so the wording stays testable — the old "required on merge to main" line was wrong for
 * G3 on push (GATE_DB is false there by policy).
 */
export function skipReason(requires: GateRequirement, requirement: string): string {
  if (requires.startsWith("db")) {
    return (
      "DB gates run on nightly/dispatch and on PRs that touch packages/db|rag|tenant — " +
      "not on every push to main."
    );
  }
  return `Set the credential(s) to run this gate (${requirement}).`;
}

export interface EvalHarness {
  gateResults: GateReport[];
  pushGate: (spec: GateSpec, checks: EvalCheck[], suffix?: string) => boolean;
  pushUnavailable: (spec: GateSpec, requirement: string) => boolean;
  /**
   * Record that a gate was deliberately not run because the PR path-scope excludes it.
   * Always returns true (not-applicable is not a failure). Only legal on EVAL_TIER=pr.
   */
  pushNotApplicable: (spec: GateSpec, reason: string) => boolean;
  credentialsAvailable: (requires: GateRequirement) => boolean;
  requiredWhenMissing: (requires: GateRequirement) => boolean;
  requirementLabel: (requires: GateRequirement) => string;
}

export function createEvalHarness(options: EvalHarnessOptions): EvalHarness {
  const gateResults: GateReport[] = [];

  function requiredWhenMissing(requires: GateRequirement): boolean {
    if (requires === "none") return false;
    return requires.startsWith("db") ? options.requireDb : options.requireAll;
  }

  function requirementLabel(requires: GateRequirement): string {
    switch (requires) {
      case "none":
        return "";
      case "mistral":
        return "MISTRAL_API_KEY not set";
      case "scaleway":
        return "SCALEWAY_API_KEY not set";
      case "scaleway+mistral":
        return "SCALEWAY_API_KEY and MISTRAL_API_KEY required";
      case "db+scaleway":
        return "DATABASE_URL and SCALEWAY_API_KEY required";
      case "db+scaleway+mistral":
        return "DATABASE_URL, SCALEWAY_API_KEY and MISTRAL_API_KEY required";
    }
  }

  function credentialsAvailable(requires: GateRequirement): boolean {
    switch (requires) {
      case "none":
        return true;
      case "mistral":
        return Boolean(env.MISTRAL_API_KEY);
      case "scaleway":
        return Boolean(env.SCALEWAY_API_KEY);
      case "scaleway+mistral":
        return Boolean(env.SCALEWAY_API_KEY && env.MISTRAL_API_KEY);
      case "db+scaleway":
        return Boolean(env.DATABASE_URL && env.SCALEWAY_API_KEY);
      case "db+scaleway+mistral":
        return Boolean(env.DATABASE_URL && env.SCALEWAY_API_KEY && env.MISTRAL_API_KEY);
    }
  }

  function pushGate(spec: GateSpec, checks: EvalCheck[], suffix?: string): boolean {
    const id = suffix === undefined ? spec.id : `${spec.id} [${suffix}]`;
    console.log(`\n${spec.layer} · ${id} — ${spec.title}:`);
    for (const check of checks) {
      const advisoryFail = !check.ok && check.advisory === true;
      const prefix = check.ok ? "PASS" : advisoryFail ? "WARN" : "FAIL";
      const advisoryTail = advisoryFail
        ? " — advisory (scaffold-content, niet merge-blocking)"
        : "";
      console.log(
        `  [${prefix}] ${check.name}${check.detail ? ` — ${check.detail}` : ""}${advisoryTail}`,
      );
    }
    // Advisory reds are visible but do not fail the gate. Blocking reds always win.
    const blocking = checks.filter((check) => check.advisory !== true);
    const blockingPassed = blocking.every((check) => check.ok);
    const hasAdvisoryFail = checks.some((check) => !check.ok && check.advisory === true);
    const status = !blockingPassed
      ? "failed"
      : hasAdvisoryFail
        ? "advisory-failed"
        : "passed";
    gateResults.push({
      id,
      layer: spec.layer,
      title: spec.title,
      status,
      checks: checks.map((check) => ({
        name: check.name,
        ok: check.ok,
        ...(check.detail === undefined ? {} : { detail: check.detail }),
        ...(check.advisory === true ? { advisory: true } : {}),
      })),
    });
    return blockingPassed;
  }

  function pushNotApplicable(spec: GateSpec, reason: string): boolean {
    console.log(`\n${spec.layer} · ${spec.id}: NOT APPLICABLE — ${reason}`);
    gateResults.push({
      id: spec.id,
      layer: spec.layer,
      title: spec.title,
      status: "not-applicable",
      checks: [
        {
          name: `NOT APPLICABLE: ${reason}`,
          ok: true,
          advisory: true,
        },
      ],
    });
    return true;
  }

  function pushUnavailable(spec: GateSpec, requirement: string): boolean {
    const required = requiredWhenMissing(spec.requires);
    if (required) {
      console.log(
        `\n${spec.layer} · ${spec.id}: REQUIRED-BUT-UNAVAILABLE — ${requirement} (required on this job).`,
      );
      gateResults.push({
        id: spec.id,
        layer: spec.layer,
        title: spec.title,
        status: "failed",
        checks: [{ name: `REQUIRED-BUT-UNAVAILABLE: ${requirement}`, ok: false }],
      });
      return false;
    }
    // DB gates (G3) are optional on push/merge: GATE_DB is only true on nightly/dispatch and on
    // PRs that touch packages/db|rag|tenant. Key gates use EVAL_REQUIRE_ALL instead.
    const skipDetail = skipReason(spec.requires, requirement);
    console.log(`\n${spec.layer} · ${spec.id}: SKIPPED (${requirement}). ${skipDetail}`);
    gateResults.push({
      id: spec.id,
      layer: spec.layer,
      title: spec.title,
      status: "skipped",
      checks: [{ name: `SKIPPED: ${requirement}`, ok: true, detail: skipDetail }],
    });
    return true;
  }

  return {
    gateResults,
    pushGate,
    pushUnavailable,
    pushNotApplicable,
    credentialsAvailable,
    requiredWhenMissing,
    requirementLabel,
  };
}

/** Log and aggregate a flat check list (G1-style entries). */
export function runEvalChecks(checks: EvalCheck[]): boolean {
  let allPassed = true;
  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
    allPassed = check.ok && allPassed;
  }
  return allPassed;
}

export type EvalVerdictKind = "PASSED" | "INCOMPLETE" | "FAILED";

export interface EvalVerdict {
  kind: EvalVerdictKind;
  /** Gates that ran (passed, failed, or advisory-failed). */
  run: number;
  /** Gates skipped for missing credentials/DB (not required on this job). */
  skipped: number;
  /** Gates excluded by path-scope (not a skip). */
  notApplicable: number;
  /** Console line for the end of the run. */
  line: string;
}

/**
 * Final eval line. A run with skipped gates must never read as PASSED — that was F0-04:
 * seven of nine gates SKIPPED and the script still printed "Eval PASSED".
 * Exit code stays 0 on INCOMPLETE (fork PRs skip G2/G3 by design); FAILED keeps exit 1.
 */
export function formatEvalVerdict(
  results: readonly Pick<GateReport, "status">[],
  options: { allPassed: boolean; partialFilter?: boolean } = { allPassed: true },
): EvalVerdict {
  const skipped = results.filter((r) => r.status === "skipped").length;
  const notApplicable = results.filter((r) => r.status === "not-applicable").length;
  const run = results.length - skipped - notApplicable;
  const incomplete = skipped > 0 || options.partialFilter === true;

  if (!options.allPassed) {
    return {
      kind: "FAILED",
      run,
      skipped,
      notApplicable,
      line: "Eval FAILED — an accuracy gate regressed or a required gate could not run. See above.",
    };
  }
  if (incomplete) {
    return {
      kind: "INCOMPLETE",
      run,
      skipped,
      notApplicable,
      line: `Eval INCOMPLETE — ${String(run)} run, ${String(skipped)} skipped.`,
    };
  }
  return {
    kind: "PASSED",
    run,
    skipped,
    notApplicable,
    line: `Eval PASSED — ${String(run)} run, 0 skipped.`,
  };
}
