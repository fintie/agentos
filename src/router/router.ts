import { AdapterRegistry } from "../adapters/index.js";
import { estimateTokens } from "../adapters/base.js";
import type { ModelFamily, RoutingContext, RoutingDecision } from "../types.js";
import { DEFAULT_RULES, matchRule, type RoutingRule } from "./rules.js";

/** Default output size assumed when estimating cost during routing. */
const ASSUMED_OUTPUT_TOKENS = 600;

export interface RouterOptions {
  rules?: RoutingRule[];
  registry?: AdapterRegistry;
}

/**
 * The ModelRouter turns a RoutingContext into a concrete model choice. It:
 *   1. matches a rule for the task type (+ predicates),
 *   2. filters candidates by hard constraints (context window, multimodal),
 *   3. reorders by soft signals (latency, cost budget, confidence/risk),
 *   4. returns the winner plus a full trace for the audit log.
 */
export class ModelRouter {
  private readonly rules: RoutingRule[];
  private readonly registry: AdapterRegistry;

  constructor(opts: RouterOptions = {}) {
    this.rules = opts.rules ?? DEFAULT_RULES;
    this.registry = opts.registry ?? new AdapterRegistry();
  }

  route(ctx: RoutingContext): RoutingDecision {
    // Escape hatch: explicit override wins, but still validate constraints.
    if (ctx.forceModel) {
      return this.decision(ctx.forceModel, [ctx.forceModel], "forceModel", `Forced to ${ctx.forceModel}.`, ctx, false);
    }

    const rule = matchRule(ctx, this.rules);
    if (!rule) {
      throw new Error(`No routing rule for task type "${ctx.taskType}".`);
    }

    let candidates = [...rule.candidates];

    // (2) Hard constraints.
    if (ctx.multimodal) {
      candidates = candidates.filter((m) => this.registry.get(m).supportsMultimodal());
    }
    if (ctx.contextTokens != null) {
      candidates = candidates.filter((m) => this.registry.get(m).maxContextTokens() >= ctx.contextTokens!);
    }
    if (candidates.length === 0) {
      // Fall back to any family in the rule that can hold the context, else throw.
      candidates = this.fallbackForConstraints(ctx, rule);
    }

    // (3) Soft signals — produce an ordering, then pick the head.
    const ordered = this.applySoftSignals(candidates, ctx);

    // Low confidence or high risk promotes the strongest available candidate.
    const escalate =
      (ctx.confidenceScore != null && ctx.confidenceScore < CONFIDENCE_FLOOR) ||
      ctx.riskLevel === "high";
    if (escalate && ordered.length > 1) {
      const strongest = this.strongest(ordered);
      const reason =
        ctx.riskLevel === "high"
          ? "High risk — promoting strongest candidate."
          : `Low confidence (${ctx.confidenceScore}) — promoting strongest candidate.`;
      return this.decision(strongest, ordered, rule.id, `${rule.description} ${reason}`, ctx, true);
    }

    const chosen = ordered[0]!;
    return this.decision(chosen, ordered, rule.id, rule.description, ctx, false);
  }

  /** Order candidates by the soft signals without dropping any. */
  private applySoftSignals(candidates: ModelFamily[], ctx: RoutingContext): ModelFamily[] {
    const scored = candidates.map((m) => ({ m, score: this.softScore(m, ctx) }));
    // Stable sort: higher score first; ties keep rule order.
    return scored
      .map((s, i) => ({ ...s, i }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .map((s) => s.m);
  }

  private softScore(family: ModelFamily, ctx: RoutingContext): number {
    let score = 0;
    const adapter = this.registry.get(family);
    const estCost = this.estimateCost(family, ctx);

    if (ctx.latency === "realtime" || ctx.latency === "interactive") {
      // Flash is the fast path.
      if (family === "gemini-3-flash") score += 3;
    }
    if (ctx.costBudgetUsd != null) {
      if (estCost <= ctx.costBudgetUsd) score += 2;
      else score -= 5; // over budget — strongly de-prioritise
      // Within budget, cheaper is mildly preferred.
      score += Math.max(0, 1 - estCost);
    }
    // Larger context window is a slight tie-breaker when context is big.
    if ((ctx.contextTokens ?? 0) > 100_000 && adapter.maxContextTokens() >= 200_000) {
      score += 1;
    }
    return score;
  }

  private estimateCost(family: ModelFamily, ctx: RoutingContext): number {
    const adapter = this.registry.get(family);
    const inputTokens = ctx.contextTokens ?? 1000;
    return adapter.estimateCost({ inputTokens, outputTokens: ASSUMED_OUTPUT_TOKENS }).totalUsd;
  }

  /** Strongest = the reasoning-heaviest family present, by fixed precedence. */
  private strongest(families: ModelFamily[]): ModelFamily {
    const precedence: ModelFamily[] = ["deepseek-v4-pro", "kimi-k2.6", "gemini-3-flash", "mock"];
    return [...families].sort((a, b) => precedence.indexOf(a) - precedence.indexOf(b))[0]!;
  }

  private fallbackForConstraints(ctx: RoutingContext, rule: RoutingRule): ModelFamily[] {
    const all: ModelFamily[] = ["gemini-3-flash", "kimi-k2.6", "deepseek-v4-pro"];
    const viable = all.filter((m) => {
      const a = this.registry.get(m);
      if (ctx.multimodal && !a.supportsMultimodal()) return false;
      if (ctx.contextTokens != null && a.maxContextTokens() < ctx.contextTokens) return false;
      return true;
    });
    if (viable.length === 0) {
      throw new Error(
        `No model satisfies constraints for "${rule.taskType}" ` +
          `(contextTokens=${ctx.contextTokens}, multimodal=${ctx.multimodal}).`,
      );
    }
    return viable;
  }

  private decision(
    model: ModelFamily,
    candidates: ModelFamily[],
    ruleId: string,
    reason: string,
    ctx: RoutingContext,
    escalated: boolean,
  ): RoutingDecision {
    return {
      model,
      ruleId,
      reason,
      candidates,
      estimatedCostUsd: this.estimateCost(model, ctx),
      escalated,
    };
  }
}

/** Below this confidence the router/cascade prefers a stronger model. */
export const CONFIDENCE_FLOOR = 0.6;

/** Convenience for callers that have a string rather than a token count. */
export function tokensOf(text: string): number {
  return estimateTokens(text);
}
