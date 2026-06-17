import {
  CallSummarySchema,
  EscalationCheckSchema,
  FollowUpPlanSchema,
  type CallSummary,
  type EscalationCheck,
  type FollowUpPlan,
} from "../schemas/index.js";
import type { Message } from "../types.js";
import type { AgentDefinition } from "./types.js";

export interface TranscriptInput {
  callId: string;
  transcript: string;
}

/** Fast call summary — Gemini. */
export const CallSummaryAgent: AgentDefinition<TranscriptInput, CallSummary> = {
  name: "CallSummaryAgent",
  description: "Summarise a call transcript with sentiment and action items.",
  taskType: "fast_summary",
  defaultRisk: "low",
  defaultLatency: "interactive",
  promptVersion: "voice.summary.v1",
  schema: CallSummarySchema,
  buildMessages(input): Message[] {
    return [
      {
        role: "system",
        content: "You summarise customer/support calls concisely and extract action items. Respond as JSON.",
      },
      { role: "user", content: `Call ${input.callId} transcript:\n${input.transcript}` },
    ];
  },
};

export interface FollowUpInput {
  summary: string;
  actionItems: string[];
}

/** Follow-up planning — Kimi. */
export const FollowUpPlanAgent: AgentDefinition<FollowUpInput, FollowUpPlan> = {
  name: "FollowUpPlanAgent",
  description: "Turn a call summary into an owned, scheduled follow-up plan.",
  taskType: "agent_planning",
  defaultRisk: "medium",
  promptVersion: "voice.followup.v1",
  schema: FollowUpPlanSchema,
  buildMessages(input): Message[] {
    return [
      {
        role: "system",
        content: "You create concrete follow-up plans with owners and due dates. Respond as JSON.",
      },
      {
        role: "user",
        content: `Summary: ${input.summary}\nAction items: ${input.actionItems.join("; ") || "none"}`,
      },
    ];
  },
};

/** Escalation check — DeepSeek (risk reasoning). */
export const EscalationAgent: AgentDefinition<{ summary: string; transcript: string }, EscalationCheck> = {
  name: "EscalationAgent",
  description: "Decide whether a call requires escalation and how urgently.",
  taskType: "compliance_review",
  defaultRisk: "high",
  promptVersion: "voice.escalation.v1",
  schema: EscalationCheckSchema,
  buildMessages(input): Message[] {
    return [
      {
        role: "system",
        content:
          "You assess risk and compliance signals in calls (complaints, safety, legal, churn). " +
          "Recommend escalation conservatively. Respond as JSON.",
      },
      { role: "user", content: `Summary: ${input.summary}\n\nTranscript:\n${input.transcript}` },
    ];
  },
};
