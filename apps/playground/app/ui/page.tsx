"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  AgentStatusBadge,
  AnswerCard,
  AnswerTrace,
  Breadcrumbs,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Card,
  Checkbox,
  Chip,
  CitationBadge,
  CitationBlock,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  IconButton,
  KpiTile,
  Pill,
  Radio,
  RadioGroup,
  RefusalNotice,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@wunderstack/ui";
import { ArrowRight } from "lucide-react";
import { useState, type ReactNode } from "react";

const SCALE_SAMPLE = "Hoeveel vakantiedagen heb ik volgens de CAO?";

const SEMANTIC_COLORS = [
  { token: "--color-page", hex: "#fafaf9" },
  { token: "--color-surface", hex: "#ffffff" },
  { token: "--color-surface-sunk", hex: "#f2f1f0" },
  { token: "--color-border", hex: "#e5e5e3" },
  { token: "--color-text", hex: "#0f0e0d" },
  { token: "--color-text-muted", hex: "#706d66" },
  { token: "--color-text-subtle", hex: "#8f8b85" },
  { token: "--color-primary", hex: "#3135c9" },
  { token: "--color-primary-hover", hex: "#2629a3" },
  { token: "--color-primary-tint", hex: "#eeeefa" },
  { token: "--color-on-primary", hex: "#ffffff" },
] as const;

const INDIGO_LADDER = [
  { token: "--indigo-50", hex: "#eeeefa" },
  { token: "--indigo-100", hex: "#d9daf4" },
  { token: "--indigo-200", hex: "#b4b6ea" },
  { token: "--indigo-400", hex: "#6165df" },
  { token: "--indigo-600", hex: "#3135c9" },
  { token: "--indigo-700", hex: "#2629a3" },
  { token: "--indigo-900", hex: "#191b66" },
] as const;

const NEUTRAL_LADDER = [
  { token: "--neutral-0", hex: "#ffffff" },
  { token: "--neutral-50", hex: "#fafaf9" },
  { token: "--neutral-100", hex: "#f2f1f0" },
  { token: "--neutral-200", hex: "#e5e5e3" },
  { token: "--neutral-300", hex: "#cccac6" },
  { token: "--neutral-400", hex: "#adaba5" },
  { token: "--neutral-500", hex: "#8f8b85" },
  { token: "--neutral-600", hex: "#706d66" },
  { token: "--neutral-700", hex: "#524f49" },
  { token: "--neutral-800", hex: "#33312c" },
  { token: "--neutral-900", hex: "#1f1d1a" },
  { token: "--neutral-950", hex: "#0f0e0d" },
] as const;

const STATE_PAIRS = [
  { bg: "--state-verified-bg", fg: "--state-verified-fg", bgHex: "#e7f5ea", fgHex: "#2e7d46" },
  { bg: "--state-caution-bg", fg: "--state-caution-fg", bgHex: "#fbf1de", fgHex: "#b4791e" },
  { bg: "--state-refusal-bg", fg: "--state-refusal-fg", bgHex: "#f1f2f4", fgHex: "#4a515c" },
  { bg: "--state-danger-bg", fg: "--state-danger-fg", bgHex: "#fbe9ef", fgHex: "#b03a63" },
] as const;

const FONTS = [
  {
    token: "--font-display",
    utility: "font-display",
    family: "Spectral",
    role: "Headings, KPI-waarden, display",
    className: "font-display font-semibold",
  },
  {
    token: "--font-body",
    utility: "font-sans (default)",
    family: "Inter",
    role: "Body, UI-copy, controls",
    className: "font-sans",
  },
] as const;

const TYPE_SCALE = [
  { token: "--text-3xl", utility: "text-3xl", px: "39px", className: "text-3xl" },
  { token: "--text-2xl", utility: "text-2xl", px: "31px", className: "text-2xl" },
  { token: "--text-xl", utility: "text-xl", px: "25px", className: "text-xl" },
  { token: "--text-lg", utility: "text-lg", px: "20px", className: "text-lg" },
  { token: "--text-base", utility: "text-base", px: "16px", className: "text-base" },
  { token: "--text-sm", utility: "text-sm", px: "14px", className: "text-sm" },
  { token: "--text-xs", utility: "text-xs", px: "12px", className: "text-xs" },
] as const;

