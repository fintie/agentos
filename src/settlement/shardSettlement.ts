import type { ShardRunReceipt } from "../shard/proofReceipt.js";
import type { ShardTopology } from "../shard/topology.js";

export interface SettlementRecord {
  taskId: string;
  receiptId: string;
  nodeId: string;
  role: "coordinator" | "draft" | "shard";
  amount: number;
  contributionReason: string;
  settlementStatus: "estimated" | "eligible" | "withheld";
}

export function calculateShardPayout(receipt: ShardRunReceipt, topology: ShardTopology): SettlementRecord[] {
  const evaluationFactor = clamp(receipt.evaluationScore ?? 0.8, 0.1, 1);
  const latencyTarget = topology.modelName.toLowerCase().includes("glm") ? 30 : 40;
  const latencyBonus = clamp(receipt.throughputTokPerSec / latencyTarget, 0.65, 1.2);
  const tokenPool = receipt.tokensOut * 0.00012 * evaluationFactor;
  const records: SettlementRecord[] = [];
  const verified = receipt.verificationStatus === "verified";
  records.push({
    taskId: receipt.taskId, receiptId: receipt.receiptId, nodeId: topology.coordinatorNodeId, role: "coordinator",
    amount: round(verified ? tokenPool * 0.1 * latencyBonus : 0),
    contributionReason: "Orchestration, embedding/head execution, ring scheduling, and direct-return coordination.",
    settlementStatus: verified ? "eligible" : "withheld",
  });
  records.push({
    taskId: receipt.taskId, receiptId: receipt.receiptId, nodeId: `${topology.coordinatorNodeId}:draft`, role: "draft",
    amount: round(verified ? tokenPool * 0.12 * (receipt.acceptedDraftTokens / Math.max(1, receipt.acceptedDraftTokens + receipt.rejectedDraftTokens)) : 0),
    contributionReason: `${topology.draftModelName} proposed ${receipt.acceptedDraftTokens} accepted speculative tokens.`,
    settlementStatus: verified ? "eligible" : "withheld",
  });
  const totalLayers = topology.shardNodes.reduce((sum, node) => sum + layerCount(node.layerStart, node.layerEnd), 0);
  for (const node of topology.shardNodes) {
    const health = receipt.healthSnapshots.find((snapshot) => snapshot.nodeId === node.nodeId);
    const offline = node.healthStatus === "offline" || health?.status === "offline" || receipt.failedNodeIds.includes(node.nodeId);
    const layers = layerCount(node.layerStart, node.layerEnd);
    const layerShare = layers / totalLayers;
    const trustBonus = node.trustedBoundary ? 1.05 : 1;
    const degradedPenalty = health?.status === "degraded" ? 0.72 : 1;
    const amount = offline || !verified ? 0 : tokenPool * 0.78 * layerShare * node.reliabilityScore * latencyBonus * trustBonus * degradedPenalty;
    records.push({
      taskId: receipt.taskId, receiptId: receipt.receiptId, nodeId: node.nodeId, role: "shard", amount: round(amount),
      contributionReason: offline
        ? "No payout: node was offline, failed, or replaced by failover."
        : `${layers} layers (${(layerShare * 100).toFixed(1)}%), reliability ${node.reliabilityScore.toFixed(3)}${node.trustedBoundary ? ", trusted boundary bonus" : ""}.`,
      settlementStatus: offline || !verified ? "withheld" : "eligible",
    });
  }
  return records;
}

function layerCount(start: number, end: number): number { return end - start + 1; }
function round(value: number): number { return Number(value.toFixed(8)); }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
