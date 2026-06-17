import {
  ArchitecturePlanSchema,
  CodeReviewSchema,
  DocSummarySchema,
  type ArchitecturePlan,
  type CodeReview,
  type DocSummary,
} from "../schemas/index.js";
import type { Message } from "../types.js";
import type { AgentDefinition } from "./types.js";

export interface RequirementInput {
  title: string;
  requirement: string;
  constraints?: string[];
}

/** DeveloperAgent: architecture planning from a product requirement — Kimi. */
export const DeveloperAgent: AgentDefinition<RequirementInput, ArchitecturePlan> = {
  name: "DeveloperAgent",
  description: "Produce an architecture/implementation plan from a product requirement.",
  taskType: "agent_planning",
  defaultRisk: "medium",
  promptVersion: "dev.architecture.v1",
  schema: ArchitecturePlanSchema,
  buildMessages(input): Message[] {
    return [
      {
        role: "system",
        content:
          "You are a senior software architect. Propose a pragmatic plan: components, responsibilities, risks, milestones. Respond as JSON.",
      },
      {
        role: "user",
        content:
          `Title: ${input.title}\nRequirement: ${input.requirement}\n` +
          `Constraints: ${(input.constraints ?? []).join("; ") || "none"}`,
      },
    ];
  },
};

export interface CodeReviewInput {
  context: string;
  diffOrCode: string;
}

/** CodeReviewAgent: rigorous review — DeepSeek. */
export const CodeReviewAgent: AgentDefinition<CodeReviewInput, CodeReview> = {
  name: "CodeReviewAgent",
  description: "Review code/diffs for correctness, security, and design issues.",
  taskType: "code_review",
  defaultRisk: "high",
  promptVersion: "dev.review.v1",
  schema: CodeReviewSchema,
  buildMessages(input): Message[] {
    return [
      {
        role: "system",
        content:
          "You are a rigorous code reviewer. Identify correctness, security, and maintainability issues with severity. " +
          "Only approve when there are no blocker/major issues. Respond as JSON.",
      },
      { role: "user", content: `Context: ${input.context}\n\nCode/diff:\n${input.diffOrCode}` },
    ];
  },
};

export interface ReportInput {
  title: string;
  source: string;
}

/**
 * ReportAgent: produce a clean, human-readable summary/report for export
 * (documentation summaries, parent reports, CRM notes) — Gemini.
 */
export const ReportAgent: AgentDefinition<ReportInput, DocSummary> = {
  name: "ReportAgent",
  description: "Generate a readable summary/report for export from structured source material.",
  taskType: "fast_summary",
  defaultRisk: "low",
  defaultLatency: "interactive",
  promptVersion: "report.v1",
  schema: DocSummarySchema,
  buildMessages(input): Message[] {
    return [
      {
        role: "system",
        content: "You write clear, well-structured summaries for a non-technical audience. Respond as JSON.",
      },
      { role: "user", content: `Title: ${input.title}\nSource material:\n${input.source}` },
    ];
  },
};
