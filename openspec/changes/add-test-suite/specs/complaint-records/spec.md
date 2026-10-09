# Spec Delta

## MODIFIED Requirements

### Requirement: Not-legitimate log contents
The system SHALL write a row to the not-legitimate log for every non-escalated `not_legitimate` complaint, containing: reference ID, timestamp, reasons, and summary.

#### Scenario: Not-legitimate record is complete
- **WHEN** a `not_legitimate`, non-escalated complaint is routed to the not-legitimate log
- **THEN** the written row includes a non-null reference ID, a timestamp, the classification reasons, and a summary
