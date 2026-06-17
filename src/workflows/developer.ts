import { randomUUID } from "node:crypto";
import { CodeReviewAgent, DeveloperAgent, ReportAgent, type RequirementInput } from "../agents/developer.js";
import type { Orchestrator } from "../orchestration/runner.js";

/**
 * Developer Workflow:
 *   product requirement → Kimi architecture plan → DeepSeek code review →
 *   Gemini documentation summary.
 *
 * (The "code review" stage reviews the proposed plan/implementation sketch;
 *  in a real pipeline a code-generation step would sit between plan and review.)
 */
export async function runDeveloperWorkflow(orchestrator: Orchestrator, input: RequirementInput) {
  const taskId = `dev-${randomUUID()}`;

  // 1. Kimi: architecture/implementation plan.
  const plan = await orchestrator.runAgent(DeveloperAgent, input, {
    taskId,
    rawInputReference: `requirement:${input.title}`,
  });

  // 2. DeepSeek: rigorous review of the plan.
  const review = await orchestrator.runAgent(
    CodeReviewAgent,
    { context: `Architecture plan for: ${input.title}`, diffOrCode: JSON.stringify(plan.parsed, null, 2) },
    { taskId, reviewModel: plan.model },
  );

  // 3. Gemini: documentation summary.
  const docs = await orchestrator.runAgent(
    ReportAgent,
    {
      title: `Design doc — ${input.title}`,
      source: JSON.stringify({ plan: plan.parsed, review: review.parsed }, null, 2),
    },
    { taskId },
  );

  return { taskId, plan, review, docs };
}
