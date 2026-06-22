import { createHash } from "node:crypto";
import type { HumanReviewStatus, ModelFamily } from "../types.js";
import type { ExecutionBackend } from "../types.js";
import type { ShardRunReceipt } from "../shard/proofReceipt.js";
import type { SettlementRecord } from "../settlement/shardSettlement.js";

/**
 * One audit/evaluation record per AI output, matching the spec field-for-field
 * and the Prisma `EvaluationRecord` model.
 */
export interface EvaluationRecord {
  id: string;
  taskId: string;
  agentName: string;
  modelName: ModelFamily | string;
  promptVersion: string;
  inputHash: string;
  rawInputReference: string;
  rawOutput: string;
  parsedOutput: unknown;
  confidenceScore: number;
  evaluationScore?: number;
  reviewModel?: string;
  humanReviewStatus: HumanReviewStatus;
  routingTrace?: unknown;
  executionBackend?: ExecutionBackend;
  shardReceipt?: ShardRunReceipt;
  settlementRecords?: SettlementRecord[];
  createdAt: string; // ISO timestamp
}

/** Fields supplied at write time; id/createdAt are filled by the store. */
export type EvaluationInput = Omit<EvaluationRecord, "id" | "createdAt"> &
  Partial<Pick<EvaluationRecord, "createdAt">>;

export interface EvaluationStore {
  record(input: EvaluationInput): Promise<EvaluationRecord>;
  list(filter?: EvaluationFilter): Promise<EvaluationRecord[]>;
  get(id: string): Promise<EvaluationRecord | undefined>;
  updateHumanReview(id: string, status: HumanReviewStatus): Promise<EvaluationRecord | undefined>;
}

export interface EvaluationFilter {
  taskId?: string;
  agentName?: string;
  modelName?: string;
  limit?: number;
}

/** Stable SHA-256 of an input payload, for dedupe + provenance. */
export function hashInput(input: unknown): string {
  const serialised = typeof input === "string" ? input : JSON.stringify(input);
  return createHash("sha256").update(serialised).digest("hex");
}
