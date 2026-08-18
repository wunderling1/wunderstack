# Copilot Studio — MCP-koppeling (IT-beheerder)

Handleiding voor de IT-beheerder van het fonds. **Zij** doen de koppeling in Copilot Studio;
Wunderling levert het endpoint en de credentials.

> Status: draft — bijwerken met screenshots na Fase 6-acceptatie.
> Zie ook: `docs/plans/PLAN-mcp-server.md`, `docs/security/mcp-server.md`.

## Wat je krijgt

Een MCP-tool `ask_cao` die CAO-vragen beantwoordt met bronvermeldingen. Het antwoord wordt
gevormd binnen de EU-stack van Wunderstack (retrieval + LLM). De vraagtekst passeert Microsofts
verwerking (zie soevereiniteitspositie in het plan, sectie 0).

## Vereisten

- Microsoft 365 Copilot-licenties en beheerrechten in Copilot Studio
- Endpoint-URL van de fondsinstance (bijv. `https://api.<fonds>.example/api/mcp`)
- Een bearer-token van Wunderling (rotatie mogelijk zonder downtime)

## Stappen (overzicht)

1. Open Copilot Studio → agent → **Tools** → **Add a tool** → **Model Context Protocol**.
2. Vul de MCP-server-URL in (`…/api/mcp`). Transport: **Streamable HTTP** (geen SSE).
3. Kies bij authenticatie **API Key** en vul in:
   - Locatie: **Header**
   - Naam: `Authorization`
   - Waarde: `Bearer <token van Wunderling>`
4. Publiceer de agent naar M365 Copilot.
5. Test met een bekende in-corpus vraag en een out-of-corpus vraag (weigerzin).

> Het token is een geheim: deel het niet per e-mail of chat en bewaar het in de secret-store
> van de tenant. Het endpoint gebruikt daarnaast een Host-allowlist en rate limiting, dus meld
> een nieuwe hostnaam bij Wunderling voordat je koppelt.

> Exacte UI-paden en screenshots volgen na de Copilot Studio-acceptatieronde
> (`docs/audit/mcp/copilot-baseline.md`).

## Wat de tool teruggeeft

- Het volledige CAO-antwoord met `[n]`-markers
- Een bronnenlijst onder het kopje `Bronnen:`
- Bij geen treffer: de vaste weigerzin (geen eigen kennis)

**Instructie aan Copilot:** geef het tool-antwoord ongewijzigd weer — niet herschrijven, niet
samenvatten, geen bronnen weglaten.

## Toegang intrekken

Vraag Wunderling om het token te roteren of te verwijderen. Tijdens rotatie blijft het oude token
kort geldig (`MCP_BEARER_TOKEN` + `MCP_BEARER_TOKEN_PREVIOUS`), daarna niet meer.

## Support

Contacteer Wunderling met `trace_id` uit het tool-antwoord (als aanwezig) bij incidenten.
