/**
 * White-label theming per O&O fund. Fund configuration = data: label, starter categories.
 * Colour is applied via the `[data-fund]` semantic override seam in @wunderstack/ui.
 */

export interface StarterCategory {
  /** Pill label shown on the empty chat, e.g. "Veelgestelde vragen" or "Verlof". */
  label: string;
  /** Fixed starter questions grouped under this category (aim for ~3). */
  questions: string[];
}

export interface FundTheme {
  /** The resolved fund key, or "default" when unscoped. */
  key: string;
  /** Short badge text (logo placeholder). */
  logoText: string;
  /** Product label shown in the empty-state fallback. */
  label: string;
  /** Human-readable corpus name in the source picker. */
  sourceLabel: string;
  /** Starter question categories shown on the empty chat. */
  starterCategories: StarterCategory[];
}

/** Topic categories that hold for every fund; the "Veelgestelde vragen" category is fund-specific. */
const TOPIC_STARTER_CATEGORIES: StarterCategory[] = [
  {
    label: "Verlof",
    questions: [
      "Hoeveel vakantiedagen krijg ik bij een fulltime contract?",
      "Welk verlof krijg ik bij een huwelijk of verhuizing?",
      "Bouw ik vakantiedagen op als ik ziek ben?",
    ],
  },
  {
    label: "Salaris",
    questions: [
      "Hoe werken de loonschalen en functiegroepen?",
      "Wanneer krijg ik een stap (periodiek) in mijn loonschaal?",
      "Welke toeslag geldt er voor overwerk?",
    ],
  },
  {
    label: "Contract & opzegging",
    questions: [
      "Welke opzegtermijnen staan er in de cao?",
      "Welke regels gelden er voor een tijdelijk contract?",
      "Wat gebeurt er met mijn vakantiedagen als ik uit dienst ga?",
    ],
  },
  {
    label: "Werktijden",
    questions: [
      "Hoeveel uur is een volledige werkweek?",
      "Welke regels gelden er voor pauzes?",
      "Welke regels gelden er voor werken op zaterdag of op feestdagen?",
    ],
  },
];

const DEFAULT_STARTER_CATEGORIES: StarterCategory[] = [
  {
    label: "Veelgestelde vragen",
    questions: [
      "Hoeveel vakantiedagen krijg ik bij een fulltime contract?",
      "Welke opzegtermijnen staan er in de cao?",
      "Hoe werken de loonschalen en functiegroepen?",
    ],
  },
  ...TOPIC_STARTER_CATEGORIES,
];

export const DEFAULT_THEME: FundTheme = {
  key: "default",
  logoText: "W",
  label: "Wunderstack — CAO-agent",
  sourceLabel: "Demo",
  starterCategories: DEFAULT_STARTER_CATEGORIES,
};

const FUND_THEMES: Record<string, Partial<FundTheme>> = {
  demo: {
    sourceLabel: "Demo",
  },
  "elektronische-detailhandel": {
    logoText: "ED",
    label: "CAO-assistent — Elektronische Detailhandel",
    sourceLabel: "Elektronische Detailhandel",
    starterCategories: [
      {
        label: "Veelgestelde vragen",
        questions: [
          "Hoeveel vakantiedagen heb ik bij een fulltime contract?",
          "Wat is mijn opzegtermijn?",
          "Hoe werkt de loonschaal voor mijn functiegroep?",
        ],
      },
      ...TOPIC_STARTER_CATEGORIES,
    ],
  },
  oomt: {
    logoText: "OOMT",
    label: "CAO-assistent — OOMT",
    sourceLabel: "Mobiliteitsbranche (OOMT)",
    starterCategories: [
      {
        label: "Veelgestelde vragen",
        questions: [
          "Hoeveel vakantiedagen heb ik bij een fulltime contract?",
          "Wat is mijn opzegtermijn?",
          "Hoe werken de loonschalen en functiegroepen?",
        ],
      },
      ...TOPIC_STARTER_CATEGORIES,
    ],
  },
};

/** Resolve a fund key to a complete theme, falling back to the default for unknown/unset funds. */
export function getFundTheme(fund: string | undefined): FundTheme {
  if (!fund) {
    return DEFAULT_THEME;
  }
  const override = FUND_THEMES[fund];
  if (!override) {
    return { ...DEFAULT_THEME, key: fund, sourceLabel: fund };
  }
  return { ...DEFAULT_THEME, ...override, key: fund };
}

/** Corpus name for the playground source picker. */
export function fundSourceLabel(fund: string): string {
  return getFundTheme(fund).sourceLabel;
}
