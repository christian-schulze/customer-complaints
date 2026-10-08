# Spec Delta

## ADDED Requirements

### Requirement: Acknowledgement draft for legitimate complaints
The routing agent SHALL write a formal acknowledgement draft for every `legitimate` complaint, matched to the same detected customer tone and bound by the same tone rules and prohibited-content rules as the closing message, stored with the complaint record for a human to review and send rather than shown directly to the complainant.

#### Scenario: Acknowledgement draft matches detected tone
- **WHEN** a `legitimate` complaint has customer tone `angry`
- **THEN** its acknowledgement draft is calm, direct, and acknowledges the frustration, following the same tone rule as the closing message

#### Scenario: Acknowledgement draft obeys the same prohibitions as the closing message
- **WHEN** an acknowledgement draft is generated for any `legitimate` complaint
- **THEN** it does not promise or predict an outcome or payout, admit fault or liability, give legal advice, or reveal the internal classification label

#### Scenario: Acknowledgement draft is stored, not sent
- **WHEN** a `legitimate` complaint's acknowledgement draft is produced
- **THEN** it is stored with the complaint record in the complaints register and is not sent to the complainant directly
