import {
  ComplianceReviewSchema,
  JudgeSchema,
  type ComplianceReviewResult,
  type JudgeResult,
} from "../schemas/index.js";
import type { Message } from "../types.js";
import type { AgentDefinition } from "./types.js";

export interface ComplianceInput {
  framework: string;
  /** The artifact under review (e.g. a care note JSON, an incident draft). */
  content: string;
}

/** ComplianceReviewAgent: risk & compliance review — DeepSeek. */
export const ComplianceReviewAgent: AgentDefinition<ComplianceInput, ComplianceReviewResult> = {
  name: "ComplianceReviewAgent",
  description: "Review an artifact against a compliance framework and score risk.",
  taskType: "compliance_review",
  defaultRisk: "high",
  promptVersion: "compliance.v1",
  schema: ComplianceReviewSchema,
  buildMessages(input): Message[] {
    return [
      {
        role: "system",
        content:
          `You are a compliance officer reviewing against the "${input.framework}" framework. ` +
          "Identify violations with severity, score overall risk (0..1), and flag anything needing human review. Respond as JSON.",
      },
      { role: "user", content: `Framework: ${input.framework}\n\nArtifact under review:\n${input.content}` },
    ];
  },
};

export interface JudgeInput {
  task: string;
  candidateOutput: string;
  rubric?: string;
}

/** JudgeAgent: LLM-as-judge final validation — DeepSeek. */
export const JudgeAgent: AgentDefinition<JudgeInput, JudgeResult> = {
  name: "JudgeAgent",
  description: "Score a candidate output as an impartial judge against a rubric.",
  taskType: "final_judge",
  defaultRisk: "high",
  promptVersion: "judge.v1",
  schema: JudgeSchema,
  buildMessages(input): Message[] {
    return [
      {
        role: "system",
        content:
          "You are an impartial evaluator. Score the candidate output 0..1 across accuracy, completeness, safety, and clarity. " +
          "Return a verdict of pass/revise/fail with reasoning. Respond as JSON.",
      },
      {
        role: "user",
        content:
          `Task: ${input.task}\nRubric: ${input.rubric ?? "general quality, correctness, and safety"}\n\n` +
          `Candidate output:\n${input.candidateOutput}`,
      },
    ];
  },
};
