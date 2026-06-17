/**
 * Catalog: the use-case-oriented view of the system that the management
 * dashboard renders. Maps each vertical (use case) to its agents and workflow,
 * carries example inputs for the "run" forms, and exposes normalised workflow
 * runners that return a flat step trace the UI can display.
 */
import type { Orchestrator } from "./orchestration/runner.js";
import type { AgentName } from "./agents/registry.js";
import { runCareWorkflow, runIncidentWorkflow } from "./workflows/care.js";
import { runStemWorkflow } from "./workflows/stem.js";
import { runVoiceWorkflow } from "./workflows/voice.js";
import { runDeveloperWorkflow } from "./workflows/developer.js";

export interface UseCase {
  id: string;
  name: string;
  description: string;
  /** Agents belonging to this use case (in pipeline order). */
  agents: AgentName[];
  /** Workflow id this use case can run end-to-end (optional). */
  workflowId?: string;
}

export const USE_CASES: UseCase[] = [
  {
    id: "care",
    name: "Aged Care",
    description:
      "Turn messy shift notes into compliant, audit-ready care documentation with a human approval gate.",
    agents: ["ShiftNoteParseAgent", "CareNoteAgent", "IncidentDraftAgent", "ComplianceReviewAgent", "ReportAgent"],
    workflowId: "care",
  },
  {
    id: "stem",
    name: "STEM Tutoring",
    description: "Give fast feedback, verify correctness rigorously, and plan personalised next practice.",
    agents: ["TutorFeedbackAgent", "CorrectnessAgent", "NextPracticeAgent", "ReportAgent"],
    workflowId: "stem",
  },
  {
    id: "voice",
    name: "Voice Gateway",
    description: "Summarise calls, plan follow-ups, and flag escalations into CRM notes.",
    agents: ["CallSummaryAgent", "FollowUpPlanAgent", "EscalationAgent", "ReportAgent"],
    workflowId: "voice",
  },
  {
    id: "developer",
    name: "Developer",
    description: "From product requirement to architecture plan, rigorous review, and documentation.",
    agents: ["DeveloperAgent", "CodeReviewAgent", "ReportAgent"],
    workflowId: "developer",
  },
  {
    id: "review",
    name: "Review & Judge",
    description: "Cross-cutting compliance review and LLM-as-judge evaluation used by every vertical.",
    agents: ["ComplianceReviewAgent", "JudgeAgent"],
  },
];

/** Example inputs used to prefill the dashboard "run agent" forms. */
export const AGENT_EXAMPLES: Record<string, unknown> = {
  ShiftNoteParseAgent: {
    residentId: "R-1042",
    shiftDate: "2026-06-17",
    rawNote: "resident unsteady this am, refused breakfast, took meds 8am paracetamol, hip pain. fam to call.",
  },
  CareNoteAgent: {
    residentId: "R-1042",
    shiftDate: "2026-06-17",
    cleanedText: "Resident was unsteady this morning, refused breakfast, took 8am paracetamol, reported hip pain.",
  },
  IncidentDraftAgent: {
    residentId: "R-1042",
    shiftDate: "2026-06-17",
    description: "Resident slipped near the bathroom around 9:15am, no visible injury, assisted up by two staff.",
  },
  TutorFeedbackAgent: { question: "What is the derivative of x^2?", studentAnswer: "x", gradeLevel: "Year 11" },
  CorrectnessAgent: { question: "What is the derivative of x^2?", studentAnswer: "x" },
  NextPracticeAgent: {
    question: "What is the derivative of x^2?",
    studentAnswer: "x",
    wasCorrect: false,
    misconceptions: ["forgot the power rule coefficient"],
  },
  CallSummaryAgent: {
    callId: "C-9001",
    transcript: "Customer: my invoice is wrong again and I'm furious. Agent: I'm sorry, let me check…",
  },
  FollowUpPlanAgent: { summary: "Customer billed incorrectly for the third time, very upset.", actionItems: ["correct invoice", "call back"] },
  EscalationAgent: {
    summary: "Customer billed incorrectly for the third time, very upset.",
    transcript: "Customer: this is the third time, I want to cancel.",
  },
  DeveloperAgent: {
    title: "Offline-first sync",
    requirement: "Add offline-first data sync to the mobile app with conflict resolution.",
    constraints: ["must work on flaky networks", "no data loss"],
  },
  CodeReviewAgent: {
    context: "Reviewing a sync conflict-resolution module.",
    diffOrCode: "function merge(a, b) { return { ...a, ...b }; }",
  },
  ReportAgent: { title: "Care report — R-1042 (2026-06-17)", source: "Resident stable, ate lunch, BP normal." },
  ComplianceReviewAgent: {
    framework: "Aged Care Quality Standards",
    content: "Care note: resident refused breakfast and reported hip pain; medication administered.",
  },
  JudgeAgent: {
    task: "Summarise a support call",
    candidateOutput: "Customer is unhappy about a billing error and wants it fixed.",
    rubric: "accuracy, completeness, safety, clarity",
  },
};

