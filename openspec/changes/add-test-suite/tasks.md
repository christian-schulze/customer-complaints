# Tasks

## 1. Project scaffolding

- [x] 1.1 Create `package.json` with a `test` script, a `test:cleanup` script, TypeScript + a lightweight runtime (e.g. `tsx`) as dev dependencies, and verify `npm install` succeeds with no `tests/` code yet
- [x] 1.2 Create `tests/cases/scripted/`, `tests/runner/`, `tests/reports/` directories and add `tests/reports/` to `.gitignore`, and verify `git status` shows the new tracked directories but not report output

## 2. Test harness workflow

- [x] 2.1 `npx n8nac pull` the current state of `chat.workflow.ts`, `classifier-core.workflow.ts`, and `router.workflow.ts` (Christian may have edited in the UI), and verify the pulled files match what's expected before building on them
- [x] 2.2 Create `workflows/local/test-harness.workflow.ts`: Webhook trigger (`authentication: 'headerAuth'`, new `httpHeaderAuth` credential backed by `TEST_WEBHOOK_SECRET`) → Config node (same defaults as `chat.workflow.ts`, shallow-merged with any `config` in the request body) → `CallClassifierCore` (executeWorkflow, `waitForSubWorkflow: true`, mirroring `chat.workflow.ts`'s node) → branch on `done` → (`false`: assemble `{ reply, done }` response; `true`: `CallRouter` executeWorkflow with `waitForSubWorkflow: true`) → a final Code node assembling `{ reply, done, result, routing }` by reading `$('CallClassifierCore').item.json` and `$('CallRouter').item.json` explicitly (per the AI-Agent-output-replacement gotcha in CLAUDE.md), and verify `npx n8nac skills validate test-harness.workflow.ts` passes — `classifier-core.workflow.ts` and `router.workflow.ts` themselves are not modified
- [x] 2.3 Push with `npx n8nac push test-harness.workflow.ts --verify`, and verify the workflow appears active in the local n8n UI
- [x] 2.4 Live-test a happy-path call (a complete conversation reaching `done: true`) against the webhook with `curl`, with and without the correct `TEST_WEBHOOK_SECRET` header, and verify: valid secret returns a combined `{ reply, done, result, routing }` body with a real `referenceId` and `routes`; missing/incorrect secret is rejected before the classifier runs (check `n8n` execution list for no new `classifier-core` execution)
- [x] 2.5 Live-test a config override (e.g. `confidenceThreshold: 0.99`, chosen specifically to flip the outcome per [[feedback-verify-deterministic-backstops-live]]) through the harness, and verify the returned `result.label` reflects the overridden threshold, not the default

## 3. Test runner

- [x] 3.1 Implement the HTTP client and turn-sending loop (`tests/runner/`): generate a fresh `sessionId` per case, send each `turns` entry to the harness in order, stop at `done: true` or exhaustion, and verify a hand-run against one real scripted case (added in group 4) returns a result object with the full per-turn transcript
- [x] 3.2 Implement per-field assertion against `expected` (only fields a case declares), accuracy and confusion-matrix aggregation across cases, and the TR-5 threshold check (≥90% accuracy, zero legitimate→not_legitimate misses, zero missed escalations) driving the process exit code, and verify with a small in-repo fixture pair (one deliberately-failing fake case, one passing) that the exit code and reported numbers match by hand-calculation
- [x] 3.3 Implement `--tag`, `--case`, and `--runs` (default 1) CLI flags, with `--runs > 1` reporting a per-case pass rate, and verify each flag narrows/repeats execution as expected against the fixture pair from 3.2
- [x] 3.4 Implement terminal output and `tests/reports/` JSON + Markdown report generation (accuracy, per-field results, confusion matrix, failing transcripts), recording each routable case's `referenceId` and destination table(s) alongside its result, and verify both report files are written after a run, the Markdown is human-readable, and the recorded referenceId/table pairs match what actually landed in the Data Tables for a sample case
- [x] 3.5 Implement `npm run test:cleanup` for `complaints_register` and `review_queue` (both have a `referenceId` column already): read the most recent report, and for each recorded `referenceId`/table pair in those two tables, delete that row via the n8n Data Table REST API (`N8N_API_KEY` from `.env`), and verify it removes exactly the rows from a prior test run and leaves any pre-existing demo rows untouched — never wired into `npm test` itself. `not_legitimate_log` cleanup is covered in group 4 below, once that table has a matchable column.

## 4. Not-legitimate log referenceId (follow-up, approved by Christian)

- [x] 4.1 Add a `referenceId` string column to the `not_legitimate_log` Data Table via a small idempotent script (mirroring `scripts/create-tables.sh`'s pattern — check existing columns first, skip if already present), and verify via the n8n API that the column exists and existing rows are unaffected
- [x] 4.2 `npx n8nac pull router.workflow.ts` fresh, add a `referenceId` entry to the `Write Not Legitimate Log` node's column mapping (the value is already computed by `Build Not Legitimate Log Row`, just not previously mapped), validate, push `--verify`, and verify the other three Switch branches still write correctly (no regression)
- [x] 4.3 Live-test a `not_legitimate` case through the harness and verify the new `not_legitimate_log` row includes the correct `referenceId`
- [x] 4.4 Extend `npm run test:cleanup` to also match-and-delete `not_legitimate_log` rows by `referenceId`, and verify it removes a leftover test row from 4.3 without touching unrelated rows

## 5. Scripted test cases

- [x] 5.1 Author scripted cases covering every PRD TR-3 dimension (every label; escalation independent of label; every tone on the classifier's closing message; every routing destination; a product not offered; opt-in contact declined; the follow-up limit reached; a prompt-injection attempt), each with `id`, `description`, `turns`, `expected`, `tags`, `reviewed: false`. 12 cases authored, each live-iterated against the real harness until its actual behaviour matched (or the expectation was corrected to match genuinely-correct system behaviour, e.g. `product-not-offered`'s bereavement mention correctly triggers escalation). Two transient Anthropic API failures were hit live during iteration and resolved on retry - unplanned but valuable evidence that `BuildFailureResult` fires correctly on real failures (see 5.3/5.4 disabled-case notes).
- [x] 5.2 Author a dedicated confused-tone case for the routing agent's `acknowledgementDraft` (`legit-confused-ack-draft.json`, distinct complaint from 5.1's `legit-confused-customer-service.json`, per [[change3-test-coverage-gaps]]); the Must-have assertion checks the structured `customerTone` field and that a non-empty acknowledgement draft was produced — judging whether the draft's prose actually *reads* confused-toned is the LLM-as-judge should-have (7.2), not this case
- [x] 5.3 Attempt to provoke `classifier-core`'s `BuildFailureResult` path with a scripted conversation; live-tested prompt-injection and malformed-config approaches, all failed because the Structured Output Parser enforces its schema at the Anthropic API level (forced structured output) - content alone cannot break it. Authored `classifier-core-build-failure-result.json` with `disabled: true` and a `disabledReason` documenting the finding (Christian approved keeping it disabled + documented rather than attempting a live credential-swap test). Verified the runner skips it with zero HTTP calls.
- [x] 5.4 Same attempt and same finding for `router.workflow.ts`'s `Routing Agent Failure` path. Authored `router-routing-agent-failure.json` with `disabled: true` and a `disabledReason`. Verified the runner skips it with zero HTTP calls.
- [x] 5.5 Send the full case set to Christian for review; mark each reviewed case `reviewed: true` only after his explicit approval, and verify `npm test` then reports a non-zero count of in-scope (reviewed) cases. Approved 2026-10-09; all 14 cases marked `reviewed: true` (the 2 disabled cases are still skipped regardless, per their `disabled` flag).
- [x] 5.6 Ran `npm test` against the full reviewed set: **PASS** - 91.7% accuracy (11/12 by label), zero legitimate→not_legitimate misses, zero missed escalations (10/10). One failure (`legit-confused-customer-service`: expected `legitimate`, got `unknown`) traced to a transient Anthropic API error (the third observed this session, same pattern as the serendipitous `BuildFailureResult` evidence in 5.3) - the model fell back to the safe `unknown` bucket rather than a dangerous misclassification, exactly as designed. Not a wrong expectation, so left as-is per CLAUDE.md rather than re-run to mask it; the transient-failure rate is noted for the README's production considerations. `npm run test:cleanup` run afterward.

## 6. Export and documentation

- [x] 6.1 Run `scripts/export.sh` to regenerate `n8n-export/` including `test-harness.workflow.ts`, and verify all four workflow JSON files are present and importable
- [x] 6.2 Write `README.md` per the handoff §7 outline (what it is, architecture diagram, quick start/manual setup, running the tests including `test:cleanup`, design decisions, scope & trade-offs, production considerations, how it was built), and verify a fresh read-through lets someone unfamiliar with the repo find the test command and the manual setup steps without looking anywhere else

## 7. Should-have: simulated cases, LLM-as-judge, repeated runs (time permitting)

- [ ] 7.1 Implement simulated-case support (runner calls the Anthropic API directly to play a complainant with a persona and hidden facts) and author at least one simulated case, and verify it reaches `done: true` within `maxFollowUps` and yields an assertable result
- [ ] 7.2 Implement an LLM-as-judge check on customer-facing messages (tone match + FR-5.4 rule violations) and wire it into the report, and verify it flags a deliberately tone-mismatched or rule-violating message in a hand-crafted check
- [ ] 7.3 Add `--runs 3` as the default for the reviewed scripted suite's CI-equivalent run and surface per-case pass rates in the report, and verify a case with known occasional variance shows a pass rate below 100% rather than being silently averaged away

## Workflow follow-up

- Run `/opsx:verify` once groups 1-6 (Must-have) are complete and TR-5 passes live.
- Archive the change with `/opsx:archive` and sync specs.
- Do not commit any step's code until Christian has reviewed it; ask him to review before committing if it's unclear whether he already has. Ask before pushing to GitHub, as always.
