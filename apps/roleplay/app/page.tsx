import {
  roleplayDifficultySchema,
  type RoleplayDifficulty,
} from "@wunderstack/shared/browser";

import { LaunchForm } from "@/components/launch-form";
import { Session } from "@/components/session";

function parseDifficulty(value: string | string[] | undefined): RoleplayDifficulty | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = roleplayDifficultySchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export default async function RoleplayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const scenario = typeof params.scenario === "string" ? params.scenario.trim() : "";
  const difficulty = parseDifficulty(params.difficulty);

  if (scenario.length === 0) {
    return <LaunchForm />;
  }

  return (
    <Session
      key={`${scenario}:${difficulty ?? ""}`}
      scenarioSlug={scenario}
      {...(difficulty === undefined ? {} : { difficulty })}
    />
  );
}
