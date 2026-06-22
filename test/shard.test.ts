import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { MemoryEvaluationStore } from "../src/evaluation/memoryStore.js";
import { Orchestrator } from "../src/orchestration/runner.js";
import { ReportAgent } from "../src/agents/developer.js";
import { calculateShardPayout } from "../src/settlement/shardSettlement.js";
import { GLM_52_WAN_TOPOLOGY, GPT_OSS_120B_WAN_TOPOLOGY } from "../src/shard/demoTopologies.js";
import { buildShardRunReceipt, verifyShardRunReceipt } from "../src/shard/proofReceipt.js";
import { simulateShardRun } from "../src/shard/simulator.js";
import { validateShardTopology, type ShardTopology } from "../src/shard/topology.js";

function buildReceipt(topology = GLM_52_WAN_TOPOLOGY, evaluationScore = 0.9) {
  const input = { prompt: "Explain distributed inference." };
  const output = { summary: "A deterministic sharded result.", confidence: evaluationScore };
  const simulation = simulateShardRun(input, topology);
  const receipt = buildShardRunReceipt({
    taskId: "task-shard-1", agentName: "ReportAgent", topology, simulation,
    input, output, schema: { type: "object" }, evaluationScore,
  });
  return { receipt, input, output, simulation };
}

describe("Shard topology", () => {
  it("accepts contiguous complete layer coverage", () => {
    expect(validateShardTopology(GLM_52_WAN_TOPOLOGY)).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it("rejects overlapping layers", () => {
    const nodes = GLM_52_WAN_TOPOLOGY.shardNodes.map((node) => ({ ...node }));
    nodes[1] = { ...nodes[1]!, layerStart: nodes[0]!.layerEnd };
    expect(validateShardTopology({ ...GLM_52_WAN_TOPOLOGY, shardNodes: nodes }).errors.join(" ")).toContain("overlap");
  });

  it("rejects missing layers", () => {
    const nodes = GLM_52_WAN_TOPOLOGY.shardNodes.map((node) => ({ ...node }));
    nodes[1] = { ...nodes[1]!, layerStart: nodes[0]!.layerEnd + 2 };
    expect(validateShardTopology({ ...GLM_52_WAN_TOPOLOGY, shardNodes: nodes }).errors.join(" ")).toContain("Missing layers");
  });
});

describe("Shard proof receipts", () => {
  it("verifies a deterministic receipt", () => {
    const { receipt, output } = buildReceipt();
    expect(verifyShardRunReceipt(receipt, GLM_52_WAN_TOPOLOGY, { expectedOutput: output, deterministicMode: true })).toEqual({ valid: true, status: "verified", errors: [] });
  });

  it("fails verification when output hash changes", () => {
    const { receipt } = buildReceipt();
    receipt.outputHash = "tampered-output-hash";
    const result = verifyShardRunReceipt(receipt, GLM_52_WAN_TOPOLOGY);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Receipt hash does not match its payload.");
  });

  it("fails verification when GPU UUIDs duplicate", () => {
    const { receipt, output } = buildReceipt();
    receipt.gpuUuids[1] = receipt.gpuUuids[0]!;
    expect(verifyShardRunReceipt(receipt, GLM_52_WAN_TOPOLOGY, { expectedOutput: output }).errors).toContain("GPU UUIDs must be distinct.");
  });
});

describe("Shard settlement", () => {
  it("pays coordinator, draft, and every successful shard", () => {
    const { receipt } = buildReceipt(GPT_OSS_120B_WAN_TOPOLOGY);
    const payouts = calculateShardPayout(receipt, GPT_OSS_120B_WAN_TOPOLOGY);
    expect(payouts.filter((item) => item.role === "coordinator")).toHaveLength(1);
    expect(payouts.filter((item) => item.role === "draft")).toHaveLength(1);
    expect(payouts.filter((item) => item.role === "shard")).toHaveLength(3);
    expect(payouts.every((item) => item.amount > 0)).toBe(true);
  });

  it("gives an offline failed node no payout", () => {
    const offlineId = GPT_OSS_120B_WAN_TOPOLOGY.shardNodes[1]!.nodeId;
    const topology: ShardTopology = {
      ...GPT_OSS_120B_WAN_TOPOLOGY,
      topologyId: "gpt-offline-failover",
      shardNodes: GPT_OSS_120B_WAN_TOPOLOGY.shardNodes.map((node) => node.nodeId === offlineId ? { ...node, healthStatus: "offline" } : { ...node }),
    };
    const input = { prompt: "failover test", mockFailover: true, failNodeIds: [offlineId] };
    const output = { summary: "failover", confidence: 0.8 };
    const simulation = simulateShardRun(input, topology);
    const receipt = buildShardRunReceipt({ taskId: "offline", agentName: "ReportAgent", topology, simulation, input, output, schema: {}, evaluationScore: 0.8 });
    const payout = calculateShardPayout(receipt, topology).find((item) => item.nodeId === offlineId)!;
    expect(payout.amount).toBe(0);
    expect(payout.settlementStatus).toBe("withheld");
  });

  it("reduces payout when evaluation score is low", () => {
    const high = calculateShardPayout(buildReceipt(GLM_52_WAN_TOPOLOGY, 0.95).receipt, GLM_52_WAN_TOPOLOGY);
    const low = calculateShardPayout(buildReceipt(GLM_52_WAN_TOPOLOGY, 0.25).receipt, GLM_52_WAN_TOPOLOGY);
    expect(low.reduce((sum, item) => sum + item.amount, 0)).toBeLessThan(high.reduce((sum, item) => sum + item.amount, 0));
  });
});

describe("Orchestrator sharded backend", () => {
  it("attaches receipt and settlement records to the evaluation record", async () => {
    const config = { ...loadConfig(), forceMock: true };
    const store = new MemoryEvaluationStore();
    const orchestrator = new Orchestrator({ config, store });
    const run = await orchestrator.runAgent(ReportAgent, { title: "Shard", source: "Deterministic proof" }, {
      taskId: "orchestrated-shard", executionBackend: "sharded", shardTopology: GPT_OSS_120B_WAN_TOPOLOGY,
    });
    expect(run.model).toBe(GPT_OSS_120B_WAN_TOPOLOGY.modelName);
    expect(run.record.executionBackend).toBe("sharded");
    expect(run.record.shardReceipt?.verificationStatus).toBe("verified");
    expect(run.record.settlementRecords).toHaveLength(5);
  });

  it("records local execution without using a live provider", async () => {
    const config = { ...loadConfig(), forceMock: true };
    const store = new MemoryEvaluationStore();
    const orchestrator = new Orchestrator({ config, store });
    const run = await orchestrator.runAgent(ReportAgent, { title: "Local", source: "Local node" }, { executionBackend: "local" });
    expect(run.record.executionBackend).toBe("local");
    expect((run.record.routingTrace as any).live).toBe(false);
    expect(run.record.shardReceipt).toBeUndefined();
  });
});
