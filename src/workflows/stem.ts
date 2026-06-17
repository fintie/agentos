import { randomUUID } from "node:crypto";
import { CorrectnessAgent, NextPracticeAgent, TutorFeedbackAgent, type StudentAnswerInput } from "../agents/stem.js";
import { ReportAgent } from "../agents/developer.js";
import type { Orchestrator } from "../orchestration/runner.js";

/**
 * STEM Workflow:
 *   student answer → Gemini fast feedback → DeepSeek correctness check →
 *   Kimi personalised next practice → parent report.
 */
export async function runStemWorkflow(orchestrator: Orchestrator, input: StudentAnswerInput) {
  const taskId = `stem-${randomUUID()}`;

  // 1. Gemini: fast formative feedback.
  const feedback = await orchestrator.runAgent(TutorFeedbackAgent, input, {
    taskId,
    rawInputReference: `student-answer:${taskId}`,
  });

  // 2. DeepSeek: authoritative correctness check (overrides fast feedback).
  const correctness = await orchestrator.runAgent(CorrectnessAgent, input, {
    taskId,
    reviewModel: feedback.model,
  });

  // 3. Kimi: personalised next practice, targeting any misconceptions.
  const nextPractice = await orchestrator.runAgent(
    NextPracticeAgent,
    {
      question: input.question,
      studentAnswer: input.studentAnswer,
      wasCorrect: correctness.parsed.verifiedCorrect,
      misconceptions: feedback.parsed.misconceptions,
    },
    { taskId },
  );

  // 4. Gemini: parent-facing report.
  const parentReport = await orchestrator.runAgent(
    ReportAgent,
    {
      title: "Practice session summary",
      source: JSON.stringify(
        {
          correct: correctness.parsed.verifiedCorrect,
          feedback: feedback.parsed.feedback,
          nextPractice: nextPractice.parsed.problems,
        },
        null,
        2,
      ),
    },
    { taskId },
  );

  return { taskId, feedback, correctness, nextPractice, parentReport };
}
