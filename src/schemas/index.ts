import { z } from "zod";

/**
 * Zod schemas for every structured AI output in the system. Each agent declares
 * one of these; the structured-output runner validates against it and retries
 * on failure. A `confidence` field (0..1) is included wherever the cascade
 * needs a self-reported confidence signal.
 */

export const ConfidenceField = z.number().min(0).max(1);

// ── Care vertical ────────────────────────────────────────────────────
export const ParsedShiftNoteSchema = z.object({
  cleanedText: z.string().min(1),
  entities: z
    .object({
      residents: z.array(z.string()).default([]),
      times: z.array(z.string()).default([]),
      medications: z.array(z.string()).default([]),
    })
    .default({ residents: [], times: [], medications: [] }),
  confidence: ConfidenceField,
});
export type ParsedShiftNote = z.infer<typeof ParsedShiftNoteSchema>;

export const CareNoteSchema = z.object({
  residentId: z.string(),
  shiftDate: z.string(),
  summary: z.string().min(1),
  observations: z.array(z.string()).default([]),
  medications: z
    .array(z.object({ name: z.string(), administered: z.boolean(), notes: z.string().optional() }))
    .default([]),
  concerns: z.array(z.string()).default([]),
  followUps: z.array(z.string()).default([]),
  confidence: ConfidenceField,
});
export type CareNote = z.infer<typeof CareNoteSchema>;

export const IncidentDraftSchema = z.object({
  incidentType: z.enum(["fall", "medication", "behaviour", "injury", "other"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  narrative: z.string().min(1),
  immediateActions: z.array(z.string()).default([]),
  peopleInvolved: z.array(z.string()).default([]),
  notifyFamily: z.boolean(),
  confidence: ConfidenceField,
});
export type IncidentDraft = z.infer<typeof IncidentDraftSchema>;

export const ComplianceReviewSchema = z.object({
  compliant: z.boolean(),
  framework: z.string(),
  riskScore: z.number().min(0).max(1),
  violations: z
    .array(z.object({ rule: z.string(), severity: z.enum(["low", "medium", "high"]), detail: z.string() }))
    .default([]),
  recommendations: z.array(z.string()).default([]),
  requiresHumanReview: z.boolean(),
  confidence: ConfidenceField,
});
export type ComplianceReviewResult = z.infer<typeof ComplianceReviewSchema>;

// ── STEM vertical ────────────────────────────────────────────────────
export const TutorFeedbackSchema = z.object({
  isCorrect: z.boolean(),
  score: z.number().min(0).max(1),
  feedback: z.string().min(1),
  misconceptions: z.array(z.string()).default([]),
  encouragement: z.string(),
  confidence: ConfidenceField,
});
export type TutorFeedback = z.infer<typeof TutorFeedbackSchema>;

export const CorrectnessCheckSchema = z.object({
  verifiedCorrect: z.boolean(),
  expectedAnswer: z.string(),
  errorAnalysis: z.string().optional(),
  confidence: ConfidenceField,
});
export type CorrectnessCheck = z.infer<typeof CorrectnessCheckSchema>;

export const NextPracticeSchema = z.object({
  rationale: z.string(),
  problems: z
    .array(z.object({ prompt: z.string(), difficulty: z.enum(["easier", "same", "harder"]), skill: z.string() }))
    .min(1),
  confidence: ConfidenceField,
});
export type NextPractice = z.infer<typeof NextPracticeSchema>;

// ── Voice vertical ───────────────────────────────────────────────────
export const CallSummarySchema = z.object({
  topic: z.string(),
  summary: z.string().min(1),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  actionItems: z.array(z.string()).default([]),
  confidence: ConfidenceField,
});
export type CallSummary = z.infer<typeof CallSummarySchema>;

export const FollowUpPlanSchema = z.object({
  steps: z.array(z.object({ action: z.string(), owner: z.string(), dueInDays: z.number() })).min(1),
  priority: z.enum(["low", "medium", "high"]),
  confidence: ConfidenceField,
});
export type FollowUpPlan = z.infer<typeof FollowUpPlanSchema>;

export const EscalationCheckSchema = z.object({
  escalate: z.boolean(),
  reason: z.string(),
  urgency: z.enum(["none", "soon", "immediate"]),
  confidence: ConfidenceField,
});
export type EscalationCheck = z.infer<typeof EscalationCheckSchema>;

// ── Developer vertical ───────────────────────────────────────────────
export const ArchitecturePlanSchema = z.object({
  overview: z.string().min(1),
  components: z.array(z.object({ name: z.string(), responsibility: z.string() })).min(1),
  risks: z.array(z.string()).default([]),
  milestones: z.array(z.string()).default([]),
  confidence: ConfidenceField,
});
export type ArchitecturePlan = z.infer<typeof ArchitecturePlanSchema>;

export const CodeReviewSchema = z.object({
  approved: z.boolean(),
  summary: z.string(),
  issues: z
    .array(z.object({ severity: z.enum(["nit", "minor", "major", "blocker"]), file: z.string().optional(), detail: z.string() }))
    .default([]),
  confidence: ConfidenceField,
});
export type CodeReview = z.infer<typeof CodeReviewSchema>;

export const DocSummarySchema = z.object({
  title: z.string(),
  summary: z.string().min(1),
  highlights: z.array(z.string()).default([]),
  confidence: ConfidenceField,
});
export type DocSummary = z.infer<typeof DocSummarySchema>;

// ── Generic LLM-as-judge ─────────────────────────────────────────────
export const JudgeSchema = z.object({
  score: z.number().min(0).max(1),
  verdict: z.enum(["pass", "revise", "fail"]),
  reasoning: z.string().min(1),
  dimensions: z
    .object({
      accuracy: z.number().min(0).max(1),
      completeness: z.number().min(0).max(1),
      safety: z.number().min(0).max(1),
      clarity: z.number().min(0).max(1),
    })
    .partial()
    .optional(),
  confidence: ConfidenceField,
});
export type JudgeResult = z.infer<typeof JudgeSchema>;
