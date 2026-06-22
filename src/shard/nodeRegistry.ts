export type ShardEndpointType = "local" | "wan" | "mock";
export type ShardHealthStatus = "healthy" | "degraded" | "offline";

export interface ShardNode {
  nodeId: string;
  providerName: string;
  region: string;
  publicEndpoint: string;
  gpuType: string;
  gpuUuid: string;
  modelFamily: string;
  layerStart: number;
  layerEnd: number;
  endpointType: ShardEndpointType;
  latencyMs: number;
  reliabilityScore: number;
  healthStatus: ShardHealthStatus;
  costPerToken: number;
  trustedBoundary: boolean;
}

export class ShardNodeRegistry {
  private readonly nodes = new Map<string, ShardNode>();

  constructor(initialNodes: ShardNode[] = []) {
    initialNodes.forEach((node) => this.register(node));
  }

  register(node: ShardNode): void {
    validateNode(node);
    this.nodes.set(node.nodeId, { ...node });
  }

  get(nodeId: string): ShardNode {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error(`Unknown shard node "${nodeId}".`);
    return { ...node };
  }

  list(): ShardNode[] {
    return [...this.nodes.values()].map((node) => ({ ...node }));
  }

  updateHealth(nodeId: string, healthStatus: ShardHealthStatus, latencyMs?: number): ShardNode {
    const node = this.get(nodeId);
    const updated = { ...node, healthStatus, latencyMs: latencyMs ?? node.latencyMs };
    this.nodes.set(nodeId, updated);
    return { ...updated };
  }

  static mockNodes(options: {
    modelFamily: string;
    totalLayers: number;
    regions: string[];
    gpuType: string;
    prefix: string;
  }): ShardNode[] {
    const { modelFamily, totalLayers, regions, gpuType, prefix } = options;
    if (totalLayers % regions.length !== 0) throw new Error("Mock topology layers must divide evenly across regions.");
    const layersPerNode = totalLayers / regions.length;
    return regions.map((region, index) => ({
      nodeId: `${prefix}-shard-${index + 1}`,
      providerName: `Mock Provider ${index + 1}`,
      region,
      publicEndpoint: `mock://${prefix}/${region.toLowerCase()}`,
      gpuType,
      gpuUuid: `GPU-${prefix.toUpperCase()}-${String(index + 1).padStart(2, "0")}`,
      modelFamily,
      layerStart: index * layersPerNode,
      layerEnd: (index + 1) * layersPerNode - 1,
      endpointType: "mock",
      latencyMs: 22 + index * 9,
      reliabilityScore: Number((0.99 - index * 0.008).toFixed(3)),
      healthStatus: "healthy",
      costPerToken: Number((0.0000025 + index * 0.0000002).toFixed(7)),
      trustedBoundary: index === 0 || index === regions.length - 1,
    }));
  }
}

function validateNode(node: ShardNode): void {
  if (!node.nodeId || !node.gpuUuid || !node.publicEndpoint) throw new Error("Shard node identity and endpoint are required.");
  if (!Number.isInteger(node.layerStart) || !Number.isInteger(node.layerEnd) || node.layerStart < 0 || node.layerEnd < node.layerStart) {
    throw new Error(`Invalid layer assignment for ${node.nodeId}.`);
  }
  if (node.latencyMs < 0 || node.costPerToken < 0) throw new Error(`Negative latency or cost for ${node.nodeId}.`);
  if (node.reliabilityScore < 0 || node.reliabilityScore > 1) throw new Error(`Reliability must be between 0 and 1 for ${node.nodeId}.`);
}
