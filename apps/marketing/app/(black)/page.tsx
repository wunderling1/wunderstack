import { Card, Chip } from "@wunderstack/ui";
import Link from "next/link";
import { AGENTS } from "@/content/agents";
import { StatusPill } from "@/components/status-pill";

/**
 * Marketing home + catalog overview (Fase 5). A content page: the vision (one-build, per-fund
 * configure) plus the catalog of agents. Only agents with a live demo link through to their embedded
 * widget; the rest are clearly marked "binnenkort" with a scripted walkthrough on their detail page.
 */
export default function Home() {
  return (
    <div className="flex flex-col gap-16">
      <section className="flex flex-col gap-5">
        <Chip className="self-start">Soeverein · gegrond · insluitbaar</Chip>
        <h1 className="font-display text-4xl font-normal leading-[1.1] md:text-5xl">
          AI-agents voor O&amp;O fondsen die je één keer bouwt en per fonds configureert.
        </h1>
        <p className="max-w-2xl text-lg text-text-muted">
          Wunderstack is de agent-infrastructuur voor Nederlandse O&amp;O fondsen. Elk antwoord is
          gegrond in de brontekst, met bronvermelding. Het standaard request-pad blijft EU-soeverein:
          fondsdata gaat nooit standaard naar een niet-EU-model.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/agents/cao"
            className="rounded-[var(--radius-control)] bg-primary px-5 py-2.5 text-sm font-medium text-on-primary hover:bg-primary-hover"
          >
            Probeer de live CAO-demo
          </Link>
          <Link
            href="#catalogus"
            className="rounded-[var(--radius-control)] border border-border px-5 py-2.5 text-sm font-medium hover:bg-surface-sunk"
          >
            Bekijk de catalogus
          </Link>
        </div>
      </section>

      <section id="catalogus" className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl font-semibold">Agent-catalogus</h2>
          <p className="text-text-muted">
            Fonds-overstijgende agents op één platform. De CAO-agent is live; de overige tonen een
            scripted walkthrough tot ze live gaan.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {AGENTS.map((agent) => (
            <Link key={agent.slug} href={`/agents/${agent.slug}`} className="group">
              <Card className="flex h-full flex-col gap-3 p-5 group-hover:border-primary">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-base font-semibold">{agent.name}</h3>
                  <span className="ml-auto">
                    <StatusPill status={agent.status} />
                  </span>
                </div>
                <p className="text-sm text-text-muted">{agent.tagline}</p>
                <span className="mt-auto text-sm font-medium text-primary">
                  {agent.status === "live" ? "Probeer live →" : "Bekijk walkthrough →"}
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
