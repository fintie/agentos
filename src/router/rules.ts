import type { ModelFamily, RoutingContext, TaskType } from "../types.js";

/**
 * A routing rule maps task type + signals to an ordered list of candidate
 * models. The first candidate is the default; later ones are escalation targets
 * the cascade can promote to. `when` lets a rule additionally gate on context
 * (risk, latency, context length, multimodality).
 */
export interface RoutingRule {
  id: string;
  taskType: TaskType;
  candidates: ModelFamily[];
  description: string;
  /** Optional extra predicate; rules are matched top-to-bottom. */
  when?: (ctx: RoutingContext) => boolean;
}

/**
 * Base rule table per the product spec. More specific rules (with `when`)
 * are listed before generic fallbacks for the same task type.
 */
export const DEFAULT_RULES: RoutingRule[] = [
  {
    id: "fast_summary.default",
    taskType: "fast_summary",
    candidates: ["gemini-3-flash", "kimi-k2.6"],
    description: "Fast, low-cost summaries → Gemini 3 Flash.",
  },
  {
    id: "multimodal_parse.default",
    taskType: "multimodal_parse",
    candidates: ["gemini-3-flash"],
    description: "Image/audio/video parsing → Gemini 3 Flash (multimodal).",
  },
  {
    id: "long_context_reasoning.default",
    taskType: "long_context_reasoning",
    candidates: ["kimi-k2.6", "deepseek-v4-pro"],
    description: "Long-context reasoning → Kimi K2.6.",
  },
  {
    id: "agent_planning.default",
    taskType: "agent_planning",
    candidates: ["kimi-k2.6", "deepseek-v4-pro"],
    description: "Agent / multi-agent planning → Kimi K2.6.",
  },
  {
    // High-risk code generation jumps straight to DeepSeek.
    id: "code_generation.high_risk",
    taskType: "code_generation",
    candidates: ["deepseek-v4-pro", "kimi-k2.6"],
    description: "High-risk code generation → DeepSeek V4 Pro first.",
    when: (ctx) => ctx.riskLevel === "high",
  },
  {
    id: "code_generation.default",
    taskType: "code_generation",
    candidates: ["kimi-k2.6", "deepseek-v4-pro"],
    description: "Code generation → Kimi K2.6, escalate to DeepSeek V4 Pro.",
  },
  {
    id: "code_review.default",
    taskType: "code_review",
    candidates: ["deepseek-v4-pro"],
    description: "Code review → DeepSeek V4 Pro.",
  },
  {
    id: "compliance_review.default",
    taskType: "compliance_review",
    candidates: ["deepseek-v4-pro"],
    description: "Compliance review → DeepSeek V4 Pro.",
  },
  {
    id: "final_judge.default",
    taskType: "final_judge",
    candidates: ["deepseek-v4-pro"],
    description: "LLM-as-judge / final validation → DeepSeek V4 Pro.",
  },
  {
    id: "batch_generation.default",
    taskType: "batch_generation",
    candidates: ["gemini-3-flash"],
    description: "High-volume batch generation → Gemini 3 Flash.",
  },
];

/** Find the first rule matching the task type and (optional) predicate. */
export function matchRule(
  ctx: RoutingContext,
  rules: RoutingRule[] = DEFAULT_RULES,
): RoutingRule | undefined {
  return rules.find(
    (r) => r.taskType === ctx.taskType && (!r.when || r.when(ctx)),
  );
}