const HEADINGS = [
  {
    tag: "h1" as const,
    role: "Pagina-titel",
    utility: "font-display text-3xl font-semibold",
    px: "39px",
    className: "font-display text-3xl font-semibold text-text",
    sample: "Design system — preview",
  },
  {
    tag: "h1" as const,
    role: "Pagina / hero-sectie",
    utility: "font-display text-2xl font-semibold",
    px: "31px",
    className: "font-display text-2xl font-semibold text-text",
    sample: "Agent-catalogus",
  },
  {
    tag: "h2" as const,
    role: "Sectie",
    utility: "font-display text-xl font-semibold",
    px: "25px",
    className: "font-display text-xl font-semibold text-text",
    sample: "Wat het doet",
  },
  {
    tag: "h2" as const,
    role: "Paneel / dialog",
    utility: "font-display text-lg font-semibold",
    px: "20px",
    className: "font-display text-lg font-semibold text-text",
    sample: "Snippet kopiëren",
  },
  {
    tag: "h3" as const,
    role: "Kaart-titel",
    utility: "font-display text-base font-semibold",
    px: "16px",
    className: "font-display text-base font-semibold text-text",
    sample: "CAO-agent",
  },
  {
    tag: "p" as const,
    role: "Eyebrow / sectielabel",
    utility: "text-xs font-medium uppercase tracking-wide",
    px: "12px",
    className: "text-xs font-medium uppercase tracking-wide text-text-subtle",
    sample: "Bronnen",
  },
];

/**
 * Lightweight design-system preview (D16 / Fase 2). Not Storybook — a single route that renders every
 * primitive and trust-pattern so the shared `@wunderstack/ui` surface can be eyeballed in one place.
 */
