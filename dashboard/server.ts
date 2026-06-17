/**
 * Minimal dashboard to inspect model routing decisions and evaluation logs.
 * Express + a single static HTML page that polls the JSON API.
 *
 *   npm run seed        # populate some data
 *   npm run dashboard   # then open http://localhost:4317
 */
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadConfig } from "../src/config.js";
import { createEvaluationStore } from "../src/evaluation/index.js";
import type { HumanReviewStatus } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const store = createEvaluationStore(config);
const app = express();
app.use(express.json());

// ── API ──────────────────────────────────────────────────────────────
app.get("/api/records", async (req, res) => {
  const records = await store.list({
    taskId: str(req.query.taskId),
    agentName: str(req.query.agentName),
    modelName: str(req.query.modelName),
  });
  res.json(records);
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

app.listen(config.dashboardPort, () => {
  console.log(`AgentOS dashboard → http://localhost:${config.dashboardPort}`);
  console.log(`Eval store: ${config.evalStore} (${config.evalFile})`);
});

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
