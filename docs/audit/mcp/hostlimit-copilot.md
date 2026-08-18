# Host limit — Copilot Studio (Fase 2)

**Status:** template — measure empirically before treating M2 as closed.

## How to measure

1. Deploy (or tunnel) the runtime with:
   - `MCP_BEARER_TOKEN=$(openssl rand -hex 32)`
   - `MCP_ENABLE_SLEEP_STUB=1`
   - `MCP_ALLOWED_HOSTS=<the public hostname>` (otherwise the Host guard returns 401)
2. Authenticate with `Authorization: Bearer <token>`. Use the bearer scheme, **not** HMAC: hosts
   can only attach static headers and cannot sign each JSON-RPC message (see
   `docs/security/mcp-server.md`).
3. Connect MCP Inspector or Copilot Studio to `https://<host>/api/mcp`.
4. Call the `sleep` tool with increasing `seconds` (e.g. 10, 20, 30, 45, 60) until the host
   times out or returns an error.
5. Record the highest successful wait and the first failing wait below.

## Results

| Probe (seconds) | Host | Outcome | Notes |
|---|---|---|---|
| _fill in_ | Copilot Studio | | API Key auth, header `Authorization` |
| | Claude Desktop (`mcp-remote`) | | Static `--header`; claude.ai hosted connectors need OAuth (not built) |
| | ChatGPT | | |

**Host limit (empirical):** _TBD seconds_

**Compare to pipeline p95:** see `latency-pipeline.md`. Synchroon haalbaar alleen als
hostlimiet > p95 (inclusief marge).

## Stateless Streamable HTTP

Confirm with MCP Inspector that `tools/list` and a `sleep` / `ask_cao` call succeed against
the Next.js route handler (SDK v2 `createMcpHandler`). Screenshot → this folder.
