# Spec Delta

## Purpose

Verifies, automatically and repeatably, that complaint intake, classification, escalation, tone, and routing behave as specified, by replaying synthetic conversations with known expected outcomes and reporting pass/fail against explicit thresholds.

## ADDED Requirements

### Requirement: Test harness exposes the same classification and routing path users exercise
The system SHALL provide a webhook-triggered test harness that accepts `{ sessionId, message, config? }`, invokes the same `classifier-core` sub-workflow the chat uses, and — once the conversation reaches `done: true` — also invokes the `router` sub-workflow in wait mode, returning the combined classifier and router output to the caller.

#### Scenario: Mid-conversation turn returns classifier output only
- **WHEN** the harness is called with a message that does not finish the conversation
- **THEN** it returns the classifier's `reply` and `done: false` without invoking the router

#### Scenario: Finishing turn returns combined classifier and router output
- **WHEN** the harness is called with a message that finishes the conversation (`done: true`)
- **THEN** it returns the classifier's result together with the router's result (destinations, and `category`/`priority` when applicable), waiting for routing to complete before responding

### Requirement: Harness authentication
The system SHALL reject test harness requests that do not present a valid `TEST_WEBHOOK_SECRET` header value.

#### Scenario: Request without a valid secret is rejected
- **WHEN** a request to the test harness omits the `TEST_WEBHOOK_SECRET` header or presents an incorrect value
- **THEN** the harness rejects the request and does not invoke the classifier

### Requirement: Harness supports config override
The system SHALL apply a `config` object supplied in the harness request in place of the default config for that call.

#### Scenario: Supplied config overrides defaults
- **WHEN** a harness request includes a `config` object with a non-default `confidenceThreshold` or `products` list
- **THEN** the classifier and any deterministic post-processing use the supplied values, not the defaults

### Requirement: Test runner tracks and can remove its own generated records
The test runner SHALL record, for every case that reaches a routable outcome, the `referenceId` and the destination table(s) it was written to, and SHALL provide a separate, explicitly-invoked cleanup command that deletes exactly those recorded rows from the Data Tables. This cleanup SHALL NOT run automatically as part of `npm test`.

#### Scenario: Report records exactly what was written
- **WHEN** a case reaches a routable outcome
- **THEN** the run's report includes that case's `referenceId` and the destination table(s) it was written to

#### Scenario: Cleanup removes only recorded test rows
- **WHEN** the cleanup command is invoked after a test run
- **THEN** only the rows whose `referenceId` was recorded by that run are deleted, and no unrelated row in `complaints_register`, `review_queue`, or `not_legitimate_log` is touched

#### Scenario: Cleanup never runs implicitly
- **WHEN** `npm test` is run without invoking the cleanup command
- **THEN** no Data Table rows are deleted as a side effect

### Requirement: Scripted test cases are synthetic conversations with known expected outcomes
The system SHALL store scripted test cases as reviewed JSON fixtures, each with an `id`, `description`, ordered `turns`, an `expected` set of fields (any of `label`, `unknownReason`, `escalate`, `customerTone`, `routes`, `category`, `priority`), `tags`, and a `reviewed` flag, and SHALL exclude any case where `reviewed` is not `true` from pass/fail accounting.

#### Scenario: Unreviewed case does not count toward results
- **WHEN** a case file has `reviewed: false` or the field is absent
- **THEN** the test runner executes it (if at all) but excludes it from the accuracy, confusion matrix, and TR-5 threshold checks

### Requirement: Scripted coverage spans every label, escalation, and routing destination
The reviewed scripted cases SHALL collectively cover every classification label (`legitimate`, `not_legitimate`, `unknown`), escalation occurring independently of label (including a `legitimate` + escalated case), and every routing destination.

#### Scenario: Every label and every route has a covering case
- **WHEN** the scripted suite is reviewed for label and route coverage
- **THEN** at least one reviewed case exists for each of `legitimate`, `not_legitimate`, `unknown`, for a `legitimate` + escalated combination, and for each routing destination

### Requirement: Scripted coverage spans every tone on both customer-facing messages independently
The reviewed scripted cases SHALL cover every customer tone (`angry`, `distressed`, `confused`, `neutral`) on the classifier's closing message, and SHALL separately cover every tone on the routing agent's acknowledgement draft, as distinct cases.

#### Scenario: Confused tone is covered on both customer-facing messages independently
- **WHEN** the scripted suite is reviewed for tone coverage
- **THEN** at least one case asserts `customerTone: confused` on the classifier's closing message, and at least one case asserts a confused-tone acknowledgement draft from the routing agent, as distinct cases

### Requirement: Scripted coverage includes edge cases named in PRD TR-3
The reviewed scripted cases SHALL include: a product not in the configured list; opt-in contact details being declined; the follow-up limit being reached; and a prompt-injection attempt.

#### Scenario: Each named edge case has a covering case
- **WHEN** the scripted suite is reviewed for edge-case coverage
- **THEN** at least one reviewed case exists for a product not offered, for opt-in contact declined, for the follow-up limit reached, and for a prompt-injection attempt

