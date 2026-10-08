# Spec Delta

## Purpose

A single, UI-editable configuration surface that drives every insurer-specific and tunable value the chat and classifier use, so nothing insurer-specific is hardcoded into prompts.

## ADDED Requirements

### Requirement: Single configuration surface
The system SHALL expose exactly one configuration point holding `insurerName` (default "ACME Insurance"), `products` (default: motor, home, travel), `maxFollowUps` (default 3), and `confidenceThreshold` (default 0.7).

#### Scenario: Defaults apply when configuration is unset
- **WHEN** the configuration values have not been changed from their defaults
- **THEN** the chat and classifier use insurerName "ACME Insurance", products [motor, home, travel], maxFollowUps 3, and confidenceThreshold 0.7

#### Scenario: Operator changes configuration without editing prompts
- **WHEN** an operator changes `insurerName`, `products`, `maxFollowUps`, or `confidenceThreshold` in the n8n UI
- **THEN** the chat introduction, information-collection behaviour, and classification threshold reflect the new values without any prompt text being edited

### Requirement: Prompts read configuration via expressions
Prompts SHALL reference the configuration node's output via expressions, not a literal insurer name, product list, follow-up count, or confidence threshold. A defensive fallback literal that exactly matches the configuration's own documented default (used only when `config` is entirely absent — e.g. a sub-workflow invoked directly without a config, such as in testing) is not a violation of this requirement, since it never overrides a value the configuration actually supplies.

#### Scenario: Changing the insurer name changes the greeting
- **WHEN** `insurerName` is changed from "ACME Insurance" to a different value and the chat workflow supplies that config to the classifier
- **THEN** the chat's self-introduction uses the new name without any change to the prompt text itself

#### Scenario: Classifier invoked directly without a config falls back to documented defaults
- **WHEN** `classifier-core` is called with no `config` at all (e.g. a future test case)
- **THEN** it behaves as though `insurerName`, `products`, `maxFollowUps`, and `confidenceThreshold` were set to this spec's documented defaults, not to some other hardcoded value
