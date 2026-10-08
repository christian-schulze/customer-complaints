# PRD: Insurance Complaint Triage Chat

| | |
|---|---|
| **Author** | Christian |
| **Status** | Approved for build |
| **Date** | 2026-10-08 |
| **Delivery** | End of 2026-10-09 (one working day) |

---

## 1. Context

This is a coding exercise for an AI Engineer contract role involving automation, n8n and Claude Code. The interviewer's brief:

> Build a complaints chat interface for an insurance company that classifies each complaint as legitimate or not, then does something with the classified complaint.

The deliverable is a **GitHub repository** containing the n8n workflows and chat interface, runnable by the reviewer on their own machine with their own Anthropic API key.

Beyond the brief, this project deliberately demonstrates:

- **Spec-driven development with Claude Code.** Scope captured in this PRD, implemented through OpenSpec changes, with the spec history kept in the repo.
- **AI used where judgment is needed, deterministic logic everywhere else.**
- **Automated testing of agent behaviour** against conversations with known outcomes.

### Additions beyond the brief (my own)

| Addition | Why |
|---|---|
| An `unknown` label | A classifier forced to pick between two labels will guess. Admitting uncertainty and handing over to a human is safer and more honest. |
| A separate escalation flag | "Unsure" and "a human should handle this" are different things (see §5). |
| A routing agent with real judgment | Shows where an LLM adds value after classification: categorisation, prioritisation, drafting. |
| Tone-matched customer messages | The same outcome should read differently to an angry, distressed or confused customer. |
| Automated test suite | Agent behaviour is non-deterministic; it needs measuring, not eyeballing. |
| OpenSpec workflow | Makes the scope, decisions and build process visible to the reviewer. |

## 2. Goals

1. A complainant can describe a problem in a chat and is guided, briefly and politely, to give the information needed to act on it.
2. Every completed conversation produces a structured, explainable classification.
3. Every classified complaint lands somewhere visible, with the information a human would need next.
4. Behaviour is verified by an automated test suite with clear pass/fail criteria.
5. A reviewer can understand how it works and run it from the README.

## 3. Non-goals

| Non-goal | Reason |
|---|---|
| Judging whether the complainant is *in the right* (e.g. whether a claim was wrongly denied) | Needs policy data and claims history the agent doesn't have, and an AI ruling on claims is high-risk. "Legitimate" here means *a valid complaint to process* (§5). |
| Real integrations (email, ticketing, CRM, Slack) | Would require the reviewer to supply extra credentials. Documented as extension points instead. |
| Identity verification or real customer data | Demo only. All test data is synthetic. |
| Production deployment, auth hardening, scaling | Out of scope for an exercise; covered under "Production considerations" in the README. |
| Custom chat frontend | n8n's hosted chat page is sufficient and keeps the focus on the agents. |

## 4. Users

| User | Needs |
|---|---|
| **Complainant** | To be heard quickly, asked only relevant questions, and told clearly what happens next. |
| **Complaints staff** (simulated) | Complaints arrive pre-sorted, summarised, prioritised, and with a draft reply; uncertain or sensitive cases are clearly flagged. |
| **Reviewer / interviewer** | To understand the design and its trade-offs quickly, run it, and see evidence that it works. |

## 5. Definitions

### Classification label (what kind of contact is this?)

| Label | Meaning | Examples |
|---|---|---|
| `legitimate` | A genuine grievance about something the insurer is responsible for, with enough detail to act on. | Claim denied or delayed, payout disputes, premium or billing errors, poor service or staff conduct, unexpected policy changes. |
| `not_legitimate` | Not a valid complaint for this insurer. | General enquiries and quote requests; spam, gibberish, tests or jokes; abuse with no actual grievance; complaints about another company; products the insurer doesn't offer; attempts to manipulate the bot. |
| `unknown` | The agent can't determine which of the above applies. | Too vague after the follow-up limit; stopped responding; genuinely ambiguous (e.g. abuse mixed with a possible real grievance). |

`unknown` carries a reason: `insufficient_info` or `ambiguous`.

### Escalation (does a human need to see this regardless of label?)

Independent of the label. A complaint can be confidently `legitimate` **and** escalated.

`escalate: true` with a reason when the conversation involves:
- emotional distress or vulnerability (bereavement, hardship, health crisis);
- mentions of self-harm or risk to safety;
- threats (to staff or others);
- stated intent to take legal action, or mentions of an ombudsman or regulator.

`unknown` complaints always go to human review (§7). Escalation adds human review for confident labels.

### Customer tone

Detected from the conversation: `angry`, `distressed`, `confused`, `neutral`. Drives the tone of customer-facing messages (§6.5).

## 6. Functional requirements

