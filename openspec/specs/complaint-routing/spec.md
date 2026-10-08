# complaint-routing Specification

## Purpose

Decides, deterministically, where a finished classification goes next, and adds the category/priority/draft-reply judgment a human triage step would otherwise supply for legitimate complaints.

## Requirements

### Requirement: Deterministic routing by label and escalation
The system SHALL route every finished classification using fixed rules on `label` and `escalate`, not model judgment: `legitimate` and not escalated → the complaints register; `legitimate` and escalated → the complaints register and the human review queue; `unknown` (any reason) → the human review queue; `not_legitimate` and escalated → the human review queue; `not_legitimate` and not escalated → the not-legitimate log.

#### Scenario: Legitimate, not escalated, goes to the register only
- **WHEN** a classification has `label: legitimate` and `escalate: false`
- **THEN** a record is written to the complaints register and no other destination

#### Scenario: Legitimate and escalated goes to both destinations
- **WHEN** a classification has `label: legitimate` and `escalate: true`
- **THEN** a record is written to both the complaints register and the human review queue

#### Scenario: Unknown always reaches the review queue
- **WHEN** a classification has `label: unknown`, regardless of `unknownReason` or `escalate`
- **THEN** a record is written to the human review queue

#### Scenario: Not-legitimate and escalated reaches the review queue
- **WHEN** a classification has `label: not_legitimate` and `escalate: true`
- **THEN** a record is written to the human review queue

#### Scenario: Not-legitimate and not escalated reaches the not-legitimate log only
- **WHEN** a classification has `label: not_legitimate` and `escalate: false`
- **THEN** a record is written to the not-legitimate log and no other destination

### Requirement: Routing agent judgment for legitimate complaints
For every `legitimate` complaint, the system SHALL use a routing agent to assign a `category` of exactly one of `claims`, `billing`, `customer_service`, or `policy_admin`, and a `priority` of exactly one of `urgent` or `standard`. The routing agent SHALL NOT run for `not_legitimate` or `unknown` complaints.

#### Scenario: Legitimate complaint receives a category and priority
- **WHEN** a classification has `label: legitimate`
- **THEN** the resulting record includes a non-null `category` from the defined set and a non-null `priority` from the defined set

#### Scenario: Non-legitimate complaints are not routed to the agent
- **WHEN** a classification has `label: unknown` or `label: not_legitimate`
- **THEN** no `category` or `priority` is produced for it

### Requirement: Priority escalation triggers
The routing agent SHALL set `priority: urgent` when the complaint involves financial hardship, a safety concern, vulnerability, or a long unresolved delay, and `priority: standard` otherwise.

#### Scenario: Financial hardship is urgent
- **WHEN** a legitimate complaint describes financial hardship caused by the insurer's handling
- **THEN** `priority` is `urgent`

#### Scenario: Routine complaint is standard
- **WHEN** a legitimate complaint describes a minor billing discrepancy with no hardship, safety, vulnerability, or long delay
- **THEN** `priority` is `standard`

### Requirement: Routing runs after the complainant-facing reply
The system SHALL send the closing message to the complainant before or without waiting for routing to complete; the complainant SHALL NOT wait on routing, the routing agent, or table writes.

#### Scenario: Chat reply precedes routing completion
- **WHEN** a conversation finishes with `done: true`
- **THEN** the closing message is returned to the chat without waiting for the routing sub-workflow to finish executing

### Requirement: Routing result is reportable
The system SHALL return a result identifying the destination(s) a classification was routed to, and the `category`/`priority` when a routing agent ran, so that callers (including the test harness) can assert on routing outcomes.

#### Scenario: Routing result lists destinations
- **WHEN** routing completes for any classification
- **THEN** the result includes the `referenceId` and the list of destination(s) written to

#### Scenario: Routing result includes category and priority for legitimate complaints
- **WHEN** routing completes for a `legitimate` complaint
- **THEN** the result also includes `category` and `priority`
