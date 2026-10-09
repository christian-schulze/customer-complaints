# Proposal

## Why

`chat.workflow.ts`'s Chat Trigger uses `responseMode: 'lastNode'`, which returns whatever node finishes executing last - not a designated "respond" node. On any turn where the conversation finishes (`done: true`), `Done Check` fires `Call Router` as a branch off the same node `Format Chat Response` branches from. Verified live (see `design.md` - Context) this is not a timing coincidence: `Call Router` is structurally one hop further from that branch point, so under `executionOrder: 'v1'` it is deterministically scheduled and finishes after `Format Chat Response` on every `done: true` turn, regardless of how fast its own sub-workflow call is. Because `Call Router` is fed directly from `Done Check` (not through `Format Chat Response`), its output is the full, unformatted classifier item (`{reply, done, result}`), and that raw object is what the hosted chat page displays - clobbering the intended closing message. Reproduced live by Christian via the hosted chat UI (the final step of the README quick start): a completed conversation returned raw JSON instead of the expected closing text. This directly violates `customer-messaging`'s existing "Closing message shown immediately" requirement, which this change exists to actually satisfy rather than redefine.

## What Changes

- Restructure `chat.workflow.ts`'s routing so `Format Chat Response` is unconditionally the last node to finish, regardless of whether `Call Router` fires on a given turn — `Call Router` must complete (or be skipped) before `Format Chat Response` runs, not race it. Exact node wiring (e.g. a `Merge` node joining both `Done Check` branches before `Format Chat Response`, vs. moving `Format Chat Response` after `Done Check` on both outputs) is decided in `design.md`, informed by a live probe of `responseMode: 'lastNode'` and `Merge` timing semantics rather than assumed.
- No change to `classifier-core.workflow.ts`, `router.workflow.ts`, or `test-harness.workflow.ts` — the `reply`/`done`/`result` contract between them is unaffected; this is purely `chat.workflow.ts`'s internal routing.
- No change to any closing-message *content* (tone rules, prohibited content, reference ID inclusion) — those are already correct per `customer-messaging`'s other requirements and are not in scope.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `customer-messaging`: "Closing message shown immediately" currently describes only the classifier's own output, not what the complainant's chat client actually receives. Adds a scenario making explicit that the chat response delivered to the complainant is always the closing message text, never a downstream node's raw output, even on turns where routing/escalation also runs.

## Impact

- `workflows/local/chat.workflow.ts`: routing between `Call Classifier Core`, `Format Chat Response`, `Done Check`, and `Call Router` changes; node count may grow by one (e.g. a `Merge` node) if that's the design chosen.
- Live n8n instance: requires `n8nac pull chat.workflow.ts` before editing (per `CLAUDE.md`, in case Christian edited in the UI since last pull), `n8nac skills validate`, `n8nac push --verify`, then a live test of at least one conversation that reaches `done: true` (ideally one `legitimate`/reference-ID case and one `escalate: true` case) to confirm the chat UI shows the closing text, not JSON.
- `tests/`: if the existing scripted suite's assertions only check `classifier-core`'s/`router`'s outputs directly (via `test-harness.workflow.ts`, bypassing `chat.workflow.ts`'s `Chat Trigger`/`responseMode` entirely), this bug and its fix may be invisible to `npm test` — flag this in `design.md` rather than altering any reviewed test case's expected outcome to compensate.
