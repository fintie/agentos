import { hashValue } from "../shard/proofReceipt.js";
import type { X402BudgetAuthorization, X402BudgetPolicy, X402ExecutionBinding, X402ExecutionQuote, X402PaymentRequirement, X402ResourceEndpoint, X402ResourceManifest, X402SettlementReceipt } from "./types.js";

export class MockX402Facilitator {
  readonly facilitatorId = "agentos-mock-facilitator";

  createQuote(resource: X402ResourceManifest, endpointId: string, estimatedUnits = 1): X402ExecutionQuote {
    const endpoint = resource.endpoints.find((item) => item.endpointId === endpointId);
    if (!endpoint) throw new Error(`Unknown endpoint "${endpointId}" for ${resource.resourceId}.`);
    const estimatedAmount = estimateAmount(endpoint, estimatedUnits);
    const base = {
      resourceId: resource.resourceId, endpointId, pricingUnit: endpoint.pricing.unit,
      unitPrice: endpoint.pricing.unitAmount,
      authorizedMaximum: endpoint.pricing.maximumAmount ?? estimatedAmount,
      estimatedAmount, currency: endpoint.pricing.currency,
      expiresAt: "2026-06-20T04:15:00.000Z",
    };
    const quoteHash = hashValue(base);
    return { quoteId: `quote_${quoteHash.slice(0, 18)}`, ...base, quoteHash };
  }

  paymentRequired(quote: X402ExecutionQuote): X402PaymentRequirement {
    return { status: 402, quote, acceptedMethods: ["mock-balance", "x402-compatible-adapter"], facilitatorId: this.facilitatorId };
  }

  authorize(quote: X402ExecutionQuote, subjectId: string, policy: X402BudgetPolicy): X402BudgetAuthorization {
    const allowed = policy.allowedCurrencies.includes(quote.currency) &&
      quote.authorizedMaximum <= policy.maximumPerRequest &&
      (!policy.allowedResourceIds || policy.allowedResourceIds.includes(quote.resourceId));
    const base = { quoteId: quote.quoteId, subjectId, budgetPolicyId: policy.policyId, authorizedMaximum: allowed ? quote.authorizedMaximum : 0, status: allowed ? "authorized" as const : "declined" as const };
    const authorizationHash = hashValue(base);
    return { authorizationId: `auth_${authorizationHash.slice(0, 18)}`, ...base, authorizationHash };
  }

  verify(quote: X402ExecutionQuote, authorization: X402BudgetAuthorization): boolean {
    return authorization.status === "authorized" && authorization.quoteId === quote.quoteId && authorization.authorizedMaximum >= quote.estimatedAmount;
  }

  settle(input: { quote: X402ExecutionQuote; authorization: X402BudgetAuthorization; actualUnits: number; binding: X402ExecutionBinding }): X402SettlementReceipt {
    const { quote, authorization, binding } = input;
    const verified = this.verify(quote, authorization) && Object.values(binding).every(Boolean);
    const actualAmount = Math.min(authorization.authorizedMaximum, Number((quote.unitPrice * Math.max(1, input.actualUnits)).toFixed(8)));
    const base = { quoteId: quote.quoteId, authorizationId: authorization.authorizationId, resourceId: quote.resourceId, actualAmount: verified ? actualAmount : 0, currency: quote.currency, binding };
    const settlementReference = hashValue(base);
    return {
      settlementId: `settle_${settlementReference.slice(0, 18)}`, ...base,
      settlementStatus: verified ? "settled" : "failed", settlementReference,
      deterministicMode: true, timestamp: "2026-06-20T04:05:00.000Z",
    };
  }
}

function estimateAmount(endpoint: X402ResourceEndpoint, units: number): number {
  const calculated = endpoint.pricing.unitAmount * Math.max(1, units);
  return Number(Math.min(endpoint.pricing.maximumAmount ?? calculated, calculated).toFixed(8));
}
