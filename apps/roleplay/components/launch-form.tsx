"use client";

import { Button, Field, Select } from "@wunderstack/ui";
import {
  ROLEPLAY_DIFFICULTIES,
  ROLEPLAY_DIFFICULTY_LABELS,
  type RoleplayDifficulty,
} from "@wunderstack/shared/browser";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

/**
 * Local-dev / admin entry before fase 5 publishes a catalog the LMS can deep-link into.
 * A production launch arrives with `?scenario=` already set and never renders this form.
 */
export function LaunchForm() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [difficulty, setDifficulty] = useState<RoleplayDifficulty | "">("");

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = slug.trim();
    if (trimmed.length === 0) {
      return;
    }
    const params = new URLSearchParams({ scenario: trimmed });
    if (difficulty !== "") {
      params.set("difficulty", difficulty);
    }
    router.push(`/?${params.toString()}`);
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-primary">Rollenspel</p>
        <h1 className="font-display text-2xl font-semibold text-text">Welk scenario wil je oefenen?</h1>
        <p className="text-sm text-text-muted">
          Vul de slug van een gepubliceerd scenario in. In een echte les opent deze pagina vanuit
          het LMS met het scenario al gekozen.
        </p>
      </header>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm text-text">
          Scenario
          <Field
            name="scenario"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="bijvoorbeeld lastig-gesprek"
            autoComplete="off"
            required
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-text">
          Moeilijkheid
          <Select
            name="difficulty"
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value as RoleplayDifficulty | "")}
          >
            <option value="">Standaard</option>
            {ROLEPLAY_DIFFICULTIES.map((level) => (
              <option key={level} value={level}>
                {ROLEPLAY_DIFFICULTY_LABELS[level]}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" disabled={slug.trim().length === 0}>
          Voorbereiden
        </Button>
      </form>
    </div>
  );
}
