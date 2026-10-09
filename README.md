# Insurance Complaint Triage Chat

A chat-based complaint intake for an insurance company, built on n8n. A complainant describes their problem to a hosted chat page; an LLM agent asks a few focused follow-up questions, then produces a structured classification (`legitimate`, `not_legitimate`, or `unknown`) with a confidence score, an escalation flag, a detected customer tone, and a neutral summary. A second agent then categorises and prioritises legitimate complaints and drafts a formal acknowledgement for a human to review. Every classification lands in one of three n8n Data Tables, giving complaints staff a pre-sorted, pre-summarised queue instead of a raw inbox.

This was built as a coding exercise demonstrating spec-driven development with Claude Code: scope captured in `docs/PRD.md`, implemented through reviewed OpenSpec changes (`openspec/`), with deterministic logic (routing, confidence thresholds, reference IDs) kept strictly separate from LLM judgment (classification, categorisation, drafting), and the whole pipeline verified by an automated test suite rather than manual spot-checking.

## Status

The full Must-have scope (PRD §9) is built and live-verified: config, chat intake, classification, escalation, tone, deterministic routing, the routing agent, Data Table records, and this test suite (harness, runner, reviewed scripted cases meeting TR-5), plus the JSON export and this README. We stopped deliberately at that point, due to time constraints, rather than continuing into the Should-have items PRD §9 itself marks as "time permitting": simulated conversations (TR-6), LLM-as-judge checks (TR-7), and repeated-run pass rates as the default (TR-8). The automated bootstrap (`add-auto-bootstrap`) — already the lowest-priority, explicitly droppable item in the build order — wasn't attempted either. See "Next steps" below for the full list of what's deliberately not built.

## Architecture

```
Complainant
   │  (n8n hosted chat)
   ▼
chat.workflow.ts ──────────────► classifier-core.workflow.ts
   │  (returns reply              (AI Agent + Structured Output Parser;
   │   immediately)                deterministic confidence-threshold and
   │                                product-not-offered backstops run after
   │                                the agent, not just in its prompt)
   │
   └──────────────────────────► router.workflow.ts
      (fire-and-forget,           (deterministic Switch on label+escalate;
       after the reply is sent)    AI Agent for category/priority/draft
                                    on legitimate complaints only)
                                        │
                                        ▼
                      ┌─────────────────┼─────────────────┐
                      ▼                 ▼                 ▼
            complaints_register   review_queue    not_legitimate_log
             (Data Table)         (Data Table)      (Data Table)
```

```
test-harness.workflow.ts (webhook, header-auth protected)
   ├──► classifier-core.workflow.ts   (same sub-workflow, waited on)
   └──► router.workflow.ts            (same sub-workflow, waited on)
```

Four workflows, three sub-components reused unchanged by both the live chat path and the test harness:
- **`chat.workflow.ts`** — the only complainant-facing entry point (n8n's hosted Chat Trigger). Reads a `Config` node (insurer name, products, follow-up limit, confidence threshold), calls `classifier-core` and waits for the reply, returns it immediately, then fires `router` without waiting.
- **`classifier-core.workflow.ts`** — an AI Agent (Claude + Structured Output Parser + per-session memory) that collects information, classifies, and drafts the closing message. A deterministic Code node runs after the agent to enforce the confidence threshold and product list from config, and to generate the reference ID — judgment stays with the LLM, the business rules don't.
- **`router.workflow.ts`** — a deterministic Switch (label × escalate) decides destination(s); a second AI Agent runs only for `legitimate` complaints to add category, priority, and a draft acknowledgement.
- **`test-harness.workflow.ts`** — a webhook wrapping the exact same two sub-workflow calls the chat path makes (same input shape, same config merge), so a passing test is evidence about the real chat behaviour, not a parallel implementation.

## Quick start (manual setup)

There's no automated bootstrap (`add-auto-bootstrap` was the lowest-priority, explicitly droppable item in the build order, and wasn't reached) — this is the only setup path.

