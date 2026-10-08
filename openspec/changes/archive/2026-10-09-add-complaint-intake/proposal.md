# Proposal

## Why

The complaints chat currently doesn't exist. Before any routing or records work can happen (Change 2), the system needs a chat surface that collects enough information from a complainant and turns a conversation into a structured, explainable classification — the core judgment the rest of the pipeline depends on.

## What Changes

- Add a `Config` node (insurer name, product list, max follow-ups, confidence threshold) that the chat and classifier prompts read via expressions.
- Add `chat.workflow.ts`: a Chat Trigger (hosted chat) that introduces the assistant for the configured insurer, calls the classifier-core sub-workflow each turn, and returns either the next question or the closing message.
- Add `classifier-core.workflow.ts` as a callable sub-workflow (input: `sessionId`, `message`, `config`) containing an AI Agent + Anthropic Chat Model + per-session memory + Structured Output Parser that:
  - asks for required fields (insurance type, what happened, roughly when, desired outcome), asks about the optional policy/claim number once, and asks once whether the complainant wants to leave contact details (opt-in, never re-asked after a "no");
  - stops asking after `maxFollowUps` and classifies with whatever it has;
  - never asks for information already given, and never lets complainant text act as an instruction to the classifier (prompt-injection resistant by construction, not just by prompting);
  - outputs `label` (`legitimate` / `not_legitimate` / `unknown` + reason), `confidence`, `reasons`, `summary`, `extracted` fields, `escalate` + `escalationReason`, and `customerTone`;
  - applies the confidence-threshold rule (label forced to `unknown`/`ambiguous` below `confidenceThreshold`) in a node after the agent, not only via the prompt, so it's deterministic and testable;
  - produces a tone-matched closing message (shown immediately in chat) following the shared tone rules, including a reference ID for `legitimate` and escalated complaints;
  - never fails silently: on parser or model failure, apologises and returns `label: unknown` / `ambiguous` with the failure noted.

Out of scope for this change (later changes): deterministic routing and the routing agent, Data Table writes, the test harness/runner, and automatic bootstrap.

## Capabilities

### New Capabilities
- `complaint-config`: the single configuration surface (insurer name, product list, max follow-ups, confidence threshold) that drives prompts and thresholds without hardcoding or prompt edits.
- `complaint-intake`: the chat conversation itself — session handling, the agent's self-introduction, and turn-by-turn information collection (required fields, one-time optional fields, opt-in contact details, the follow-up limit).
- `complaint-classification`: turning a finished conversation into a structured, explainable result — label, confidence threshold enforcement, escalation flag, customer tone, extracted fields, and injection resistance.
- `customer-messaging`: tone-matched, rule-bound customer-facing message content. This change covers the classifier's closing message; Change 2 (`add-routing-and-records`) will extend this capability with the routing agent's acknowledgement draft, which shares the same tone rules and prohibitions.

### Modified Capabilities
(none — greenfield project, no existing specs)

## Impact

- New files: `workflows/local/chat.workflow.ts`, `workflows/local/classifier-core.workflow.ts` (n8n-as-code source of truth), pushed to and pulled from the running Local n8n instance at `http://localhost:5678`.
- Uses the existing `anthropicApi` credential already created in that instance.
- No Data Table writes yet (Change 2) and no test harness yet (Change 3) — classifier-core is built as a callable sub-workflow specifically so Change 3 can call the exact same thing the chat does.
- No changes to existing specs (none exist yet).