### Requirement: Attempted induced-failure coverage is recorded even where it cannot be exercised live
The scripted suite SHALL include a case attempting to induce the classifier's model-failure path and a case attempting to induce the router's model-failure path. Where a case's `disabled` field is `true`, the runner SHALL skip it (no HTTP calls, excluded from scoring) and the case's `disabledReason` SHALL explain why it cannot reliably exercise that path from a scripted conversation.

#### Scenario: Classifier model-failure attempt is recorded
- **WHEN** the scripted suite is reviewed for failure coverage
- **THEN** a case exists documenting an attempt to force the classifier's model-failure path, with its outcome (triggered live, or disabled with a documented reason) visible in the case file

#### Scenario: Router model-failure attempt is recorded
- **WHEN** the scripted suite is reviewed for failure coverage
- **THEN** a case exists documenting an attempt to force the routing agent's model-failure path, with its outcome (triggered live, or disabled with a documented reason) visible in the case file

#### Scenario: A disabled case is skipped, not silently dropped
- **WHEN** a case has `disabled: true`
- **THEN** `npm test` logs that it was skipped and why, makes no HTTP call for it, and excludes it from accuracy, the confusion matrix, and the TR-5 threshold checks

### Requirement: Test runner executes cases turn by turn and reports results
The system SHALL provide a test runner (`npm test`) that, for each in-scope case, uses a fresh `sessionId`, sends each turn to the harness in order until `done: true` or the turns are exhausted (exhaustion counts as a failure), asserts every field the case declares in `expected`, and reports overall accuracy, per-field results, a confusion matrix on `label`, and full transcripts for failures, to the terminal and to `tests/reports/` (JSON and Markdown).

#### Scenario: Case runs until done or turns are exhausted
- **WHEN** a case's scripted turns are all sent and the conversation has not reached `done: true`
- **THEN** the case is recorded as a failure ("ran out of turns")

#### Scenario: Report includes confusion matrix and failing transcripts
- **WHEN** `npm test` completes
- **THEN** the terminal output and the written report include a label confusion matrix and, for every failing case, its full turn-by-turn transcript

### Requirement: Pass criteria gate suite success
The test runner SHALL exit non-zero unless all of: overall accuracy across in-scope cases is at least 90%, zero `legitimate` complaints are classified `not_legitimate`, and zero cases expected to escalate fail to escalate.

#### Scenario: Any legitimate-to-not_legitimate miss fails the suite
- **WHEN** any in-scope case expects `label: legitimate` and the harness returns `label: not_legitimate`
- **THEN** the suite reports failure and `npm test` exits non-zero, regardless of overall accuracy

#### Scenario: Any missed escalation fails the suite
- **WHEN** any in-scope case expects `escalate: true` and the harness returns `escalate: false`
- **THEN** the suite reports failure and `npm test` exits non-zero

#### Scenario: Suite passes when thresholds are met
- **WHEN** overall accuracy is at least 90%, no legitimate complaint is misclassified as not_legitimate, and no expected escalation is missed
- **THEN** `npm test` exits zero

### Requirement: Runner supports filtering and repeated runs
The test runner SHALL support `--tag` and `--case` flags to select a subset of cases, and a `--runs` flag (default 1) that repeats each selected case and reports a per-case pass rate when greater than 1.

#### Scenario: Running a single case by id
- **WHEN** `npm test` is invoked with `--case <id>`
- **THEN** only that case executes and is reported on

#### Scenario: Repeated runs report a pass rate
- **WHEN** `npm test` is invoked with `--runs 3`
- **THEN** each selected case executes three times and the report shows the fraction of runs that passed per case

### Requirement: Simulated conversations exercise realistic multi-turn questioning
This is a should-have, built only if time permits. Where built, the system SHALL support simulated test cases in which the runner calls the Anthropic API directly to play a complainant with a defined persona and hidden facts, testing the classifier's follow-up questioning against conversations not fully scripted turn by turn.

#### Scenario: Simulated case reaches a classification via dynamic dialogue
- **WHEN** a simulated case is run
- **THEN** the simulated complainant responds to each classifier question based on its persona and hidden facts, and the conversation still terminates in `done: true` within the configured follow-up limit, yielding a result the runner can assert against the case's expected label/escalation

### Requirement: LLM-as-judge checks validate tone and messaging safety
This is a should-have, built only if time permits. Where built, the system SHALL check customer-facing messages (the classifier's closing message and the routing agent's acknowledgement draft) with an LLM-as-judge pass asserting that the message's tone matches the case's `customerTone` and that none of the messaging-safety rules (no outcome promises, no admission of fault, no legal advice, no revealed internal label, no mirrored hostility) are violated.

#### Scenario: Judge flags a tone mismatch
- **WHEN** a customer-facing message is judged against an expected `customerTone` it does not match
- **THEN** the judge check fails that case and the failure is reported with the message text and the expected tone

#### Scenario: Judge flags a messaging-safety violation
- **WHEN** a customer-facing message promises an outcome, admits fault, gives legal advice, reveals the internal label, or mirrors hostility
- **THEN** the judge check fails that case and reports which rule was violated
