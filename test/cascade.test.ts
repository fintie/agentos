import { describe, expect, it } from "vitest";
import { Orchestrator } from "../src/orchestration/runner.js";
import { runCascade } from "../src/orchestration/cascade.js";
import { AdapterRegistry } from "../src/adapters/index.js";
import { MemoryEvaluationStore } from "../src/evaluation/memoryStore.js";
import { ModelRouter } from "../src/router/router.js";
import { loadConfig } from "../src/config.js";
import type { AgentDefinition } from "../src/agents/types.js";
import { z } from "zod";

const cfg = { ...loadConfig(), forceMock: true };

function makeOrchestrator() {
  const registry = new AdapterRegistry(cfg);
  return new Orchestrator({
    registry,
    router: new ModelRouter({ registry }),
    store: new MemoryEvaluationStore(), // no file → pure in-memory
  });
}

const OutSchema = z.object({ answer: z.string(), confidence: z.number().min(0).max(1) });

// Agent whose confidence we can drive via the prompt → mock behaviour.
const TestAgent: AgentDefinition<{ q: string; conf: number }, z.infer<typeof OutSchema>> = {
  name: "TestAgent",
  description: "test",
  taskType: "code_generation",
  defaultRisk: "low",
  promptVersion: "t1",
  schema: OutSchema,
  buildMessages: (input) => [{ role: "user", content: `${input.q} conf=${input.conf}` }],
};

describe("runCascade", () => {
  it("accepts the first rung when the accept predicate passes", async () => {
    const orch = makeOrchestrator();
    const res = await runCascade(orch, TestAgent, { q: "hi", conf: 0.9 }, {
      accept: () => true,
    });
    expect(res.escalated).toBe(false);
    expect(res.steps).toHaveLength(1);
    expect(res.steps[0]?.accepted).toBe(true);
  });

  it("escalates through the ladder when accept keeps rejecting", async () => {
    const orch = makeOrchestrator();
    const res = await runCascade(orch, TestAgent, { q: "hi", conf: 0.1 }, {
      ladder: ["gemini-3-flash", "kimi-k2.6", "deepseek-v4-pro"],
      accept: (r) => r.model === "deepseek-v4-pro", // only the top rung is accepted
    });
    expect(res.escalated).toBe(true);
    expect(res.final.model).toBe("deepseek-v4-pro");
    expect(res.steps.map((s) => s.model)).toEqual([
      "gemini-3-flash",
      "kimi-k2.6",
      "deepseek-v4-pro",
    ]);
  });

  it("writes an evaluation record for every rung attempted", async () => {
    const store = new MemoryEvaluationStore();
    const registry = new AdapterRegistry(cfg);
    const orch = new Orchestrator({ registry, router: new ModelRouter({ registry }), store });
    await runCascade(orch, TestAgent, { q: "hi", conf: 0.1 }, {
      taskId: "cascade-test",
      ladder: ["gemini-3-flash", "deepseek-v4-pro"],
      accept: (r) => r.model === "deepseek-v4-pro",
    });
    const records = await store.list({ taskId: "cascade-test" });
    expect(records).toHaveLength(2);
  });
});
