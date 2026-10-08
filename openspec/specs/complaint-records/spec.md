# complaint-records Specification

## Purpose

Defines the three durable records a classified complaint can land in, and what each one contains, so a human (or the test harness) can find what happened to any complaint and has the information needed to act on it.

## Requirements

### Requirement: Complaints register contents
The system SHALL write a row to the complaints register for every `legitimate` complaint, containing: reference ID, timestamp, summary, extracted fields, category, priority, customer tone, acknowledgement draft, and the escalated flag.

#### Scenario: Legitimate complaint record is complete
- **WHEN** a `legitimate` complaint is routed to the complaints register
- **THEN** the written row includes a non-null reference ID, timestamp, summary, extracted fields, category, priority, customer tone, acknowledgement draft, and escalated flag

### Requirement: Review queue contents
The system SHALL write a row to the human review queue for every complaint routed there, containing: reference ID, timestamp, label, reason (the unknown reason and/or escalation reason, whichever apply), summary, and the full conversation transcript.

#### Scenario: Escalated legitimate complaint's review-queue row includes the escalation reason
- **WHEN** a `legitimate` and escalated complaint is routed to the review queue
- **THEN** the written row includes the escalation reason and the full transcript

#### Scenario: Unknown complaint's review-queue row includes the unknown reason
- **WHEN** an `unknown` complaint is routed to the review queue
- **THEN** the written row includes the unknown reason and the full transcript

### Requirement: Not-legitimate log contents
The system SHALL write a row to the not-legitimate log for every non-escalated `not_legitimate` complaint, containing: timestamp, reasons, and summary.

#### Scenario: Not-legitimate record is complete
- **WHEN** a `not_legitimate`, non-escalated complaint is routed to the not-legitimate log
- **THEN** the written row includes a timestamp, the classification reasons, and a summary

### Requirement: Records viewable in the n8n UI
All three tables SHALL be standard n8n Data Tables, viewable and browsable in the n8n UI without any additional tooling.

#### Scenario: A written record is visible in the UI
- **WHEN** any record has been written to one of the three tables
- **THEN** it can be viewed by opening that Data Table in the n8n UI
