"use client";

import {
  ROLEPLAY_DIFFICULTIES,
  ROLEPLAY_DIFFICULTY_LABELS,
  ROLEPLAY_SCENARIO_STATUS_LABELS,
  ROLEPLAY_SCENARIO_STATUSES,
  percentagesFromRatings,
  type RoleplayRubricDraft,
  type RoleplayScenarioDraft,
  type RubricCriterionDraft,
} from "@wunderstack/shared";
import { Button, Card, Field, Select, Textarea } from "@wunderstack/ui";
import { useActionState, useState, type ReactNode } from "react";
import {
  createScenarioAction,
  updateScenarioAction,
  type ScenarioFormState,
} from "./actions";

function emptyCriterion(): RubricCriterionDraft {
  return { question: "", description: "", weight: 3, behavioralIndicators: [] };
}

function Label({ children }: { children: ReactNode }) {
  return <span className="text-sm text-text-muted">{children}</span>;
}

function Hint({ children }: { children: ReactNode }) {
  return <span className="text-xs text-text-subtle">{children}</span>;
}

function FieldBlock({ children }: { children: ReactNode }) {
  return <label className="flex flex-col gap-1">{children}</label>;
}

export function ScenarioForm({
  fundKey,
  mode,
  slug,
  version,
  draft,
  notice,
}: {
  fundKey: string;
  mode: "create" | "edit";
  slug: string;
  version?: number;
  draft: RoleplayScenarioDraft;
  notice?: string | null;
}) {
  const action = mode === "create" ? createScenarioAction : updateScenarioAction;
  const [state, formAction, pending] = useActionState(action, null as ScenarioFormState);
  const [rubric, setRubric] = useState<RoleplayRubricDraft>(draft.rubric);
  const percents = percentagesFromRatings(rubric.criteria.map((criterion) => criterion.weight));

  function updateCriterion(index: number, patch: Partial<RubricCriterionDraft>) {
    setRubric((current) => ({
      ...current,
      criteria: current.criteria.map((criterion, i) =>
        i === index ? { ...criterion, ...patch } : criterion,
      ),
    }));
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="fundKey" value={fundKey} />
      <input type="hidden" name="agentKey" value="roleplay" />
      {mode === "edit" ? <input type="hidden" name="slug" value={slug} /> : null}
      <input type="hidden" name="rubric" value={JSON.stringify(rubric)} />

      {notice === "unpublished" && !state ? (
        <p className="text-sm text-state-caution-fg" role="status">
          Opgeslagen als concept — vul de ontbrekende velden in voor publicatie.
        </p>
      ) : null}
      {state?.ok === false ? (
        <p className="text-sm text-state-refusal-fg" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.ok === true ? (
        <p className="text-sm text-state-verified-fg">Scenario opgeslagen.</p>
      ) : null}

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold">Identiteit</h3>
          {typeof version === "number" ? (
            <p className="text-xs text-text-subtle">Versie {version}</p>
          ) : null}
        </div>
        <FieldBlock>
          <Label>Slug</Label>
          <Field
            name={mode === "create" ? "slug" : undefined}
            required={mode === "create"}
            defaultValue={slug}
            disabled={mode === "edit"}
            placeholder="klachtgesprek"
            autoComplete="off"
          />
          <Hint>
            {mode === "create"
              ? "Kleine letters, cijfers en koppeltekens. Niet meer wijzigbaar na opslaan."
              : "De slug is de sleutel van dit scenario en wijzigt niet."}
          </Hint>
        </FieldBlock>
        <FieldBlock>
          <Label>Titel</Label>
          <Field name="title" defaultValue={draft.title} placeholder="Klachtgesprek late levering" />
        </FieldBlock>
        <FieldBlock>
          <Label>Korte beschrijving</Label>
          <Textarea name="description" rows={2} defaultValue={draft.description} />
        </FieldBlock>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldBlock>
            <Label>Status</Label>
            <Select name="status" defaultValue={draft.status}>
              {ROLEPLAY_SCENARIO_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {ROLEPLAY_SCENARIO_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </FieldBlock>
          <FieldBlock>
            <Label>Maximum beurten</Label>
            <Field
              name="maxTurns"
              type="number"
              min={1}
              max={100}
              defaultValue={draft.maxTurns}
            />
          </FieldBlock>
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h3 className="text-sm font-semibold">Rollen</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldBlock>
            <Label>Rol van de AI</Label>
            <Field name="partnerRole" defaultValue={draft.partnerRole} placeholder="ontevreden klant" />
          </FieldBlock>
          <FieldBlock>
            <Label>Rol van de deelnemer</Label>
            <Field
              name="userRole"
              defaultValue={draft.userRole}
              placeholder="medewerker klantenservice"
            />
          </FieldBlock>
        </div>
        <FieldBlock>
          <Label>Aanspreektitel deelnemer (optioneel)</Label>
          <Field name="userTitle" defaultValue={draft.userTitle} placeholder="u / je" />
        </FieldBlock>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h3 className="text-sm font-semibold">Persona en situatie</h3>
        <FieldBlock>
          <Label>Persona-instructie</Label>
          <Textarea
            name="persona"
            rows={5}
            defaultValue={draft.persona}
            placeholder="Jij speelt de rol van een ontevreden klant die al drie weken wacht op een levering."
          />
          <Hint>
            Altijd &quot;Jij speelt de rol van …&quot;. Nooit &quot;Je bent X&quot; — dan spreekt het
            model de deelnemer aan als X.
          </Hint>
        </FieldBlock>
        <FieldBlock>
          <Label>Situatie</Label>
          <Textarea name="contextDescription" rows={4} defaultValue={draft.contextDescription} />
        </FieldBlock>
        <FieldBlock>
          <Label>Verborgen informatie (optioneel)</Label>
          <Textarea name="hiddenInformation" rows={3} defaultValue={draft.hiddenInformation} />
          <Hint>Wat de persona weet maar niet uit zichzelf vertelt.</Hint>
        </FieldBlock>
        <FieldBlock>
          <Label>Extra instructies (optioneel)</Label>
          <Textarea name="instructions" rows={3} defaultValue={draft.instructions} />
        </FieldBlock>
        <FieldBlock>
          <Label>Openingszin</Label>
          <Textarea name="openingLine" rows={3} defaultValue={draft.openingLine} />
        </FieldBlock>
        <FieldBlock>
          <Label>Eindconditie (optioneel)</Label>
          <Textarea name="endCondition" rows={2} defaultValue={draft.endCondition} />
        </FieldBlock>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h3 className="text-sm font-semibold">Leerdoel</h3>
        <FieldBlock>
          <Label>Leerdoel</Label>
          <Textarea name="learningObjective" rows={3} defaultValue={draft.learningObjective} />
        </FieldBlock>
        <FieldBlock>
          <Label>Secundair doel (optioneel)</Label>
          <Textarea name="secondaryObjective" rows={2} defaultValue={draft.secondaryObjective} />
        </FieldBlock>
        <FieldBlock>
          <Label>Veelgemaakte valkuilen (één per regel)</Label>
          <Textarea name="commonPitfalls" rows={3} defaultValue={draft.commonPitfalls.join("\n")} />
        </FieldBlock>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h3 className="text-sm font-semibold">Briefing</h3>
        <FieldBlock>
          <Label>Tekst voor de deelnemer</Label>
          <Textarea name="briefing" rows={5} defaultValue={draft.briefing} />
          <Hint>
            De deelnemer leest dit vóór de openingszin. Deze tekst gaat nooit naar het model — anders
            lekt de opdracht in de persona.
          </Hint>
        </FieldBlock>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h3 className="text-sm font-semibold">Rubriek</h3>
        <p className="text-sm text-text-muted">
          Gewicht is een belang van 1 tot 5. Percentages worden bij de beoordeling uitgerekend, niet
          door jou.
        </p>
        {rubric.criteria.map((criterion, index) => (
          <div key={index} className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Criterium {index + 1}</p>
              <p className="text-xs text-text-subtle">{percents[index]?.toFixed(2) ?? "0"}%</p>
            </div>
            <FieldBlock>
              <Label>Vraag</Label>
              <Field
                value={criterion.question}
                onChange={(event) => updateCriterion(index, { question: event.target.value })}
                placeholder="Vraagt de deelnemer door?"
              />
            </FieldBlock>
            <FieldBlock>
              <Label>Toelichting (optioneel)</Label>
              <Textarea
                rows={2}
                value={criterion.description}
                onChange={(event) => updateCriterion(index, { description: event.target.value })}
              />
            </FieldBlock>
            <FieldBlock>
              <Label>Belang (1–5)</Label>
              <Select
                value={String(criterion.weight)}
                onChange={(event) =>
                  updateCriterion(index, { weight: Number.parseInt(event.target.value, 10) })
                }
              >
                {[1, 2, 3, 4, 5].map((weight) => (
                  <option key={weight} value={weight}>
                    {weight}
                  </option>
                ))}
              </Select>
            </FieldBlock>
            <FieldBlock>
              <Label>Indicatoren (één per regel)</Label>
              <Textarea
                rows={2}
                value={criterion.behavioralIndicators.join("\n")}
                onChange={(event) =>
                  updateCriterion(index, {
                    behavioralIndicators: event.target.value.split("\n"),
                  })
                }
              />
            </FieldBlock>
            {rubric.criteria.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                className="self-start"
                onClick={() =>
                  setRubric((current) => ({
                    ...current,
                    criteria: current.criteria.filter((_, i) => i !== index),
                  }))
                }
              >
                Criterium verwijderen
              </Button>
            ) : null}
          </div>
        ))}
        {rubric.criteria.length < 12 ? (
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            onClick={() =>
              setRubric((current) => ({
                ...current,
                criteria: [...current.criteria, emptyCriterion()],
              }))
            }
          >
            Criterium toevoegen
          </Button>
        ) : null}
        <FieldBlock>
          <Label>Extra instructie voor de beoordelaar (optioneel)</Label>
          <Textarea
            rows={3}
            value={rubric.reviewPrompt}
            onChange={(event) => setRubric((current) => ({ ...current, reviewPrompt: event.target.value }))}
          />
        </FieldBlock>
        <FieldBlock>
          <Label>Drempel (0–10)</Label>
          <Field
            type="number"
            min={0}
            max={10}
            step={0.1}
            value={rubric.passThreshold}
            onChange={(event) =>
              setRubric((current) => ({
                ...current,
                passThreshold: Number.parseFloat(event.target.value),
              }))
            }
          />
        </FieldBlock>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h3 className="text-sm font-semibold">Moeilijkheid (optioneel)</h3>
        <p className="text-sm text-text-muted">
          Leeg laten mag. Een scenario is speelbaar zonder extra tekst per niveau.
        </p>
        {ROLEPLAY_DIFFICULTIES.map((level) => (
          <div key={level} className="flex flex-col gap-3">
            <p className="text-sm font-medium">{ROLEPLAY_DIFFICULTY_LABELS[level]}</p>
            <FieldBlock>
              <Label>Gespreksprompt</Label>
              <Textarea
                name={`difficulty_${level}_conversation`}
                rows={2}
                defaultValue={draft.difficulties[level]?.conversationPrompt ?? ""}
              />
            </FieldBlock>
            <FieldBlock>
              <Label>Beoordelingsprompt</Label>
              <Textarea
                name={`difficulty_${level}_review`}
                rows={2}
                defaultValue={draft.difficulties[level]?.reviewPrompt ?? ""}
              />
            </FieldBlock>
          </div>
        ))}
      </Card>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Bezig…" : mode === "create" ? "Scenario aanmaken" : "Opslaan"}
      </Button>
    </form>
  );
}
