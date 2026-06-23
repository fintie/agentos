/**
 * AgentOS management dashboard.
 *
 * Browse agents grouped by use case, inspect their routing/model/schema, run a
 * single agent or a whole vertical workflow, and review routing decisions +
 * evaluation logs.
 *
 *   npm run seed        # optional: populate some history
 *   npm run dashboard   # then open http://localhost:4317
 */
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadConfig } from "../src/config.js";
import { createEvaluationStore } from "../src/evaluation/index.js";
import { Orchestrator } from "../src/orchestration/runner.js";
import { AgentRegistry } from "../src/agents/registry.js";
import { zodToJsonSchema } from "../src/orchestration/zodToJsonSchema.js";
import { USE_CASES, WORKFLOWS, AGENT_EXAMPLES } from "../src/catalog.js";
import type { HumanReviewStatus, RoutingContext } from "../src/types.js";
import { StructuredOutputError } from "../src/orchestration/structured.js";
import { runTradingWorkflow } from "../src/trading/engine.js";
import { buildDistributedInferenceDemo } from "../src/shard/dashboardData.js";
import { DEMO_SHARD_TOPOLOGIES } from "../src/shard/demoTopologies.js";
import type { ExecutionBackend } from "../src/types.js";
import { buildX402SystemDemo } from "../src/x402/demoData.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const store = createEvaluationStore(config);
const orchestrator = new Orchestrator({ config, store });
const agents = new AgentRegistry();

const app = express();
app.use(express.json({ limit: "1mb" }));

/** Build display metadata for one agent, including the model the router picks. */
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
    live: orchestrator.registry.isLive(decision.model),
    candidates: decision.candidates,
    schema: zodToJsonSchema(agent.schema as any),
    example: AGENT_EXAMPLES[agent.name] ?? {},
  };
}

// ── Catalog ────────────────────────────────────────────────────────────
app.get("/api/usecases", (_req, res) => {
  res.json(
    USE_CASES.map((uc) => ({
      ...uc,
      agents: uc.agents.map(agentMeta),
      workflow: uc.workflowId ? { id: uc.workflowId, name: WORKFLOWS[uc.workflowId]?.name } : null,
    })),
  );
});

app.get("/api/agents", (_req, res) => {
  res.json(agents.list().map((a) => agentMeta(a.name)));
});

app.get("/api/config", (_req, res) => {
  res.json({
    mockMode: config.forceMock,
    evalStore: config.evalStore,
    liveModels: (["gemini-3-flash", "kimi-k2.6", "deepseek-v4-pro"] as const).filter((m) =>
      orchestrator.registry.isLive(m),
    ),
  });
});

app.get("/api/trading", async (_req, res) => {
  res.json(await runTradingWorkflow());
});
app.get("/api/shard", (_req, res) => {
  res.json(buildDistributedInferenceDemo());
});
app.get("/api/x402", (_req, res) => {
  res.json(buildX402SystemDemo());
});

// ── Run ──────────────────────────────────────────────────────────────
app.post("/api/run/agent", async (req, res) => {
  const { agentName, input, executionBackend, topologyId } = req.body ?? {};
  try {
    const agent = agents.get(agentName);
    const backend = (["provider", "local", "sharded"].includes(executionBackend) ? executionBackend : "provider") as ExecutionBackend;
    const topology = topologyId ? DEMO_SHARD_TOPOLOGIES.find((item) => item.topologyId === topologyId) : undefined;
    if (topologyId && !topology) return res.status(400).json({ ok: false, error: `Unknown topology "${topologyId}".` });
    const result = await orchestrator.runAgent(agent, input ?? {}, { executionBackend: backend, shardTopology: topology });
    res.json({
      ok: true,
      model: result.model,
      confidence: result.confidence,
      decision: result.decision,
      parsed: result.parsed,
      raw: result.raw,
      recordId: result.record.id,
      executionBackend: result.record.executionBackend,
      shardReceipt: result.record.shardReceipt,
      settlementRecords: result.record.settlementRecords,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: errorMessage(err) });
  }
});

app.post("/api/run/workflow", async (req, res) => {
  const { workflowId, input } = req.body ?? {};
  const wf = WORKFLOWS[workflowId];
  if (!wf) return res.status(404).json({ ok: false, error: `Unknown workflow "${workflowId}".` });
  try {
    const result = await wf.run(orchestrator, input ?? wf.example);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: errorMessage(err) });
  }
});

// ── Evaluation log ─────────────────────────────────────────────────────
app.get("/api/records", async (req, res) => {
  res.json(
    await store.list({
      taskId: str(req.query.taskId),
      agentName: str(req.query.agentName),
      modelName: str(req.query.modelName),
    }),
  );
});

app.get("/api/stats", async (_req, res) => {
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
  res.json({ total: records.length, byModel, byAgent, escalations, pendingReview });
});

app.post("/api/records/:id/review", async (req, res) => {
  const status = req.body?.status as HumanReviewStatus;
  if (!["APPROVED", "REJECTED", "PENDING", "NOT_REQUIRED"].includes(status)) {
    return res.status(400).json({ error: "invalid status" });
  }
  const updated = await store.updateHumanReview(req.params.id, status);
  if (!updated) return res.status(404).json({ error: "not found" });
  res.json(updated);
});

// ── Static page ──────────────────────────────────────────────────────
app.get("/", (_req, res) => res.sendFile(join(__dirname, "index.html")));
app.get("/docs", (_req, res) => res.sendFile(join(__dirname, "docs.html")));
app.get("/trading.css", (_req, res) => res.sendFile(join(__dirname, "trading.css")));
app.get("/trading.js", (_req, res) => res.sendFile(join(__dirname, "trading.js")));
app.get("/shard.css", (_req, res) => res.sendFile(join(__dirname, "shard.css")));
app.get("/shard.js", (_req, res) => res.sendFile(join(__dirname, "shard.js")));
app.get("/x402.css", (_req, res) => res.sendFile(join(__dirname, "x402.css")));
app.get("/x402.js", (_req, res) => res.sendFile(join(__dirname, "x402.js")));

app.listen(config.dashboardPort, () => {
  console.log(`AgentOS dashboard → http://localhost:${config.dashboardPort}`);
  console.log(`Mode: ${config.forceMock ? "MOCK" : "live where keys present"} | store: ${config.evalStore}`);
});

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function errorMessage(err: unknown): string {
  if (err instanceof StructuredOutputError) return `Schema validation failed after ${err.attempts} attempts.`;
  return err instanceof Error ? err.message : String(err);
}
