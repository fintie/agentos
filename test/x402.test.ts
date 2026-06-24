import { describe, expect, it } from "vitest";
import { getX402SystemData, parseX402ScanPage, X402_PUBLIC_RESOURCES } from "../src/x402/ecosystemData.js";
import { MockX402Facilitator } from "../src/x402/mockFacilitator.js";
import { X402ResourceRegistry } from "../src/x402/resourceRegistry.js";

describe("X402 Agent System", () => {
  it("discovers healthy resources by capability", () => {
    const registry = new X402ResourceRegistry(X402_PUBLIC_RESOURCES);
    expect(registry.discover({ capability: "resource-search", healthyOnly: true }).map((item) => item.resourceId)).toEqual(["x402scan-resource-index"]);
  });

  it("creates deterministic usage quotes", () => {
    const resource = new X402ResourceRegistry(X402_PUBLIC_RESOURCES).get("x402scan-resource-index");
    const facilitator = new MockX402Facilitator();
    expect(facilitator.createQuote(resource, resource.endpoints[0]!.endpointId, 120)).toEqual(facilitator.createQuote(resource, resource.endpoints[0]!.endpointId, 120));
  });

  it("declines a quote above budget policy", () => {
    const resource = new X402ResourceRegistry(X402_PUBLIC_RESOURCES).get("x402scan-resource-index");
    const facilitator = new MockX402Facilitator();
    const quote = facilitator.createQuote(resource, resource.endpoints[0]!.endpointId, 120);
    const authorization = facilitator.authorize(quote, "agent-test", { policyId: "test", maximumPerRequest: 0.001, maximumDaily: 1, allowedCurrencies: ["USDC"] });
    expect(authorization.status).toBe("declined");
    expect(facilitator.verify(quote, authorization)).toBe(false);
  });

  it("settles only when execution and evaluation proofs are bound", () => {
    const resource = new X402ResourceRegistry(X402_PUBLIC_RESOURCES).get("x402scan-resource-index");
    const facilitator = new MockX402Facilitator();
    const quote = facilitator.createQuote(resource, resource.endpoints[0]!.endpointId);
    const authorization = facilitator.authorize(quote, "agent-test", { policyId: "test", maximumPerRequest: 1, maximumDaily: 10, allowedCurrencies: ["USDC"] });
    const failed = facilitator.settle({ quote, authorization, actualUnits: 1, binding: { executionReceiptHash: "receipt", evaluationHash: "", outputHash: "output", tokenHash: "tokens" } });
    expect(failed.settlementStatus).toBe("failed");
    expect(failed.actualAmount).toBe(0);
  });

  it("falls back to the latest public network snapshot", async () => {
    const data = await getX402SystemData({ forceRefresh: true, fetchImpl: async () => { throw new Error("offline"); } });
    expect(data.dataMode).toBe("snapshot");
    expect(data.stats.totals).toEqual({ transactions: 9_442_968, volume: 1_109_608.06, buyers: 117_724, sellers: 38_387 });
    expect(data.resources.every((resource) => resource.baseUrl.startsWith("https://"))).toBe(true);
  });

  it("parses public x402scan RSC activity", () => {
    const overview = { total_transactions: 10, total_amount: 2_500_000, unique_buyers: 3, unique_sellers: 2, latest_block_timestamp: "2026-06-23T00:00:00.000Z" };
    const activity = [{ bucket_start: "2026-06-22T00:00:00.000Z", total_transactions: 4, total_amount: 500_000, unique_buyers: 2, unique_sellers: 1 }];
    const encode = (id: string, value: unknown) => `<script>self.__next_f.push(${JSON.stringify([1, `${id}:${JSON.stringify({ json: value })}`])})</script>`;
    const stats = parseX402ScanPage(encode("52", overview) + encode("53", activity));
    expect(stats.totals.volume).toBe(2.5);
    expect(stats.transactions[0]?.value).toBe(4);
  });
});
