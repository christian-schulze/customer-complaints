# Design

## Context

See `proposal.md` - Why/What Changes. This is the first of four changes; nothing exists yet (greenfield). The architecture is fixed by `n8n-agent-pipeline-handoff.md` §3: `chat.workflow.ts` (Chat Trigger → Config → Execute Workflow: classifier-core → reply) and `classifier-core.workflow.ts` (AI Agent + Anthropic Chat Model + memory + Structured Output Parser, called with `{ sessionId, message, config }`). This design covers how to build those two workflows so Change 3's test harness can later call `classifier-core` directly and exercise exactly what the chat uses.

## Goals / Non-Goals

**Goals:**
- A sub-workflow boundary clean enough that the test harness (Change 3) can call `classifier-core` with no dependency on the chat workflow.
- Confidence-threshold enforcement (FR-3.2) that is deterministic and independently testable, not solely prompt-dependent.
- A failure path that never leaves the complainant without a reply or the result without a recorded outcome.

**Non-Goals:**
- Persistent (e.g. Postgres) chat memory — Simple Memory (in-process) is accepted for this change; persistent memory is a documented PRD §9 next step.
- Routing, Data Table writes, the routing agent's acknowledgement draft — Change 2.
- The test harness itself — Change 3.

## Decisions

**Prompt config reads default via `??` to the configuration's own documented defaults, never to a different value.**
`classifier-core`'s system prompt reads `$json.config?.insurerName ?? 'ACME Insurance'` (and similarly for `products`, `maxFollowUps`, `confidenceThreshold`). This is a defensive fallback for the case where `classifier-core` is invoked directly with no `config` at all (e.g. future test cases per the handoff's "if config is supplied it overrides defaults"), not a hardcoded insurer-specific value competing with the Config node — the literal exactly mirrors `complaint-config`'s documented default and is only reachable when `config` is entirely absent. See `complaint-config` spec's "Prompts read configuration via expressions" requirement for the explicit carve-out.

**Memory: Simple Memory, keyed on `sessionId`.**
Per the handoff, this is explicitly "for now." Simple Memory lives in n8n's execution context, not a database — conversation state is lost on an n8n restart mid-conversation. Acceptable for a one-day local demo; flagged again under Risks.

**Confidence threshold and product check enforced deterministically, not just in the prompt.**
FR-3.2 explicitly requires this. The same reasoning extends to FR-3.3 (product not offered): both are factual comparisons (`confidence < threshold`; `extracted.insuranceType` not in `config.products`) that a deterministic node after the AI Agent can check exactly, rather than trusting the agent to apply them every time. Implementation: a Code node after the Structured Output Parser that overrides `label`/`unknownReason` when either check fails, before the result is returned. This also makes both rules directly unit-testable without an LLM call.

**Reference ID generated deterministically, not by the LLM.**
A Code node (not the agent) generates `referenceId` for every completed conversation (e.g. a timestamp-based or random short ID), so it's always present in the structured result, collision-free, and never hallucinated. Whether it appears in the complainant-visible closing message text is a separate, conditional decision (surfaced only for `legitimate` or escalated conversations, per `customer-messaging` spec) — the field exists in `result` regardless of label, matching the handoff's JSON schema.

**Prompt-injection resistance: framing + deterministic backstops, not prompting alone.**
The system prompt explicitly frames complainant text as information about the complaint, never as instructions to the agent (FR-3.4). This is reinforced, not replaced, by the deterministic checks above: an injection attempt that tries to force `legitimate` with high stated confidence still gets caught by the product/field checks where applicable. Full injection resistance also depends on the test suite (Change 3, TR-3) to measure it, since prompting alone can't be proven correct.

**Model: Anthropic Chat Model node, version 1.6, `resourceLocator` in list mode.**
Confirmed via the setup checks that this node version calls Anthropic's live Models API through the credential, so the model list reflects what's actually available rather than a stale hardcoded set. A current Sonnet-class model is the default for `classifier-core` — this task requires nuanced judgment (escalation triggers, tone, injection resistance), not just cheap text classification, so Haiku-class is passed over for quality; Opus-class is passed over as unnecessary cost for a text-in/JSON-out task with a confidence-threshold safety net. Low temperature, per the handoff.

**Failure handling: a dedicated fallback branch, not a thrown error.**
If the Structured Output Parser fails to parse the agent's output (after the parser's own auto-fix retry), the complainant must not see a raw error, and the failure must always be recorded (PRD: "never fail silently"). **Implemented via the `Classify` (AI Agent) node's `onError: continueErrorOutput`** rather than a separate If node checking a parser-failure flag: a parser failure surfaces as the Agent node's own error, so routing the Agent's error output (index 1) to a fixed, non-LLM fallback branch achieves the same thing with one fewer node. That branch produces an apologetic `reply`, `done: true`, `result.label: unknown`, `unknownReason: insufficient_info`, and the failure noted in `reasons`, then rejoins the same `Finalize Result` node the success path uses.

**LLM-facing schema is flat; `classifier-core`'s external contract is not.**
Discovered during implementation: nesting the agent's entire structured output under a `result` key (matching the handoff's documented shape exactly) made Claude intermittently omit required fields, and the Structured Output Parser silently returned `{}` with no error in that case — a bad failure mode, and not one `autoFix` catches if the schema itself is the problem. The Structured Output Parser's JSON schema is now flat (`reply`, `done`, `label`, `confidence`, ... all at the top level); the `Finalize Result` Code node re-nests these into `{ reply, done, result: {...} }` before returning. The external contract — what `chat.workflow.ts`, and later Change 3's test harness, call and receive — is unchanged.

**Workflow boundary: `Execute Workflow` node, not inline logic.**
`chat.workflow.ts` calls `classifier-core` as a sub-workflow via `Execute Workflow`, passing `{ sessionId, message, config }` and returning its `{ reply, done, result }` unchanged. This is the seam Change 3's test harness will call directly.

## Risks / Trade-offs

- **Simple Memory is in-process** → conversation state doesn't survive an n8n restart mid-conversation. Mitigation: acceptable for a one-day local demo; documented as a PRD §9 next step (persistent memory).
- **LLM-based tone/escalation detection varies run-to-run** → Mitigation: low temperature; confidence threshold forces `unknown` when the agent itself is unsure; Change 3's test suite measures pass rates rather than expecting exact determinism.
- **Dynamic model discovery (resourceLocator "list" mode) needs live connectivity in the n8n UI to populate the dropdown** → Mitigation: pin a concrete, known-good model ID in the `.workflow.ts` source (not just "whatever the dropdown shows today"), so the workflow runs correctly even if the UI can't refresh the list.
- **Deterministic backstops only cover checks that are pure data comparisons** (confidence, product list) → they don't make escalation or tone detection deterministic; those remain LLM judgment calls, covered by Change 3's test suite instead.
- **Deeply nested required fields in a Structured Output Parser schema can make the model silently omit one, with no thrown error** (observed: the parser returned `{}` rather than failing loudly) → Mitigation: kept the LLM-facing schema flat; any future change to this schema should stay flat and be smoke-tested against a live model before assuming the deterministic-backstop safety net is reachable at all.

## Migration Plan

Greenfield — no existing workflows or data to migrate. Both workflow files are created, validated (`n8nac skills validate`), and pushed to the Local n8n instance (`n8nac push --verify`). Rollback is `git revert` on the `.workflow.ts` files followed by `n8nac push` of the reverted version, or re-`n8nac pull` from the instance if the UI was used to undo a change.
