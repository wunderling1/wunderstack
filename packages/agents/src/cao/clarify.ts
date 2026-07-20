/**
 * Clarify behavior (Fase 11) — ask one targeted question when a CAO question is underspecified.
 *
 * CAO answers often depend on facts the user did not give (functiegroep/trede for salary,
 * fulltime/parttime for leave). Guessing produces a confidently wrong number; asking one sharp
 * follow-up feels far more competent. This is a deliberate DETERMINISTIC detector (no LLM on the
 * hot path): it is cheap, traceable and testable, and it only fires on clearly underspecified
 * cases so it never hijacks an answerable question.
 *
 * Kept conservative on purpose (regel van drie): today only the salary-without-functiegroep case,
 * which is both the most common and the most damaging to get wrong. Extend as real usage proves
 * more patterns worth catching.
 */

/** Mentions a salary/wage amount ("verdien", "verdient", "verdienen", "salaris", "uurloon", ...). */
const SALARY_INTENT = /\b(verdien\w*|salaris|maandsalaris|uurloon|maandloon)\b/i;
/** Phrased as a question about an amount ("hoeveel", "wat", "welk bedrag"). */
const AMOUNT_QUESTION = /\b(hoeveel|wat|welk)\b/i;
/**
 * Already specifies the pay grade, so no clarification is needed. Besides the generic
 * functiegroep/trede signals, CAOs that pay by age (jeugdloon) or by salarisgroep + functiejaren
 * (e.g. ETD) make a salary question answerable once the age/diploma or group/functiejaren is given —
 * asking for functiegroep/trede there would be wrong (and would hijack answerable golden cases).
 */
const PAY_GRADE_SPECIFIED =
  /\b(functiegroep|functie-?indeling|salarisgroep|salarisschaal|schaal|trede|fg\s?\d|functiejaar|functiejaren|jeugdgroep|jeugdloon|\d+\s?-?\s?jarige?|\d+\s+jaar)\b/i;
/**
 * Qualifiers that make a salary question answerable WITHOUT a pay grade (it is about a rule or a
 * percentage, not an absolute amount): sick pay, raises, deductions, holiday allowance, pro-rata,
 * etc. When any is present we do not ask for functiegroep/trede.
 */
const GENERIC_SALARY_TOPIC =
  /\b(ziek\w*|arbeidsongeschikt\w*|doorbetaal\w*|doorbetaling|percentage|procent|verhoging|periodiek\w*|inhoud\w*|ingehouden|pensioen\w*|vakantiegeld|toeslag\w*|overwerk|uitbetaal\w*|rato|deeltijd|parttime|fulltime|voltijd)\b/i;

const SALARY_CLARIFICATION =
  "Om je salaris te bepalen heb ik je functie-indeling nodig: in welke functiegroep en op welke " +
  "trede ben je ingedeeld?";

/**
 * Returns a single clarifying question when the input is underspecified, or `null` when it is
 * specific enough to answer directly.
 */
export function detectClarification(question: string): string | null {
  const q = question.trim();

  if (
    SALARY_INTENT.test(q) &&
    AMOUNT_QUESTION.test(q) &&
    !PAY_GRADE_SPECIFIED.test(q) &&
    !GENERIC_SALARY_TOPIC.test(q)
  ) {
    return SALARY_CLARIFICATION;
  }

  return null;
}
