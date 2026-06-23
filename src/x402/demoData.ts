import { hashValue } from "../shard/proofReceipt.js";
import { MockX402Facilitator } from "./mockFacilitator.js";
import { X402ResourceRegistry } from "./resourceRegistry.js";
import type { X402BudgetPolicy, X402ResourceManifest } from "./types.js";

export const DEMO_X402_RESOURCES: X402ResourceManifest[] = [
  resource("agentos-shard-inference", "Shard Inference Network", "inference", ["distributed-inference", "proof-receipt"], "POST", "/v1/infer", "token", 0.00012, 0.05, 0.992),
  resource("agentos-market-intelligence", "Market Intelligence Feed", "data", ["market-data", "news-catalyst"], "GET", "/v1/market/snapshot", "request", 0.0025, undefined, 0.978),
  resource("agentos-research-tool", "Evidence Research Tool", "tool", ["web-research", "source-verification"], "POST", "/v1/research", "upto", 0.004, 0.04, 0.966),
  resource("agentos-local-compute", "Local Model Compute", "compute", ["structured-output", "private-inference"], "POST", "/v1/generate", "token", 0.00004, 0.02, 0.984),
];

export const DEMO_X402_POLICY: X402BudgetPolicy = {
  policyId: "policy-agentos-demo", maximumPerRequest: 0.05, maximumDaily: 2,
  allowedCurrencies: ["USD-DEMO"], allowedResourceIds: DEMO_X402_RESOURCES.map((item) => item.resourceId),
};

export function buildX402SystemDemo() {
  const registry = new X402ResourceRegistry(DEMO_X402_RESOURCES);
  const facilitator = new MockX402Facilitator();
  const selected = registry.get("agentos-shard-inference");
  const quote = facilitator.createQuote(selected, "agentos-shard-inference-endpoint", 120);
  const paymentRequirement = facilitator.paymentRequired(quote);
  const authorization = facilitator.authorize(quote, "agent-software-engineering", DEMO_X402_POLICY);
  const binding = {
    executionReceiptHash: hashValue("shard-receipt-demo"), evaluationHash: hashValue({ score: 0.91 }),
    outputHash: hashValue("verified inference output"), tokenHash: hashValue(["verified", "tokens"]),
  };
  const settlement = facilitator.settle({ quote, authorization, actualUnits: 96, binding });
  return {
    generatedAt: "2026-06-20T04:10:00.000Z", deterministicMode: true,
    protocolMode: "mock-no-chain", resources: registry.list(),
    lifecycle: { resource: selected, quote, paymentRequirement, authorization, binding, settlement },
    stats: buildStats(),
  };
}

function resource(id: string, name: string, category: X402ResourceManifest["category"], capabilities: string[], method: "GET" | "POST", path: string, unit: "request" | "token" | "upto", amount: number, maximumAmount: number | undefined, reliabilityScore: number): X402ResourceManifest {
  return {
    resourceId: id, name, description: `${name} exposed as a deterministic pay-per-use AgentOS resource.`, category,
    baseUrl: `mock://x402/${id}`, discoveryPath: "/.well-known/x402", providerName: "AgentOS Demo Provider",
    capabilities, healthStatus: "healthy", reliabilityScore,
    proofRequirements: ["output-hash", "token-hash", "evaluation-hash", ...(id.includes("shard") ? ["shard-receipt" as const] : [])],
    endpoints: [{ endpointId: `${id}-endpoint`, method, path, description: `Call ${name}`, inputSchema: { type: "object" }, outputSchema: { type: "object" }, pricing: { unit, unitAmount: amount, ...(maximumAmount === undefined ? {} : { maximumAmount }), currency: "USD-DEMO" } }],
  };
}

function buildStats() {
  const months = ["Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun"];
  const transactions = [0.18,0.24,0.31,0.42,0.61,0.83,1.16,1.72,2.38,3.14,4.21,5.24].map((value,index)=>({ period:months[index]!, value:Number((value*1_000_000).toFixed(0)) }));
  const volume = [0.03,0.05,0.08,0.13,0.19,0.27,0.38,0.52,0.68,0.82,0.97,1.11].map((value,index)=>({ period:months[index]!, value:Number((value*1_000_000).toFixed(0)) }));
  const buyers = [4.1,5.8,8.2,11.9,17.4,24.8,35.6,49.2,66.8,84.3,104.7,126.09].map((value,index)=>({ period:months[index]!, value:Number((value*1_000).toFixed(0)) }));
  const sellers = [1.8,2.4,3.2,4.5,6.1,8.3,11.4,15.2,20.1,26.5,34.1,42].map((value,index)=>({ period:months[index]!, value:Number((value*1_000).toFixed(0)) }));
  return { sourceLabel: "Deterministic ecosystem benchmark demo", period: "12 months", transactions, volume, buyers, sellers };
}
