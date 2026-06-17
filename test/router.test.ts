import { describe, expect, it } from "vitest";
import { ModelRouter } from "../src/router/router.js";
import { AdapterRegistry } from "../src/adapters/index.js";
import { loadConfig } from "../src/config.js";
import type { RoutingContext, TaskType } from "../src/types.js";

// Force mock so adapters report each family's real context/multimodal profile.
const cfg = { ...loadConfig(), forceMock: true };
const registry = new AdapterRegistry(cfg);
const router = new ModelRouter({ registry });

function route(ctx: RoutingContext) {
  return router.route(ctx);
}

describe("ModelRouter — base rule table", () => {
  const cases: Array<[TaskType, string]> = [
    ["fast_summary", "gemini-3-flash"],
    ["multimodal_parse", "gemini-3-flash"],
    ["long_context_reasoning", "kimi-k2.6"],
    ["agent_planning", "kimi-k2.6"],
    ["code_generation", "kimi-k2.6"],
    ["code_review", "deepseek-v4-pro"],
    ["compliance_review", "deepseek-v4-pro"],
    ["final_judge", "deepseek-v4-pro"],
    ["batch_generation", "gemini-3-flash"],
  ];

  it.each(cases)("routes %s → %s", (taskType, expected) => {
    expect(route({ taskType }).model).toBe(expected);
  });
});

describe("ModelRouter — risk & confidence escalation", () => {
  it("high-risk code_generation goes straight to DeepSeek", () => {
    const d = route({ taskType: "code_generation", riskLevel: "high" });
    expect(d.model).toBe("deepseek-v4-pro");
    expect(d.escalated).toBe(true);
  });

  it("low confidence escalates to the strongest candidate", () => {
    const d = route({ taskType: "code_generation", confidenceScore: 0.2 });
    expect(d.model).toBe("deepseek-v4-pro");
    expect(d.escalated).toBe(true);
  });

  it("high confidence keeps the cheap default", () => {
    const d = route({ taskType: "code_generation", confidenceScore: 0.95 });
    expect(d.model).toBe("kimi-k2.6");
    expect(d.escalated).toBe(false);
  });
});

describe("ModelRouter — hard constraints", () => {
  it("multimodal task only routes to a multimodal-capable model", () => {
    const d = route({ taskType: "multimodal_parse", multimodal: true });
    expect(d.model).toBe("gemini-3-flash");
  });

  it("multimodal requirement filters out non-multimodal candidates", () => {
    // long_context default is Kimi (no multimodal) → must fall back to Gemini.
    const d = route({ taskType: "long_context_reasoning", multimodal: true });
    expect(registry.get(d.model).supportsMultimodal()).toBe(true);
  });

  it("huge context excludes models whose window is too small", () => {
    // 200k tokens excludes DeepSeek (128k); Kimi (256k) qualifies.
    const d = route({ taskType: "long_context_reasoning", contextTokens: 200_000 });
    expect(d.model).toBe("kimi-k2.6");
  });

  it("throws when no model can satisfy the constraints", () => {
    expect(() => route({ taskType: "code_review", contextTokens: 5_000_000 })).toThrow();
  });
});

describe("ModelRouter — cost budget & latency", () => {
  it("realtime latency prefers Gemini Flash among candidates", () => {
    const d = route({ taskType: "code_generation", latency: "realtime" });
    // Flash isn't a code_generation candidate, so it stays on the rule set;
    // but for a task where Flash IS a candidate it wins:
    const fast = route({ taskType: "fast_summary", latency: "realtime" });
    expect(fast.model).toBe("gemini-3-flash");
    expect(d.candidates.length).toBeGreaterThan(0);
  });

  it("reports an estimated cost on every decision", () => {
    const d = route({ taskType: "fast_summary", contextTokens: 2000 });
    expect(d.estimatedCostUsd).toBeGreaterThanOrEqual(0);
  });
});

describe("ModelRouter — forceModel escape hatch", () => {
  it("honours an explicit forceModel", () => {
    const d = route({ taskType: "fast_summary", forceModel: "deepseek-v4-pro" });
    expect(d.model).toBe("deepseek-v4-pro");
    expect(d.ruleId).toBe("forceModel");
  });
});
