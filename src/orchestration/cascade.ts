import { CONFIDENCE_FLOOR } from "../router/router.js";
import type { ModelFamily, RiskLevel } from "../types.js";
import type { AgentDefinition } from "../agents/types.js";
import { StructuredOutputError } from "./structured.js";
import type { AgentRunResult, Orchestrator, RunOptions } from "./runner.js";

export interface CascadeStep {
  model: ModelFamily;
  /** Why this rung was attempted. */
  reason: string;
  confidence?: number;
  accepted: boolean;
  error?: string;
}

export interface CascadeOptions extends RunOptions {
  /** Ordered models to try, cheapest/fastest first. Defaults to a sensible ladder. */
  ladder?: ModelFamily[];
  /** Accept the result once confidence ≥ this. Defaults to CONFIDENCE_FLOOR. */
  confidenceThreshold?: number;
  /** Force escalation to the top of the ladder regardless of confidence. */
  requireStrongest?: boolean;
  /** Custom acceptance predicate (e.g. schema-specific quality gate). */
  accept?: (result: AgentRunResult<any>) => boolean;
}

export interface CascadeResult<T> {
  final: AgentRunResult<T>;
  steps: CascadeStep[];
  escalated: boolean;
}

const DEFAULT_LADDER: ModelFamily[] = ["gemini-3-flash", "kimi-k2.6", "deepseek-v4-pro"];

/**
 * Cascade execution: start cheap/fast, escalate to stronger models when:
 *   - self-reported confidence is below threshold,
 *   - the task risk is high (force the strongest rung),
 *   - structured-output validation fails (the cheap rung threw),
 *   - the caller's accept() predicate rejects the output.
 *
 * Each rung is a full agent run (routed, validated, logged), so every attempt
 * is captured in the evaluation store.
 */
export async function runCascade<TInput, TOutput extends { confidence: number }>(
  orchestrator: Orchestrator,
  agent: AgentDefinition<TInput, TOutput>,
  input: TInput,
  opts: CascadeOptions = {},
): Promise<CascadeResult<TOutput>> {
  const threshold = opts.confidenceThreshold ?? CONFIDENCE_FLOOR;
  const ladder = opts.ladder ?? deriveLadder(agent.defaultRisk, opts.requireStrongest);
  const steps: CascadeStep[] = [];
  let last: AgentRunResult<TOutput> | undefined;

  for (let i = 0; i < ladder.length; i++) {
    const model = ladder[i]!;
    const isLastRung = i === ladder.length - 1;
    try {
      const result = await orchestrator.runAgent(agent, input, {
        ...opts,
        // Pin this rung's model via the router's forceModel escape hatch.
        routing: { ...opts.routing, forceModel: model },
      });
      last = result;

      const passesConfidence = result.confidence >= threshold;
      const passesCustom = opts.accept ? opts.accept(result) : true;
      const accepted = (passesConfidence && passesCustom) || isLastRung;

      steps.push({
        model,
        reason: i === 0 ? "initial (cheapest rung)" : "escalation",
        confidence: result.confidence,
        accepted,
      });

      if (accepted) {
        return { final: result, steps, escalated: i > 0 };
      }
    } catch (err) {
      // Schema-validation failure (or provider error) → escalate to next rung.
      const message = err instanceof StructuredOutputError ? "schema validation failed" : String(err);
      steps.push({ model, reason: i === 0 ? "initial" : "escalation", accepted: false, error: message });
      if (isLastRung) throw err;
    }
  }

  // Should be unreachable (last rung always accepts), but keep TS happy.
  if (!last) throw new Error("Cascade produced no result.");
  return { final: last, steps, escalated: ladder.length > 1 };
}

/** High-risk work starts higher up the ladder / forces the strongest model. */
function deriveLadder(risk: RiskLevel, requireStrongest?: boolean): ModelFamily[] {
  if (requireStrongest) return ["deepseek-v4-pro"];
  if (risk === "high") return ["kimi-k2.6", "deepseek-v4-pro"];
  return DEFAULT_LADDER;
}
