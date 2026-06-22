# AgentOS — Multi-Model Orchestration Layer

**Live demo:** https://agentos.nextgenius.com.au (static, read-only console on GitHub Pages)

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
npm run dashboard           # agent management console at :4317
```

## Management console

`npm run dashboard` serves a single-page console ([dashboard/](dashboard/)) to
**manage agents by use case**:

- **Overview** — fleet stats (agents, use cases, logged outputs, escalations, pending reviews).
- **Use case pages** (Aged Care / STEM / Voice / Developer / Review & Judge) — the
  workflow pipeline with the model routed to each step, a one-click **Run workflow**
  (with an editable JSON input), and cards for every agent in that vertical.
- **All agents** — the full registry grouped by use case; each card shows task type,
  routed model, risk, prompt version, multimodal flag, the output **Zod schema**, and a
  **Run agent** form (prefilled with an example) that executes the agent live.
- **Evaluation log** — every output with its routing decision, model, confidence,
  reviewer, and a human-review approve/reject control.

The primary navigation is organised around six composable systems: **Trading,
Healthcare, Education, Marketing, Software Engineering, and Research**. Shared
platform modules such as model routing, memory, workflow runtime, evaluation,
scheduling, notifications, human review, and audit logging are declared once and
visibly reused across systems. Trading tools such as Watchlist, Signals,
Backtests, Portfolio, News, and Agent Activity live inside the Trading system.

It talks to a small JSON API on the same server (`/api/usecases`, `/api/agents`,
`/api/run/agent`, `/api/run/workflow`, `/api/records`, `/api/stats`). Use-case
groupings, example inputs, and workflow runners live in [src/catalog.ts](src/catalog.ts).
Runs use real providers when keys are present, otherwise the mock adapters.

### Static deployment (GitHub Pages)

GitHub Pages serves static files only, so `npm run build:pages`
([scripts/build-static.ts](scripts/build-static.ts)) pre-computes the catalog,
schemas, a seeded evaluation log, and a pre-baked example run for every agent and
workflow into `data/*.json`, and emits a static `index.html`
([dashboard/pages.html](dashboard/pages.html)). The published site is a fully
browsable, read-only mirror — live execution still requires `npm run dashboard`.

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

The router also includes an EvoClaw-inspired model health registry
([health.ts](src/router/health.ts)): repeated provider failures open a lightweight
circuit breaker, routing avoids unhealthy models, and single-candidate rules can
fail over to the next viable healthy family instead of cascading an upstream outage
through the workflow. Successful calls close the breaker again. Each run stores the
attempted model chain, model health snapshots, actual cost, and a value-for-money
score in the evaluation trace.

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
- **Trading Agent OS**: US/ASX scan → catalyst research + technical analysis → strategy scoring → 30D/90D/1Y backtests → hard risk gate → portfolio construction → channel notifications. The domain implementation lives in [src/trading](src/trading), including a 15-minute US / 30-minute ASX scheduler, provider interface, deterministic demo provider, event bus, and pluggable Telegram/Discord/Email/Dashboard notification adapters.

The dashboard exposes dedicated **Watchlist, Signals, Backtests, Portfolio, News, and Agent Activity** applications. Demo data is synthetic; production deployments should supply licensed market/news providers and secure notification transports through `TradingDataProvider` and `CallbackNotificationChannel`.

## Distributed Inference & Proof Receipts

AgentOS does **not** yet perform real WAN GPU inference. Inspired by the orchestration concepts in
[leyten/shard](https://github.com/leyten/shard), it models the control and settlement layer required
for a future distributed inference network without CUDA, activation transport, blockchain, or
`c0mpute.ai` access.

The deterministic mock implementation in [src/shard](src/shard) provides:

- a shard node registry with GPU identity, region, layer range, health, reliability, cost, and trust-boundary metadata;
- topology validation for complete contiguous layer coverage, ring order, and unhealthy-node failover policy;
- WAN traversal simulation with edge RTTs, speculative-token acceptance, async-pipeline/direct-return flags, retries, failover, latency, and throughput;
- proof receipts covering inputs, outputs, tokens, schemas, GPU UUIDs, regions, layer assignments, health snapshots, and optimization flags;
- receipt verification for coverage, GPU uniqueness, node participation, output integrity, RTT validity, deterministic consistency, and offline-node exclusion;
- settlement estimates for coordinators, draft models, and shard nodes, weighted by token output, layer contribution, reliability, evaluation quality, latency, failures, and trusted boundaries.

`Orchestrator.runAgent()` accepts `executionBackend: "provider" | "local" | "sharded"`. A sharded
run uses deterministic mock structured generation, simulates the selected topology, attaches the
verified `ShardRunReceipt` and `SettlementRecord[]` to the existing evaluation record, and exposes
the result through the same audit API. Two included demos model a 78-layer GLM-5.2-style 6×13 WAN
ring and a 36-layer gpt-oss-120B-style 3×12 WAN ring.

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
