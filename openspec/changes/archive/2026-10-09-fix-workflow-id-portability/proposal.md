# Proposal

## Why

The README's Quick Start step for loading the four workflows onto the n8n instance is unreliable on a fresh or wiped instance, and this isn't hypothetical: it was reproduced live, twice, this session by deleting all four workflows and re-running the Quick Start. `chat.workflow.ts` and `test-harness.workflow.ts` each have two Execute Workflow nodes ("Call Classifier Core", "Call Router") that reference `classifier-core`/`router` by a hardcoded workflow ID. n8n never lets a caller choose a workflow's ID on creation — not via `n8nac push`'s create-fallback, and (same underlying n8n create path) not via importing JSON either — so a fresh `classifier-core`/`router` gets a brand-new ID the hardcoded references don't know about, and activating `chat` or `test-harness` fails with "references workflow X which is not published." This blocks a reviewer following the README from scratch, and blocks Christian from ever resetting his own Local n8n volume without a bespoke manual recovery.

A first fix (a script that resolves the new IDs after push and writes them back into the tracked `.workflow.ts` files) was built and proven to work end-to-end this session, but was rejected: it bakes resolved, instance-specific IDs into git-tracked source that's supposed to be environment-agnostic, so every reset produces permanent, meaningless git diff churn. This proposal replaces that approach with one that never writes resolved IDs into tracked source.

## What Changes

- A deploy mechanism (script) that, after loading `classifier-core.workflow.ts` and `router.workflow.ts` onto the instance with `n8nac push`, resolves their current workflow IDs from the live instance and ensures `chat`'s and `test-harness`'s "Call Classifier Core"/"Call Router" Execute Workflow nodes point at them — **without** writing the resolved IDs back into the git-tracked `.workflow.ts` files. The exact write-path (e.g. a direct, out-of-band API correction after a normal `n8nac push`, vs. another mechanism) is decided in `design.md`; the constraint that tracked source stays untouched is not up for revisiting without Christian's sign-off, since it's the specific failure mode this proposal exists to fix.
- `workflows/local/*.workflow.ts`, loaded with `npx n8nac push <file>.workflow.ts --verify`, is the **only** documented way to get the four workflows onto the instance. Those files are this project's single source of truth (per `CLAUDE.md`). `n8n-export/*.json` is a generated export artifact (`scripts/export.sh`) for reviewers who want to inspect the JSON — it is **not** an import path, and the README must not present it as an alternative way to load the workflows. **BREAKING** (to the current README): the existing Quick Start's "Import the four workflows from `n8n-export/*.json`" step and its paired "reattach credentials on the imported workflows" step are removed outright, not kept as a fallback.
- The README's Quick Start workflow-loading and activation steps are rewritten around `n8nac push` + this new script, replacing the old manual "reattach credentials" / "activate all four" steps.
- `CLAUDE.md`'s known-gotchas list gains an entry documenting why hardcoded Execute Workflow references don't survive workflow recreation, so this isn't rediscovered a third time.
- Out of scope: true multi-environment promotion (`n8nac promote` between distinct dev/stage/prod-style environments). This project is single-environment (Local only, per `openspec/config.yaml`); the scenario in scope is the one n8n instance being wiped and rebuilt from zero, repeatedly — not deployment to a second, concurrently-existing environment. Also out of scope: the broader zero-touch `add-auto-bootstrap` item (credential creation, Data Table creation, and activation triggered automatically by `docker compose up`) — this proposal only fixes the workflow-loading step's correctness; it doesn't attempt full unattended bootstrap. Also out of scope: credential ID portability — creating the Anthropic and webhook credentials is unchanged from the current manual-UI-and-script steps.

## Capabilities

### New Capabilities
- `workflow-deployment`: the four n8n workflows (`chat`, `classifier-core`, `router`, `test-harness`) can be loaded or reloaded onto the project's single n8n instance, from any starting state (empty, partially populated, or already up to date), ending with all cross-workflow Execute Workflow references correct and all four active — without manual ID editing in the n8n UI or in tracked source files, and without ever needing anything other than the git-tracked `.workflow.ts` source as the load input.

### Modified Capabilities
(none — this change is about deployment mechanics, not complaint-handling behavior; no existing `complaint-*` capability's requirements change)

## Impact

- `README.md`: Quick Start section's workflow-loading step (JSON-import path and its credential-reattachment step removed entirely, not just reordered) and the activation step. The pre-existing process-summary line describing `n8n-export/*.json` as "a generated convenience for reviewers who don't want to set up n8nac" is also corrected — it's a generated export artifact, not an import path, regardless of n8nac availability.
- `CLAUDE.md`: new known-gotcha entry.
- `scripts/`: new deploy script implementing the mechanism design.md settles on.
- No change to any workflow's classification, routing, messaging, or records logic — only to how the existing Execute Workflow node parameters get set correctly at deploy time, and to how the workflows are loaded onto an instance in the first place.
