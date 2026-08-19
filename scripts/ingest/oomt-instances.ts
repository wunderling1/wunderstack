/**
 * Seed OOMT agent instances: (oomt, cao) + (oomt, arbo) with separate public keys.
 * Also seeds agent_config minScore + arbo starters for the oomt corpus.
 *
 * Run: pnpm seed:oomt
 */
import { agentConfig, closeDb, getWriterDb, upsertTenantConfig } from "@wunderstack/db";

const TENANT_ID = "oomt";

const ARBO_STARTER_CATEGORIES = [
  {
    label: "Veelgestelde vragen",
    questions: [
      "Welke PBM moet ik dragen bij werk aan elektrische voertuigen?",
      "Hoe maak ik een e-voertuig spanningsloos?",
      "Welke risico's zijn er bij werken aan het HV-systeem?",
    ],
  },
  {
    label: "PBM",
    questions: [
      "Welke persoonlijke beschermingsmiddelen (PBM) gelden bij HV-werk?",
      "Welke PBM moet ik dragen bij werk aan een e-voertuig?",
      "Welke bescherming geldt bij het werken onder spanning?",
    ],
  },
  {
    label: "Spanningsloos werken",
    questions: [
      "Hoe maak ik een e-voertuig spanningsloos?",
      "Welke stappen gelden voordat ik aan het HV-systeem werk?",
      "Wie mag een e-voertuig spanningsloos maken?",
    ],
  },
  {
    label: "Risico's",
    questions: [
      "Welke risico's zijn er bij werken aan elektrische voertuigen?",
      "Wat is het gevaar van het hoogvoltagesysteem (HV)?",
      "Welke maatregelen gelden bij beschadiging van een HV-accu?",
    ],
  },
  {
    label: "BHV",
    questions: [
      "Wat moet BHV doen bij een incident met een e-voertuig?",
      "Welke maatregelen gelden bij brand van een HV-accu?",
      "Wie waarschuw ik bij een ongeval met een e-voertuig?",
    ],
  },
];

const ARBO_TEXTS = {
  tagline: "Heb je een vraag over de arbocatalogus?",
  intro:
    "De AI-assistent geeft antwoord uit de catalogus Veilig werken met elektrische voertuigen, met de bron erbij. Staat het er niet in? Dan hoor je dat eerlijk.",
  starterCategories: ARBO_STARTER_CATEGORIES,
};

const ARBO_CONFIG = {
  minScore: 0.35,
  corpusVersion: "arbo-oomt-1",
  starterCategories: ARBO_STARTER_CATEGORIES,
  statusLabels: {
    searching: "Catalogus doorzoeken",
    retrieved: "Passages beoordelen",
    generating: "Bronvermelding controleren",
  },
};

async function main(): Promise<void> {
  const cao = await upsertTenantConfig({ tenantId: TENANT_ID, agentKey: "cao" });
  const arbo = await upsertTenantConfig({
    tenantId: TENANT_ID,
    agentKey: "arbo",
    texts: ARBO_TEXTS,
  });

  await getWriterDb()
    .insert(agentConfig)
    .values({
      agentKey: "arbo",
      fundKey: "oomt",
      config: ARBO_CONFIG,
    })
    .onConflictDoUpdate({
      target: [agentConfig.agentKey, agentConfig.fundKey],
      set: { config: ARBO_CONFIG },
    });

  console.log("OOMT instances seeded:");
  console.log(`  cao  public_key=${cao.publicKey}`);
  console.log(`  arbo public_key=${arbo.publicKey}`);
  console.log("\nSet in .env for playground:");
  console.log(`  NEXT_PUBLIC_WUNDERSTACK_TENANT_KEY=${cao.publicKey}`);
  console.log(`  NEXT_PUBLIC_WUNDERSTACK_TENANT_KEY_ARBO=${arbo.publicKey}`);
  console.log("\nThen ingest the arbocatalogus:");
  console.log(
    "  pnpm --filter @wunderstack/ingest ingest input/arbo_catalogus_oomt.pdf --fund oomt --agent arbo --version arbo-oomt-1",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
