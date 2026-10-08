# CLAUDE.md

Conventions for working in this repo. `docs/PRD.md` is the source of truth for
*behaviour*; this file is the source of truth for *process and known gotchas*.

## Conventions

- PRD is the source of truth for behaviour. If an implementation detail here
  would imply changing the PRD, stop and ask Christian rather than deciding
  alone.
- Always `n8nac pull <id>` before editing a workflow (Christian may have
  edited in the UI). Validate (`n8nac skills validate`), push `--verify`,
  then test live after every edit.
- Never change a reviewed test case's expected outcome to make it pass.
  Flag it to Christian instead.
- Agents have no tools: no Execute Command node, no custom Docker image.
  Don't add any.
- No secrets in tracked files; env vars only (`.env`, gitignored). Test data
  is synthetic.
- Commit after each working step; don't push to GitHub without asking.
- Keep an eye on time: flag at once if a must-have is at risk.
- Prefer testing live over guessing at n8n node schemas — `n8nac skills
  node-info <node>` for parameters, a throwaway webhook→Execute-Workflow
  probe (create, test, delete) for behaviour you can't find documented.

## Known n8n gotchas

These cost real debugging time once; they shouldn't cost it twice.

- **An AI Agent node (with `hasOutputParser: true`) replaces `$json` entirely
  with `{ output: {...} }` on success, or `{ error }` on its error output —
  it does NOT merge or preserve the fields that went into it.** Any node
  downstream of an Agent node that needs the *original* input (e.g. a
  `config` object, routing metadata, a computed index) must recover it via
  `$('Upstream Node Name').item.json`, never by reading `$input.first().json`
  and assuming the input fields survived. This caused `classifier-core`'s
  `Finalize Result` node to silently fall back to default `products` and
  `confidenceThreshold` regardless of what was actually configured — found
  and fixed during Change 2, when a deliberately out-of-range
  `confidenceThreshold: 0.99` test failed to force an `unknown` label. It was
  masked in earlier manual testing because the Agent's *own* system prompt
  correctly read `$json.config` at its own invocation (evaluated before the
  Agent runs, on its unmodified input) — only the deterministic
  *post-processing* Code node after it was affected.
- **A Data Table node's `insert` operation output contains only the inserted
  row's own columns** — any other field on the item is stripped, not passed
  through. Confirmed with a throwaway probe workflow. Same fix as above:
  recover anything else via `$('Node Name').item.json` if a later node needs
  it.
- **Structured Output Parser, `schemaType: 'manual'`, uses the `inputSchema`
  field — not `jsonSchema`.** `jsonSchema` is a legacy v1.1-only field; using
  it on a newer parser version silently does nothing (the schema is ignored,
  no error).
- **`autoFix: true` on a Structured Output Parser requires its own
  `ai_languageModel` connection**, separate from the agent's own model
  connection, or it throws "A Model sub-node must be connected and enabled."
  Reuse the same model node for both connections — no need for two.
- **Deeply-nested required JSON schemas make Claude intermittently drop
  fields with no thrown error** (observed: the parser silently returned
  `{}`). Keep any LLM-facing Structured Output Parser schema flat; if the
  external contract needs nesting, re-nest it in a deterministic Code node
  *after* the parser, not in the schema itself.
- **Prefer `Switch` in `mode: 'expression'` with a precomputed index from a
  dedicated Code node over hand-authored `mode: 'rules'` filter-condition
  JSON.** The rules/filter JSON shape is easy to get subtly wrong and hard to
  validate before a live test; a Code node computing a plain integer index is
  easier to read, review, and unit-reason about.
- **Docker bridge networking is broken on this host** — `docker-compose.yml`
  uses `network_mode: host` with `N8N_LISTEN_ADDRESS=127.0.0.1` instead of a
  `ports:` mapping.
- **Failure handling uses the Agent node's `onError: continueErrorOutput`**,
  not a separate `If` node checking a parser-failure flag — a parser failure
  surfaces as the Agent node's own error, so routing its error output
  (index 1) to a fixed, non-LLM fallback branch is one node fewer.
