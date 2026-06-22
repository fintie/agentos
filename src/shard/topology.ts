import type { ShardNode } from "./nodeRegistry.js";

export interface ShardTopology {
  topologyId: string;
  modelName: string;
  totalLayers: number;
  coordinatorNodeId: string;
  draftModelName: string;
  shardNodes: ShardNode[];
  ringOrder: string[];
  directReturnEnabled: boolean;
  speculativeDecodingEnabled: boolean;
  asyncPipeliningEnabled: boolean;
}

export interface TopologyValidationOptions { mockFailover?: boolean }
export interface TopologyValidationResult { valid: boolean; errors: string[]; warnings: string[] }

export function validateShardTopology(topology: ShardTopology, options: TopologyValidationOptions = {}): TopologyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sorted = [...topology.shardNodes].sort((a, b) => a.layerStart - b.layerStart);
  if (!topology.topologyId || !topology.modelName || !topology.coordinatorNodeId) errors.push("Topology identity, model, and coordinator are required.");
  if (!Number.isInteger(topology.totalLayers) || topology.totalLayers <= 0) errors.push("totalLayers must be a positive integer.");
  if (sorted.length === 0) errors.push("At least one shard node is required.");
  if (sorted[0]?.layerStart !== 0) errors.push("Layer coverage must start at layer 0.");
  for (let index = 0; index < sorted.length; index++) {
    const node = sorted[index]!;
    if (node.layerStart > node.layerEnd) errors.push(`${node.nodeId} has an invalid layer range.`);
    const previous = sorted[index - 1];
    if (previous && node.layerStart <= previous.layerEnd) errors.push(`Layer overlap between ${previous.nodeId} and ${node.nodeId}.`);
    if (previous && node.layerStart > previous.layerEnd + 1) errors.push(`Missing layers between ${previous.nodeId} and ${node.nodeId}.`);
    if (node.healthStatus === "offline") {
      if (options.mockFailover) warnings.push(`${node.nodeId} is offline and requires mock failover.`);
      else errors.push(`${node.nodeId} is offline.`);
    } else if (node.healthStatus === "degraded") {
      if (options.mockFailover) warnings.push(`${node.nodeId} is degraded and may use mock failover.`);
      else errors.push(`${node.nodeId} is degraded.`);
    }
  }
  if (sorted.at(-1)?.layerEnd !== topology.totalLayers - 1) errors.push(`Layer coverage must end at layer ${topology.totalLayers - 1}.`);
  const nodeIds = new Set(topology.shardNodes.map((node) => node.nodeId));
  if (nodeIds.has(topology.coordinatorNodeId)) errors.push("Coordinator must not own a main-model layer block.");
  if (topology.ringOrder.length !== topology.shardNodes.length || new Set(topology.ringOrder).size !== topology.ringOrder.length) {
    errors.push("ringOrder must contain every shard node exactly once.");
  }
  if (topology.ringOrder.some((nodeId) => !nodeIds.has(nodeId))) errors.push("ringOrder references an unknown shard node.");
  return { valid: errors.length === 0, errors, warnings };
}

export function assertValidShardTopology(topology: ShardTopology, options: TopologyValidationOptions = {}): ShardTopology {
  const validation = validateShardTopology(topology, options);
  if (!validation.valid) throw new Error(`Invalid shard topology: ${validation.errors.join(" ")}`);
  return topology;
}