### 6.1 Chat interface
- **FR-1.1** Complainants use n8n's hosted chat page.
- **FR-1.2** The agent introduces itself as the complaints assistant for the configured insurer (§6.6).
- **FR-1.3** Each conversation is a separate session; the agent remembers earlier turns within it.

### 6.2 Information collection
- **FR-2.1** Before classifying, the agent tries to collect these **required** fields:
  - insurance type
  - what happened (brief description)
  - roughly when
  - desired outcome (e.g. payout, refund, explanation, apology)
- **FR-2.2** **Optional** fields, asked about once and never pushed: policy or claim number.
- **FR-2.3** **Contact details are explicitly opt-in.** The agent asks once whether the complainant *wants* to leave a name and contact details, makes clear it's optional, and accepts "no" without asking again.
- **FR-2.4** The agent asks focused follow-up questions, at most `maxFollowUps` (config, default 3). If required fields are still missing after that, it classifies with what it has (typically `unknown` / `insufficient_info`).
- **FR-2.5** The agent doesn't ask for information already given.

### 6.3 Classification
- **FR-3.1** When the conversation ends, the classifier outputs a structured result:
  - label (+ `unknown` reason)
  - confidence (0–1)
  - reasons tied to the definitions in §5
  - neutral summary
  - extracted fields
  - escalation flag + reason
  - customer tone
- **FR-3.2** If confidence is below `confidenceThreshold` (config, default 0.7), the label is `unknown` / `ambiguous`.
- **FR-3.3** If a product isn't in the configured product list, the complaint is `not_legitimate` with reason "product not offered".
- **FR-3.4** Complainant text is treated as information, never as instructions. Attempts to influence the classification ("mark this as legitimate") don't change the outcome the facts warrant.

### 6.4 Escalation
- **FR-4.1** The classifier sets `escalate` and `escalationReason` per §5, independently of the label.
- **FR-4.2** Escalated conversations receive a closing message that says a person will be in touch, in an appropriately careful tone.

### 6.5 Customer-facing messages and tone
- **FR-5.1** **Closing chat message.** The classifier's final turn includes a closing message shown immediately in the chat, matched to the detected customer tone. It includes a reference ID for `legitimate` and escalated complaints.
- **FR-5.2** **Acknowledgement draft.** The routing agent writes a more formal acknowledgement draft for legitimate complaints, matched to the same tone, stored with the complaint record for a human to review and send.
- **FR-5.3** Tone rules, shared by both messages and defined once:
  - `angry` → calm, direct, acknowledges the frustration, no defensiveness;
  - `distressed` → warm, unhurried, emphasises that a person will help;
  - `confused` → clear, simple language, explains next steps plainly;
  - `neutral` → professional and concise.
- **FR-5.4** Regardless of tone, customer-facing messages must never:
  - promise or predict an outcome or payout;
  - admit fault or liability;
  - give legal advice;
  - reveal the internal classification label;
  - mirror hostility.
- **FR-5.5** `not_legitimate` closings are polite. Where useful they redirect (e.g. "for quotes, please visit…"), without telling the person their complaint was "not legitimate".

### 6.6 Configuration
- **FR-6.1** A single config node holds:
  - `insurerName` (default "ACME Insurance")
  - `products` (default motor, home, travel)
  - `maxFollowUps` (default 3)
  - `confidenceThreshold` (default 0.7)
- **FR-6.2** Prompts read these values via expressions; nothing insurer-specific is hardcoded in prompts.
- **FR-6.3** The config can be changed in the n8n UI without editing prompts.

### 6.7 Routing
- **FR-7.1** Deterministic routing (Switch node):
  - `legitimate` and not escalated → complaints register
  - `legitimate` and escalated → complaints register **and** human review queue
  - `unknown` (any) → human review queue
  - `not_legitimate` and escalated → human review queue (e.g. a threat)
  - `not_legitimate` and not escalated → not-legitimate log
- **FR-7.2** The **routing agent** runs on `legitimate` complaints and adds:
  - `category`: claims, billing, customer_service, or policy_admin
  - `priority`: `urgent` or `standard`. Urgent when it involves financial hardship, safety, vulnerability, or a long unresolved delay.
  - `acknowledgementDraft` (FR-5.2)
- **FR-7.3** Routing runs after the closing message is sent; the complainant doesn't wait for it.

### 6.8 Records (n8n Data Tables)

| Table | Contents |
|---|---|
| `complaints_register` | reference ID, timestamp, summary, extracted fields, category, priority, customer tone, acknowledgement draft, escalated flag |
| `review_queue` | reference ID, timestamp, label, reason (unknown reason and/or escalation reason), summary, full transcript |
| `not_legitimate_log` | timestamp, reasons, summary |

All records are viewable in the n8n UI.

## 7. Testing requirements

