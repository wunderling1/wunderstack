import { Card } from "@wunderstack/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmbedWidget } from "@/components/embed-widget";
import { StatusPill } from "@/components/status-pill";
import { AGENTS, agentBySlug } from "@/content/agents";
import { env } from "@/lib/env";

/**
 * Per-agent detail page (Fase 5). Live agents that have a public demo key (CAO) mount the Fase 4
 * embed; other live agents (arbo) and “binnenkort” entries show a scripted walkthrough — never a
 * fake live demo for an agent that is not on the registry.
 */
export function generateStaticParams() {
  return AGENTS.map((agent) => ({ slug: agent.slug }));
}

function embedConfig(): { scriptSrc: string; agentKey: string } | null {
  const base = env.EMBED_SCRIPT_BASE?.replace(/\/$/, "");
  const key = env.EMBED_PUBLIC_KEY;
  if (!base || !key) {
    return null;
  }
  return { scriptSrc: `${base}/embed.js`, agentKey: key };
}

/** Public marketing embed is wired for CAO (tenant zero) only. */
function hasPublicEmbedDemo(slug: string): boolean {
  return slug === "cao";
}

export default async function AgentDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agent = agentBySlug(slug);
  if (!agent) {
    notFound();
  }

  const embed = agent.status === "live" && hasPublicEmbedDemo(agent.slug) ? embedConfig() : null;
  const showLiveDemo = agent.status === "live" && hasPublicEmbedDemo(agent.slug);
  const showWalkthrough = !showLiveDemo;

  return (
    <div className="flex flex-col gap-10">
      <Link href="/#catalogus" className="text-sm text-text-muted hover:text-text">
        ← Catalogus
      </Link>

      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-semibold">{agent.name}</h1>
          <StatusPill status={agent.status} />
        </div>
        <p className="max-w-2xl text-lg text-text-muted">{agent.tagline}</p>
      </header>

      <section className="max-w-2xl">
        <p className="text-text">{agent.summary}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold">Wat het doet</h2>
        <ul className="flex flex-col gap-2">
          {agent.highlights.map((point) => (
            <li key={point} className="flex gap-2 text-text-muted">
              <span aria-hidden className="text-primary">
                •
              </span>
              {point}
            </li>
          ))}
        </ul>
      </section>

      {showLiveDemo ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold">Probeer het live</h2>
          {embed ? (
            <>
              <p className="text-text-muted">
                Zelfde insluitbare agent die een fonds op zijn eigen site zet — hier als chatvenster
                op de publieke demo (tenant zero).
              </p>
              <EmbedWidget
                scriptSrc={embed.scriptSrc}
                agentKey={embed.agentKey}
                agentId={agent.slug}
                mode="inline"
              />
            </>
          ) : (
            <Card className="p-5 text-sm text-text-muted">
              De live demo is niet geconfigureerd in deze omgeving. Zet <code>EMBED_SCRIPT_BASE</code>{" "}
              en <code>EMBED_PUBLIC_KEY</code> zodat de Fase 4-embed tegen tenant zero laadt.
            </Card>
          )}
        </section>
      ) : null}

      {showWalkthrough ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold">
            {agent.status === "live" ? "Hoe het werkt" : "Scripted walkthrough"}
          </h2>
          <p className="text-text-muted">
            {agent.status === "live"
              ? "Deze agent draait in de runtime; de publieke marketing-demo is nog CAO-only."
              : "Deze agent is nog niet live. Zo werkt hij straks:"}
          </p>
          <ol className="flex flex-col gap-2">
            {agent.walkthrough.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-pill)] bg-surface-sunk text-xs font-medium">
                  {index + 1}
                </span>
                <span className="text-text-muted">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
