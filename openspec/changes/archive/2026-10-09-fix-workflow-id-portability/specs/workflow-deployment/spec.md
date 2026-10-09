# Spec Delta

## Purpose

Lets the four n8n workflows be deployed or redeployed onto the project's single n8n instance from any starting state, with cross-workflow references and activation always correct, without manual or instance-specific edits to git-tracked workflow source, and without any load path other than the git-tracked `.workflow.ts` source.

## ADDED Requirements

### Requirement: Fresh deployment succeeds from an empty instance
Deploying onto an n8n instance that has none of the four workflows SHALL result in all four (`chat`, `classifier-core`, `router`, `test-harness`) present and active, with `chat`'s and `test-harness`'s Execute Workflow nodes resolving to the actual, currently-live `classifier-core` and `router` workflows.

#### Scenario: Deploying onto an instance with no prior workflows
- **WHEN** the deploy mechanism is run against an n8n instance that has none of the four workflows
- **THEN** all four workflows exist and are active, and `chat`'s and `test-harness`'s "Call Classifier Core"/"Call Router" nodes each call the `classifier-core`/`router` workflow actually present on that instance

### Requirement: Redeployment is idempotent
Running the deploy mechanism again against an instance where all four workflows already exist and are correctly wired SHALL make no functional changes and SHALL NOT create duplicate workflows.

#### Scenario: Re-running deploy with nothing changed
- **WHEN** the deploy mechanism is run against an instance where all four workflows already exist, are active, and are correctly wired
- **THEN** the instance still has exactly four workflows (`chat`, `classifier-core`, `router`, `test-harness`) afterward, each still active and correctly wired

### Requirement: Cross-workflow references resolve to whatever this instance actually assigned
`chat`'s and `test-harness`'s Execute Workflow references to `classifier-core`/`router` SHALL always resolve to the workflow IDs this specific n8n instance currently has for those workflows, regardless of what ID, if any, is recorded anywhere else (git history, a previous deploy, another instance).

#### Scenario: Instance assigns different IDs than any previously recorded
- **WHEN** `classifier-core` or `router` is created on an instance with an ID that differs from any ID previously recorded for it anywhere
- **THEN** `chat`'s and `test-harness`'s Execute Workflow nodes call that workflow successfully, using the new ID

### Requirement: Deployment never requires editing tracked workflow source for instance-specific values
A normal deploy-correction run SHALL NOT require, as part of succeeding, any edit to the git-tracked `.workflow.ts` files that encodes an instance-specific value (a workflow ID, in particular). Git-tracked source content SHALL be identical before and after a deploy-correction run, except for changes the operator deliberately made to the workflow's own logic.

#### Scenario: Deploying does not change tracked source
- **WHEN** the deploy-correction mechanism is run, whether onto an instance just loaded from an empty state or an already-populated one
- **THEN** the content of `workflows/local/*.workflow.ts` as recorded in version control is unaffected by the run

### Requirement: Loading the workflows has exactly one documented path
The four workflows SHALL be loaded onto the instance only from the git-tracked `.workflow.ts` source (via `n8nac push`). No other artifact (in particular, no exported JSON file) SHALL be documented or required as a way to load the workflows onto an instance.

#### Scenario: Setup instructions reference only the tracked source
- **WHEN** a reviewer follows the project's documented setup instructions for loading the four workflows
- **THEN** every instruction operates on `workflows/local/*.workflow.ts` via `n8nac push`, and no instruction imports a JSON file as a substitute for that source

### Requirement: Missing deployment prerequisites are reported, not silently tolerated
If a prerequisite the deploy mechanism depends on (for example, a required credential) is missing on the target instance such that a workflow cannot be correctly activated, the mechanism SHALL report this clearly rather than leaving a workflow silently inactive or partially wired.

#### Scenario: A required credential is missing on the target instance
- **WHEN** the deploy mechanism is run against an instance missing a credential one of the workflows needs
- **THEN** the mechanism reports which workflow and which credential is missing, rather than completing and leaving that workflow inactive or broken without explanation