1. **Start n8n**: `docker compose up -d`, then open `http://localhost:5678` and create the owner account.
2. **Copy `.env.example` to `.env`** and fill in `ANTHROPIC_API_KEY` and a random value for `TEST_WEBHOOK_SECRET` (e.g. `openssl rand -hex 24`). Leave `N8N_API_KEY` for the next step.
3. **Create an n8n API key**: Settings → API, create a key, paste it into `.env` as `N8N_API_KEY`.
4. **Create the Anthropic credential** in the n8n UI (Credentials → New → Anthropic), using your API key.
5. **Load the four workflows**: `npx n8nac push <file>.workflow.ts --verify` for each of the four files in `workflows/local/` (keeps credential references intact). This is the only load path — `workflows/local/*.workflow.ts` is this project's source of truth; `n8n-export/*.json` is a generated export artifact, not something to import.
6. **Create the test-harness webhook credential**: `./scripts/create-test-credential.sh` (reads `TEST_WEBHOOK_SECRET` from `.env`, creates an `httpHeaderAuth` credential via the n8n API; idempotent).
7. **Create the three Data Tables**: `./scripts/create-tables.sh` (idempotent — safe to re-run; also adds the `not_legitimate_log` referenceId column — see "Design decisions" for why that exists).
8. **Wire up cross-workflow references and activate**: `./scripts/deploy-workflows.sh`. `chat`'s and `test-harness`'s Execute Workflow nodes hardcode `classifier-core`'s/`router`'s workflow ID, and n8n never lets a freshly-created workflow keep a chosen ID (see the `CLAUDE.md` gotcha), so after a fresh load those references always point at the wrong workflow until this runs. The script resolves the real IDs by name, corrects the two references via the n8n API, checks the credentials from steps 4 and 6 exist, and activates all four in dependency order — all without touching any git-tracked `.workflow.ts` file. Safe to re-run any time (e.g. after wiping and reloading the workflows again).
9. **Try it**: open `chat.workflow.ts`'s hosted chat URL (Chat Trigger node → "Chat URL") and describe a complaint.

## Running the tests

```bash
npm install
npm test                              # full reviewed scripted suite
npm test -- --case <id>               # a single case
npm test -- --tag <tag>               # a tag (e.g. escalation, tone)
npm test -- --runs 3                  # repeat each selected case 3 times, report pass rates
npm run test:cleanup                  # delete the rows the most recent run wrote, from the three Data Tables
```

**This is slow — expect roughly 3–4 minutes for the full reviewed suite (one run).** Every case is a real conversation with a real LLM call per turn, not a mock; `--runs 3` roughly triples that. Run a single case with `--case <id>` while iterating, and use the full suite for the real TR-5 check. Non-determinism is also real at this speed: the model occasionally asks an extra clarifying question a single-turn case didn't script for ("ran out of turns"), or hits a transient Anthropic API error — a one-off failure here and there is expected LLM variance, not necessarily a regression; TR-5's 90% threshold is designed to tolerate that rather than demand a flake-free run every time.

`npm test` talks to `test-harness.workflow.ts` over HTTP (`TEST_WEBHOOK_SECRET` from `.env`), sends each case's turns in order, and reports overall accuracy, per-field accuracy, a label confusion matrix, and full transcripts for any failure, to the terminal and to `tests/reports/` (gitignored). It exits non-zero unless: overall accuracy ≥ 90%, zero `legitimate` complaints are misclassified `not_legitimate`, and zero expected escalations are missed — per PRD TR-5.