export interface WorkflowStep {
  agent: string;
  model: string;
  confidence: number;
  escalated: boolean;
  ruleId?: string;
  output: unknown;
}

export interface WorkflowRunResult {
  taskId: string;
  steps: WorkflowStep[];
}

type Runner = (orch: Orchestrator, input: any) => Promise<WorkflowRunResult>;

function step(name: string, r: any): WorkflowStep {
  // r is an AgentRunResult or a CascadeResult (which wraps `.final`).
  const run = r.final ?? r;
  return {
    agent: name,
    model: run.model,
    confidence: run.confidence,
    escalated: r.escalated ?? run.decision?.escalated ?? false,
    ruleId: run.decision?.ruleId,
    output: run.parsed,
  };
}

/** Workflow runners normalised to {taskId, steps} for the dashboard. */
export const WORKFLOWS: Record<
  string,
  { name: string; useCaseId: string; example: unknown; run: Runner }
> = {
  care: {
    name: "Care Workflow",
    useCaseId: "care",
    example: AGENT_EXAMPLES.ShiftNoteParseAgent,
    run: async (orch, input) => {
      const r = await runCareWorkflow(orch, input);
      return {
        taskId: r.taskId,
        steps: [
          step("ShiftNoteParseAgent", r.parsed),
          step("CareNoteAgent", r.careNote),
          step("ComplianceReviewAgent", r.compliance),
          step("ReportAgent", r.report),
        ],
      };
    },
  },
  incident: {
    name: "Incident Workflow",
    useCaseId: "care",
    example: AGENT_EXAMPLES.IncidentDraftAgent,
    run: async (orch, input) => {
      const r = await runIncidentWorkflow(orch, input);
      return { taskId: r.taskId, steps: [step("IncidentDraftAgent", r.draft), step("ComplianceReviewAgent", r.compliance)] };
    },
  },
  stem: {
    name: "STEM Workflow",
    useCaseId: "stem",
    example: AGENT_EXAMPLES.TutorFeedbackAgent,
    run: async (orch, input) => {
      const r = await runStemWorkflow(orch, input);
      return {
        taskId: r.taskId,
        steps: [
          step("TutorFeedbackAgent", r.feedback),
          step("CorrectnessAgent", r.correctness),
          step("NextPracticeAgent", r.nextPractice),
          step("ReportAgent", r.parentReport),
        ],
      };
    },
  },
  voice: {
    name: "Voice Workflow",
    useCaseId: "voice",
    example: AGENT_EXAMPLES.CallSummaryAgent,
    run: async (orch, input) => {
      const r = await runVoiceWorkflow(orch, input);
      return {
        taskId: r.taskId,
        steps: [
          step("CallSummaryAgent", r.summary),
          step("FollowUpPlanAgent", r.followUp),
          step("EscalationAgent", r.escalation),
          step("ReportAgent", r.crmNote),
        ],
      };
    },
  },
  developer: {
    name: "Developer Workflow",
    useCaseId: "developer",
    example: AGENT_EXAMPLES.DeveloperAgent,
    run: async (orch, input) => {
      const r = await runDeveloperWorkflow(orch, input);
      return {
        taskId: r.taskId,
        steps: [step("DeveloperAgent", r.plan), step("CodeReviewAgent", r.review), step("ReportAgent", r.docs)],
      };
    },
  },
};
