import { randomUUID } from "node:crypto";
import { CareNoteAgent, IncidentDraftAgent, ShiftNoteParseAgent, type ShiftNoteInput } from "../agents/care.js";
import { ComplianceReviewAgent } from "../agents/review.js";
import { ReportAgent } from "../agents/developer.js";
import type { Orchestrator } from "../orchestration/runner.js";
import { runCascade } from "../orchestration/cascade.js";

/**
 * Care Workflow:
 *   raw shift note → Gemini parse → Kimi structured care note →
 *   DeepSeek compliance review → human approval gate → report export.
 */
export async function runCareWorkflow(orchestrator: Orchestrator, input: ShiftNoteInput) {
  const taskId = `care-${randomUUID()}`;

  // 1. Gemini: parse/clean the raw (or photographed) note.
  const parsed = await orchestrator.runAgent(ShiftNoteParseAgent, input, {
    taskId,
    rawInputReference: `shift-note:${input.residentId}:${input.shiftDate}`,
  });

  // 2. Kimi: structured care note. Cascade escalates to DeepSeek if low confidence.
  const careNote = await runCascade(
    orchestrator,
    CareNoteAgent,
    { residentId: input.residentId, shiftDate: input.shiftDate, cleanedText: parsed.parsed.cleanedText },
    { taskId },
  );

  // 3. DeepSeek: compliance review of the care note.
  const compliance = await orchestrator.runAgent(
    ComplianceReviewAgent,
    { framework: "Aged Care Quality Standards", content: JSON.stringify(careNote.final.parsed, null, 2) },
    { taskId, reviewModel: careNote.final.model },
  );

  // 4. Human approval gate: required when not compliant or review flagged it.
  const requiresHuman = !compliance.parsed.compliant || compliance.parsed.requiresHumanReview;
  await orchestrator.store.updateHumanReview(
    careNote.final.record.id,
    requiresHuman ? "PENDING" : "NOT_REQUIRED",
  );

  // 5. Report export (Gemini) — produced once cleared (here we draft it regardless,
  //    but mark it PENDING when human sign-off is still required).
  const report = await orchestrator.runAgent(
    ReportAgent,
    {
      title: `Care report — ${input.residentId} (${input.shiftDate})`,
      source: JSON.stringify({ careNote: careNote.final.parsed, compliance: compliance.parsed }, null, 2),
    },
    { taskId, humanReviewStatus: requiresHuman ? "PENDING" : "NOT_REQUIRED" },
  );

  return { taskId, parsed, careNote, compliance, report, requiresHuman };
}

/** Convenience: full incident path (draft → compliance review). */
export async function runIncidentWorkflow(
  orchestrator: Orchestrator,
  input: { residentId: string; shiftDate: string; description: string },
) {
  const taskId = `incident-${randomUUID()}`;
  const draft = await runCascade(orchestrator, IncidentDraftAgent, input, { taskId });
  const compliance = await orchestrator.runAgent(
    ComplianceReviewAgent,
    { framework: "Incident Management Policy", content: JSON.stringify(draft.final.parsed, null, 2) },
    { taskId, reviewModel: draft.final.model },
  );
  return { taskId, draft, compliance };
}