Only cases with `reviewed: true` count toward those numbers (`tests/cases/scripted/*.json` — Christian reviews generated cases before they count, per this repo's CLAUDE.md). Two cases are additionally `disabled: true` — see "Scope & trade-offs" below.

Because tests exercise the real classifier and router, including real Data Table writes, `npm test` leaves real rows in the demo tables. Run `npm run test:cleanup` afterwards if you want a clean table view for a demo — it deletes only the exact rows the last run recorded (by reference ID), never anything else, and never runs automatically.

## Design decisions

- **Native n8n AI nodes at runtime, not Claude Code.** The chat takes untrusted public input and classification is text-in/JSON-out with no tool use needed — AI Agent + Anthropic Chat Model + Structured Output Parser is the right-sized tool. Claude Code drove the *build* process (see "How it was built"), not the running pipeline.
- **Deterministic logic lives outside the prompt, in Code nodes that run after the agent.** The confidence threshold, the product-not-offered check, and reference ID generation are all enforced in `classifier-core`'s `Finalize Result` node, not just requested in the system prompt — so they're testable and can't silently drift if the model's own arithmetic is off. Confirmed the hard way: a bug where this Code node read `config` from the wrong place (an n8n AI Agent node replaces `$json` with just its own `{ output }`, dropping whatever went in) went undetected through all of Change 1's testing because every test happened to use near-default config values; it only surfaced once a deliberately boundary-violating `confidenceThreshold: 0.99` test was added in Change 3. See `CLAUDE.md` for the full gotcha list.
- **Label and escalation are independent.** `unknown` means the agent can't tell what kind of contact this is; `escalate` means a person needs to see it regardless of label, for reasons like hardship, safety, or threats of legal action. A complaint can be confidently `legitimate` and escalated at the same time, or `not_legitimate` and escalated (e.g. a threat with no real grievance behind it) — the scripted test suite has a case for each combination.
- **Tone rules are defined once and duplicated into two prompts.** The classifier's closing message and the routing agent's acknowledgement draft are generated by two separate agents with no connection between them, so the tone rules (angry/distressed/confused/neutral) and the "never promise an outcome, admit fault, give legal advice, reveal the label, or mirror hostility" rules are restated in both system prompts verbatim. A shared prompt-fragment mechanism would remove the duplication but isn't something n8n-as-code supports without a build step; noted as a drift risk, mitigated by the test suite's `legit-confused-ack-draft.json` case specifically checking the routing agent's tone handling independently of the classifier's.
- **The test harness is a thin caller, not a parallel implementation.** It calls `classifier-core` and `router` exactly as `chat.workflow.ts` does (same inputs, same config-merge behaviour, real Data Table writes) so a passing test is evidence about the real chat path. The only new workflow-side logic for testing is a single `referenceId` column mapping added to `router`'s `Write Not Legitimate Log` node — `not_legitimate_log` was the one table without a reference ID (PRD §6.8), which meant the test runner's cleanup command couldn't identify its own rows there the way it could for the other two tables. Adding the column was a smaller, safer change than the alternative considered (a `dryRun` flag threaded through `router`'s four Switch branches), which would have meant re-testing already-shipped routing logic for a test-infrastructure concern.
- **The test runner (`tests/runner/`) is hand-rolled TypeScript, not built on Jest/Vitest.** It's a fair amount of custom code (HTTP client, scoring, confusion matrix, Markdown/JSON reporting, cleanup) for what might look like "just run some tests." The reason: almost none of it is generic test-running machinery a framework would provide — it's domain-specific aggregation (per-field accuracy, a 3×3 label confusion matrix, recording `referenceId`/destination-table pairs for `test:cleanup`) that a framework wouldn't help with, and every "test" here is a multi-turn conversation against a live LLM, not a unit under test a framework's mocking/assertion tools are built for. There's also a real mismatch on TR-8 specifically: Jest/Vitest's repeat/retry options are built for flake-mitigation ("retry until it passes"), not TR-8's "always run N times regardless and report the pass rate" — implementing that on top of a framework would mean working against its assumptions rather than with them. The one genuine thing a framework would buy is easier parallel execution, which could meaningfully cut the ~3–4 minute full-suite runtime (see "Running the tests") — though that's addable to the current runner directly (a concurrency-limited `Promise.all` over cases) without taking on a framework dependency. Noted as a reasonable "maybe later" rather than acted on here.

## Scope & trade-offs

**In scope**: chat intake with follow-up questioning, three-way classification with confidence and reasons, escalation independent of label, tone-matched customer messaging, deterministic routing, an LLM categorisation/prioritisation/drafting step, Data Table records, and an automated test suite with explicit pass criteria.

**Out of scope, and why** (from PRD §3): judging whether a complainant is *in the right* on a claim (needs policy/claims data the agent doesn't have, and an AI ruling on claims is high-risk); real integrations like email/ticketing/Slack (would need the reviewer's own credentials); identity verification (demo only, synthetic data); production auth/scaling hardening; a custom chat frontend (n8n's hosted chat page is sufficient).

**Two scripted test cases are disabled, not deleted.** `classifier-core-build-failure-result.json` and `router-routing-agent-failure.json` were meant to deliberately provoke each agent's `onError` fallback path. Live-tested: n8n's Structured Output Parser on an AI Agent node enforces its JSON schema via Anthropic's forced structured output at the API level, not merely by prompt suggestion — no amount of prompt-injection content can make the model violate the schema (confirmed with several attempts, including the ones recorded in these two files). The only way to reach either fallback is a genuine API-level failure (invalid credential, rate limit, timeout). That did happen three times, unprompted, during this session's live test-case authoring — ordinary, non-adversarial calls hit transient Anthropic API errors and both agents' fallbacks fired exactly as designed (see the `disabledReason` field in `classifier-core-build-failure-result.json` for the captured evidence, and the one flaky `legit-confused-customer-service` failure in a full suite run, which landed safely in `unknown` rather than a dangerous misclassification). Deliberately reproducing this via a temporary credential swap was considered and declined — not worth the risk of briefly breaking live chat traffic on the shared credential for a one-off verification. The `onError: continueErrorOutput` wiring itself was code-reviewed in Changes 1–2 and is architecturally sound; it just isn't reliably exercised by a scripted conversation.

**`unknown`'s two reasons (`insufficient_info` vs `ambiguous`) need more work to tell apart reliably — flagged for future attention, not resolved here.** `unknown-ambiguous.json` only asserts `label: unknown`, not the specific `unknownReason`. Five live-iteration attempts at content that should read as "mixes abuse with what might be a real grievance" (the PRD's own definition of `ambiguous`) kept landing on `insufficient_info` instead, or resolved cleanly to `legitimate`/`unknown` depending on small wording changes — genuinely ambiguous-by-design input turned out to be close to a coin-flip between the two reasons even by a careful human read, suggesting the distinction between them may need sharper prompt wording (or sharper PRD definitions) before it can be tested reliably rather than a test-content problem alone. Until that's revisited, treat `unknownReason` as under-tested for the `ambiguous` case specifically, even though `label: unknown` itself is well covered.

