# MCP-server — security officer FAQ

Antwoorden op de standaardvragen van een security officer van het fonds.
Bronplan: `docs/plans/PLAN-mcp-server.md`.

> Status: draft — juridische toetsing van de DPIA-input (onderaan) is **vereist** vóór
> productieclaim richting fonds.

## Wie kan aanroepen?

Alleen callers met een geldig **fonds-credential**. Er zijn twee geaccepteerde schema's; de server
kiest op basis van de request en valt nooit stilletjes terug van het ene op het andere.

| Schema | Header(s) | Voor wie |
|---|---|---|
| HMAC-SHA256 over `${timestamp}.${rawBody}` | `x-wunderstack-signature` + `x-wunderstack-timestamp` | Server-to-server callers die per request kunnen ondertekenen. Replay-window 5 minuten, elke handtekening eenmalig bruikbaar. |
| Bearer-token | `Authorization: Bearer <token>` | Gehoste MCP-clients (Copilot Studio, MCP Inspector, `mcp-remote`) die uitsluitend **statische** headers kunnen meesturen en dus geen handtekening per JSON-RPC-bericht kunnen berekenen. |

Het bearer-token is statisch en heeft daarom géén tijdstempel- of replay-bescherming: de
vertrouwelijkheid rust op TLS plus tokenlengte (minimaal 32 tekens, afgedwongen in de env-validatie).
Waar de caller kan ondertekenen is HMAC dus het sterkere schema en de voorkeur.

Geen Entra/OAuth per gebruiker in v1 — auth is op fondsniveau. Is geen van beide credentials
geconfigureerd, dan weigert het endpoint elke request met 503 (secure-by-default). Voor gehoste
Claude-connectors op claude.ai is OAuth 2.0 vereist; die route is niet gebouwd en dat kanaal is
daarmee nog niet ondersteund.

## Wat wordt gelogd?

- **Langfuse (EU Cloud):** trace per vraag, tags `cao-agent`, `fund`, `channel=mcp`, optioneel
  `environment`. Bevat de vraagtekst en retrieval-metadata.
- **Durable event-log** (`interaction_events` in de fonds-DB): tenant, fund, session (UUID per
  call), outcome, citation count, question, channel, optional `trace_id`. Retentie: 90 dagen
  (zie `docs/decisions/DECISION-analytics-retention.md`).

## Hoe lang bewaard?

Zie analytics-retentiebesluit (90 dagen voor vraagtekst in het event-log). Langfuse-retentie
volgt het Langfuse EU Cloud-abonnement.

## Hoe wordt toegang ingetrokken?

Beide schema's gebruiken dezelfde dual-credential-rotatie:

1. Rotatie: zet het nieuwe credential in `MCP_SIGNING_SECRET` respectievelijk `MCP_BEARER_TOKEN`,
   het oude in de bijbehorende `_PREVIOUS` (beide geldig → geen downtime).
2. Na bevestiging dat alle callers het nieuwe credential gebruiken: verwijder PREVIOUS.
3. Volledige intrekking: unset alle vier → endpoint weigert alle requests (503). Wil je alleen
   de gehoste clients afsluiten en server-to-server laten staan, unset dan uitsluitend de
   bearer-tokens.

## Rate limiting

Per IP en per fonds (`mcp:${tenantId}`), in-memory per proces. Overschrijding → 429.

## Soevereiniteit (per-laag)

| Laag | Waar |
|---|---|
| Vraagtekst (client → Microsoft → onze API) | Kan Microsofts verwerking passeren; keuze van het fonds (M365 Copilot) |
| Retrieval, embeddings, LLM, citatieverificatie | EU-stack (Scaleway embeddings, Mistral, Scalingo Postgres) — geen niet-EU-model in het inferentiepad |
| Tracing | Langfuse EU Cloud |

Formulering: *sovereign intelligence layer, client naar keuze van het fonds.* Dit is geen claim
dat "alle data EU blijft" — de vraagtekst kan persoonsgegevens bevatten en Microsoft passeren.

## DPIA-input (juridische toetsing vereist)

- **Verwerkingsverantwoordelijke / verwerker:** per fondscontract vastleggen.
- **Persoonsgegevens in de vraagtekst:** mogelijk (namen, personeelsnummers, medische context in
  CAO-vragen). Minimaliseer in gebruikersinstructies; log retentie 90 dagen.
- **Doorgifte:** vraagtekst kan via Microsoft (niet-EU-subprocessors afhankelijk van Microsofts
  configuratie) onze EU-API bereiken. Antwoordvorming blijft EU.
- **Rechtsgrond:** typisch gerechtvaardigd belang of uitvoering arbeidsovereenkomst — **geen
  aanname; jurist fonds + Wunderling toetsen.**
- **Restrisico relay-fidelity:** Copilot kan tool-output herschrijven. Mitigatie: tool-beschrijving
  instrueert letterlijke weergave; meting in `docs/audit/mcp/copilot-baseline.md`. Bij structureel
  verlies van citaties/weigerzin → productbelofte bijstellen.
