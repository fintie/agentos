/**
 * Seed demo data: runs every vertical workflow against the mock adapters and
 * persists evaluation records to the configured store (JSON file by default),
 * so the dashboard has routing decisions + eval logs to inspect immediately.
 *
 *   npm run seed
 */
import { loadConfig } from "../src/config.js";
import { Orchestrator } from "../src/orchestration/runner.js";
import { runCareWorkflow, runIncidentWorkflow } from "../src/workflows/care.js";
import { runStemWorkflow } from "../src/workflows/stem.js";
import { runVoiceWorkflow } from "../src/workflows/voice.js";
import { runDeveloperWorkflow } from "../src/workflows/developer.js";

async function main() {
  // Force mock so seeding never needs API keys.
  const config = { ...loadConfig(), forceMock: true };
  const orchestrator = new Orchestrator({ config });

  console.log("Seeding demo workflows (mock adapters)…\n");

  const care = await runCareWorkflow(orchestrator, {
    residentId: "R-1042",
    shiftDate: "2026-06-16",
    rawNote:
      "resident a bit unsteady this am, refused breakfast, took meds 8am paracetamol. complained of hip pain. fam to be called.",
  });
  console.log(`✓ Care workflow         → task ${care.taskId} (human review: ${care.requiresHuman})`);

  const incident = await runIncidentWorkflow(orchestrator, {
    residentId: "R-1042",
    shiftDate: "2026-06-16",
    description: "Resident slipped near the bathroom around 9:15am, no visible injury, assisted up by two staff.",
  });
  console.log(`✓ Incident workflow     → task ${incident.taskId}`);

  const stem = await runStemWorkflow(orchestrator, {
    question: "What is the derivative of x^2?",
    studentAnswer: "x",
    gradeLevel: "Year 11",
  });
  console.log(`✓ STEM workflow         → task ${stem.taskId}`);

  const voice = await runVoiceWorkflow(orchestrator, {
    callId: "C-9001",
    transcript:
      "Customer: my invoice is wrong again and I'm furious. Agent: I'm sorry, let me check… Customer: this is the third time.",
  });
  console.log(`✓ Voice workflow        → task ${voice.taskId}`);

  const dev = await runDeveloperWorkflow(orchestrator, {
    title: "Offline-first sync",
    requirement: "Add offline-first data sync to the mobile app with conflict resolution.",
    constraints: ["must work on flaky networks", "no data loss"],
  });
  console.log(`✓ Developer workflow    → task ${dev.taskId}`);

  const all = await orchestrator.store.list();
  console.log(`\nDone. ${all.length} evaluation records written to ${config.evalFile}.`);
  console.log("Run `npm run dashboard` to inspect routing decisions and eval logs.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
