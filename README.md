# Insurance Complaint Triage Chat

*This README is a stub. The full write-up (what it is, architecture, quick start, design decisions, scope & trade-offs, how it was built) is a Change 3 deliverable per `n8n-agent-pipeline-handoff.md` §4/§7. Only the production-considerations note below has been added so far, flagged ahead of schedule at Christian's request.*

## Production considerations

- **Inline JavaScript in n8n Code nodes isn't modular.** `workflows/local/classifier-core.workflow.ts`'s `Finalize Result` and `Build Failure Result` nodes hold their logic as plain JS strings in the `jsCode` field. n8n Code nodes run as an isolated script inside n8n itself — there's no module system at runtime, so this code can't `import` from a separate file the way normal application code would. For a one-off ~40-line deterministic check this is fine, but it doesn't get type-checking, linting, or unit tests of its own, and any shared logic between nodes has to be duplicated or copy-pasted. In a production build, extract this logic into small standalone, tested files (e.g. `workflows/local/lib/finalize-result.js`) and either keep the `jsCode` string in sync with a documented pointer back to the source file, or add a small build step that inlines the module into the workflow file before `n8nac push`.
