# Design

## Context

See `proposal.md` - Why for the bug mechanism. Current `chat.workflow.ts` routing:

```
Chat Trigger -> Config -> Call Classifier Core -> Format Chat Response
                                                 -> Done Check -.out(1)-> Call Router
```

`Chat Trigger.options.responseMode` is `'lastNode'`. Checked via `n8nac skills node-info`: the Chat Trigger node (`@n8n/n8n-nodes-langchain.chatTrigger`) exposes no documented `responseNode`-style mode paired with a dedicated respond node the way the generic `n8n-nodes-base.webhook` node does with `n8n-nodes-base.respondToWebhook` — that pairing is documented only for the plain Webhook node. So the fix works within `lastNode` semantics rather than switching response modes to something unverified for hosted chat.

**Verified mechanism (live probe, not the wall-clock race originally assumed in `proposal.md`):** built a probe mirroring this exact shape (`Webhook -> Switch[2 mutually-exclusive outputs] -> {direct Set} | {Set -> Execute Workflow (waitForSubWorkflow: false)} -> Merge`). Both branches returned in ~0.07s - `Call Router`'s `waitForSubWorkflow: false` setting means it does not wait on the sub-workflow at all, and its own node output is simply its own input passed through unchanged (confirmed: the probe's "done" branch returned the exact fields set immediately before the Execute Workflow node, not anything from the 2-second-delayed sub-workflow). So the bug is not a timing race `Call Router` sometimes loses - it is structural: under `executionOrder: 'v1'`, `Call Router` is one hop further from the branch point than `Format Chat Response`, so it is always scheduled and finishes after `Format Chat Response`, deterministically, every time `done: true`. Its output - the raw item that reached `Call Router` (i.e. `Call Classifier Core`'s full `{reply, done, result}` object, since `Call Router` passes it through unchanged) - is what `responseMode: 'lastNode'` returns, which is exactly the raw-JSON symptom reported.

## Goals / Non-Goals

**Goals:**
- `Format Chat Response`'s output is what the hosted chat page displays on every turn, whether or not `Call Router` fires on that turn.
- No change to `classifier-core.workflow.ts`, `router.workflow.ts`, `test-harness.workflow.ts`, or the `reply`/`done`/`result` contract between workflows.
- No change to closing-message content, tone, or reference-ID logic.

**Non-Goals:**
- Switching `Chat Trigger`'s response mode away from `lastNode` (unverified for hosted chat; out of scope for a routing-order fix).
- Making `Call Router`'s own completion observable to the complainant (it already isn't, and shouldn't be - FR-5.1 requires the closing text, not routing status).

## Decisions

**Force sequential ordering with a `Merge` node (mode `append`) so `Format Chat Response` always runs after both `Done Check` outcomes are settled.**

New routing:
```
Call Classifier Core -> Done Check -.out(0) (not done) -----------> Merge.in(0)
                                     .out(1) (done) -> Call Router -> Merge.in(1)
Merge -> Format Chat Response
```

Concretely: both `Done Check` outputs feed a `Merge` node (one input per branch), and `Call Router` sits between `Done Check.out(1)` and `Merge.in(1)` so the merge can't fire until `Call Router` has actually finished. `Merge` is configured `mode: 'append', numberInputs: 2` - plain append, not `chooseBranch`. This is sufficient (and verified live, see Context) because `Done Check`'s two outputs are mutually exclusive: on any given execution, exactly one of `Merge`'s two inputs ever receives an item, so "append" naturally yields that one item with no risk of duplicating or needing to pick a branch. No data-recovery step is needed either: because `Call Router`'s `waitForSubWorkflow: false` setting makes it pass its own input through unchanged, the item that reaches `Merge.in(1)` already carries `Call Classifier Core`'s original `reply`/`done`/`result` fields intact. `Format Chat Response` moves to read from `Merge`'s output instead of directly from `Call Classifier Core`, keeping its existing `output = {{ $json.reply }}` expression unchanged.

This makes `Format Chat Response` structurally the only node downstream of the merge point, so under `responseMode: 'lastNode'` it is unambiguously last on every turn, regardless of whether `Call Router` fires.

**Alternatives considered:**
- *Do nothing, rely on `Call Router` usually finishing fast* - rejected; the live probe showed this isn't actually a timing coincidence at all, it's a deterministic structural ordering under `executionOrder: 'v1'` - `Call Router` is *always* scheduled after `Format Chat Response` when `done: true`, so this fails every single time, not intermittently.
- *`Merge` `mode: 'chooseBranch'`* - unnecessary once the branches were confirmed mutually exclusive; `chooseBranch` would add a `useDataOfInput` choice that implies picking between two live candidates, but only one branch is ever populated per run, so plain `append` is simpler and does the same thing.
- *Give `Call Router` its own fire-and-forget branch disconnected from the response path entirely (e.g. trigger it from a Webhook-called sibling workflow instead of inline)* - larger structural change than needed, and loses the existing single-`Execute Workflow`-node simplicity the rest of the project favors (see `CLAUDE.md`'s `Switch`/Code-node-over-rules-JSON preference for a similar "prefer the smaller, more legible structure" precedent).

## Risks / Trade-offs

- **[Risk]** `Merge` node behavior for mutually-exclusive upstream branches (whether it hangs waiting for the branch that never fires, what data survives) is exactly the kind of n8n node-schema detail `CLAUDE.md` warns against guessing at → **Mitigated**: verified live with two throwaway probe workflows mirroring this exact shape (Switch with 2 mutually-exclusive outputs, one branch through an `Execute Workflow (waitForSubWorkflow: false)` node, into a `Merge`). Confirmed `mode: 'append'` returns promptly on both branches (no hang) and the returned item is exactly the one branch's unmodified data. Probes created, tested, and deleted (both remote workflows and local `.workflow.ts` files) before this design was finalized.
- **[Risk]** `test-harness.workflow.ts` already serializes `Call Router` before its own final response node (confirmed by reading its routing), so `npm test` cannot detect this bug or regress on this fix → **Mitigation**: verification for this change is a live manual chat conversation (one `legitimate` case reaching a reference ID, one `escalate: true` case), not `npm test`; call this out explicitly in `tasks.md` so it isn't mistaken for "covered by the existing suite."
- **[Trade-off]** Adding a `Merge` node increases `chat.workflow.ts`'s node count by one and its routing by one hop. Accepted: the alternative (relying on execution order happening to favor `Format Chat Response`) is the bug itself, and was shown to fail deterministically, not intermittently.

## Migration Plan

1. `n8nac pull` `chat.workflow.ts` by its live workflow ID (pick up any UI edits made since last pull). Note: the live instance's workflow/sub-workflow IDs had already drifted from what was last committed (`chat`/`classifier-core`/`router` all got new IDs on a prior reload) - pulling updates the `@workflow`/`workflowId` values in the tracked file to match current reality, which is expected and gets committed alongside this change's edits, not treated as unwanted churn.
2. Build and run the throwaway `Merge` probes (done - see Risks above); confirm `mode: 'append'` behavior; probes deleted.
3. Edit `chat.workflow.ts`: add the `Merge` node, rewire `Done Check`'s two outputs and `Call Router` into it, rewire `Merge -> Format Chat Response`.
4. `n8nac skills validate`, then `n8nac push chat.workflow.ts --verify`.
5. Live-test via the hosted chat URL: one conversation ending `legitimate` (expect closing text with reference ID, not JSON), one ending `escalate: true` (expect closing text mentioning human follow-up, not JSON).
6. Commit.

Rollback: revert the commit and `n8nac push --verify` the prior `chat.workflow.ts`; no data migration or other workflow is touched, so rollback is a single-file revert.
