# Proposal

## Why

Change 1 produces a structured, explainable classification but does nothing with it: every conversation ends and the result evaporates. Before this exercise's brief ("classifies each complaint as legitimate or not, then does **something** with the classified complaint") is satisfied, classified complaints need to land somewhere visible with the information a human would need next, and legitimate complaints need the category/priority/draft-reply judgment a human triage step would otherwise supply.

## What Changes

- Add `router.workflow.ts` as a callable sub-workflow (input: classifier-core's `{ reply, done, result }` output, plus `config`) that:
  - deterministically routes on `result.label` and `result.escalate` per PRD FR-7.1 (a Switch node, not prompted judgment): `legitimate` not escalated → `complaints_register`; `legitimate` escalated → `complaints_register` **and** `review_queue`; `unknown` (any) → `review_queue`; `not_legitimate` escalated → `review_queue`; `not_legitimate` not escalated → `not_legitimate_log`;
  - for `legitimate` complaints only, runs a routing agent (AI Agent + structured output, no tools) that adds `category` (`claims` / `billing` / `customer_service` / `policy_admin`), `priority` (`urgent` / `standard`, urgent when financial hardship, safety, vulnerability, or long unresolved delay is present), and an `acknowledgementDraft` — a formal, tone-matched message sharing the `customer-messaging` tone rules and prohibitions, for a human to review and send;
  - writes the routed record(s) to the appropriate n8n Data Table(s);
  - returns `{ referenceId, routes: [...], category?, priority? }` so Change 3's test harness can assert on routing outcomes without re-deriving them.
- Create the three n8n Data Tables this change writes to — `complaints_register`, `review_queue`, `not_legitimate_log` — with the columns from PRD §6.8. Data Tables are confirmed available on this n8n version and creatable via the n8n REST API (`POST /api/v1/data-tables`), verified live against the running instance; creation is a one-off setup step for this change (a `scripts/` helper script, not a workflow node), not yet part of an automatic bootstrap (Change 4).
- Update `chat.workflow.ts`: when `done == true`, call `router` via Execute Workflow **without waiting for completion** (`waitForSubWorkflow: false`), per FR-7.3 — the complainant sees the closing message immediately and doesn't wait on routing or table writes.

Out of scope for this change (later changes): the test harness and runner (Change 3, which will call `router` in wait mode to assert on its output), and automatic bootstrap of workflows/credential/tables (Change 4).

## Capabilities

### New Capabilities
- `complaint-routing`: deterministic routing of a finished classification to its destination(s) per label and escalation, and the routing agent's judgment (category, priority) for legitimate complaints — the "something" the brief asks the system to do with a classified complaint.
- `complaint-records`: what gets written where — the three Data Tables, their columns, and which routing outcomes write to which table(s).

### Modified Capabilities
- `customer-messaging`: extends the shared tone rules and FR-5.4 prohibitions (already governing the classifier's closing message) to the routing agent's acknowledgement draft (FR-5.2), which is tone-matched the same way but written for a human reviewer rather than shown directly to the complainant.

## Impact

- New file: `workflows/local/router.workflow.ts` (n8n-as-code source of truth), pushed to and pulled from the running Local n8n instance.
- Modified file: `workflows/local/chat.workflow.ts` — adds the fire-and-forget call to `router` after `done == true`.
- New Data Tables on the running instance: `complaints_register`, `review_queue`, `not_legitimate_log`.
- New setup script (e.g. `scripts/create-tables.ts` or `.sh`) that creates the three tables via the n8n API; re-runnable (should not fail or duplicate if a table already exists).
- Uses the existing `anthropicApi` credential already created in that instance (routing agent's Anthropic Chat Model node).
- No changes to `classifier-core.workflow.ts`'s external contract — `router` consumes its existing `{ reply, done, result }` shape unchanged.
