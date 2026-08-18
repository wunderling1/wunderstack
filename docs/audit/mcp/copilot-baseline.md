# Copilot Studio baseline (Fase 6)

**Status:** checklist — the acceptance that counts for the product promise.
**Date:** _TBD_
**Trial tenant:** _TBD_
**Endpoint:** `https://<host>/api/mcp`

## Method

1. Add MCP tool in Copilot Studio (Tools → Add a tool → Model Context Protocol).
2. Publish agent to M365 Copilot.
3. Run the fund golden set (or a representative subset) via the Copilot route.
4. Compare each answer to the portal route on the same questions.

## Metrics

| Metric | Portal | Copilot | Delta |
|---|---|---|---|
| Cases run | | | |
| `[n]` markers intact (%) | | | |
| Answer text unmodified (%) | | | |
| Exact weigerzin intact (%) | | | |
| Rendered `Bronnen:` block intact (%) | | | |
| `isError` → host invents CAO answer (count) | — | | |

## Relay-fidelity (M1)

Threshold for product promise: if structural loss of `[n]` markers or weigerzin, **adjust the
product promise**, do not weaken the measurement.

**Decision:** _go / no-go / go-with-caveat_

**Promise / caveat text for fund docs:**

_

## isError behaviour (M10)

When `ask_cao` returns `isError: true`, does Copilot:

- [ ] Refer the user to the fund / retry later
- [ ] Invent a CAO answer from its own knowledge (failure)

Evidence:

_

## Screenshots

Place screenshots in this folder (`copilot-*.png`).