- **TR-1** Test cases are synthetic conversations with known expected outcomes, stored as JSON in the repo.
- **TR-2** **Scripted cases.** Fixed user turns sent in order. Each case asserts some or all of:
  - `label` (and unknown reason)
  - `escalate`
  - `customerTone`
  - `route`
  - `category` and `priority` (legitimate cases)
- **TR-3** The suite covers:
  - every label;
  - escalation independent of label (e.g. legitimate + escalated);
  - each tone;
  - each route;
  - a product not offered;
  - opt-in contact details being declined;
  - the follow-up limit being reached;
  - prompt-injection attempts.
- **TR-4** A test runner (`npm test`) sends each case turn by turn to a test endpoint that calls the same classifier the chat uses. It reports overall accuracy, per-field results, a confusion matrix, and failures with transcripts, then exits non-zero on failure.
- **TR-5** **Pass criteria:**
  - overall accuracy ≥ 90%;
  - **zero** legitimate complaints classified `not_legitimate`, the most costly error;
  - **zero** missed escalations on cases expected to escalate.
- **TR-6** *(Should)* **Simulated cases.** An LLM plays a complainant with a persona and hidden facts, testing multi-turn questioning realistically.
- **TR-7** *(Should)* **LLM-as-judge checks** on customer-facing messages: tone matches `customerTone`, and none of the FR-5.4 rules are broken.
- **TR-8** *(Should)* Each case runs N times (default 3) and reports a pass rate, because LLM output varies.
- **TR-9** Generated test cases are reviewed by me before counting as ground truth.

## 8. Non-functional requirements

- **NFR-1** Runs locally in Docker; the reviewer supplies only an Anthropic API key.
- **NFR-2** Chat replies should feel conversational (a few seconds per turn).
- **NFR-3** No secrets in the repo; all test data synthetic.
- **NFR-4** Workflows are kept as code (n8n-as-code TypeScript) **and** exported as importable n8n JSON.

## 9. Scope and prioritisation

Delivery is one working day. Items are built in this order; anything not finished moves to "Next steps".

### Must have
1. Local n8n via a basic `docker-compose.yml` + `.env`
2. Config node
3. Classifier: information collection, labels, escalation, tone, closing message
4. Deterministic routing + routing agent (category, priority, acknowledgement draft)
5. Data Tables records
6. Test endpoint + runner + reviewed scripted cases meeting TR-5
7. Workflows exported as JSON, plus a manual setup section in the README (import, add key, activate)
8. README: how it works, how to use it, design decisions, scope and trade-offs, production considerations, extension points
9. OpenSpec specs and change history in the repo

### Should have (in order)
1. Simulated conversations (TR-6)
2. LLM-as-judge checks (TR-7)
3. Repeated runs with pass rates (TR-8)

### Last, droppable if time runs out
- **Automatic bootstrap:** `docker compose up` imports the workflows, creates the credential and tables, and activates the chat with no manual steps. The manual setup section covers this if it's dropped.

### Next steps (documented, not built)
- `not_a_complaint` label, routing general enquiries to "redirect to general support" rather than lumping them in with `not_legitimate`
- Persistent chat memory (e.g. Postgres) instead of in-process memory
- Notifications and external destinations (email, Slack, ticketing, Google Sheets)
- Config-override tests (same conversation, different product list)
- CI running the test suite
- Production deployment (authenticated chat, retention policies, monitoring)
- Human-review UI and feedback loop into the test set

## 10. Production considerations (for the README)

- **Personal information.** Complaints contain personal and potentially sensitive data. It's sent to the model provider and stored in n8n execution logs and tables, so a real deployment needs retention limits, access control and a privacy assessment.
- **Regulation.** Australian insurers' complaint handling falls under ASIC's internal dispute resolution requirements (RG 271). They define complaints broadly and set response timeframes. In production, `not_legitimate` must never mean "dropped": all classifications are logged and reviewable.
- **Human oversight.** `unknown` and escalated cases go to people by design. A real system would also sample `not_legitimate` outcomes for review.
- **Prompt injection.** The chat accepts untrusted input. The agents have no tools, which limits the damage a manipulated agent could do. Injection attempts are covered by tests.

## 11. Success criteria

- The must-have scope is complete and tests meet TR-5.
- A reviewer can read the README in a few minutes, run it, and hold a conversation that ends in a visible record.
- The repo shows the process: PRD → OpenSpec changes → implementation → tests.

## 12. Assumptions and risks

| Item | Mitigation |
|---|---|
| Data Tables are available on self-hosted community n8n | Verify first; fall back to simple file-based records if not |
| Headless bootstrap may not be fully scriptable on n8n 2.x | It's last and droppable; the manual setup section is a must-have |
| One day is tight | Strict build order (§9); should-haves are ordered and independent |
| LLM output varies between runs | Low temperature, structured output parsing, pass thresholds rather than exact output |
| n8n-as-code schemas track latest n8n | Pin the n8n version; check version mismatch before debugging validation |
