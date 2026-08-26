/**
 * Map a runtime error code to Dutch copy the learner can act on.
 *
 * Unknown codes collapse to a generic sentence so a new 4xx from the API cannot leak English
 * identifiers (`no_agent_instance`) onto the page.
 */
export function roleplayErrorMessage(error: string): string {
  switch (error) {
    case "scenario_not_found":
      return "Dit scenario is niet beschikbaar.";
    case "session_not_found":
      return "Dit gesprek is niet gevonden. Begin opnieuw.";
    case "session_ended":
      return "Dit gesprek is al afgelopen.";
    case "no_turns_left":
      return "Je hebt geen beurten meer. Het gesprek wordt beoordeeld.";
    case "rate_limited":
    case "daily_cap_reached":
      return "Even geduld, probeer het zo opnieuw.";
    case "server_busy":
      return "De oefening is even druk bezet. Probeer het zo opnieuw.";
    case "payload_too_large":
      return "Je bericht is te lang.";
    case "invalid_request":
      return "Dat bericht kon niet worden verstuurd.";
    case "start_failed":
    case "turn_failed":
      return "Het gesprek kon niet worden gestart. Probeer het opnieuw.";
    case "invalid_lti_token":
    case "lti_token_expired":
      return "Je LMS-sessie is verlopen. Open de oefening opnieuw vanuit de leeromgeving.";
    case "scenario_mismatch":
    case "fund_mismatch":
      return "Deze oefening hoort niet bij de opdracht vanuit de leeromgeving.";
    default:
      return "Er ging iets mis. Probeer het opnieuw.";
  }
}

export async function readErrorCode(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
    ) {
      return body.error;
    }
  } catch {
    /* not JSON */
  }
  return "unknown";
}
