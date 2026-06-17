import {
  CorrectnessCheckSchema,
  NextPracticeSchema,
  TutorFeedbackSchema,
  type CorrectnessCheck,
  type NextPractice,
  type TutorFeedback,
} from "../schemas/index.js";
import type { Message } from "../types.js";
import type { AgentDefinition } from "./types.js";

export interface StudentAnswerInput {
  question: string;
  studentAnswer: string;
  gradeLevel?: string;
}

/** Fast formative feedback on a student's answer — Gemini. */
export const TutorFeedbackAgent: AgentDefinition<StudentAnswerInput, TutorFeedback> = {
  name: "TutorFeedbackAgent",
  description: "Give fast, encouraging formative feedback on a student answer.",
  taskType: "fast_summary",
  defaultRisk: "low",
  defaultLatency: "interactive",
  promptVersion: "stem.feedback.v1",
  schema: TutorFeedbackSchema,
  buildMessages(input): Message[] {
    return [
      {
        role: "system",
        content:
          "You are a supportive STEM tutor. Give quick, specific, age-appropriate feedback. Be encouraging and concrete. Respond as JSON.",
      },
      {
        role: "user",
        content: `Grade: ${input.gradeLevel ?? "unspecified"}\nQuestion: ${input.question}\nStudent answer: ${input.studentAnswer}`,
      },
    ];
  },
};

/** Rigorous correctness verification — DeepSeek (deep reasoning). */
export const CorrectnessAgent: AgentDefinition<StudentAnswerInput, CorrectnessCheck> = {
  name: "CorrectnessAgent",
  description: "Independently verify whether a student's answer is correct.",
  taskType: "final_judge",
  defaultRisk: "medium",
  promptVersion: "stem.correctness.v1",
  schema: CorrectnessCheckSchema,
  buildMessages(input): Message[] {
    return [
      {
        role: "system",
        content:
          "You are a meticulous grader. Independently solve the problem, then compare with the student's answer. " +
          "State the expected answer and analyse any error. Respond as JSON.",
      },
      {
        role: "user",
        content: `Question: ${input.question}\nStudent answer: ${input.studentAnswer}`,
      },
    ];
  },
};

export interface NextPracticeInput {
  question: string;
  studentAnswer: string;
  wasCorrect: boolean;
  misconceptions: string[];
}

/** Personalised next-practice generation — Kimi (planning). */
export const NextPracticeAgent: AgentDefinition<NextPracticeInput, NextPractice> = {
  name: "NextPracticeAgent",
  description: "Plan a personalised next set of practice problems.",
  taskType: "agent_planning",
  defaultRisk: "low",
  promptVersion: "stem.nextpractice.v1",
  schema: NextPracticeSchema,
  buildMessages(input): Message[] {
    return [
      {
        role: "system",
        content:
          "You design adaptive practice. Target the student's misconceptions and calibrate difficulty to their last result. Respond as JSON.",
      },
      {
        role: "user",
        content:
          `Last question: ${input.question}\nAnswer: ${input.studentAnswer}\nCorrect: ${input.wasCorrect}\n` +
          `Misconceptions: ${input.misconceptions.join(", ") || "none"}`,
      },
    ];
  },
};
