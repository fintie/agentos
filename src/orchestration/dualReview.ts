import type { AgentDefinition } from "../agents/types.js";
import type { AgentRunResult, Orchestrator, RunOptions } from "./runner.js";

/**
 * Dual review: one model generates, a second model reviews, and an optional
 * third model rewrites/finalises. Each stage is a full, logged agent run; they
 * share a taskId so the chain is reconstructable in the audit log.
 *
 * Example (incident handling):
 *   - Kimi (IncidentDraftAgent) generates the draft,
 *   - DeepSeek (ComplianceReviewAgent) reviews risk/compliance,
 *   - Gemini (ReportAgent) rewrites the final language for readability.
 */
export interface DualReviewSpec<GInput, GOut extends { confidence: number }, RInput, ROut extends { confidence: number }, FInput, FOut extends { confidence: number }> {
  taskId: string;
  generate: { agent: AgentDefinition<GInput, GOut>; input: GInput; options?: RunOptions };
  review: {
    agent: AgentDefinition<RInput, ROut>;
    buildInput: (generated: GOut) => RInput;
    options?: RunOptions;
  };
  /** Optional finalisation/rewrite stage. */
  finalize?: {
    agent: AgentDefinition<FInput, FOut>;
    buildInput: (generated: GOut, review: ROut) => FInput;
    options?: RunOptions;
  };
}

export interface DualReviewResult<GOut, ROut, FOut> {
  generated: AgentRunResult<GOut>;
  review: AgentRunResult<ROut>;
  finalized?: AgentRunResult<FOut>;
}

export async function runDualReview<
  GInput,
  GOut extends { confidence: number },
  RInput,
  ROut extends { confidence: number },
  FInput,
  FOut extends { confidence: number },
>(
  orchestrator: Orchestrator,
  spec: DualReviewSpec<GInput, GOut, RInput, ROut, FInput, FOut>,
): Promise<DualReviewResult<GOut, ROut, FOut>> {
  const generated = await orchestrator.runAgent(spec.generate.agent, spec.generate.input, {
    ...spec.generate.options,
    taskId: spec.taskId,
  });

  const review = await orchestrator.runAgent(spec.review.agent, spec.review.buildInput(generated.parsed), {
    ...spec.review.options,
    taskId: spec.taskId,
    // Record which model produced the artifact under review.
    reviewModel: generated.model,
  });

  let finalized: AgentRunResult<FOut> | undefined;
  if (spec.finalize) {
    finalized = await orchestrator.runAgent(
      spec.finalize.agent,
      spec.finalize.buildInput(generated.parsed, review.parsed),
      { ...spec.finalize.options, taskId: spec.taskId, reviewModel: review.model },
    );
  }

  return { generated, review, finalized };
}
