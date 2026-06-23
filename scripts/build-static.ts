/**
 * Static-site generator for GitHub Pages.
 *
 * GitHub Pages can only serve static files, so this script pre-computes
 * everything the management console needs — the catalog (use cases + agents +
 * routed models + schemas), a seeded evaluation log, and a pre-baked example
 * run for every agent and workflow — into ./data/*.json, and copies the static
 * SPA template to ./index.html. The published site is then a fully browsable,
 * read-only mirror of the live dashboard.
 *
 *   npm run build:pages
 */
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config.js";
import { Orchestrator } from "../src/orchestration/runner.js";
import { AgentRegistry } from "../src/agents/registry.js";
import { MemoryEvaluationStore } from "../src/evaluation/memoryStore.js";
import { zodToJsonSchema } from "../src/orchestration/zodToJsonSchema.js";
import { USE_CASES, WORKFLOWS, AGENT_EXAMPLES } from "../src/catalog.js";
import type { RoutingContext } from "../src/types.js";
import { runTradingWorkflow } from "../src/trading/engine.js";
import { buildDistributedInferenceDemo } from "../src/shard/dashboardData.js";
import { buildX402SystemDemo } from "../src/x402/demoData.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");

// Always build against the mock adapters → deterministic, no keys, no cost.
const config = { ...loadConfig(), forceMock: true };
const store = new MemoryEvaluationStore(); // pure in-memory; we serialise it ourselves
const orchestrator = new Orchestrator({ config, store });
const agents = new AgentRegistry();

function agentMeta(name: string) {
  const agent = agents.get(name);
  const ctx: RoutingContext = {
    taskType: agent.taskType,
    riskLevel: agent.defaultRisk,
    latency: agent.defaultLatency,
    multimodal: agent.multimodal,
  };
  const decision = orchestrator.router.route(ctx);
  return {
    name: agent.name,
    description: agent.description,
    taskType: agent.taskType,
    defaultRisk: agent.defaultRisk,
    defaultLatency: agent.defaultLatency ?? null,
    promptVersion: agent.promptVersion,
    multimodal: Boolean(agent.multimodal),
    routedModel: decision.model,
    live: false,
    candidates: decision.candidates,
    schema: zodToJsonSchema(agent.schema as any),
    example: AGENT_EXAMPLES[agent.name] ?? {},
  };
}

function write(rel: string, data: unknown) {
  const path = join(DATA, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

async function main() {
  mkdirSync(DATA, { recursive: true });
  console.log("Building static Pages site (mock adapters)…");

  // 1. Catalog.
  const usecases = USE_CASES.map((uc) => ({
    ...uc,
    agents: uc.agents.map(agentMeta),
    workflow: uc.workflowId ? { id: uc.workflowId, name: WORKFLOWS[uc.workflowId]?.name } : null,
  }));
  write("usecases.json", usecases);
  write("agents.json", agents.list().map((a) => agentMeta(a.name)));
  write("config.json", { static: true, mockMode: true, evalStore: "static", liveModels: [] });
  write("trading.json", await runTradingWorkflow({ now: () => new Date("2026-06-20T02:15:00.000Z") }));
  write("shard.json", buildDistributedInferenceDemo());
  write("x402.json", buildX402SystemDemo());

  // 2. Pre-baked single-agent runs.
  for (const a of agents.list()) {
    const input = AGENT_EXAMPLES[a.name] ?? {};
    const r = await orchestrator.runAgent(a, input);
    write(`runs/${a.name}.json`, {
      ok: true,
      model: r.model,
      confidence: r.confidence,
      decision: r.decision,
      parsed: r.parsed,
      raw: r.raw,
      recordId: r.record.id,
    });
  }

  // 3. Pre-baked workflow runs.
  for (const [id, wf] of Object.entries(WORKFLOWS)) {
    const result = await wf.run(orchestrator, wf.example);
    write(`workflows/${id}.json`, result);
  }

  // 4. Seeded evaluation log (everything the runs above produced).
  write("records.json", await store.list());
  const stats = await buildStats();
  write("stats.json", stats);

  // 5. Copy the static SPA template to the repo root as index.html, + .nojekyll.
  copyFileSync(join(__dirname, "..", "dashboard", "pages.html"), join(ROOT, "index.html"));
  copyFileSync(join(__dirname, "..", "dashboard", "docs.html"), join(ROOT, "docs.html"));
  copyFileSync(join(__dirname, "..", "dashboard", "trading.css"), join(ROOT, "trading.css"));
  copyFileSync(join(__dirname, "..", "dashboard", "trading.js"), join(ROOT, "trading.js"));
  copyFileSync(join(__dirname, "..", "dashboard", "shard.css"), join(ROOT, "shard.css"));
  copyFileSync(join(__dirname, "..", "dashboard", "shard.js"), join(ROOT, "shard.js"));
  copyFileSync(join(__dirname, "..", "dashboard", "x402.css"), join(ROOT, "x402.css"));
  copyFileSync(join(__dirname, "..", "dashboard", "x402.js"), join(ROOT, "x402.js"));
  writeFileSync(join(ROOT, ".nojekyll"), "");
  if (!existsSync(join(ROOT, "CNAME"))) {
    // Preserve the custom domain if it ever goes missing.
    writeFileSync(join(ROOT, "CNAME"), "agentos.nextgenius.com.au\n");
  }

  console.log(`Done. Wrote data/ + index.html. ${stats.total} records baked in.`);
}

async function buildStats() {
  const records = await store.list();
  const byModel: Record<string, number> = {};
  const byAgent: Record<string, number> = {};
  let escalations = 0;
  let pendingReview = 0;
  for (const r of records) {
    byModel[r.modelName] = (byModel[r.modelName] ?? 0) + 1;
    byAgent[r.agentName] = (byAgent[r.agentName] ?? 0) + 1;
    if ((r.routingTrace as any)?.decision?.escalated) escalations++;
    if (r.humanReviewStatus === "PENDING") pendingReview++;
  }
  return { total: records.length, byModel, byAgent, escalations, pendingReview };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
