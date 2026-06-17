/**
 * Shared domain types for AgentOS.
 */

/** The three supported model families plus the local mock. */
export type ModelFamily = "gemini-3-flash" | "kimi-k2.6" | "deepseek-v4-pro" | "mock";

/** Canonical task types the router understands. */
export type TaskType =
  | "fast_summary"
  | "multimodal_parse"
  | "long_context_reasoning"
  | "agent_planning"
  | "code_generation"
  | "code_review"
  | "compliance_review"
  | "final_judge"
  | "batch_generation";

export type RiskLevel = "low" | "medium" | "high";
export type LatencyRequirement = "realtime" | "interactive" | "batch";

/** Signals the router weighs when choosing a model. */
export interface RoutingContext {
  taskType: TaskType;
  riskLevel?: RiskLevel;
  /** Approximate input size in tokens. */
  contextTokens?: number;
  latency?: LatencyRequirement;
  /** Max acceptable spend for this single call, in USD. */
  costBudgetUsd?: number;
  /** Whether the task involves images / audio / video. */
  multimodal?: boolean;
  /**
   * Confidence in a prior/cheaper result (0..1). When provided and low, the
   * router may prefer a stronger model. Used heavily by cascade execution.
   */
  confidenceScore?: number;
  /** Force a particular family regardless of rules (escape hatch). */
  forceModel?: ModelFamily;
}

export interface RoutingDecision {
  model: ModelFamily;
  ruleId: string;
  reason: string;
  /** Models considered, in preference order. */
  candidates: ModelFamily[];
  estimatedCostUsd: number;
  /** Whether this decision was an escalation from a cheaper model. */
  escalated: boolean;
}

/** A multimodal message part. */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; dataBase64: string }
  | { type: "audio"; mimeType: string; dataBase64: string };

export interface Message {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export interface GenerateOptions {
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  /** JSON schema (as plain object) to coerce structured output where supported. */
  responseJsonSchema?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateResult {
  text: string;
  usage: TokenUsage;
  model: ModelFamily;
  /** Provider-reported finish reason, normalised. */
  finishReason: "stop" | "length" | "content_filter" | "error" | "unknown";
  raw?: unknown;
}

export interface CostEstimate {
  inputCostUsd: number;
  outputCostUsd: number;
  totalUsd: number;
}

export type HumanReviewStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "NOT_REQUIRED";
