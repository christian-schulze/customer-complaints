import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : Router
// Nodes   : 16  |  Connections: 18
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// RouterTrigger                      executeWorkflowTrigger
// DetermineRoute                     code
// RouteSwitch                        switch
// RoutingModel                       lmChatAnthropic            [creds] [ai_languageModel] [ai_languageModel]
// RoutingResultParser                outputParserStructured     [AI] [ai_outputParser]
// RoutingAgent                       agent                      [AI] [onError→out(1)]
// FinalizeLegitimateRecord           code
// RoutingAgentFailure                code
// WriteComplaintsRegister            dataTable
// EscalatedCheck                     switch
// BuildReviewQueueRow                code
// BuildNotLegitimateLogRow           code
// PrepareReviewQueueRow              code
// WriteReviewQueue                   dataTable
// WriteNotLegitimateLog              dataTable
// FinalizeRoutingResult              code
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// RouterTrigger
//    → DetermineRoute
//      → RouteSwitch
//        → RoutingAgent
//          → FinalizeLegitimateRecord
//            → WriteComplaintsRegister
//              → EscalatedCheck
//                → FinalizeRoutingResult
//               .out(1) → PrepareReviewQueueRow
//                  → WriteReviewQueue
//                    → FinalizeRoutingResult (↩ loop)
//         .out(1) → RoutingAgentFailure
//            → PrepareReviewQueueRow (↩ loop)
//       .out(1) → RoutingAgent (↩ loop)
//       .out(2) → BuildReviewQueueRow
//          → PrepareReviewQueueRow (↩ loop)
//       .out(3) → BuildNotLegitimateLogRow
//          → WriteNotLegitimateLog
//            → FinalizeRoutingResult (↩ loop)
//
// AI CONNECTIONS
// RoutingResultParser.uses({ ai_languageModel: RoutingModel })
// RoutingAgent.uses({ ai_languageModel: RoutingModel, ai_outputParser: RoutingResultParser })
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'lcuFTh9kerJUgkf2',
    name: 'Router',
    active: true,
    isArchived: false,
    projectId: 'ZoCl8PNtu0LdHnhV',
    settings: { executionOrder: 'v1' },
})
export class RouterWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: '8b6bd649-a60d-479d-a3e6-e02e8c38258a',
        name: 'Router Trigger',
        type: 'n8n-nodes-base.executeWorkflowTrigger',
        version: 1.2,
        position: [0, 0],
    })
    RouterTrigger = {
        inputSource: 'workflowInputs',
        workflowInputs: {
            values: [
                {
                    name: 'result',
                    type: 'object',
                },
                {
                    name: 'config',
                    type: 'object',
                },
            ],
        },
    };

    @node({
        id: '54a1ba24-8483-403a-8c35-33428cb8290c',
        name: 'Determine Route',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [250, 0],
    })
    DetermineRoute = {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `const item = $input.first().json;
const result = item.result || {};
const label = result.label;
const escalate = result.escalate === true;

// FR-7.1: deterministic routing on label + escalate, not model judgment.
let routeIndex;
if (label === 'legitimate' && !escalate) routeIndex = 0;
else if (label === 'legitimate' && escalate) routeIndex = 1;
else if (label === 'unknown') routeIndex = 2;
else if (label === 'not_legitimate' && escalate) routeIndex = 2;
else routeIndex = 3; // not_legitimate, not escalated

return [{ json: { ...item, routeIndex } }];`,
    };

    @node({
        id: 'bfb8dc71-7501-4182-b144-297b804fdf82',
        name: 'Route Switch',
        type: 'n8n-nodes-base.switch',
        version: 3.4,
        position: [500, 0],
    })
    RouteSwitch = {
        mode: 'expression',
        numberOutputs: 4,
        output: '={{ $json.routeIndex }}',
    };

    @node({
        id: '57f5ff99-6305-4bf4-87ea-230062d5a480',
        name: 'Routing Model',
        type: '@n8n/n8n-nodes-langchain.lmChatAnthropic',
        version: 1.6,
        position: [750, 220],
        credentials: { anthropicApi: { id: 'QkrzUs2JhJlBwMWH', name: 'Anthropic account' } },
    })
    RoutingModel = {
        model: {
            __rl: true,
            value: 'claude-sonnet-5',
            mode: 'list',
            cachedResultName: 'Claude Sonnet 5',
        },
        options: {
            temperature: 0.2,
        },
    };

    @node({
        id: 'b48344de-7907-454f-8243-b52c144b20c5',
        name: 'Routing Result Parser',
        type: '@n8n/n8n-nodes-langchain.outputParserStructured',
        version: 1.3,
        position: [750, 340],
    })
    RoutingResultParser = {
        schemaType: 'manual',
        inputSchema: `{
  "type": "object",
  "additionalProperties": false,
  "required": ["category", "priority", "acknowledgementDraft"],
  "properties": {
    "category": { "type": "string", "enum": ["claims", "billing", "customer_service", "policy_admin"] },
    "priority": { "type": "string", "enum": ["urgent", "standard"] },
    "acknowledgementDraft": { "type": "string" }
  }
}`,
        autoFix: true,
    };

    @node({
        id: '0beea344-669a-40d1-b895-33e4eefde4df',
        name: 'Routing Agent',
        type: '@n8n/n8n-nodes-langchain.agent',
        version: 3.1,
        position: [750, 0],
        onError: 'continueErrorOutput',
    })
    RoutingAgent = {
        promptType: 'define',
        text: `=Classify and draft an acknowledgement for this complaint.

Complaint details (JSON): {{ JSON.stringify({ summary: $json.result.summary, extracted: $json.result.extracted, customerTone: $json.result.customerTone, escalate: $json.result.escalate, escalationReason: $json.result.escalationReason, reasons: $json.result.reasons }) }}`,
        hasOutputParser: true,
        options: {
            systemMessage: `=You are the complaint routing assistant for {{ $json.config?.insurerName ?? 'ACME Insurance' }}. You are given one finished, confirmed-legitimate complaint. Respond ONLY with the required JSON fields — no other text, no markdown.

CATEGORY (exactly one): "claims" (claim denied, delayed, or disputed), "billing" (premium or billing errors), "customer_service" (poor service or staff conduct), "policy_admin" (unexpected policy changes or other administrative matters). Choose based on what the complaint is actually about.

PRIORITY (exactly one): "urgent" when the complaint involves financial hardship, a safety concern, vulnerability, or a long unresolved delay. "standard" otherwise. The complaint's escalate flag and escalationReason (if present) are strong signals for urgency, but judge from the full complaint, not that flag alone.

ACKNOWLEDGEMENT DRAFT (acknowledgementDraft): write a more formal message than a chat reply, for a human reviewer to check and send to the complainant. It must follow the same tone and content rules as every other customer-facing message in this system:
- Tone, matched to the given customerTone:
  - angry: calm, direct, acknowledge the frustration, never defensive.
  - distressed: warm, unhurried, make clear a person will help.
  - confused: clear, simple language, plainly explain what happens next.
  - neutral: professional and concise.
- Never, regardless of tone: promise or predict an outcome or payout; admit fault or liability; give legal advice; reveal any internal classification label (never say "legitimate", "not legitimate", or "unknown" as a verdict); mirror hostility back at the complainant.
- This draft is stored with the complaint record for a human to review and send — it is not shown to the complainant directly.`,
        },
    };

    @node({
        id: '84d11130-b3fa-430a-bb7a-ea715c59aa0f',
        name: 'Finalize Legitimate Record',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1000, -100],
    })
    FinalizeLegitimateRecord = {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `// The Agent node replaces $json with just { output: {...} } (or { error } on failure),
// dropping the fields that went in — recover result/routeIndex from Route Switch's output.
const upstream = $('Route Switch').item.json;
const parsed = $input.first().json.output || {};
const result = upstream.result || {};
const routeIndex = upstream.routeIndex;

const referenceId = result.referenceId;
const timestamp = new Date().toISOString();

const registerRow = {
  referenceId,
  timestamp,
  summary: result.summary || '',
  extracted: JSON.stringify(result.extracted || {}),
  category: parsed.category || '',
  priority: parsed.priority || '',
  customerTone: result.customerTone || '',
  acknowledgementDraft: parsed.acknowledgementDraft || '',
  escalated: result.escalate === true,
};

// Shaped for review_queue, used only if routeIndex === 1 (legitimate + escalated).
const reviewRow = {
  referenceId,
  timestamp,
  label: 'legitimate',
  reason: result.escalationReason || '',
  summary: result.summary || '',
  transcript: JSON.stringify(result.transcript || []),
};

const routes = routeIndex === 1 ? ['complaints_register', 'review_queue'] : ['complaints_register'];

return [{
  json: {
    registerRow,
    reviewRow,
    routeIndex,
    referenceId,
    category: parsed.category || null,
    priority: parsed.priority || null,
    routes,
  },
}];`,
    };

    @node({
        id: '89c9ee90-35c1-49b0-8577-fa76a738ca10',
        name: 'Routing Agent Failure',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1000, 180],
    })
    RoutingAgentFailure = {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `// Same as Finalize Legitimate Record: the Agent's error output only carries { error },
// so result must be recovered from Route Switch's output, not from $input.first().json.
const result = $('Route Switch').item.json.result || {};
const err = $input.first().json.error;
const message = (err && (err.message || err.description)) || 'unknown error';
const referenceId = result.referenceId;
const timestamp = new Date().toISOString();

// Never fail silently: a routing-agent failure still reaches a human, via review_queue
// rather than complaints_register (no category/priority/acknowledgementDraft to store).
const reviewRow = {
  referenceId,
  timestamp,
  label: 'legitimate',
  reason: 'routing agent failure: ' + message,
  summary: result.summary || '',
  transcript: JSON.stringify(result.transcript || []),
};

return [{
  json: {
    reviewRow,
    routes: ['review_queue'],
    referenceId,
    category: null,
    priority: null,
  },
}];`,
    };

    @node({
        id: 'bd114ffe-b5c3-4e85-b367-a32cafd89e17',
        name: 'Write Complaints Register',
        type: 'n8n-nodes-base.dataTable',
        version: 1.1,
        position: [1250, -100],
    })
    WriteComplaintsRegister = {
        resource: 'row',
        operation: 'insert',
        dataTableId: {
            __rl: true,
            value: 'mMEMGqB3jWfJe4iA',
            mode: 'id',
        },
        columns: {
            mappingMode: 'defineBelow',
            value: {
                referenceId: '={{ $json.registerRow.referenceId }}',
                timestamp: '={{ $json.registerRow.timestamp }}',
                summary: '={{ $json.registerRow.summary }}',
                extracted: '={{ $json.registerRow.extracted }}',
                category: '={{ $json.registerRow.category }}',
                priority: '={{ $json.registerRow.priority }}',
                customerTone: '={{ $json.registerRow.customerTone }}',
                acknowledgementDraft: '={{ $json.registerRow.acknowledgementDraft }}',
                escalated: '={{ $json.registerRow.escalated }}',
            },
            matchingColumns: [],
            schema: [
                {
                    id: 'referenceId',
                    displayName: 'referenceId',
                    type: 'string',
                    required: false,
                    defaultMatch: false,
                    canBeUsedToMatch: true,
                    display: true,
                },
                {
                    id: 'timestamp',
                    displayName: 'timestamp',
                    type: 'string',
                    required: false,
                    defaultMatch: false,
                    canBeUsedToMatch: true,
                    display: true,
                },
                {
                    id: 'summary',
                    displayName: 'summary',
                    type: 'string',
                    required: false,
                    defaultMatch: false,
                    canBeUsedToMatch: true,
                    display: true,
                },
                {
                    id: 'extracted',
                    displayName: 'extracted',
                    type: 'string',
                    required: false,
                    defaultMatch: false,
                    canBeUsedToMatch: true,
                    display: true,
                },
                {
                    id: 'category',
                    displayName: 'category',
                    type: 'string',
                    required: false,
                    defaultMatch: false,
                    canBeUsedToMatch: true,
                    display: true,
                },
                {
                    id: 'priority',
                    displayName: 'priority',
                    type: 'string',
                    required: false,
                    defaultMatch: false,
                    canBeUsedToMatch: true,
                    display: true,
                },
                {
                    id: 'customerTone',
                    displayName: 'customerTone',
                    type: 'string',
                    required: false,
                    defaultMatch: false,
                    canBeUsedToMatch: true,
                    display: true,
                },
                {
                    id: 'acknowledgementDraft',
                    displayName: 'acknowledgementDraft',
                    type: 'string',
                    required: false,
                    defaultMatch: false,
                    canBeUsedToMatch: true,
                    display: true,
                },
                {
                    id: 'escalated',
                    displayName: 'escalated',
                    type: 'boolean',
                    required: false,
                    defaultMatch: false,
                    canBeUsedToMatch: true,
                    display: true,
                },
            ],
        },
    };

    @node({
        id: '2a2dba5f-b9cc-40ca-a0fb-d180e003e393',
        name: 'Escalated Check',
        type: 'n8n-nodes-base.switch',
        version: 3.4,
        position: [1500, -100],
    })
    EscalatedCheck = {
        mode: 'expression',
        numberOutputs: 2,
        output: "={{ $('Finalize Legitimate Record').item.json.routeIndex === 1 ? 1 : 0 }}",
    };

    @node({
        id: '3f418ebd-7d10-4b52-afc3-639100b0af7e',
        name: 'Build Review Queue Row',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1000, 400],
    })
    BuildReviewQueueRow = {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `const item = $input.first().json;
const result = item.result || {};
const referenceId = result.referenceId;
const timestamp = new Date().toISOString();
const reason = result.unknownReason || result.escalationReason || '';

const reviewRow = {
  referenceId,
  timestamp,
  label: result.label,
  reason,
  summary: result.summary || '',
  transcript: JSON.stringify(result.transcript || []),
};

return [{
  json: {
    reviewRow,
    routes: ['review_queue'],
    referenceId,
    category: null,
    priority: null,
  },
}];`,
    };

    @node({
        id: '668e4763-3ba0-4876-8e65-334b8d518bf9',
        name: 'Build Not Legitimate Log Row',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1000, 600],
    })
    BuildNotLegitimateLogRow = {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `const item = $input.first().json;
const result = item.result || {};
const timestamp = new Date().toISOString();

const logRow = {
  timestamp,
  reasons: JSON.stringify(result.reasons || []),
  summary: result.summary || '',
};

return [{
  json: {
    logRow,
    routes: ['not_legitimate_log'],
    referenceId: result.referenceId,
    category: null,
    priority: null,
  },
}];`,
    };

    @node({
        id: 'e4bacf1f-bbd7-4a18-9b8c-ab5423b29d68',
        name: 'Prepare Review Queue Row',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1250, 300],
    })
    PrepareReviewQueueRow = {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `// Data Table insert output only carries the inserted row's own columns, so a path that
// goes through "Write Complaints Register" first (escalated legitimate) loses reviewRow.
// Recover it from Finalize Legitimate Record in that case; otherwise it's already here.
function tryNode(name) {
  try {
    const it = $(name).item;
    return it ? it.json : null;
  } catch (e) {
    return null;
  }
}

const direct = $input.first().json;
const reviewRow = direct.reviewRow || (tryNode('Finalize Legitimate Record') || {}).reviewRow;

return [{ json: { reviewRow } }];`,
    };

    @node({
        id: 'f32d83de-b07f-483c-98fd-2c83012462b4',
        name: 'Write Review Queue',
        type: 'n8n-nodes-base.dataTable',
        version: 1.1,
        position: [1500, 300],
    })
    WriteReviewQueue = {
        resource: 'row',
        operation: 'insert',
        dataTableId: {
            __rl: true,
            value: 'ZVW4CiFnlbBwWTWZ',
            mode: 'id',
        },
        columns: {
            mappingMode: 'defineBelow',
            value: {
                referenceId: '={{ $json.reviewRow.referenceId }}',
                timestamp: '={{ $json.reviewRow.timestamp }}',
                label: '={{ $json.reviewRow.label }}',
                reason: '={{ $json.reviewRow.reason }}',
                summary: '={{ $json.reviewRow.summary }}',
                transcript: '={{ $json.reviewRow.transcript }}',
            },
            matchingColumns: [],
            schema: [
                {
                    id: 'referenceId',
                    displayName: 'referenceId',
                    type: 'string',
                    required: false,
                    defaultMatch: false,
                    canBeUsedToMatch: true,
                    display: true,
                },
                {
                    id: 'timestamp',
                    displayName: 'timestamp',
                    type: 'string',
                    required: false,
                    defaultMatch: false,
                    canBeUsedToMatch: true,
                    display: true,
                },
                {
                    id: 'label',
                    displayName: 'label',
                    type: 'string',
                    required: false,
                    defaultMatch: false,
                    canBeUsedToMatch: true,
                    display: true,
                },
                {
                    id: 'reason',
                    displayName: 'reason',
                    type: 'string',
                    required: false,
                    defaultMatch: false,
                    canBeUsedToMatch: true,
                    display: true,
                },
                {
                    id: 'summary',
                    displayName: 'summary',
                    type: 'string',
                    required: false,
                    defaultMatch: false,
                    canBeUsedToMatch: true,
                    display: true,
                },
                {
                    id: 'transcript',
                    displayName: 'transcript',
                    type: 'string',
                    required: false,
                    defaultMatch: false,
                    canBeUsedToMatch: true,
                    display: true,
                },
            ],
        },
    };

    @node({
        id: '0f40e400-a68e-4260-88cb-f3bd0ebb7561',
        name: 'Write Not Legitimate Log',
        type: 'n8n-nodes-base.dataTable',
        version: 1.1,
        position: [1250, 600],
    })
    WriteNotLegitimateLog = {
        resource: 'row',
        operation: 'insert',
        dataTableId: {
            __rl: true,
            value: 'zyC9WzSyeEj9UVxc',
            mode: 'id',
        },
        columns: {
            mappingMode: 'defineBelow',
            value: {
                timestamp: '={{ $json.logRow.timestamp }}',
                reasons: '={{ $json.logRow.reasons }}',
                summary: '={{ $json.logRow.summary }}',
                referenceId: '={{ $json.referenceId }}',
            },
            matchingColumns: [],
            schema: [
                {
                    id: 'timestamp',
                    displayName: 'timestamp',
                    type: 'string',
                    required: false,
                    defaultMatch: false,
                    canBeUsedToMatch: true,
                    display: true,
                },
                {
                    id: 'reasons',
                    displayName: 'reasons',
                    type: 'string',
                    required: false,
                    defaultMatch: false,
                    canBeUsedToMatch: true,
                    display: true,
                },
                {
                    id: 'summary',
                    displayName: 'summary',
                    type: 'string',
                    required: false,
                    defaultMatch: false,
                    canBeUsedToMatch: true,
                    display: true,
                },
                {
                    id: 'referenceId',
                    displayName: 'referenceId',
                    type: 'string',
                    required: false,
                    defaultMatch: false,
                    canBeUsedToMatch: true,
                    display: true,
                },
            ],
        },
    };

    @node({
        id: '3a41e82e-9c57-4c99-9124-ad3d532d821c',
        name: 'Finalize Routing Result',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1750, 100],
    })
    FinalizeRoutingResult = {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `// Data Table inserts strip any field that isn't one of the table's own columns, so recover
// the routing metadata (referenceId, routes, category, priority) from whichever upstream
// metadata-producing node actually ran on this execution path, not from $json.
function tryNode(name) {
  try {
    const it = $(name).item;
    return it ? it.json : null;
  } catch (e) {
    return null;
  }
}

const source =
  tryNode('Finalize Legitimate Record') ||
  tryNode('Routing Agent Failure') ||
  tryNode('Build Review Queue Row') ||
  tryNode('Build Not Legitimate Log Row');

return [{
  json: {
    referenceId: source ? source.referenceId : null,
    routes: source ? source.routes : [],
    category: source ? source.category ?? null : null,
    priority: source ? source.priority ?? null : null,
  },
}];`,
    };

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.RouterTrigger.out(0).to(this.DetermineRoute.in(0));
        this.DetermineRoute.out(0).to(this.RouteSwitch.in(0));
        this.RouteSwitch.out(0).to(this.RoutingAgent.in(0));
        this.RouteSwitch.out(1).to(this.RoutingAgent.in(0));
        this.RouteSwitch.out(2).to(this.BuildReviewQueueRow.in(0));
        this.RouteSwitch.out(3).to(this.BuildNotLegitimateLogRow.in(0));
        this.RoutingAgent.out(0).to(this.FinalizeLegitimateRecord.in(0));
        this.RoutingAgent.out(1).to(this.RoutingAgentFailure.in(0));
        this.FinalizeLegitimateRecord.out(0).to(this.WriteComplaintsRegister.in(0));
        this.WriteComplaintsRegister.out(0).to(this.EscalatedCheck.in(0));
        this.EscalatedCheck.out(0).to(this.FinalizeRoutingResult.in(0));
        this.EscalatedCheck.out(1).to(this.PrepareReviewQueueRow.in(0));
        this.RoutingAgentFailure.out(0).to(this.PrepareReviewQueueRow.in(0));
        this.BuildReviewQueueRow.out(0).to(this.PrepareReviewQueueRow.in(0));
        this.PrepareReviewQueueRow.out(0).to(this.WriteReviewQueue.in(0));
        this.WriteReviewQueue.out(0).to(this.FinalizeRoutingResult.in(0));
        this.BuildNotLegitimateLogRow.out(0).to(this.WriteNotLegitimateLog.in(0));
        this.WriteNotLegitimateLog.out(0).to(this.FinalizeRoutingResult.in(0));

        this.RoutingResultParser.uses({
            ai_languageModel: this.RoutingModel.output,
        });
        this.RoutingAgent.uses({
            ai_languageModel: this.RoutingModel.output,
            ai_outputParser: this.RoutingResultParser.output,
        });
    }
}
