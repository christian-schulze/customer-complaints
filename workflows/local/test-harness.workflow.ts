import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : Test Harness
// Nodes   : 6  |  Connections: 5
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// Webhook                            webhook                    [creds]
// Config                             set
// CallClassifierCore                 executeWorkflow
// DoneCheck                          switch
// CallRouter                         executeWorkflow
// FinalizeHarnessResponse            code
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// Webhook
//    → Config
//      → CallClassifierCore
//        → DoneCheck
//         .out(1) → CallRouter
//            → FinalizeHarnessResponse
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'Jh40d9BY4nitlVAx',
    name: 'Test Harness',
    active: true,
    isArchived: false,
    projectId: 'ZoCl8PNtu0LdHnhV',
    settings: { executionOrder: 'v1' },
})
export class TestHarnessWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: '98881c5b-d91d-4648-8e36-e54b8b322e64',
        webhookId: '4f3ab191-36d4-4250-9fec-d7e9e62db068',
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        version: 2.1,
        position: [-250, 0],
        credentials: { httpHeaderAuth: { id: 'uzIlBcfZyKG2AMDU', name: 'Test Harness Webhook Secret' } },
    })
    Webhook = {
        httpMethod: 'POST',
        path: 'test-harness',
        authentication: 'headerAuth',
        responseMode: 'lastNode',
        responseData: 'firstEntryJson',
    };

    @node({
        id: '32a27c5a-d616-468b-9dee-23fd8163a7f5',
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
                    name: 'sessionId',
                    value: '={{ $json.body.sessionId }}',
                    type: 'string',
                },
                {
                    id: '2',
                    name: 'message',
                    value: '={{ $json.body.message }}',
                    type: 'string',
                },
                {
                    id: '3',
                    name: 'insurerName',
                    value: "={{ $json.body.config?.insurerName ?? 'ACME Insurance' }}",
                    type: 'string',
                },
                {
                    id: '4',
                    name: 'products',
                    value: '={{ $json.body.config?.products ?? ["motor", "home", "travel"] }}',
                    type: 'array',
                },
                {
                    id: '5',
                    name: 'maxFollowUps',
                    value: '={{ $json.body.config?.maxFollowUps ?? 3 }}',
                    type: 'number',
                },
                {
                    id: '6',
                    name: 'confidenceThreshold',
                    value: '={{ $json.body.config?.confidenceThreshold ?? 0.7 }}',
                    type: 'number',
                },
            ],
        },
        includeOtherFields: false,
    };

    @node({
        id: '5d10e750-0e45-4793-b66b-30ddd4df5500',
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
                message: '={{ $json.message }}',
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
        id: '3a8c9a10-ffbd-4570-a23d-adccf15dd0ad',
        name: 'Done Check',
        type: 'n8n-nodes-base.switch',
        version: 3.4,
        position: [500, 0],
    })
    DoneCheck = {
        mode: 'expression',
        numberOutputs: 2,
        output: '={{ $json.done ? 1 : 0 }}',
    };

    @node({
        id: 'ec2a0b93-b524-470a-ad1d-f7a415f6e521',
        name: 'Call Router',
        type: 'n8n-nodes-base.executeWorkflow',
        version: 1.3,
        position: [750, 150],
    })
    CallRouter = {
        source: 'database',
        workflowId: {
            __rl: true,
            value: 'lcuFTh9kerJUgkf2',
            mode: 'id',
        },
        workflowInputs: {
            mappingMode: 'defineBelow',
            value: {
                result: '={{ $json.result }}',
                config: "={{ { insurerName: $('Config').item.json.insurerName, products: $('Config').item.json.products, maxFollowUps: $('Config').item.json.maxFollowUps, confidenceThreshold: $('Config').item.json.confidenceThreshold } }}",
            },
            matchingColumns: [],
            schema: [
                {
                    id: 'result',
                    displayName: 'result',
                    type: 'object',
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
        id: '53db750b-dd3e-4cee-8de0-70553f8159b7',
        name: 'Finalize Harness Response',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1000, 150],
    })
    FinalizeHarnessResponse = {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `const classifier = $('Call Classifier Core').item.json;
const routing = $('Call Router').item.json;

return [{
  json: {
    reply: classifier.reply,
    done: classifier.done,
    result: classifier.result,
    routing,
  },
}];`,
    };

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.Webhook.out(0).to(this.Config.in(0));
        this.Config.out(0).to(this.CallClassifierCore.in(0));
        this.CallClassifierCore.out(0).to(this.DoneCheck.in(0));
        this.DoneCheck.out(1).to(this.CallRouter.in(0));
        this.CallRouter.out(0).to(this.FinalizeHarnessResponse.in(0));
    }
}
