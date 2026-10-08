# Handoff: Insurance Complaint Triage Chat (technical + process)

You're picking up a project designed in a separate planning session. Two documents drive it:

- **`docs/PRD.md`**: *what* we're building and *why*: requirements, scope, priorities, test criteria. It is the source of truth for behaviour.
- **This document**: *how*: technical decisions, architecture, tooling, and the build process.

Read both fully before doing anything. If they appear to conflict, stop and ask me (Christian).

**Time budget: one working day.** Follow the build order in PRD §9 strictly. When a should-have or the bootstrap is at risk, tell me early rather than rushing.

---

## 1. Technical decisions (don't relitigate)

- **Runtime agents are native n8n AI nodes**: AI Agent + Anthropic Chat Model + memory + Structured Output Parser. **Not Claude Code.** The chat takes untrusted public input, and classification is text-in/JSON-out with no tools needed. **Agents have no tools.** No Execute Command node, no custom Docker image.
- **n8n-orchestrated.** The workflow graph controls the flow; LLMs only make judgments inside nodes.
- **Workflows as code via n8n-as-code (`n8nac`).** `.workflow.ts` files are the source of truth; sync is explicit (pull/push). Prompts live inline in the workflow files.
- **Classifier core is a sub-workflow** called by both the chat workflow and the test harness, so tests exercise exactly what users talk to.
- **Records go in n8n Data Tables** (verify availability first; see PRD §12).
- **Single environment: Local**, Docker on my Linux laptop, `http://localhost:5678`. My separate instance at `n8n.cmonkey.me` is **not** used for this project.
- **Spec-driven with OpenSpec** (§4).

## 2. Repo layout

```
.
├── README.md
├── CLAUDE.md
├── .gitignore
├── .env.example                  # ANTHROPIC_API_KEY, N8N_API_KEY, TEST_WEBHOOK_SECRET
├── docker-compose.yml            # official n8n image, pinned version
├── package.json                  # test runner + scripts
├── docs/
│   └── PRD.md
├── openspec/                     # created by `openspec init`
├── workflows/local/              # *.workflow.ts (n8nac source of truth)
│   ├── chat.workflow.ts
│   ├── classifier-core.workflow.ts
│   ├── router.workflow.ts
│   └── test-harness.workflow.ts
├── n8n-export/                   # importable JSON exports for reviewers
├── scripts/                      # export script; bootstrap (last)
└── tests/
    ├── cases/scripted/*.json
    ├── cases/simulated/*.json    # should-have
    ├── runner/                   # TypeScript
    └── reports/                  # gitignored
```

## 3. Architecture