**Next steps** (documented, not built, per PRD §9): a `not_a_complaint` label distinct from `not_legitimate`, for routing general enquiries separately rather than lumping them in with junk; persistent chat memory (e.g. Postgres) instead of in-process memory; real notification/external destinations; config-override tests (same conversation, different product list — not attempted here beyond the ad hoc boundary-value checks used during implementation); CI running the test suite on push; the automated bootstrap (`add-auto-bootstrap`, explicitly the lowest-priority item); production deployment hardening; a human-review UI with a feedback loop back into the test set; **sharpening the `insufficient_info`/`ambiguous` distinction** (prompt wording and/or PRD definitions) so `unknown-ambiguous.json` can assert a specific reason instead of just `label: unknown`.

## Production considerations

- **Personal information.** Complaints contain personal and potentially sensitive data, sent to Anthropic and stored in n8n execution logs and Data Tables. A real deployment needs retention limits, access control, and a privacy assessment.
- **Regulation.** Australian insurers' complaint handling falls under ASIC's RG 271, which defines complaints broadly and sets response timeframes. In production, `not_legitimate` must never mean "dropped" — every classification here is logged and reviewable, including in the not-legitimate log.
- **Human oversight.** `unknown` and escalated cases go to people by design; a real system would also sample `not_legitimate` outcomes for review.
- **Prompt injection.** The chat accepts untrusted input. Agents have no tools, limiting the damage a manipulated agent could do. Covered by the test suite's `prompt-injection-manipulation.json` case, and incidentally demonstrated by the difficulty of inducing a parser failure through conversational content at all (see "Scope & trade-offs" above) — the structured-output enforcement that makes injection hard to exploit also makes it hard to deliberately break for testing.
- **Transient model-provider failures are real, not just theoretical.** Three ordinary test calls during this project's own test-case authoring session hit genuine Anthropic API errors. Both `onError: continueErrorOutput` fallbacks (classifier and router) handled this correctly and non-silently every time, but a production deployment should have alerting on how often `BuildFailureResult`/`Routing Agent Failure` actually fire, since that rate is itself a signal worth watching.
- **Inline JavaScript in n8n Code nodes isn't modular.** `classifier-core.workflow.ts`'s `Finalize Result`/`Build Failure Result` and `router.workflow.ts`'s equivalents hold their logic as plain JS strings in the `jsCode` field — n8n Code nodes run as isolated scripts with no module system, so this code can't `import` from a separate file the way normal application code would. Fine for one-off ~40-line deterministic checks, but it gets no type-checking, linting, or unit tests of its own, and logic shared between nodes (e.g. the tone rules duplicated into two prompts) has to be copy-pasted. A production build should extract this into small standalone, tested files and either keep the `jsCode` string in sync with a documented pointer back to the source, or add a build step that inlines it before `n8nac push`.

## How it was built

`docs/PRD.md` (requirements, priorities, test criteria) → four OpenSpec changes, each proposed, reviewed, applied, live-tested, verified, and archived in turn (`openspec/changes/archive/`, specs synced into `openspec/specs/`) → workflows written as code with n8n-as-code (`workflows/local/*.workflow.ts`, source of truth; `n8n-export/*.json` is a generated export artifact for inspecting the JSON, not an import path) → this test suite, built against the real running pipeline rather than a mock. `n8n-agent-pipeline-handoff.md` has the full process and technical-decisions writeup this project followed.
