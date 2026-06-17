import {
  CareNoteSchema,
  IncidentDraftSchema,
  ParsedShiftNoteSchema,
  type CareNote,
  type IncidentDraft,
  type ParsedShiftNote,
} from "../schemas/index.js";
import type { Message } from "../types.js";
import type { AgentDefinition } from "./types.js";

export interface ShiftNoteInput {
  residentId: string;
  shiftDate: string;
  rawNote: string;
  /** Optional handwritten-note image (base64) for multimodal parsing. */
  imageBase64?: string;
  imageMime?: string;
}

/**
 * Step 1 of the care workflow: Gemini cleans + structures a messy raw shift
 * note (optionally from a photo). Fast, low-cost, multimodal.
 */
export const ShiftNoteParseAgent: AgentDefinition<ShiftNoteInput, ParsedShiftNote> = {
  name: "ShiftNoteParseAgent",
  description: "Parse and normalise a raw/handwritten shift note into clean text + entities.",
  taskType: "multimodal_parse",
  defaultRisk: "low",
  defaultLatency: "interactive",
  promptVersion: "care.parse.v1",
  schema: ParsedShiftNoteSchema,
  buildMessages(input): Message[] {
    const userContent: Message["content"] = input.imageBase64
      ? [
          { type: "text", text: `Parse this shift note for resident ${input.residentId} (${input.shiftDate}).` },
          { type: "image", mimeType: input.imageMime ?? "image/jpeg", dataBase64: input.imageBase64 },
        ]
      : `Parse and clean this raw shift note for resident ${input.residentId} (${input.shiftDate}):\n\n${input.rawNote}`;
    return [
      {
        role: "system",
        content:
          "You normalise aged-care shift notes. Fix obvious typos, expand shorthand, and extract entities. Do not invent facts. Respond as JSON.",
      },
      { role: "user", content: userContent },
    ];
  },
  get multimodal() {
    return true;
  },
};

/**
 * Step 2: Kimi turns the cleaned note into a structured, audit-ready care note.
 * Long-context reasoning, higher risk (clinical record).
 */
export const CareNoteAgent: AgentDefinition<{ residentId: string; shiftDate: string; cleanedText: string }, CareNote> = {
  name: "CareNoteAgent",
  description: "Produce a structured, compliant care note from cleaned shift text.",
  taskType: "long_context_reasoning",
  defaultRisk: "high",
  promptVersion: "care.note.v1",
  schema: CareNoteSchema,
  buildMessages(input): Message[] {
    return [
      {
        role: "system",
        content:
          "You are an aged-care documentation assistant. Produce a precise, factual care note. " +
          "Flag anything clinically significant under concerns/followUps. Never fabricate medications or observations.",
      },
      {
        role: "user",
        content: `Resident: ${input.residentId}\nShift: ${input.shiftDate}\nCleaned note:\n${input.cleanedText}\n\nReturn a structured care note as JSON.`,
      },
    ];
  },
};

export interface IncidentInput {
  residentId: string;
  shiftDate: string;
  description: string;
}

/** IncidentDraftAgent: drafts an incident report from a description. */
export const IncidentDraftAgent: AgentDefinition<IncidentInput, IncidentDraft> = {
  name: "IncidentDraftAgent",
  description: "Draft a structured incident report for review.",
  taskType: "long_context_reasoning",
  defaultRisk: "high",
  promptVersion: "care.incident.v1",
  schema: IncidentDraftSchema,
  buildMessages(input): Message[] {
    return [
      {
        role: "system",
        content:
          "You draft aged-care incident reports. Be factual and neutral, classify severity conservatively, " +
          "and recommend family notification when severity is medium or above. Respond as JSON.",
      },
      {
        role: "user",
        content: `Resident: ${input.residentId}\nDate: ${input.shiftDate}\nIncident description:\n${input.description}`,
      },
    ];
  },
};
