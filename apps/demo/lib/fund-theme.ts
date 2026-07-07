/**
 * White-label theming per O&O fund (Fase 12). This is **fund configuration = data** (control-plane
 * vs data-plane, see 200-architecture.mdc): the widget/demo is built once and branded per fund from
 * this table — colour, label, tagline and starter questions. No fund-specific value is hardcoded in
 * agent or component code; components read a resolved `FundTheme`.
 *
 * A CSS-first theme: `primary` is assigned to the `--primary`/`--ring` CSS variables on a wrapper, so
 * every `bg-primary`/`ring` utility picks up the fund's colour without touching component code.
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
  /** Primary brand colour as a CSS colour (assigned to --primary/--ring). */
  primary: string;
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
  primary: "oklch(0.52 0.16 262)",
  starters: DEFAULT_STARTERS,
};

/**
 * Per-fund overrides. Keys match the `fund` scope used by the chat API (see lib/fund-scope.ts).
 * Extend this table per client; unknown funds fall back to DEFAULT_THEME.
 */
const FUND_THEMES: Record<string, Partial<FundTheme>> = {
  "elektronische-detailhandel": {
    logoText: "ED",
    label: "CAO-assistent — Elektronische Detailhandel",
    tagline: "Vragen over jouw CAO, met verwijzing naar het artikel",
    primary: "oklch(0.55 0.17 145)",
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
