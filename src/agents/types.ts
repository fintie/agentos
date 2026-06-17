import type { z } from "zod";
import type { LatencyRequirement, Message, RiskLevel, TaskType } from "../types.js";

/**
 * A declarative agent: metadata + how to build a prompt + the output schema.
 * Execution (routing, structured output, retries, logging) is handled by the
 * Orchestrator, so agents stay small and testable.
 *
 * Every output schema must expose a numeric `confidence` field; the runner
 * reads it to drive cascade escalation.
 */
export interface AgentDefinition<TInput, TOutput extends { confidence: number }> {
  name: string;
  description: string;
  /** Routing task type for this agent's primary call. */
  taskType: TaskType;
  defaultRisk: RiskLevel;
  defaultLatency?: LatencyRequirement;
  /** Bumped whenever the prompt template changes — stored on every record. */
  promptVersion: string;
  // Input type is left open (`any`) because schemas use .default()/.optional(),
  // which makes Zod's input type diverge from the inferred output type.
  schema: z.ZodType<TOutput, z.ZodTypeDef, any>;
  /** Whether the agent's input includes images/audio. */
  multimodal?: boolean;
  /** Build the chat messages for a given input. */
  buildMessages(input: TInput): Message[];
}

export type AnyAgent = AgentDefinition<any, any>;
