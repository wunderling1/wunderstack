/**
 * White-label theming per O&O fund. Fund configuration = data: label, tagline, starters.
 * Colour is applied via the `[data-fund]` semantic override seam in @wunderstack/ui.
 */

export interface FundTheme {
  /** The resolved fund key, or "default" when unscoped. */
  key: string;
  /** Short badge text (logo placeholder). */
  logoText: string;
  /** Product label shown in the header. */
  label: string;
  /** One-line tagline under the label / on the empty state. */
  tagline: string;
  /** Starter questions shown on the empty chat. */
  starters: string[];
}

const DEFAULT_STARTERS = [
  "Hoeveel vakantiedagen krijg ik volgens de CAO?",
  "Wat is de opzegtermijn bij ontslag?",
  "Heb ik recht op een reiskostenvergoeding?",
];

export const DEFAULT_THEME: FundTheme = {
  key: "default",
  logoText: "W",
  label: "Wunderstack — CAO-agent",
  tagline: "Antwoorden met bronvermelding uit de CAO",
  starters: DEFAULT_STARTERS,
};

const FUND_THEMES: Record<string, Partial<FundTheme>> = {
  "elektronische-detailhandel": {
    logoText: "ED",
    label: "CAO-assistent — Elektronische Detailhandel",
    tagline: "Vragen over jouw CAO, met verwijzing naar het artikel",
    starters: [
      "Hoeveel vakantiedagen heb ik bij een fulltime contract?",
      "Wat is mijn opzegtermijn?",
      "Hoe werkt de loonschaal voor mijn functiegroep?",
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
    return { ...DEFAULT_THEME, key: fund };
  }
  return { ...DEFAULT_THEME, ...override, key: fund };
}
