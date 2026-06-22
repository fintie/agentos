import { createHash } from "node:crypto";
import type { ShardTopology } from "./topology.js";
import { assertValidShardTopology } from "./topology.js";

export interface ShardSimulationInput {
  prompt: unknown;
  outputTokenTarget?: number;
  draftWindow?: number;
  failNodeIds?: string[];
  mockFailover?: boolean;
}

export interface ShardEdgeRtt { fromNodeId: string; toNodeId: string; rttMs: number; failed: boolean; retried: boolean }
export interface ShardTraversal { nodeId: string; layerStart: number; layerEnd: number; processingMs: number; status: "success" | "failed" | "failover" }
export interface ShardRunSimulationResult {
  draftTokensProposed: number;
  acceptedDraftTokens: number;
  rejectedDraftTokens: number;
  outputTokens: string[];
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  throughputTokPerSec: number;
  edgeRtts: ShardEdgeRtt[];
  traversal: ShardTraversal[];
  failedEdges: string[];
  retryCount: number;
  failoverNodeIds: string[];
  deterministicMode: true;
}

export function simulateShardRun(input: ShardSimulationInput | unknown, topology: ShardTopology): ShardRunSimulationResult {
  const request: ShardSimulationInput = isSimulationInput(input) ? input : { prompt: input };
  assertValidShardTopology(topology, { mockFailover: request.mockFailover });
  const serialised = stableStringify(request.prompt);
  const digest = createHash("sha256").update(`${topology.topologyId}:${serialised}`).digest("hex");
  const tokensIn = Math.max(1, Math.ceil(serialised.length / 4));
  const tokensOut = request.outputTokenTarget ?? 48 + (parseInt(digest.slice(0, 2), 16) % 33);
  const draftWindow = request.draftWindow ?? 6;
  const proposed = topology.speculativeDecodingEnabled ? Math.ceil(tokensOut * 1.28 / draftWindow) * draftWindow : 0;
  const acceptanceRate = topology.speculativeDecodingEnabled ? 0.72 + (parseInt(digest.slice(2, 4), 16) % 18) / 100 : 0;
  const accepted = Math.min(tokensOut, Math.floor(proposed * acceptanceRate));
  const rejected = Math.max(0, proposed - accepted);
  const failures = new Set(request.failNodeIds ?? []);
  const ordered = topology.ringOrder.map((id) => topology.shardNodes.find((node) => node.nodeId === id)!);
  const edges: ShardEdgeRtt[] = [];
  const failedEdges: string[] = [];
  let retries = 0;
  for (let index = 0; index < ordered.length; index++) {
    const from = ordered[index]!;
    const to = ordered[index + 1] ?? (topology.directReturnEnabled ? { nodeId: topology.coordinatorNodeId, latencyMs: 8 } : ordered[0]!);
    const failed = failures.has(from.nodeId) || failures.has(to.nodeId) || from.healthStatus === "offline";
    const edgeId = `${from.nodeId}->${to.nodeId}`;
    if (failed) failedEdges.push(edgeId);
    if (failed && request.mockFailover) retries++;
    const jitter = parseInt(digest.slice(4 + (index % 12), 6 + (index % 12)), 16) % 7;
    edges.push({ fromNodeId: from.nodeId, toNodeId: to.nodeId, rttMs: Math.round((from.latencyMs + to.latencyMs) / 2 + jitter), failed, retried: failed && Boolean(request.mockFailover) });
  }
  const traversal = ordered.map((node) => ({
    nodeId: node.nodeId,
    layerStart: node.layerStart,
    layerEnd: node.layerEnd,
    processingMs: Number(((node.layerEnd - node.layerStart + 1) * 0.72 + node.latencyMs * 0.08).toFixed(2)),
    status: failures.has(node.nodeId) ? (request.mockFailover ? "failover" as const : "failed" as const) : "success" as const,
  }));
  const edgeLatency = edges.reduce((sum, edge) => sum + edge.rttMs * (edge.retried ? 1.75 : 1), 0);
  const processingLatency = traversal.reduce((sum, stage) => sum + stage.processingMs, 0);
  const traversals = topology.speculativeDecodingEnabled ? Math.ceil(tokensOut / Math.max(1, accepted / Math.ceil(tokensOut / draftWindow))) : tokensOut;
  const pipelineFactor = topology.asyncPipeliningEnabled ? 0.31 : 1;
  const latencyMs = Number((110 + (edgeLatency + processingLatency) * traversals * pipelineFactor).toFixed(2));
  const outputTokens = Array.from({ length: tokensOut }, (_, index) => `tok_${digest.slice((index * 2) % 56, (index * 2) % 56 + 8)}`);
  return {
    draftTokensProposed: proposed, acceptedDraftTokens: accepted, rejectedDraftTokens: rejected,
    outputTokens, tokensIn, tokensOut, latencyMs,
    throughputTokPerSec: Number((tokensOut / (latencyMs / 1000)).toFixed(2)),
    edgeRtts: edges, traversal, failedEdges, retryCount: retries,
    failoverNodeIds: traversal.filter((stage) => stage.status === "failover").map((stage) => stage.nodeId),
    deterministicMode: true,
  };
}

function isSimulationInput(value: unknown): value is ShardSimulationInput {
  return Boolean(value && typeof value === "object" && "prompt" in value);
}
function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}
