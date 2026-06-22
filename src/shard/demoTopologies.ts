import { ShardNodeRegistry } from "./nodeRegistry.js";
import type { ShardTopology } from "./topology.js";
import { assertValidShardTopology } from "./topology.js";

const glmNodes = ShardNodeRegistry.mockNodes({
  modelFamily: "GLM-5.2-style-mock", totalLayers: 78,
  regions: ["NV", "TX", "MN", "MO", "UT", "WA"], gpuType: "RTX PRO 6000 Mock", prefix: "glm52",
});
const gptNodes = ShardNodeRegistry.mockNodes({
  modelFamily: "gpt-oss-120B-style-mock", totalLayers: 36,
  regions: ["NV", "TX", "UT"], gpuType: "RTX 4090 Mock", prefix: "gptoss",
});

export const GLM_52_WAN_TOPOLOGY: ShardTopology = assertValidShardTopology({
  topologyId: "topology-glm52-wan-6x13",
  modelName: "GLM-5.2 style mock model",
  totalLayers: 78,
  coordinatorNodeId: "glm52-coordinator-wa",
  draftModelName: "GLM-4-9B draft mock",
  shardNodes: glmNodes,
  ringOrder: glmNodes.map((node) => node.nodeId),
  directReturnEnabled: true,
  speculativeDecodingEnabled: true,
  asyncPipeliningEnabled: true,
});

export const GPT_OSS_120B_WAN_TOPOLOGY: ShardTopology = assertValidShardTopology({
  topologyId: "topology-gptoss120b-wan-3x12",
  modelName: "gpt-oss-120B style mock model",
  totalLayers: 36,
  coordinatorNodeId: "gptoss-coordinator-nv",
  draftModelName: "gpt-oss-20B draft mock",
  shardNodes: gptNodes,
  ringOrder: gptNodes.map((node) => node.nodeId),
  directReturnEnabled: true,
  speculativeDecodingEnabled: true,
  asyncPipeliningEnabled: true,
});

export const DEMO_SHARD_TOPOLOGIES = [GLM_52_WAN_TOPOLOGY, GPT_OSS_120B_WAN_TOPOLOGY];
