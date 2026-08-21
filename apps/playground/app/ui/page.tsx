"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  AgentStatusBadge,
  AnswerCard,
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
          Primitives en trust-patterns uit <code>@wunderstack/ui</code>. Alleen semantische tokens.
        </p>
      </header>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button size="default">Control-radius</Button>
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
