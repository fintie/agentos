import type { HumanReviewStatus } from "../types.js";
import type {
  EvaluationFilter,
  EvaluationInput,
  EvaluationRecord,
  EvaluationStore,
} from "./types.js";

/**
 * Prisma/Postgres-backed store. The @prisma/client import is lazy and optional
 * so the package builds and runs without a database (the memory store is the
 * default). Use AGENTOS_EVAL_STORE=prisma after `prisma generate` + `migrate`.
 */
export class PrismaEvaluationStore implements EvaluationStore {
  private client: any;

  private async db(): Promise<any> {
    if (this.client) return this.client;
    // Dynamic import keeps @prisma/client optional.
    const mod: any = await import("@prisma/client").catch(() => {
      throw new Error(
        "AGENTOS_EVAL_STORE=prisma requires @prisma/client. Run `npm run prisma:generate`.",
      );
    });
    this.client = new mod.PrismaClient();
    return this.client;
  }

  async record(input: EvaluationInput): Promise<EvaluationRecord> {
    const db = await this.db();
    const row = await db.evaluationRecord.create({
      data: {
        taskId: input.taskId,
        agentName: input.agentName,
        modelName: String(input.modelName),
        promptVersion: input.promptVersion,
        inputHash: input.inputHash,
        rawInputReference: input.rawInputReference,
        rawOutput: input.rawOutput,
        parsedOutput: input.parsedOutput as any,
        confidenceScore: input.confidenceScore,
        evaluationScore: input.evaluationScore,
        reviewModel: input.reviewModel,
        humanReviewStatus: input.humanReviewStatus,
        routingTrace: input.routingTrace as any,
        executionBackend: input.executionBackend,
        shardReceipt: input.shardReceipt as any,
        settlementRecords: input.settlementRecords as any,
      },
    });
    return toRecord(row);
  }

  async list(filter: EvaluationFilter = {}): Promise<EvaluationRecord[]> {
    const db = await this.db();
    const rows = await db.evaluationRecord.findMany({
      where: {
        taskId: filter.taskId,
        agentName: filter.agentName,
        modelName: filter.modelName,
      },
      orderBy: { createdAt: "desc" },
      take: filter.limit,
    });
    return rows.map(toRecord);
  }

  async get(id: string): Promise<EvaluationRecord | undefined> {
    const db = await this.db();
    const row = await db.evaluationRecord.findUnique({ where: { id } });
    return row ? toRecord(row) : undefined;
  }

  async updateHumanReview(
    id: string,
    status: HumanReviewStatus,
  ): Promise<EvaluationRecord | undefined> {
    const db = await this.db();
    const row = await db.evaluationRecord.update({
      where: { id },
      data: { humanReviewStatus: status },
    });
    return row ? toRecord(row) : undefined;
  }
}

function toRecord(row: any): EvaluationRecord {
  return {
    id: row.id,
    taskId: row.taskId,
    agentName: row.agentName,
    modelName: row.modelName,
    promptVersion: row.promptVersion,
    inputHash: row.inputHash,
    rawInputReference: row.rawInputReference,
    rawOutput: row.rawOutput,
    parsedOutput: row.parsedOutput,
    confidenceScore: row.confidenceScore,
    evaluationScore: row.evaluationScore ?? undefined,
    reviewModel: row.reviewModel ?? undefined,
    humanReviewStatus: row.humanReviewStatus,
    routingTrace: row.routingTrace ?? undefined,
    executionBackend: row.executionBackend ?? undefined,
    shardReceipt: row.shardReceipt ?? undefined,
    settlementRecords: row.settlementRecords ?? undefined,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}
