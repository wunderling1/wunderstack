/**
 * Shared eval harness mechanics — gate accumulator, prerequisite resolution, and simple check runners.
 * Agent-specific golden sets and gate run functions stay in cao.eval.ts (multi-agent entry via
 * agent-profile.ts). This module is the shared accumulator / credential resolution only.
 */
import { env } from "@wunderstack/shared";

import type { GateRequirement, GateSpec } from "./gates.js";
import type { GateReport } from "./report-writer.js";

export interface EvalCheck {
  name: string;
  ok: boolean;
  detail?: string;
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

export interface EvalHarness {
  gateResults: GateReport[];
  pushGate: (spec: GateSpec, checks: EvalCheck[], suffix?: string) => boolean;
  pushUnavailable: (spec: GateSpec, requirement: string) => boolean;
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
      console.log(
        `  [${check.ok ? "PASS" : "FAIL"}] ${check.name}${check.detail ? ` — ${check.detail}` : ""}`,
      );
    }
    const passed = checks.every((check) => check.ok);
    gateResults.push({
      id,
      layer: spec.layer,
      title: spec.title,
      status: passed ? "passed" : "failed",
      checks: checks.map((check) => ({
        name: check.name,
        ok: check.ok,
        ...(check.detail === undefined ? {} : { detail: check.detail }),
      })),
    });
    return passed;
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
    console.log(
      `\n${spec.layer} · ${spec.id}: SKIPPED (${requirement}). Set the credential(s) to run this gate; required on merge to main.`,
    );
    gateResults.push({
      id: spec.id,
      layer: spec.layer,
      title: spec.title,
      status: "skipped",
      checks: [{ name: `SKIPPED: ${requirement}`, ok: true }],
    });
    return true;
  }

  return {
    gateResults,
    pushGate,
    pushUnavailable,
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
