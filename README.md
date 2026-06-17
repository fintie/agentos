# AgentOS — Multi-Model Orchestration Layer

A TypeScript orchestration layer that routes tasks across three model families,
cascades from cheap → strong models, runs dual-model review, validates every
output against Zod schemas, and writes a full evaluation/audit log.

| Family | Role |
| --- | --- |
| **Gemini 3 Flash** | Fast, low-cost, multimodal & interactive tasks, batch generation |
| **Kimi K2.6** | Long-context reasoning, agent planning, long-horizon coding, multi-agent orchestration |
| **DeepSeek V4 Pro** | Deep reasoning, complex code, compliance review, final validation, LLM-as-judge |

> **Runs with zero setup.** With no API keys (or `AGENTOS_FORCE_MOCK=true`) every
> provider is transparently backed by `MockModelAdapter`, so the demos, seed
> script, dashboard, and tests all work offline and deterministically.

## Quick start

```bash
npm install
cp .env.example .env        # optional — defaults to mock mode
npm test                    # unit tests (routing, structured output, cascade)
npm run demo                # run one Care workflow and print the routing trace
npm run seed                # populate all four workflows into the eval store
npm run dashboard           # inspect routing decisions + eval logs at :4317
```

## Architecture

```
RoutingContext ─▶ ModelRouter ─▶ AdapterRegistry ─▶ ModelAdapter (Gemini/Kimi/DeepSeek/Mock)
                      │                                   │
                  routing rules                      generate / generateStructured / stream
                      │                                   │
Agent definition ─▶ Orchestrator.runAgent ─▶ runStructured (Zod validate + retry)
                      │                                   │
                  Cascade / DualReview              EvaluationStore (memory | Prisma)
                      │
                  Vertical workflows (Care / STEM / Voice / Developer)
```

### 1. Model Router — [src/router](src/router)
Routes on **task type, risk, context length, latency, cost budget, confidence**.
Rules live in [rules.ts](src/router/rules.ts) (`fast_summary → Gemini`,
`compliance_review → DeepSeek`, …). The router then applies hard constraints
(context window, multimodal capability), reorders by soft signals (latency/cost),
and **escalates to the strongest candidate** when confidence is low or risk is high.
Every decision returns a full trace (rule id, candidates, estimated cost, escalation flag).

### 2. Model Adapters — [src/adapters](src/adapters)
Common interface (`generate`, `generateStructured`, `stream`, `estimateCost`,
`supportsMultimodal`, `maxContextTokens`). Implementations: `GeminiFlashAdapter`
(Google `generateContent`), `KimiAdapter` + `DeepSeekAdapter` (OpenAI-compatible
chat completions, with SSE streaming), and `MockModelAdapter` (schema-aware,
deterministic, offline). The `AdapterRegistry` picks real vs. mock per family
based on env keys.

### 3. Agent Registry — [src/agents](src/agents)
Declarative agents (metadata + prompt builder + Zod schema). The eight headline
agents — `CareNoteAgent`, `IncidentDraftAgent`, `TutorFeedbackAgent`,
`CallSummaryAgent`, `DeveloperAgent`, `ReportAgent`, `ComplianceReviewAgent`,
`JudgeAgent` — plus supporting agents the workflows compose.

### 4. Cascade Execution — [src/orchestration/cascade.ts](src/orchestration/cascade.ts)
Starts on the cheapest rung and escalates when **confidence is low, risk is high,
schema validation fails, or a custom `accept()` predicate rejects** the output.
Every rung is a fully logged agent run.

### 5. Dual Review — [src/orchestration/dualReview.ts](src/orchestration/dualReview.ts)
One model generates, a second reviews, an optional third rewrites — e.g. Kimi
drafts an incident → DeepSeek reviews compliance → Gemini rewrites for readability.
Stages share a `taskId` so the chain is reconstructable in the audit log.

### 6. Structured Output — [src/orchestration/structured.ts](src/orchestration/structured.ts)
All outputs are **Zod schemas** ([src/schemas](src/schemas)). Validation failures
trigger corrective retries; both **raw and parsed** output are returned and stored.

### 7. Evaluation Layer — [src/evaluation](src/evaluation)
Every output is recorded with: `task_id, agent_name, model_name, prompt_version,
input_hash, raw_input_reference, raw_output, parsed_output, confidence_score,
evaluation_score, review_model, human_review_status, created_at` (+ routing trace).
Pluggable store: `MemoryEvaluationStore` (JSON file, default) or
`PrismaEvaluationStore` (Postgres — see [prisma/schema.prisma](prisma/schema.prisma)).

### 8. Vertical Workflows — [src/workflows](src/workflows)
- **Care**: raw shift note → Gemini parse → Kimi care note → DeepSeek compliance → human gate → report
- **STEM**: answer → Gemini feedback → DeepSeek correctness → Kimi next practice → parent report
- **Voice**: transcript → Gemini summary → Kimi follow-up → DeepSeek escalation → CRM note
- **Developer**: requirement → Kimi architecture plan → DeepSeek review → Gemini docs

## Configuration

All keys come from the environment (see [.env.example](.env.example)). Set
`AGENTOS_EVAL_STORE=prisma` and a `DATABASE_URL` to use Postgres:

```bash
npm run prisma:generate && npm run prisma:migrate
```

## Project layout

```
src/
  adapters/        model interface + Gemini/Kimi/DeepSeek/Mock + registry
  router/          routing rules + ModelRouter
  schemas/         Zod schemas for every AI output
  agents/          declarative agents + registry
  orchestration/   runner, structured output, cascade, dual review
  evaluation/      record types + memory/prisma stores
  workflows/       Care / STEM / Voice / Developer
test/              vitest unit tests (routing, structured output, cascade)
scripts/           seed + demo runners
dashboard/         Express API + single-page inspector
prisma/            Postgres schema for the audit log
```

## Notes on stack

The spec allowed Next.js **or** NestJS. The core is framework-agnostic (a plain
TypeScript library) so it drops into either; the included dashboard is a
lightweight Express + static HTML app chosen so the whole project runs with no
database or framework scaffolding. The Prisma schema + adapter are provided for a
production Postgres deployment.
