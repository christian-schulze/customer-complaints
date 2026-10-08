# Spec Delta

## Purpose

The shared tone rules and hard content constraints that govern every customer-facing message the system produces, so the same outcome reads appropriately to an angry, distressed, confused, or neutral complainant without ever overstepping what the system is entitled to say.

## ADDED Requirements

### Requirement: Closing message shown immediately
The classifier's final turn SHALL include a closing message shown immediately in the chat, matched to the detected customer tone, including a reference ID when the complaint is `legitimate` or escalated.

#### Scenario: Legitimate complaint closing includes a reference ID
- **WHEN** a conversation is classified `legitimate`
- **THEN** the closing message includes a reference ID

#### Scenario: Escalated complaint closing includes a reference ID
- **WHEN** a conversation has `escalate: true`, regardless of label
- **THEN** the closing message includes a reference ID

#### Scenario: Non-escalated not-legitimate closing has no reference ID
- **WHEN** a conversation is classified `not_legitimate` and `escalate` is `false`
- **THEN** the closing message does not include a reference ID

### Requirement: Tone rules
Customer-facing messages SHALL follow these tone rules: `angry` → calm, direct, acknowledges the frustration, no defensiveness; `distressed` → warm, unhurried, emphasises that a person will help; `confused` → clear, simple language, explains next steps plainly; `neutral` → professional and concise.

#### Scenario: Angry tone is calm and non-defensive
- **WHEN** the detected customer tone is `angry`
- **THEN** the closing message is calm and direct, acknowledges the frustration, and is not defensive

#### Scenario: Distressed tone is warm and unhurried
- **WHEN** the detected customer tone is `distressed`
- **THEN** the closing message is warm, unhurried, and states that a person will help

#### Scenario: Confused tone is simple and explains next steps
- **WHEN** the detected customer tone is `confused`
- **THEN** the closing message uses clear, simple language and plainly explains what happens next

#### Scenario: Neutral tone is professional and concise
- **WHEN** the detected customer tone is `neutral`
- **THEN** the closing message is professional and concise

### Requirement: Prohibited content regardless of tone
Customer-facing messages SHALL NOT, regardless of tone: promise or predict an outcome or payout, admit fault or liability, give legal advice, reveal the internal classification label, or mirror hostility back at the complainant.

#### Scenario: Hostility is not mirrored
- **WHEN** the complainant's messages are hostile and the detected tone is `angry`
- **THEN** the closing message does not mirror that hostility

#### Scenario: Internal label is never revealed
- **WHEN** a closing message is generated for any label
- **THEN** the message never states the internal classification label (e.g. does not say the word "legitimate", "not legitimate", or "unknown" as a verdict on the complaint)

#### Scenario: No outcome is promised
- **WHEN** a closing message is generated for a `legitimate` complaint
- **THEN** the message does not promise or predict a payout or other outcome

### Requirement: Polite not-legitimate closing
A `not_legitimate` closing message SHALL be polite, SHALL NOT tell the complainant their complaint was "not legitimate", and SHOULD redirect where useful (e.g. to a quotes page).

#### Scenario: Quote request receives a polite redirect
- **WHEN** a conversation is classified `not_legitimate` because it was a quote request
- **THEN** the closing message is polite, suggests where to go for a quote, and does not state that the complaint was rejected or not legitimate

### Requirement: Escalated closing tone
An escalated conversation's closing message SHALL state that a person will be in touch, in an appropriately careful tone.

#### Scenario: Escalated complaint closing mentions human follow-up
- **WHEN** a conversation has `escalate: true`
- **THEN** the closing message states that a person will be in touch, phrased carefully rather than alarmingly
