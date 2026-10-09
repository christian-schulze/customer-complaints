# Tasks

## 1. Confirm Merge node behavior live

- [x] 1.1 Pull `chat.workflow.ts` (`n8nac pull chat.workflow.ts`) to pick up any UI edits since last pull, and verify the pulled file matches what's currently live before changing anything. Done: pulled by live ID (`s3dRuSXpeqfkOc9b` - the tracked `@workflow`/`workflowId` values had drifted from a prior reload, which the pull corrected; see `design.md` Migration Plan note 1).
- [x] 1.2 Build a throwaway probe workflow (Webhook trigger -> two branches with different artificial delay -> `Merge` node -> `Set` node) to confirm which `Merge` `mode`/`output` setting (a) waits for all inputs before firing and (b) preserves one branch's fields untouched in the output item. Test live, record the confirmed settings, then delete the probe workflow. Done: two rounds of probing (see `design.md` Context/Risks) - first confirmed `chooseBranch`/`waitForAll` semantics on two always-firing branches, second (closer to the real shape) revealed the actual mechanism is structural ordering, not a timing race, and that plain `mode: 'append'` is sufficient for `Done Check`'s mutually-exclusive outputs. Both probe workflows (and the throwaway sub-workflow) deleted from the live instance and from `workflows/local/` afterward.

## 2. Rewire chat.workflow.ts

- [x] 2.1 Add a `Merge` node to `chat.workflow.ts` configured with the settings confirmed in 1.2, and rewire `Done Check`'s two outputs (the not-done branch direct, the done branch via `Call Router`) into its two inputs, then `Merge -> Format Chat Response`, per `design.md` - Decisions. Verify by reading the updated routing map/connections in the file and confirming `Format Chat Response` has no incoming connection directly from `Call Classifier Core` anymore. Done: `Merge` node (`mode: 'append', numberInputs: 2`) added; `Format Chat Response` now reads from `Merge.out(0)` only.
- [x] 2.2 `n8nac skills validate` on `chat.workflow.ts` and fix any reported schema errors. Verify by a clean validate run. Done: "✅ Workflow is valid!"
- [x] 2.3 `n8nac push chat.workflow.ts --verify`. Verify by the push command reporting success and the live workflow's node graph matching the local file. Done: pushed and verified, "Fetched \"Complaints Chat\" (7 nodes)".

## 3. Live verification

- [x] 3.1 Run one conversation through to a `legitimate` classification, via direct POST to the Chat Trigger's production webhook (the same endpoint and payload shape the hosted chat page itself calls - `{action: "sendMessage", sessionId, chatInput}`). Verify the response is the closing message text (with a reference ID), not raw JSON. Done: response was `{"output":"...Your reference number is CMP-MV0I9Z1E-70ZX..."}` - clean, no `reply`/`done`/`result` fields leaking through.
- [x] 3.2 Same method, one conversation reaching `escalate: true`. Verify the response is closing text mentioning human follow-up, not raw JSON. Done: response was `{"output":"...a person will be in touch with you to follow up on this as a priority."}` with a reference ID - clean.
- [x] 3.3 Run `npm test` and confirm it still passes at the existing TR-5 bar. Verify by the reported overall accuracy/escalation-miss numbers: expected unchanged, since `test-harness.workflow.ts` doesn't exercise `chat.workflow.ts`'s `Chat Trigger` at all (see `proposal.md` - Impact) - this run is a regression check on the unrelated sub-workflows, not evidence for or against this fix. Done: PASS, 100.0% overall accuracy (12/12 reviewed runs), 0 escalation misses, 0 `legitimate`→`not_legitimate` misclassifications.

## 4. Commit

- [ ] 4.1 Commit the updated `chat.workflow.ts` and this change's artifacts together, after Christian's review per `CLAUDE.md`. Verify by `git log` showing the commit and `git status` clean.

## Workflow follow-up

- Archive this change after Christian reviews and the live verification in section 3 is confirmed.
- `openspec sync specs` / archive will fold the `customer-messaging` delta scenario into the main spec - verify the archived spec reads correctly afterward.
