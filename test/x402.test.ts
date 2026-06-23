import { describe, expect, it } from "vitest";
import { hashValue } from "../src/shard/proofReceipt.js";
import { buildX402SystemDemo, DEMO_X402_POLICY, DEMO_X402_RESOURCES } from "../src/x402/demoData.js";
import { MockX402Facilitator } from "../src/x402/mockFacilitator.js";
import { X402ResourceRegistry } from "../src/x402/resourceRegistry.js";

describe("X402 Agent System", () => {
  it("discovers healthy resources by capability", () => {
    const registry = new X402ResourceRegistry(DEMO_X402_RESOURCES);
    expect(registry.discover({ capability: "proof-receipt", healthyOnly: true }).map((item) => item.resourceId)).toEqual(["agentos-shard-inference"]);
  });

  it("creates deterministic usage quotes", () => {
    const resource = new X402ResourceRegistry(DEMO_X402_RESOURCES).get("agentos-shard-inference");
    const facilitator = new MockX402Facilitator();
    expect(facilitator.createQuote(resource, resource.endpoints[0]!.endpointId, 120)).toEqual(facilitator.createQuote(resource, resource.endpoints[0]!.endpointId, 120));
  });

  it("declines a quote above budget policy", () => {
    const resource = new X402ResourceRegistry(DEMO_X402_RESOURCES).get("agentos-shard-inference");
    const facilitator = new MockX402Facilitator();
    const quote = facilitator.createQuote(resource, resource.endpoints[0]!.endpointId, 120);
    const authorization = facilitator.authorize(quote, "agent-test", { ...DEMO_X402_POLICY, maximumPerRequest: 0.001 });
    expect(authorization.status).toBe("declined");
    expect(facilitator.verify(quote, authorization)).toBe(false);
  });

  it("settles only when execution and evaluation proofs are bound", () => {
    const demo = buildX402SystemDemo();
    expect(demo.lifecycle.settlement.settlementStatus).toBe("settled");
    expect(demo.lifecycle.settlement.binding.executionReceiptHash).toBe(hashValue("shard-receipt-demo"));
    const facilitator = new MockX402Facilitator();
    const failed = facilitator.settle({ quote: demo.lifecycle.quote, authorization: demo.lifecycle.authorization, actualUnits: 1, binding: { ...demo.lifecycle.binding, evaluationHash: "" } });
    expect(failed.settlementStatus).toBe("failed");
    expect(failed.actualAmount).toBe(0);
  });

  it("builds four complete twelve-month metric series", () => {
    const stats = buildX402SystemDemo().stats;
    expect([stats.transactions, stats.volume, stats.buyers, stats.sellers].every((series) => series.length === 12)).toBe(true);
    expect(stats.transactions.at(-1)?.value).toBe(5_240_000);
    expect(stats.volume.at(-1)?.value).toBe(1_110_000);
    expect(stats.buyers.at(-1)?.value).toBe(126_090);
    expect(stats.sellers.at(-1)?.value).toBe(42_000);
  });
});
