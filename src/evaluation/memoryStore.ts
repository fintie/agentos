import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { HumanReviewStatus } from "../types.js";
import type {
  EvaluationFilter,
  EvaluationInput,
  EvaluationRecord,
  EvaluationStore,
} from "./types.js";

/**
 * File-backed in-memory store. Zero external dependencies — ideal for local
 * dev, tests, and the demo dashboard. Persists to a JSON file so the dashboard
 * can read what the demo/seed wrote.
 */
export class MemoryEvaluationStore implements EvaluationStore {
  private records: EvaluationRecord[] = [];

  constructor(private readonly file?: string) {
    if (file && existsSync(file)) {
      try {
        this.records = JSON.parse(readFileSync(file, "utf8"));
      } catch {
        this.records = [];
      }
    }
  }

  async record(input: EvaluationInput): Promise<EvaluationRecord> {
    const rec: EvaluationRecord = {
      ...input,
      id: randomUUID(),
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    this.records.push(rec);
    this.flush();
    return rec;
  }

  async list(filter: EvaluationFilter = {}): Promise<EvaluationRecord[]> {
    let out = this.records;
    if (filter.taskId) out = out.filter((r) => r.taskId === filter.taskId);
    if (filter.agentName) out = out.filter((r) => r.agentName === filter.agentName);
    if (filter.modelName) out = out.filter((r) => r.modelName === filter.modelName);
    out = [...out].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async get(id: string): Promise<EvaluationRecord | undefined> {
    return this.records.find((r) => r.id === id);
  }

  async updateHumanReview(
    id: string,
    status: HumanReviewStatus,
  ): Promise<EvaluationRecord | undefined> {
    const rec = this.records.find((r) => r.id === id);
    if (!rec) return undefined;
    rec.humanReviewStatus = status;
    this.flush();
    return rec;
  }

  private flush(): void {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.records, null, 2));
  }
}
