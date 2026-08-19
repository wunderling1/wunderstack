# Host smoketest — Claude / ChatGPT (Fase 5)

**Status:** checklist — run against staging before treating Fase 5 as done.
**Date:** _TBD_
**Staging URL:** `https://<staging>/api/mcp`
**Corpus:** wegwerp / demo — geen productiedata
**Auth:** `MCP_BEARER_TOKEN` set (hosts can only send static headers); IP rate limit active

## Preconditions

- [ ] Staging has `MCP_BEARER_TOKEN` configured (no open endpoint)
- [ ] `MCP_ALLOWED_HOSTS` includes the staging hostname (else 401 `host_not_allowed`)
- [ ] IP + `mcp:${tenant}` rate limits confirmed (429 on burst)
- [ ] Wegwerpcorpus ingested (demo or eval-fixtures), not production CAO
- [ ] Endpoint publicly reachable (hosts connect from vendor cloud, not localhost)
- [ ] Claude route chosen: Desktop + `mcp-remote --header` (bearer works) — claude.ai hosted
      connectors require OAuth 2.0, which is not built

## Claude

| Check | Result | Notes / screenshot |
|---|---|---|
| Tool listed / recognized | | |
| Natural Dutch question triggers `ask_cao` without naming the tool | | |
| Answer arrives with `[n]` markers | | |
| Rendered `Bronnen:` block present | | |
| Out-of-corpus → exact `NOT_FOUND_MESSAGE` | | |
| Reformulation observations (not a Copilot prediction) | | |

## ChatGPT (developer mode / custom connector)

| Check | Result | Notes / screenshot |
|---|---|---|
| Tool listed / recognized | | |
| Natural Dutch question triggers `ask_cao` | | |
| `[n]` markers intact | | |
| `Bronnen:` block present | | |
| Out-of-corpus → exact weigerzin | | |
| Reformulation observations | | |

## Findings

_Record anything surprising about rewriting, dropped citations, or auth header support.
These findings do **not** predict Copilot Studio behaviour (Fase 6)._