### chat.workflow.ts
```
Chat Trigger (Hosted Chat, response mode: When Last Node Finishes)
  → Config node (insurerName, products, maxFollowUps, confidenceThreshold)
  → Execute Workflow: classifier-core { sessionId, message, config }
  → done == false → return reply
  → done == true  → Execute Workflow: router (don't wait for completion)
                  → return closingMessage
```
All complainant-facing replies come from this top-level workflow (the Chat / "Respond to Chat" node doesn't work in sub-workflows).

### classifier-core.workflow.ts
- Input: `{ sessionId, message, config }`. Memory keyed on `sessionId` (Simple Memory for now).
- Low temperature. Structured Output Parser enforcing:

```json
{
  "reply": "next question or closing message",
  "done": false,
  "result": null
}
```
When `done` is true, `reply` is the tone-matched closing message and `result` is:
```json
{
  "referenceId": "string",
  "label": "legitimate | not_legitimate | unknown",
  "unknownReason": "insufficient_info | ambiguous | null",
  "confidence": 0.0,
  "reasons": ["..."],
  "summary": "...",
  "extracted": {
    "insuranceType": "...", "whatHappened": "...", "when": "...", "desiredOutcome": "...",
    "policyOrClaimNumber": null,
    "contact": null
  },
  "escalate": false,
  "escalationReason": null,
  "customerTone": "angry | distressed | confused | neutral",
  "transcript": []
}
```
- Enforce the confidence-threshold rule (PRD FR-3.2) in a node after the agent, not only in the prompt, so it's deterministic and testable.
- On parser or model failure, apologise, and set `label: unknown` / `ambiguous` with the failure noted. Never fail silently.

### router.workflow.ts
- Switch per PRD FR-7.1 → Data Table inserts.
- The routing agent (AI Agent + structured output) runs on `legitimate` complaints only, producing `category`, `priority`, and `acknowledgementDraft`.
- Returns `{ referenceId, routes: [...], category?, priority? }` for tests.

### test-harness.workflow.ts
- Webhook protected by header auth (`TEST_WEBHOOK_SECRET`).
- `{ sessionId, message, config? }` → classifier-core → when done, also runs the router **in wait mode** and returns classifier output + router output together. Optionally writes to separate test tables, or skips table writes when a `dryRun` flag is set, so tests don't pollute the demo data.
- If `config` is supplied, it overrides the defaults (enables future config-override tests).

## 4. Process: OpenSpec + n8n-as-code

### Setup (part of Change 1's preparation; no spec ceremony)
1. Basic `docker-compose.yml` (n8n pinned to a recent stable version, port bound to `127.0.0.1:5678`, named volume for `/home/node/.n8n`, execution pruning on). `docker compose up -d`. I create the owner account, the n8n API key and the Anthropic credential in the UI.
2. n8n-as-code:
   ```
   /plugin marketplace add https://github.com/EtienneLescot/n8n-as-code
   /plugin install n8n-as-code@n8nac-marketplace
   ```
   ```bash
   npx --yes n8nac env add Local --base-url http://localhost:5678 --workflows-path workflows/local
   printf '%s' "$N8N_API_KEY" | npx --yes n8nac env auth set Local --api-key-stdin
   npx --yes n8nac env use Local
   npx --yes n8nac update-ai
   ```
3. OpenSpec: `npm install -g @fission-ai/openspec@latest` if needed, then `openspec init` with Claude Code as the tool. Put the technical decisions from §1 into OpenSpec's project context/config. Copy `PRD.md` into `docs/`.
4. **Verify Data Tables** are available on this n8n version, and check the n8n Anthropic Chat Model node's supported models. Report both before Change 1.

### Changes

Keep it to these **four coarse changes**; more ceremony than this won't fit the day. For each change:

1. `/opsx:propose`, drawing on the referenced PRD sections. Spec scenarios should map one-to-one to test cases where possible.
2. **Stop. I review the proposal.**
3. `/opsx:apply`.
4. Run tests.
5. `/opsx:verify`.
6. `/opsx:archive`.
7. Commit.

| # | Change | PRD refs | Priority |
|---|---|---|---|
| 1 | `add-complaint-intake` (config, chat, classifier core, escalation, tone, closing message) | §5, §6.1–6.6 | Must |
| 2 | `add-routing-and-records` (Switch, routing agent, Data Tables) | §6.7–6.8 | Must |
| 3 | `add-test-suite` (harness, runner, scripted cases; then simulated, judge, repeats if time allows) | §7 | Must → Should |
| 4 | `add-auto-bootstrap` (headless import, credential, tables, activation) | §9 "Last" | Droppable |

The README and JSON export are a must-have task attached to Change 3. Tell me when we reach them; don't leave them for after the bootstrap.

`/opsx:verify` can check structure but can't judge LLM behaviour. For classification and tone requirements, a passing `npm test` report is the evidence of verification.

### n8n-as-code loop (for every workflow edit)
```bash
npx n8nac pull <id>                         # always first; I may have edited in the UI
# edit .workflow.ts
npx n8nac skills validate <file>.workflow.ts
npx n8nac push <file>.workflow.ts --verify
npm test                                     # once the suite exists
```
Use `npx n8nac skills node-info <node>` to check node parameters instead of guessing.

### JSON export (must-have)
`scripts/export.sh` exports all project workflows from Local as JSON into `n8n-export/` (n8n CLI `export:workflow` via `docker compose exec`, or `n8nac convert` if it supports TS → JSON). Run it before every commit that changes workflows.

## 5. Test runner notes (details in PRD §7)
- TypeScript, `npm test`. Each case uses a fresh `sessionId` and talks turn by turn to the harness until `done` or out of turns ("ran out of turns" is a failure).
- Case format: `id`, `description`, `turns`, `expected` (any of `label`, `unknownReason`, `escalate`, `customerTone`, `routes`, `category`, `priority`), `tags`, `reviewed`.
- Only `reviewed: true` cases count. **I review generated cases before they count.**
- Report to terminal + `tests/reports/` (JSON + Markdown). Enforce TR-5 thresholds; exit non-zero on failure.
- Flags: `--tag`, `--case`, `--runs`.
- Should-haves: simulated cases (the runner calls the Anthropic API directly to play the complainant) and LLM-as-judge checks for FR-5.3 and FR-5.4.

## 6. CLAUDE.md conventions
- PRD is the source of truth for behaviour. If an implementation detail implies changing the PRD, ask me.
- Always `n8nac pull` before editing a workflow; validate, push `--verify`, test after.
- Never change a reviewed test case's expected outcome to make it pass. Flag it to me instead.
- Agents have no tools; don't add any.
- No secrets in tracked files; env vars only. Test data is synthetic.
- Commit after each working step; don't push to GitHub without asking.
- Keep an eye on time: flag at once if a must-have is at risk.

## 7. README outline (must-have)
1. What it is: two paragraphs on how it works and how to use it.
2. Architecture: a simple diagram of the workflows.
3. Quick start (bootstrap, if built) **and** manual setup: import the `n8n-export/` JSON, add the Anthropic credential, create the tables, activate the chat.
4. Running the tests.
5. Design decisions: native agents vs Claude Code at runtime; label vs escalation; where AI is used and where it isn't; tone rules.
6. **Scope & trade-offs**: in scope, out of scope with reasons, next steps (summarised from PRD §3 and §9, linking to `docs/PRD.md`).
7. Production considerations (PRD §10).
8. How it was built: PRD → OpenSpec changes (link to `openspec/`) → n8n-as-code → tests.

## References
- n8n-as-code: https://github.com/EtienneLescot/n8n-as-code (docs: https://n8nascode.dev/)
- OpenSpec: https://openspec.dev/ (docs: https://openspec.dev/docs)
- n8n Chat Trigger: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.chattrigger
