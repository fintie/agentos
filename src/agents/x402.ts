import { z } from "zod";
import type { Message } from "../types.js";
import type { AgentDefinition } from "./types.js";

const confidence = z.number().min(0).max(1);
export const ResourceDiscoverySchema = z.object({ resource_ids: z.array(z.string()), selected_resource_id: z.string(), capability_match: z.number().min(0).max(1), rationale: z.string(), confidence });
export const ExecutionPricingSchema = z.object({ quote_id: z.string(), pricing_unit: z.enum(["request", "token", "upto"]), estimated_amount: z.number(), authorized_maximum: z.number(), currency: z.string(), within_budget: z.boolean(), confidence });
export const PaymentVerificationSchema = z.object({ authorization_id: z.string(), quote_hash_valid: z.boolean(), budget_valid: z.boolean(), resource_allowed: z.boolean(), decision: z.enum(["authorize", "decline"]), reason: z.string(), confidence });
export const X402SettlementSchema = z.object({ settlement_id: z.string(), receipt_bound: z.boolean(), evaluation_bound: z.boolean(), actual_amount: z.number(), settlement_status: z.enum(["pending", "settled", "failed"]), contribution_reason: z.string(), confidence });

function messages(role: string, input: unknown): Message[] {
  return [
    { role: "system", content: `You are the AgentOS ${role}. Use only supplied resource, pricing, authorization, and receipt evidence. Never claim payment finality or wallet access without a verified settlement reference. Return structured JSON.` },
    { role: "user", content: JSON.stringify(input) },
  ];
}

export const ResourceDiscoveryAgent: AgentDefinition<unknown, z.infer<typeof ResourceDiscoverySchema>> = {
  name: "ResourceDiscoveryAgent", description: "Discover and rank machine-readable resources by capability, health, proof, and price.",
  taskType: "agent_planning", defaultRisk: "medium", promptVersion: "x402.discovery.v1", schema: ResourceDiscoverySchema,
  buildMessages: (input) => messages("Resource Discovery Agent", input),
};
export const ExecutionPricingAgent: AgentDefinition<unknown, z.infer<typeof ExecutionPricingSchema>> = {
  name: "ExecutionPricingAgent", description: "Create an execution quote and evaluate it against the requesting agent's budget policy.",
  taskType: "agent_planning", defaultRisk: "high", promptVersion: "x402.pricing.v1", schema: ExecutionPricingSchema,
  buildMessages: (input) => messages("Execution Pricing Agent", input),
};
export const PaymentVerificationAgent: AgentDefinition<unknown, z.infer<typeof PaymentVerificationSchema>> = {
  name: "PaymentVerificationAgent", description: "Verify quote integrity, budget authorization, and resource allowlists before execution.",
  taskType: "final_judge", defaultRisk: "high", promptVersion: "x402.verification.v1", schema: PaymentVerificationSchema,
  buildMessages: (input) => messages("Payment Verification Agent", input),
};
export const X402SettlementAgent: AgentDefinition<unknown, z.infer<typeof X402SettlementSchema>> = {
  name: "X402SettlementAgent", description: "Bind execution and evaluation receipts to a verifiable settlement result.",
  taskType: "compliance_review", defaultRisk: "high", promptVersion: "x402.settlement.v1", schema: X402SettlementSchema,
  buildMessages: (input) => messages("X402 Settlement Agent", input),
};
