import { calculateShardPayout } from "../settlement/shardSettlement.js";
import { DEMO_SHARD_TOPOLOGIES } from "./demoTopologies.js";
import { buildShardRunReceipt, hashValue } from "./proofReceipt.js";
import { simulateShardRun } from "./simulator.js";

export function buildDistributedInferenceDemo() {
  const runs = DEMO_SHARD_TOPOLOGIES.map((topology, index) => {
    const taskId = `demo-shard-${index + 1}`;
    const input = { prompt: `Deterministic distributed inference demo ${index + 1}` };
    const output = { summary: `Verified mock output for ${topology.modelName}`, confidence: 0.88 - index * 0.04 };
    const simulation = simulateShardRun({ prompt: input, outputTokenTarget: index === 0 ? 72 : 64 }, topology);
    const receipt = buildShardRunReceipt({
      taskId, agentName: index === 0 ? "DeveloperAgent" : "ReportAgent", topology, simulation,
      input, output, schema: { type: "object", required: ["summary", "confidence"] },
      evaluationScore: output.confidence, timestamp: `2026-06-20T0${index + 2}:00:00.000Z`,
    });
    return { topology, simulation, receipt, settlements: calculateShardPayout(receipt, topology) };
  });
  const normalReceipts = [
    { receiptId: "provider-demo-gemini", backend: "provider", taskId: "demo-provider-1", agentName: "ReportAgent", modelName: "gemini-3-flash", outputHash: hashValue("provider output"), tokenHash: hashValue(["provider", "tokens"]), evaluationScore: 0.86, payoutEstimate: 0.000018, settlementStatus: "estimated", timestamp: "2026-06-20T01:20:00.000Z" },
    { receiptId: "local-demo-kimi", backend: "local", taskId: "demo-local-1", agentName: "DeveloperAgent", modelName: "kimi-k2.6-local", outputHash: hashValue("local output"), tokenHash: hashValue(["local", "tokens"]), evaluationScore: 0.82, payoutEstimate: 0.000014, settlementStatus: "estimated", timestamp: "2026-06-20T01:40:00.000Z" },
  ];
  return { generatedAt: "2026-06-20T04:00:00.000Z", deterministicMode: true, runs, normalReceipts };
}
