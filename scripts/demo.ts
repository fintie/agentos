/**
 * Interactive-ish demo: runs one care workflow and prints the full routing +
 * evaluation trace to the console. Great for understanding the data flow.
 *
 *   npm run demo
 */
import { loadConfig } from "../src/config.js";
import { Orchestrator } from "../src/orchestration/runner.js";
import { runCareWorkflow } from "../src/workflows/care.js";

async function main() {
  const config = { ...loadConfig(), forceMock: true };
  const orchestrator = new Orchestrator({ config });

  const result = await runCareWorkflow(orchestrator, {
    residentId: "R-2001",
    shiftDate: "2026-06-17",
    rawNote: "slept poorly, anxious at 2am, settled w/ reassurance. ate full lunch. BP 130/85.",
  });

  console.log("=== Care Workflow trace ===\n");
  console.log(`Task: ${result.taskId}\n`);

  console.log("1. ShiftNoteParseAgent →", result.parsed.model);
  console.log("   ", result.parsed.parsed.cleanedText, "\n");

  console.log("2. CareNoteAgent (cascade) →", result.careNote.final.model);
  console.log("    escalated:", result.careNote.escalated);
  console.log("    rungs:", result.careNote.steps.map((s) => `${s.model}${s.accepted ? "✓" : "✗"}`).join(" → "), "\n");

  console.log("3. ComplianceReviewAgent →", result.compliance.model);
  console.log("    compliant:", result.compliance.parsed.compliant, "| risk:", result.compliance.parsed.riskScore, "\n");

  console.log("4. Human review required:", result.requiresHuman);
  console.log("5. ReportAgent →", result.report.model, "\n");

  const records = await orchestrator.store.list({ taskId: result.taskId });
  console.log(`=== ${records.length} evaluation records ===`);
  for (const r of records.reverse()) {
    console.log(
      `  [${r.agentName}] model=${r.modelName} conf=${r.confidenceScore.toFixed(2)} ` +
        `review=${r.reviewModel ?? "-"} human=${r.humanReviewStatus}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
