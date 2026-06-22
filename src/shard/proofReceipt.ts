import { createHash } from "node:crypto";
import type { ShardHealthStatus } from "./nodeRegistry.js";
import type { ShardRunSimulationResult } from "./simulator.js";
import type { ShardTopology } from "./topology.js";
import { validateShardTopology } from "./topology.js";

export interface ShardRunReceipt {
  receiptId: string;
  taskId: string;
  agentName: string;
  modelName: string;
  topologyId: string;
  coordinatorNodeId: string;
  shardNodeIds: string[];
  gpuUuids: string[];
  regions: string[];
  layerAssignments: Array<{ nodeId: string; layerStart: number; layerEnd: number }>;
  edgeRtts: Array<{ fromNodeId: string; toNodeId: string; rttMs: number; failed: boolean }>;
  inputHash: string;
  outputHash: string;
  tokenHash: string;
  schemaHash: string;
  tokensIn: number;
  tokensOut: number;
  acceptedDraftTokens: number;
  rejectedDraftTokens: number;
  latencyMs: number;
  throughputTokPerSec: number;
  deterministicMode: boolean;
  optimizationFlags: { speculativeDecoding: boolean; asyncPipelining: boolean; directReturn: boolean };
  healthSnapshots: Array<{ nodeId: string; status: ShardHealthStatus; reliabilityScore: number; latencyMs: number }>;
  verificationStatus: "verified" | "failed" | "unverified";
  evaluationScore?: number;
  failedNodeIds: string[];
  timestamp: string;
}

export interface BuildShardReceiptInput {
  taskId: string;
  agentName: string;
  topology: ShardTopology;
  simulation: ShardRunSimulationResult;
  input: unknown;
  output: unknown;
  schema: unknown;
  evaluationScore?: number;
  timestamp?: string;
}

export interface ReceiptVerificationContext {
  expectedOutput?: unknown;
  expectedNodeCount?: number;
  deterministicMode?: boolean;
}
export interface ReceiptVerificationResult { valid: boolean; status: "verified" | "failed"; errors: string[] }

export function buildShardRunReceipt(input: BuildShardReceiptInput): ShardRunReceipt {
  const { topology, simulation } = input;
  const base: ShardRunReceipt = {
    receiptId: "pending",
    taskId: input.taskId,
    agentName: input.agentName,
    modelName: topology.modelName,
    topologyId: topology.topologyId,
    coordinatorNodeId: topology.coordinatorNodeId,
    shardNodeIds: topology.ringOrder,
    gpuUuids: topology.ringOrder.map((id) => topology.shardNodes.find((node) => node.nodeId === id)!.gpuUuid),
    regions: topology.ringOrder.map((id) => topology.shardNodes.find((node) => node.nodeId === id)!.region),
    layerAssignments: topology.shardNodes.map((node) => ({ nodeId: node.nodeId, layerStart: node.layerStart, layerEnd: node.layerEnd })),
    edgeRtts: simulation.edgeRtts.map(({ fromNodeId, toNodeId, rttMs, failed }) => ({ fromNodeId, toNodeId, rttMs, failed })),
    inputHash: hashValue(input.input),
    outputHash: hashValue(input.output),
    tokenHash: hashValue(simulation.outputTokens),
    schemaHash: hashValue(input.schema),
    tokensIn: simulation.tokensIn,
    tokensOut: simulation.tokensOut,
    acceptedDraftTokens: simulation.acceptedDraftTokens,
    rejectedDraftTokens: simulation.rejectedDraftTokens,
    latencyMs: simulation.latencyMs,
    throughputTokPerSec: simulation.throughputTokPerSec,
    deterministicMode: simulation.deterministicMode,
    optimizationFlags: {
      speculativeDecoding: topology.speculativeDecodingEnabled,
      asyncPipelining: topology.asyncPipeliningEnabled,
      directReturn: topology.directReturnEnabled,
    },
    healthSnapshots: topology.shardNodes.map((node) => ({ nodeId: node.nodeId, status: node.healthStatus, reliabilityScore: node.reliabilityScore, latencyMs: node.latencyMs })),
    verificationStatus: "unverified",
    evaluationScore: input.evaluationScore,
    failedNodeIds: simulation.failoverNodeIds,
    timestamp: input.timestamp ?? "1970-01-01T00:00:00.000Z",
  };
  const receiptId = `shard_${hashReceipt(base).slice(0, 24)}`;
  const receipt = { ...base, receiptId };
  return { ...receipt, verificationStatus: verifyShardRunReceipt(receipt, topology, { expectedOutput: input.output, deterministicMode: true }).status };
}

export function verifyShardRunReceipt(receipt: ShardRunReceipt, topology: ShardTopology, context: ReceiptVerificationContext = {}): ReceiptVerificationResult {
  const errors: string[] = [];
  const topologyValidation = validateShardTopology(topology, { mockFailover: receipt.failedNodeIds.length > 0 });
  if (!topologyValidation.valid) errors.push(...topologyValidation.errors);
  if (receipt.topologyId !== topology.topologyId || receipt.modelName !== topology.modelName) errors.push("Receipt topology or model does not match.");
  if (receipt.receiptId !== `shard_${hashReceipt(receipt).slice(0, 24)}`) errors.push("Receipt hash does not match its payload.");
  const expectedCount = context.expectedNodeCount ?? topology.shardNodes.length;
  if (receipt.shardNodeIds.length !== expectedCount) errors.push("Unexpected shard node count.");
  if (new Set(receipt.gpuUuids).size !== receipt.gpuUuids.length) errors.push("GPU UUIDs must be distinct.");
  if (receipt.layerAssignments.length !== topology.shardNodes.length) errors.push("Layer assignment count does not match topology.");
  const assignmentCoverage = [...receipt.layerAssignments].sort((a, b) => a.layerStart - b.layerStart);
  if (assignmentCoverage[0]?.layerStart !== 0 || assignmentCoverage.at(-1)?.layerEnd !== topology.totalLayers - 1) errors.push("Receipt layer coverage is incomplete.");
  for (let index = 1; index < assignmentCoverage.length; index++) {
    if (assignmentCoverage[index]!.layerStart !== assignmentCoverage[index - 1]!.layerEnd + 1) errors.push("Receipt layers are not contiguous.");
  }
  if (context.expectedOutput !== undefined && receipt.outputHash !== hashValue(context.expectedOutput)) errors.push("Output hash mismatch.");
  if (receipt.edgeRtts.some((edge) => !Number.isFinite(edge.rttMs) || edge.rttMs < 0)) errors.push("Invalid WAN edge RTT.");
  if (context.deterministicMode !== undefined && receipt.deterministicMode !== context.deterministicMode) errors.push("Deterministic mode mismatch.");
  if (receipt.healthSnapshots.some((snapshot) => snapshot.status === "offline" && !receipt.failedNodeIds.includes(snapshot.nodeId))) errors.push("Offline node participated without failover.");
  if (!receipt.inputHash || !receipt.outputHash || !receipt.tokenHash || !receipt.schemaHash) errors.push("Receipt hashes are incomplete.");
  return { valid: errors.length === 0, status: errors.length === 0 ? "verified" : "failed", errors };
}

export function hashReceipt(receipt: ShardRunReceipt): string {
  const { receiptId: _receiptId, verificationStatus: _status, ...payload } = receipt;
  return hashValue(payload);
}

export function hashValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}
