import { randomUUID } from "node:crypto";
import { CallSummaryAgent, EscalationAgent, FollowUpPlanAgent, type TranscriptInput } from "../agents/voice.js";
import { ReportAgent } from "../agents/developer.js";
import type { Orchestrator } from "../orchestration/runner.js";

/**
 * Voice Gateway Workflow:
 *   call transcript → Gemini summary → Kimi follow-up plan →
 *   DeepSeek escalation check → CRM note.
 */
export async function runVoiceWorkflow(orchestrator: Orchestrator, input: TranscriptInput) {
  const taskId = `voice-${randomUUID()}`;

  // 1. Gemini: fast call summary.
  const summary = await orchestrator.runAgent(CallSummaryAgent, input, {
    taskId,
    rawInputReference: `call:${input.callId}`,
  });

  // 2. Kimi: follow-up plan.
  const followUp = await orchestrator.runAgent(
    FollowUpPlanAgent,
    { summary: summary.parsed.summary, actionItems: summary.parsed.actionItems },
    { taskId },
  );

  // 3. DeepSeek: escalation check on risk/compliance signals.
  const escalation = await orchestrator.runAgent(
    EscalationAgent,
    { summary: summary.parsed.summary, transcript: input.transcript },
    { taskId, reviewModel: summary.model },
  );

  // 4. Gemini: CRM note. Flag for human review when escalation is immediate.
  const crmNote = await orchestrator.runAgent(
    ReportAgent,
    {
      title: `CRM note — call ${input.callId}`,
      source: JSON.stringify(
        { summary: summary.parsed, followUp: followUp.parsed, escalation: escalation.parsed },
        null,
        2,
      ),
    },
    { taskId, humanReviewStatus: escalation.parsed.urgency === "immediate" ? "PENDING" : "NOT_REQUIRED" },
  );

  return { taskId, summary, followUp, escalation, crmNote };
}
