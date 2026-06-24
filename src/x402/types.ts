export type X402PricingUnit = "request" | "token" | "upto";
export type X402AuthorizationStatus = "authorized" | "declined" | "expired";
export type X402SettlementStatus = "pending" | "settled" | "failed";

export interface X402ResourceEndpoint {
  endpointId: string;
  method: "GET" | "POST";
  path: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  pricing: { unit: X402PricingUnit; unitAmount: number; maximumAmount?: number; currency: string };
}

export interface X402ResourceManifest {
  resourceId: string;
  name: string;
  description: string;
  category: "compute" | "data" | "inference" | "tool";
  baseUrl: string;
  discoveryPath: "/.well-known/x402";
  providerName: string;
  capabilities: string[];
  endpoints: X402ResourceEndpoint[];
  healthStatus: "healthy" | "degraded" | "offline";
  reliabilityScore: number;
  proofRequirements: Array<"output-hash" | "token-hash" | "evaluation-hash" | "shard-receipt">;
  sourceUrl?: string;
}

export interface X402ExecutionQuote {
  quoteId: string;
  resourceId: string;
  endpointId: string;
  pricingUnit: X402PricingUnit;
  unitPrice: number;
  authorizedMaximum: number;
  estimatedAmount: number;
  currency: string;
  expiresAt: string;
  quoteHash: string;
}

export interface X402BudgetAuthorization {
  authorizationId: string;
  quoteId: string;
  subjectId: string;
  budgetPolicyId: string;
  authorizedMaximum: number;
  status: X402AuthorizationStatus;
  authorizationHash: string;
}

export interface X402PaymentRequirement {
  status: 402;
  quote: X402ExecutionQuote;
  acceptedMethods: string[];
  facilitatorId: string;
}

export interface X402ExecutionBinding {
  executionReceiptHash: string;
  evaluationHash: string;
  outputHash: string;
  tokenHash: string;
}

export interface X402SettlementReceipt {
  settlementId: string;
  quoteId: string;
  authorizationId: string;
  resourceId: string;
  actualAmount: number;
  currency: string;
  binding: X402ExecutionBinding;
  settlementStatus: X402SettlementStatus;
  settlementReference: string;
  deterministicMode: true;
  timestamp: string;
}

export interface X402BudgetPolicy {
  policyId: string;
  maximumPerRequest: number;
  maximumDaily: number;
  allowedCurrencies: string[];
  allowedResourceIds?: string[];
}
