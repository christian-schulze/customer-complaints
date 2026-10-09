# Proposal

## Why

Classifier and routing behaviour is produced by LLM agents, which is inherently non-deterministic — PRD Goal 4 and §7 (TR-1 through TR-9) require that behaviour be measured against known-outcome conversations rather than eyeballed. Change 3 is the last Must-have in the build order (handoff §4 table) and nothing currently exercises `classifier-core` or `router` except manual chat testing.

## What Changes

- Add `workflows/local/test-harness.workflow.ts`: a webhook-triggered workflow, protected by header auth (`TEST_WEBHOOK_SECRET`), that accepts `{ sessionId, message, config? }`, calls `classifier-core` (optionally overriding config), and — once `done: true` — also calls `router` in wait mode, returning classifier output and router output together. Both sub-workflows are called exactly as `chat.workflow.ts` calls them, unmodified — test runs exercise the real Data Table write path, not a stubbed one.
- Add a TypeScript test runner (`tests/runner/`) driven by `npm test`, that:
  - Sends each scripted case's turns in order to the harness, using a fresh `sessionId` per case.
  - Asserts the fields each case declares (`label`, `unknownReason`, `escalate`, `customerTone`, `routes`, `category`, `priority`).
  - Reports overall accuracy, per-field results, a confusion matrix on `label`, and failures with full transcripts, to the terminal and to `tests/reports/` (JSON + Markdown).
  - Records, for every case that reaches a routable outcome, the `referenceId` and destination table(s) it was written to, so those exact rows can be identified later.
  - Enforces TR-5 thresholds and exits non-zero on failure.
  - Supports `--tag`, `--case`, `--runs` flags.
- Add a separate, explicitly-invoked `npm run test:cleanup` command that deletes exactly the rows recorded by the most recent run (via the n8n Data Table REST API, matching on recorded `referenceId`s) — so test runs don't leave synthetic complaints permanently mixed in with demo data, without ever running automatically and without needing a `dryRun` mode in `router.workflow.ts`.
- **Add a `referenceId` column to the `not_legitimate_log` Data Table, and map it in `router.workflow.ts`'s `Write Not Legitimate Log` insert node.** Discovered while building cleanup: `complaints_register` and `review_queue` both have a `referenceId` column (PRD §6.8) that cleanup can match on, but `not_legitimate_log` doesn't — it's `timestamp`/`reasons`/`summary` only. Christian approved adding the column (a small, additive deviation from PRD §6.8's exact column list, done for test-infra reasons) rather than a fragile timestamp/summary-text match. This is the one place this change touches `router.workflow.ts`, scoped to one new column mapping on one existing insert node — not the four-branch `dryRun` redesign rejected earlier.
- Add reviewed scripted test cases (`tests/cases/scripted/*.json`) covering PRD TR-3 in full (every label, escalation independent of label, each tone on **both** the classifier's closing message and the routing agent's acknowledgement draft, every route, a product not offered, opt-in contact declined, the follow-up limit reached, prompt-injection attempts) plus two previously-identified gaps: a deliberate induced failure on classifier-core's `BuildFailureResult` path and a deliberate induced failure on router's `Routing Agent Failure` path. Only cases Christian marks `reviewed: true` count toward TR-5.
- Add `package.json` and the `tests/` directory structure from the handoff (§2), gitignoring `tests/reports/`.
- Export all four workflows (including the new harness) to `n8n-export/` via `scripts/export.sh`.
- Write the README (handoff §7 outline): what it is, architecture, quick start/manual setup, running the tests, design decisions, scope & trade-offs, production considerations, how it was built.
- **Should-have, time permitting, in priority order** (PRD §9): simulated conversations (TR-6, an LLM plays the complainant), LLM-as-judge checks on tone/FR-5.4 (TR-7), repeated runs with pass rates (TR-8). These are included in tasks.md as a separate, clearly-marked phase after the Must-have bar (TR-5 passing on scripted cases) is met.

## Capabilities

### New Capabilities
- `test-suite`: automated, repeatable verification of complaint-intake, classification, escalation, tone, and routing behaviour against synthetic conversations with known expected outcomes, via a dedicated test harness workflow and runner.

### Modified Capabilities
- `complaint-records`: the not-legitimate log gains a `referenceId` column (was timestamp/reasons/summary only), so test-generated rows can be identified and cleaned up the same way as the other two tables.

## Impact

- New file: `workflows/local/test-harness.workflow.ts` (calls existing `classifier-core` and `router` sub-workflows unchanged).
- New directory: `tests/` (`cases/scripted/*.json`, `runner/`, `reports/` — gitignored).
- New file: `package.json` (test runner dependencies and `npm test` script).
- Modified: `.gitignore` (add `tests/reports/`), `n8n-export/` (regenerated to include the harness), `README.md` (written per handoff §7 outline — currently a stub).
- No changes to `chat.workflow.ts` or `classifier-core.workflow.ts`. One small, scoped change to `router.workflow.ts`: the `Write Not Legitimate Log` node's column mapping gains `referenceId` (value already computed upstream by `Build Not Legitimate Log Row`, just not previously mapped to a column). Otherwise the harness calls both sub-workflows as-is, matching PRD's requirement that tests exercise exactly what users talk to.
