import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : Complaints Chat
// Nodes   : 4  |  Connections: 3
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// Config                             set
// ChatTrigger                        chatTrigger
// CallClassifierCore                 executeWorkflow
// FormatChatResponse                 set
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// ChatTrigger
//    → Config
//      → CallClassifierCore
//        → FormatChatResponse
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: '3DTkBZ3xEmbu3ima',
    name: 'Complaints Chat',
    active: false,
    isArchived: false,
    settings: { executionOrder: 'v1' },
})
export class ComplaintsChatWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: '6f9f955b-8a19-4a09-9f39-2a18c9869280',
        name: 'Config',
        type: 'n8n-nodes-base.set',
        version: 3.5,
        position: [0, 0],
    })
    Config = {
        mode: 'manual',
        assignments: {
            assignments: [
                {
                    id: '1',
                    name: 'insurerName',
                    value: 'ACME Insurance',
                    type: 'string',
                },
                {
                    id: '2',
                    name: 'products',
                    value: '={{ ["motor", "home", "travel"] }}',
                    type: 'array',
                },
                {
                    id: '3',
                    name: 'maxFollowUps',
                    value: 3,
                    type: 'number',
                },
                {
                    id: '4',
                    name: 'confidenceThreshold',
                    value: 0.7,
                    type: 'number',
                },
            ],
        },
        includeOtherFields: true,
    };

    @node({
        id: 'cfb5f7a7-d8d9-452e-bee2-39d18a34c7ec',
        webhookId: '39340647-22f2-47e3-80b4-d4a944895fde',
        name: 'Chat Trigger',
        type: '@n8n/n8n-nodes-langchain.chatTrigger',
        version: 1.4,
        position: [-250, 0],
    })
    ChatTrigger = {
        public: true,
        mode: 'hostedChat',
        authentication: 'none',
        options: {
            responseMode: 'lastNode',
        },
    };

    @node({
        id: '6a3b0eff-ab63-4685-bd01-801fd22d9d58',
        name: 'Call Classifier Core',
        type: 'n8n-nodes-base.executeWorkflow',
        version: 1.3,
        position: [250, 0],
    })
    CallClassifierCore = {
        source: 'database',
        workflowId: {
            __rl: true,
            value: 'Ka2qqZQ9mv8HbkcI',
            mode: 'id',
        },
        workflowInputs: {
            mappingMode: 'defineBelow',
            value: {
                sessionId: '={{ $json.sessionId }}',
                message: '={{ $json.chatInput }}',
                config: '={{ { insurerName: $json.insurerName, products: $json.products, maxFollowUps: $json.maxFollowUps, confidenceThreshold: $json.confidenceThreshold } }}',
            },
            matchingColumns: [],
            schema: [
                {
                    id: 'sessionId',
                    displayName: 'sessionId',
                    type: 'string',
                    required: false,
                    defaultMatch: false,
                    canBeUsedToMatch: true,
                    display: true,
                },
                {
                    id: 'message',
                    displayName: 'message',
                    type: 'string',
                    required: false,
                    defaultMatch: false,
                    canBeUsedToMatch: true,
                    display: true,
                },
                {
                    id: 'config',
                    displayName: 'config',
                    type: 'object',
                    required: false,
                    defaultMatch: false,
                    canBeUsedToMatch: true,
                    display: true,
                },
            ],
        },
        options: {
            waitForSubWorkflow: true,
        },
    };

    @node({
        id: 'de205a98-4606-4d16-89d2-7ab0ee498b68',
        name: 'Format Chat Response',
        type: 'n8n-nodes-base.set',
        version: 3.5,
        position: [500, 0],
    })
    FormatChatResponse = {
        mode: 'manual',
        assignments: {
            assignments: [
                {
                    id: '1',
                    name: 'output',
                    value: '={{ $json.reply }}',
                    type: 'string',
                },
            ],
        },
        includeOtherFields: false,
    };

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.ChatTrigger.out(0).to(this.Config.in(0));
        this.Config.out(0).to(this.CallClassifierCore.in(0));
        this.CallClassifierCore.out(0).to(this.FormatChatResponse.in(0));
    }
}
