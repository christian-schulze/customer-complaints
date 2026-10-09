# Spec Delta

## MODIFIED Requirements

### Requirement: Closing message shown immediately
The classifier's final turn SHALL include a closing message shown immediately in the chat, matched to the detected customer tone, including a reference ID when the complaint is `legitimate` or escalated. The chat response the complainant's client actually receives for that turn SHALL be this closing message text, regardless of what other processing (routing, Data Table writes, acknowledgement drafting) also runs as part of finishing the conversation.

#### Scenario: Legitimate complaint closing includes a reference ID
- **WHEN** a conversation is classified `legitimate`
- **THEN** the closing message includes a reference ID

#### Scenario: Escalated complaint closing includes a reference ID
- **WHEN** a conversation has `escalate: true`, regardless of label
- **THEN** the closing message includes a reference ID

#### Scenario: Non-escalated not-legitimate closing has no reference ID
- **WHEN** a conversation is classified `not_legitimate` and `escalate` is `false`
- **THEN** the closing message does not include a reference ID

#### Scenario: Closing message is not displaced by downstream processing
- **WHEN** a conversation reaches `done: true` and this also triggers routing/Data Table writes/acknowledgement drafting as part of finishing
- **THEN** the chat response delivered to the complainant is still the closing message text, not the raw output of the routing step or any other downstream node
