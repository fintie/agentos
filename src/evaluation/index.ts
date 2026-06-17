import { loadConfig, type AgentOSConfig } from "../config.js";
import { MemoryEvaluationStore } from "./memoryStore.js";
import { PrismaEvaluationStore } from "./prismaStore.js";
import type { EvaluationStore } from "./types.js";

export * from "./types.js";
export { MemoryEvaluationStore } from "./memoryStore.js";
export { PrismaEvaluationStore } from "./prismaStore.js";

/** Construct the configured evaluation store (memory by default). */
export function createEvaluationStore(cfg: AgentOSConfig = loadConfig()): EvaluationStore {
  if (cfg.evalStore === "prisma") return new PrismaEvaluationStore();
  return new MemoryEvaluationStore(cfg.evalFile);
}