export default function UiPreviewPage() {
  const [contract, setContract] = useState("fulltime");

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <header className="mb-10">
        <h1 className="font-display text-3xl font-semibold">Design system — preview</h1>
        <p className="mt-1 text-sm text-text-muted">
          Kleur, typeschaal, primitives en trust-patterns uit <code>@wunderstack/ui</code>.
          Componenten gebruiken alleen semantische tokens; de primitive ladders zijn de ramp eronder.
        </p>
      </header>

      <Section title="Color — semantic">
        <p className="mb-4 text-sm text-text-muted">
          Wat componenten mogen refereren (<code>--color-*</code>, <code>--state-*</code>). Bindingen
          staan in <code>packages/ui/src/tokens/semantic.css</code>.
        </p>
        <SwatchGrid>
          {SEMANTIC_COLORS.map((swatch) => (
            <Swatch key={swatch.token} token={swatch.token} hex={swatch.hex} />
          ))}
        </SwatchGrid>
        <h3 className="mt-8 mb-3 text-sm font-semibold text-text">State pairs</h3>
        <SwatchGrid>
          {STATE_PAIRS.flatMap((pair) => [
            <Swatch key={pair.bg} token={pair.bg} hex={pair.bgHex} />,
            <Swatch key={pair.fg} token={pair.fg} hex={pair.fgHex} />,
          ])}
        </SwatchGrid>
      </Section>

      <Section title="Color — primitive ladders">
        <p className="mb-4 text-sm text-text-muted">
          Ruwe ramps in <code>packages/ui/src/tokens/primitive.css</code>. Niet in componenten
          gebruiken.
        </p>
        <h3 className="mb-3 text-sm font-semibold text-text">Indigo</h3>
        <SwatchGrid>
          {INDIGO_LADDER.map((swatch) => (
            <Swatch key={swatch.token} token={swatch.token} hex={swatch.hex} />
          ))}
        </SwatchGrid>
        <h3 className="mt-8 mb-3 text-sm font-semibold text-text">Neutral</h3>
        <SwatchGrid>
          {NEUTRAL_LADDER.map((swatch) => (
            <Swatch key={swatch.token} token={swatch.token} hex={swatch.hex} />
          ))}
        </SwatchGrid>
      </Section>

      <Section title="Typography">
        <div className="grid gap-4 sm:grid-cols-2">
          {FONTS.map((font) => (
            <div key={font.token} className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
              <p className="font-mono text-xs text-text-subtle">{font.token}</p>
              <p className="mt-0.5 font-mono text-xs text-text-muted">{font.utility}</p>
              <p className={`mt-3 text-2xl ${font.className}`}>{font.family}</p>
              <p className="mt-1 text-sm text-text-muted">{font.role}</p>
            </div>
          ))}
        </div>

        <h3 className="mt-8 mb-3 text-sm font-semibold text-text">Type scale</h3>
        <p className="mb-4 text-sm text-text-muted">
          Semantische tokens uit <code>--text-*</code>. Pixelwaarden staan in{" "}
          <code>packages/ui/src/tokens/semantic.css</code>.
        </p>
        <div className="divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface">
          {TYPE_SCALE.map((step) => (
            <div key={step.token} className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-baseline sm:gap-6">
              <div className="w-40 shrink-0">
                <p className="font-mono text-xs text-text">{step.utility}</p>
                <p className="font-mono text-xs text-text-subtle">
                  {step.token} · {step.px}
                </p>
              </div>
              <p className={`min-w-0 text-text ${step.className}`}>{SCALE_SAMPLE}</p>
            </div>
          ))}
        </div>

        <h3 className="mt-8 mb-3 text-sm font-semibold text-text">Headings</h3>
        <p className="mb-4 text-sm text-text-muted">
          Display-font (Spectral) + semibold op de typeschaal. Geen aparte heading-tokens — dit zijn de
          recepten die apps nu gebruiken.
        </p>
        <div className="divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface">
          {HEADINGS.map((heading) => {
            const Tag = heading.tag;
            return (
              <div key={heading.role} className="px-4 py-4">
                <p className="mb-2 font-mono text-xs text-text-subtle">
                  {heading.role} · {heading.utility} · {heading.px}
                </p>
                <Tag className={heading.className}>{heading.sample}</Tag>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button shape="pill">Pill</Button>
          <IconButton label="Volgende">
            <ArrowRight className="h-4 w-4" />
          </IconButton>
        </div>
      </Section>

      <Section title="Chips & status">
        <div className="flex flex-wrap items-center gap-3">
          <Chip variant="verified">Geverifieerd</Chip>
          <Chip variant="caution">Let op</Chip>
          <Chip variant="refusal">Niet in de bron</Chip>
          <Chip variant="danger">Fout</Chip>
          <AgentStatusBadge status="operational" />
          <AgentStatusBadge status="degraded" />
          <AgentStatusBadge status="offline" />
        </div>
      </Section>

      <Section title="Field">
        <Field placeholder="Stel je vraag…" className="max-w-sm" />
      </Section>

      <Section title="Textarea">
        <Textarea placeholder="Eén origin per regel…" rows={3} className="max-w-sm" />
      </Section>

      <Section title="Select (dropdown)">
        <div className="max-w-sm">
          <Select defaultValue="cao" aria-label="Kies een agent">
            <option value="cao">CAO-agent</option>
            <option value="verzuim">Verzuim-agent</option>
            <option value="subsidie">Subsidie-agent</option>
          </Select>
        </div>
      </Section>

      <Section title="Checkbox">
        <div className="flex flex-col gap-2">
          <Checkbox label="Toon alleen geverifieerde citaties" defaultChecked />
          <Checkbox label="Voeg bronvermelding toe" />
          <Checkbox label="Uitgeschakelde optie" disabled />
        </div>
      </Section>

      <Section title="Radio">
        <RadioGroup name="contract" value={contract} onValueChange={setContract}>
          <Radio value="fulltime" label="Voltijd" />
          <Radio value="parttime" label="Deeltijd" />
          <Radio value="oproep" label="Oproepkracht" />
        </RadioGroup>
      </Section>

      <Section title="Pills">
        <div className="flex flex-wrap items-center gap-2">
          <Pill>Neutraal</Pill>
          <Pill variant="primary">Vakantie</Pill>
          <Pill variant="outline">Artikel 12.3</Pill>
          <Pill variant="selected">Actief</Pill>
        </div>
      </Section>

      <Section title="Breadcrumbs">
        <Breadcrumbs>
          <BreadcrumbItem>
            <BreadcrumbLink href="#">Agents</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="#">CAO-agent</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Instellingen</BreadcrumbPage>
          </BreadcrumbItem>
        </Breadcrumbs>
      </Section>

      <Section title="Tabs">
        <Tabs defaultValue="antwoord">
          <TabsList>
            <TabsTrigger value="antwoord">Antwoord</TabsTrigger>
            <TabsTrigger value="bronnen">Bronnen</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>
          <TabsContent value="antwoord">
            Het gestreamde antwoord van de agent verschijnt hier, met inline citaties.
          </TabsContent>
          <TabsContent value="bronnen">
            De opgehaalde CAO-artikelen met verificatiestatus.
          </TabsContent>
          <TabsContent value="details">
            Tracegegevens: model, latency en tokengebruik.
          </TabsContent>
        </Tabs>
      </Section>

      <Section title="Accordion">
        <Accordion className="max-w-xl">
          <AccordionItem name="faq">
            <AccordionTrigger>Hoeveel vakantiedagen heb ik?</AccordionTrigger>
            <AccordionContent>
              Bij een voltijds dienstverband heb je volgens de CAO recht op 25 vakantiedagen per jaar.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem name="faq">
            <AccordionTrigger>Wat is mijn opzegtermijn?</AccordionTrigger>
            <AccordionContent>
              De opzegtermijn hangt af van je dienstjaren; de CAO beschrijft de staffel per situatie.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem name="faq">
            <AccordionTrigger>Heb ik recht op reiskostenvergoeding?</AccordionTrigger>
            <AccordionContent>
              Dit is geregeld per fonds; raadpleeg het relevante artikel voor de exacte voorwaarden.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Section>

      <Section title="KPI tiles">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <KpiTile label="Vragen (30d)" value="1.284" hint="+12% t.o.v. vorige periode" />
          <KpiTile
            label="Beantwoord met geverifieerde citaties"
            value="87%"
            hint="v1-maat: geverifieerde citaties"
          />
          <KpiTile label="Onbeantwoord" value="163" hint="corpus-roadmap-signaal" />
        </div>
      </Section>

      <Section title="Trust-patterns — conversatie">
        <div className="flex flex-col gap-4">
          <AnswerCard role="user">Hoeveel vakantiedagen krijg ik volgens de CAO?</AnswerCard>
          <AnswerCard
            role="agent"
            agentLabel="AI-assistent"
            agentSubLabel="CAO-agent"
            footer={
              <div className="border-t border-border px-8 py-4 text-sm text-text-muted">
                <span className="text-[11px] font-medium uppercase tracking-wider text-text-subtle">Bronnen</span>
                <p className="mt-1 text-xs text-text-subtle">· Artikel 12, lid 3 — uw fund CAO v2024</p>
              </div>
            }
          >
            Volgens de CAO heb je recht op 25 vakantiedagen per jaar bij een voltijds dienstverband
            <CitationBadge refNumber={1} className="ml-1" />.
          </AnswerCard>
          <RefusalNotice>
            Dit staat niet in de CAO-tekst die ik tot mijn beschikking heb. Ik kan er daarom geen
            onderbouwd antwoord op geven.
          </RefusalNotice>
        </div>
      </Section>

      <Section title="Trust-patterns — antwoordtrace">
        <div className="flex flex-col gap-6">
          <AnswerTrace
            head="Zoeken in de CAO"
            inFlight
            steps={[
              {
                id: "search",
                label: "Bronnen doorzoeken",
                detail: "14 passages bekeken",
                tone: null,
                chips: [
                  {
                    id: "a",
                    label: "Artikel 12 — Vakantie",
                    dropped: false,
                    struck: false,
                  },
                  {
                    id: "b",
                    label: "Artikel 5 — Werktijden",
                    dropped: true,
                    struck: false,
                  },
                ],
                overflowLabel: null,
                pending: false,
              },
              {
                id: "write",
                label: "Antwoord schrijven",
                detail: null,
                tone: null,
                chips: [],
                overflowLabel: null,
                pending: true,
              },
            ]}
          />
          <AnswerTrace
            head="Zoeken in de CAO"
            inFlight={false}
            summary="3 passages, 1 geverifieerde bron"
            steps={[
              {
                id: "search",
                label: "Bronnen doorzoeken",
                detail: "14 passages bekeken",
                tone: null,
                chips: [],
                overflowLabel: null,
                pending: false,
              },
            ]}
          />
        </div>
      </Section>

      <Section title="Trust-patterns — citaties">
        <div className="flex flex-col gap-3">
          <CitationBlock
            refNumber={1}
            verification="verified"
            label="Artikel 12.3 — Vakantie"
            quote="De werknemer heeft recht op 25 vakantiedagen per kalenderjaar bij een voltijds dienstverband."
          />
          <CitationBlock
            refNumber={2}
            verification="caution"
            label="Bijlage A — Indicatief"
            quote="Afwijkende afspraken kunnen per onderneming gelden; raadpleeg de bedrijfsregeling."
          />
        </div>
      </Section>

      <Section title="Table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>Release</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>CAO-agent</TableCell>
              <TableCell className="font-mono text-xs">v0.4.1</TableCell>
              <TableCell>
                <AgentStatusBadge status="operational" />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Verzuim-agent</TableCell>
              <TableCell className="font-mono text-xs">v0.1.0</TableCell>
              <TableCell>
                <AgentStatusBadge status="degraded" />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Section>

      <Section title="Dialog">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary">Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Snippet kopiëren</DialogTitle>
              <DialogDescription>
                Plak dit script in de website van het fonds om de agent in te sluiten.
              </DialogDescription>
            </DialogHeader>
            <Card className="bg-surface-sunk p-3 font-mono text-xs">
              &lt;script src=&quot;https://api.wunderling.nl/embed.js&quot;&gt;&lt;/script&gt;
            </Card>
            <div className="mt-4 flex justify-end">
              <DialogClose asChild>
                <Button>Klaar</Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-text-subtle">{title}</h2>
      {children}
    </section>
  );
}

function SwatchGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-border bg-border sm:grid-cols-4">
      {children}
    </div>
  );
}

function Swatch({ token, hex }: { token: string; hex: string }) {
  return (
    <div className="flex min-h-28 flex-col bg-surface">
      <div className="min-h-16 flex-1" style={{ background: `var(${token})` }} />
      <div className="px-2 py-1.5">
        <p className="font-mono text-[11px] text-text">{token}</p>
        <p className="font-mono text-[11px] text-text-subtle">{hex}</p>
      </div>
    </div>
  );
}
