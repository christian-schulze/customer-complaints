# Spec Delta

## Purpose

The conversational surface complainants use: a hosted chat session that introduces itself, asks focused questions to gather what's needed to classify a complaint, and knows when to stop asking.

## ADDED Requirements

### Requirement: Hosted chat session per complainant
The system SHALL present complainants with n8n's hosted chat page, introduce itself as the complaints assistant for the configured insurer, and treat each conversation as an independent session that remembers its own earlier turns.

#### Scenario: Assistant introduces itself with the configured insurer name
- **WHEN** a complainant starts a new chat session
- **THEN** the assistant's first message identifies it as the complaints assistant for the configured `insurerName`

#### Scenario: Agent recalls earlier turns within the same session
- **WHEN** a complainant states a fact (e.g. "it's a motor claim") and later in the same session is asked a follow-up question
- **THEN** the agent does not contradict or discard the earlier stated fact

#### Scenario: Separate sessions do not share context
- **WHEN** two complainants start chats with different `sessionId`s
- **THEN** neither session's conversation history or extracted information is visible in the other

### Requirement: Required-field collection
The system SHALL try to collect, before classifying: insurance type, what happened, roughly when, and desired outcome.

#### Scenario: Agent asks for a missing required field
- **WHEN** a complainant's message is missing the desired outcome
- **THEN** the agent's next reply asks for the desired outcome rather than classifying immediately

### Requirement: Optional fields asked once
The system SHALL ask about the policy or claim number at most once per conversation and SHALL NOT ask again if it is not provided.

#### Scenario: Complainant doesn't provide a policy number
- **WHEN** the agent has already asked once for a policy or claim number and the complainant did not provide one
- **THEN** the agent proceeds without asking for it again

### Requirement: Opt-in contact details
The system SHALL ask once whether the complainant wants to leave a name and contact details, SHALL make clear this is optional, and SHALL accept a decline without asking again.

#### Scenario: Complainant declines contact details
- **WHEN** the complainant is asked once whether they want to leave contact details and responds "no"
- **THEN** the agent does not ask for contact details again for the rest of the session

### Requirement: Follow-up limit
The system SHALL ask at most `maxFollowUps` focused follow-up questions. If required fields are still missing after that limit, it SHALL classify with the information it has.

#### Scenario: Follow-up limit reached with required fields still missing
- **WHEN** the agent has asked `maxFollowUps` follow-up questions and at least one required field is still missing
- **THEN** the agent classifies the conversation with the information available rather than asking further questions

### Requirement: No redundant questions
The system SHALL NOT ask for information the complainant has already given.

#### Scenario: Complainant already stated when the event happened
- **WHEN** the complainant's first message already states roughly when the event happened
- **THEN** no later agent message asks when it happened
