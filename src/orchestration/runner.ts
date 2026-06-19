import { randomUUID } from "node:crypto";
import { AdapterRegistry } from "../adapters/index.js";
import { loadConfig, type AgentOSConfig } from "../config.js";
import { createEvaluationStore } from "../evaluation/index.js";
import { hashInput, type EvaluationRecord, type EvaluationStore } from "../evaluation/types.js";
import { ModelRouter } from "../router/router.js";
import type {
  HumanReviewStatus,
  ModelFamily,
  RoutingContext,
  RoutingDecision,
} from "../types.js";
import type { AgentDefinition } from "../agents/types.js";
import { runStructured } from "./structured.js";

export interface RunOptions {
  /** Group multiple calls under one logical task (workflow run). */
  taskId?: string;
  /** Override routing inputs for this call (risk, latency, budget, forceModel…). */
  routing?: Partial<RoutingContext>;
  /** Reference to where the raw input is stored (object key, row id, etc.). */
  rawInputReference?: string;
  /** Persisted alongside the record when this output was reviewed by a model. */
  reviewModel?: string;
  evaluationScore?: number;
  humanReviewStatus?: HumanReviewStatus;
  maxRetries?: number;
  signal?: AbortSignal;
}

export interface AgentRunResult<T> {
  parsed: T;
  raw: string;
  model: ModelFamily;
  confidence: number;
  decision: RoutingDecision;
  record: EvaluationRecord;
}

/**
 * Central execution engine. Given an agent definition and input, it routes to a
 * model, runs schema-validated generation with retries, and writes a full
 * evaluation/audit record. Cascade and dual-review compose on top of this.
 */
export class Orchestrator {
  readonly router: ModelRouter;
  readonly registry: AdapterRegistry;
  readonly store: EvaluationStore;

  constructor(opts: { config?: AgentOSConfig; router?: ModelRouter; registry?: AdapterRegistry; store?: EvaluationStore } = {}) {
    const config = opts.config ?? loadConfig();
    this.registry = opts.registry ?? new AdapterRegistry(config);
    this.router = opts.router ?? new ModelRouter({ registry: this.registry });
    this.store = opts.store ?? createEvaluationStore(config);
  }

  /** Route + generate + validate + log for a single agent call. */
  async runAgent<TInput, TOutput extends { confidence: number }>(
    agent: AgentDefinition<TInput, TOutput>,
    input: TInput,
    opts: RunOptions = {},
  ): Promise<AgentRunResult<TOutput>> {
    const messages = agent.buildMessages(input);
    const contextText = messages.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n");

    const ctx: RoutingContext = {
      taskType: agent.taskType,
      riskLevel: agent.defaultRisk,
      latency: agent.defaultLatency,
      multimodal: agent.multimodal,
      contextTokens: Math.ceil(contextText.length / 4),
      ...opts.routing,
    };

    const decision = this.router.route(ctx);
    const attemptedModels: Array<{ model: ModelFamily; ok: boolean; error?: string }> = [];
    const candidateChain = uniqueModels([decision.model, ...decision.candidates]);
    let structured: Awaited<ReturnType<typeof runStructured<TOutput>>> | undefined;
    let model = decision.model;
    let lastError: unknown;

    for (const candidate of candidateChain) {
      const adapter = this.registry.get(candidate);
      try {
        structured = await runStructured({
          adapter,
          messages,
          schema: agent.schema,
          schemaName: agent.name,
          maxRetries: opts.maxRetries,
          signal: opts.signal,
        });
        model = candidate;
        attemptedModels.push({ model: candidate, ok: true });
        this.router.health.recordSuccess(candidate);
        break;
      } catch (err) {
        lastError = err;
        attemptedModels.push({ model: candidate, ok: false, error: errorMessage(err) });
        this.router.health.recordFailure(candidate);
      }
    }

    if (!structured) {
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }

    const confidence = structured.parsed.confidence;
    const adapter = this.registry.get(model);
    const actualCost = adapter.estimateCost(structured.usage);
    const vfm = valueForMoney({
      actualCostUsd: actualCost.totalUsd,
      estimatedCostUsd: decision.estimatedCostUsd,
      confidence,
      attempts: structured.attempts,
    });
    const record = await this.store.record({
      taskId: opts.taskId ?? randomUUID(),
      agentName: agent.name,
      modelName: model,
      promptVersion: agent.promptVersion,
      inputHash: hashInput(input as unknown),
      rawInputReference: opts.rawInputReference ?? "inline",
      rawOutput: structured.raw,
      parsedOutput: structured.parsed,
      confidenceScore: confidence,
      evaluationScore: opts.evaluationScore,
      reviewModel: opts.reviewModel,
      humanReviewStatus: opts.humanReviewStatus ?? "NOT_REQUIRED",
      routingTrace: {
        context: ctx,
        decision: model === decision.model ? decision : { ...decision, model },
        attemptedModels,
        attempts: structured.attempts,
        usage: structured.usage,
        cost: actualCost,
        valueForMoney: vfm,
        health: this.router.health.snapshots(candidateChain),
        live: this.registry.isLive(model),
      },
    });

    return {
      parsed: structured.parsed,
      raw: structured.raw,
      model,
      confidence,
      decision: model === decision.model ? decision : { ...decision, model },
      record,
    };
  }
}

function uniqueModels(models: ModelFamily[]): ModelFamily[] {
  return [...new Set(models)];
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function valueForMoney(opts: {
  actualCostUsd: number;
  estimatedCostUsd: number;
  confidence: number;
  attempts: number;
}) {
  const retryPenalty = Math.max(0, opts.attempts - 1) * 0.1;
  const costAccuracy =
    opts.estimatedCostUsd <= 0
      ? 1
      : Math.max(0, 1 - Math.abs(opts.actualCostUsd - opts.estimatedCostUsd) / opts.estimatedCostUsd);
  const score = Math.max(0, Math.min(1, opts.confidence * 0.7 + costAccuracy * 0.3 - retryPenalty));
  return {
    score,
    actualCostUsd: opts.actualCostUsd,
    estimatedCostUsd: opts.estimatedCostUsd,
    costAccuracy,
  };
}
