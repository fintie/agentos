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
    const adapter = this.registry.get(decision.model);

    const structured = await runStructured({
      adapter,
      messages,
      schema: agent.schema,
      schemaName: agent.name,
      maxRetries: opts.maxRetries,
      signal: opts.signal,
    });

    const confidence = structured.parsed.confidence;
    const record = await this.store.record({
      taskId: opts.taskId ?? randomUUID(),
      agentName: agent.name,
      modelName: decision.model,
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
        decision,
        attempts: structured.attempts,
        usage: structured.usage,
        live: this.registry.isLive(decision.model),
      },
    });

    return { parsed: structured.parsed, raw: structured.raw, model: decision.model, confidence, decision, record };
  }
}
