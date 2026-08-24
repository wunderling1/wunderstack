/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-ui-to-agents",
      comment:
        "Hard rule A: packages/ui must never import packages/agents. UI is props-in; apps wire data.",
      severity: "error",
      from: { path: "^packages/ui/" },
      to: { path: "^packages/agents/" },
    },
    {
      name: "no-playground-to-agents",
      comment:
        "The playground is UI-only (tenant-zero demo, D14): it talks to the runtime over HTTP, never imports the agent seam directly. Keeps agent + hardening logic in one place.",
      severity: "error",
      from: { path: "^apps/playground/" },
      to: { path: "^packages/agents/" },
    },
    {
      name: "no-dashboard-to-agents",
      comment:
        "The dashboard is a read-only analytics surface: it reads events via @wunderstack/analytics and never imports the agent seam, so the Mastra runtime stays out of this bundle. Agent identity comes from the release-manifest seam (app-local) instead.",
      severity: "error",
      from: { path: "^apps/dashboard/" },
      to: { path: "^packages/agents/" },
    },
    {
      name: "no-marketing-to-agents",
      comment:
        "apps/marketing is a static content site (Fase 5): it depends only on @wunderstack/ui + shared and mounts the Fase 4 embed over HTTP. It must never import the agent seam (or db/rag/ai/analytics), so the Mastra runtime stays out of a public content bundle. The catalog is app-local content, not the runtime registry.",
      severity: "error",
      from: { path: "^apps/marketing/" },
      to: { path: "^packages/(agents|db|rag|ai|analytics)/" },
    },
    {
      name: "no-embed-to-agents",
      comment:
        "The embed (packages/embed) is a browser web component: it reuses @wunderstack/ui and talks to the runtime over HTTP with a public tenant-key. It must never import the agent seam (or any server-only package), so the Mastra runtime never leaks into a third-party page bundle.",
      severity: "error",
      from: { path: "^packages/embed/" },
      to: { path: "^packages/(agents|db|rag|ai|analytics)/" },
    },
    {
      name: "no-packages-to-consumers",
      comment:
        "Arrow rule: packages/* must never import from apps/* or scripts/*. Consumers depend on packages, never the reverse.",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^(apps|scripts)/" },
    },
    {
      name: "no-apps-to-fund-schema",
      comment:
        "Apps must not import fund-schema tables directly (ADR-multitenant-database). Retrieval and corpus reads go through packages/rag or @wunderstack/analytics.",
      severity: "error",
      from: { path: "^apps/" },
      to: { path: "^packages/db/src/schema/fund/" },
    },
    {
      name: "no-circular",
      comment: "Circular dependencies make the module graph fragile; break the cycle.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: {
      path: ["node_modules", "\\.next"],
    },
    tsConfig: {
      fileName: "tsconfig.base.json",
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    },
  },
};
