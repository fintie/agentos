import type { AnyAgent } from "./types.js";
import { CareNoteAgent, IncidentDraftAgent, ShiftNoteParseAgent } from "./care.js";
import { CorrectnessAgent, NextPracticeAgent, TutorFeedbackAgent } from "./stem.js";
import { CallSummaryAgent, EscalationAgent, FollowUpPlanAgent } from "./voice.js";
import { CodeReviewAgent, DeveloperAgent, ReportAgent } from "./developer.js";
import { ComplianceReviewAgent, JudgeAgent } from "./review.js";

export * from "./types.js";
export * from "./care.js";
export * from "./stem.js";
export * from "./voice.js";
export * from "./developer.js";
export * from "./review.js";

/**
 * Central registry of reusable agents. The eight headline agents from the spec
 * plus the supporting agents the vertical workflows compose.
 */
export const AGENTS = {
  // ── Spec headline agents ──
  CareNoteAgent,
  IncidentDraftAgent,
  TutorFeedbackAgent,
  CallSummaryAgent,
  DeveloperAgent,
  ReportAgent,
  ComplianceReviewAgent,
  JudgeAgent,
  // ── Supporting workflow agents ──
  ShiftNoteParseAgent,
  CorrectnessAgent,
  NextPracticeAgent,
  FollowUpPlanAgent,
  EscalationAgent,
  CodeReviewAgent,
} as const;

export type AgentName = keyof typeof AGENTS;

export class AgentRegistry {
  private readonly agents = new Map<string, AnyAgent>(Object.entries(AGENTS));

  get(name: AgentName | string): AnyAgent {
    const agent = this.agents.get(name);
    if (!agent) throw new Error(`Unknown agent "${name}".`);
    return agent;
  }

  register(agent: AnyAgent): void {
    this.agents.set(agent.name, agent);
  }

  list(): AnyAgent[] {
    return [...this.agents.values()];
  }
}
