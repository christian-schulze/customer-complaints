#!/usr/bin/env bash
# Corrects the two cross-workflow references and activates all four
# workflows on the Local n8n instance, from any starting state.
#
# n8n never lets a caller choose a workflow's ID on creation, so
# chat.workflow.ts's and test-harness.workflow.ts's "Call Classifier Core"/
# "Call Router" Execute Workflow nodes can only point at whatever ID
# classifier-core/router happened to get on THIS instance's last load - not
# whatever is committed in workflows/local/*.workflow.ts. This script
# resolves the real IDs by name and corrects the two nodes via a direct API
# update, then activates in dependency order. It never reads or writes
# workflows/local/*.workflow.ts (see
# openspec/changes/fix-workflow-id-portability/design.md Decision 1) - run
# it once after loading the four workflows with `npx n8nac push
# <file>.workflow.ts --verify` for each of the four files (the only
# documented load path - see design.md Decision 3). Idempotent: safe to
# re-run.
set -euo pipefail

cd "$(dirname "$0")/.."
set -a
source .env
set +a

BASE_URL="${N8N_BASE_URL:-http://localhost:5678}"

CLASSIFIER_CORE_NAME="Classifier Core"
ROUTER_NAME="Router"
CHAT_NAME="Complaints Chat"
TEST_HARNESS_NAME="Test Harness"
ANTHROPIC_CREDENTIAL_NAME="Anthropic account"
WEBHOOK_CREDENTIAL_NAME="Test Harness Webhook Secret"

# Fields the workflow-update PUT rejects: either read-only (id, active,
# versionId, ...) or, when null, rejected outright instead of being treated
# as absent (description). Confirmed live against this n8n version (2.42.5).
READONLY_WORKFLOW_FIELDS='.id, .active, .activeVersion, .activeVersionId, .createdAt, .isArchived, .meta, .nodeGroups, .shared, .sourceWorkflowId, .tags, .triggerCount, .updatedAt, .versionCounter, .versionId'

api() {
  local method="$1" path="$2" data="${3:-}"
  if [[ -n "$data" ]]; then
    curl -sf -X "$method" -H "X-N8N-API-KEY: $N8N_API_KEY" -H "Content-Type: application/json" \
      "$BASE_URL/api/v1$path" -d "$data"
  else
    curl -sf -X "$method" -H "X-N8N-API-KEY: $N8N_API_KEY" "$BASE_URL/api/v1$path"
  fi
}

workflow_id_by_name() {
  local name="$1"
  local matches count
  matches=$(api GET "/workflows" | jq -c --arg name "$name" '[.data[] | select(.name == $name)]')
  count=$(jq 'length' <<<"$matches")
  if [[ "$count" -eq 0 ]]; then
    echo "error: no workflow named '$name' found on this instance" >&2
    exit 1
  elif [[ "$count" -gt 1 ]]; then
    echo "error: ambiguous workflow name '$name' - multiple workflows share it:" >&2
    jq -r '.[] | "  \(.id)\t\(.name)"' <<<"$matches" >&2
    exit 1
  fi
  jq -r '.[0].id' <<<"$matches"
}

require_credential() {
  local name="$1" neededBy="$2"
  if ! api GET "/credentials" | jq -e --arg name "$name" '.data[] | select(.name == $name)' >/dev/null; then
    echo "error: credential '$name' not found on this instance - required by '$neededBy'" >&2
    exit 1
  fi
}

# Updates wf_id's "Call Classifier Core"/"Call Router" Execute Workflow
# nodes (if present) to point at classifier_id/router_id. No-op, and no API
# write, if both already match.
fix_execute_workflow_refs() {
  local wf_id="$1" classifier_id="$2" router_id="$3"
  local def updated
  def=$(api GET "/workflows/$wf_id")
  updated=$(jq --arg cid "$classifier_id" --arg rid "$router_id" '
    .nodes |= map(
      if .type == "n8n-nodes-base.executeWorkflow" and .name == "Call Classifier Core" then
        .parameters.workflowId.value = $cid
      elif .type == "n8n-nodes-base.executeWorkflow" and .name == "Call Router" then
        .parameters.workflowId.value = $rid
      else . end
    )
  ' <<<"$def")

  local name
  name=$(jq -r '.name' <<<"$def")

  if diff <(jq -c '.nodes' <<<"$def") <(jq -c '.nodes' <<<"$updated") >/dev/null; then
    echo "skip: $name already references the current Classifier Core/Router IDs"
    return
  fi

  local body
  body=$(jq "del($READONLY_WORKFLOW_FIELDS) | if .description == null then del(.description) else . end" <<<"$updated")
  api PUT "/workflows/$wf_id" "$body" >/dev/null
  echo "updated: $name -> Call Classifier Core=$classifier_id, Call Router=$router_id"
}

activate() {
  local wf_id="$1" name="$2"
  local active
  active=$(api GET "/workflows/$wf_id" | jq -r '.active')
  if [[ "$active" == "true" ]]; then
    echo "skip: $name already active"
    return
  fi
  api POST "/workflows/$wf_id/activate" >/dev/null
  echo "activated: $name"
}

echo "== Resolving workflow IDs by name =="
CLASSIFIER_CORE_ID=$(workflow_id_by_name "$CLASSIFIER_CORE_NAME")
ROUTER_ID=$(workflow_id_by_name "$ROUTER_NAME")
CHAT_ID=$(workflow_id_by_name "$CHAT_NAME")
TEST_HARNESS_ID=$(workflow_id_by_name "$TEST_HARNESS_NAME")
echo "$CLASSIFIER_CORE_NAME -> $CLASSIFIER_CORE_ID"
echo "$ROUTER_NAME -> $ROUTER_ID"
echo "$CHAT_NAME -> $CHAT_ID"
echo "$TEST_HARNESS_NAME -> $TEST_HARNESS_ID"

echo "== Checking required credentials =="
require_credential "$ANTHROPIC_CREDENTIAL_NAME" "$CLASSIFIER_CORE_NAME/$ROUTER_NAME"
require_credential "$WEBHOOK_CREDENTIAL_NAME" "$TEST_HARNESS_NAME"

echo "== Correcting cross-workflow references =="
fix_execute_workflow_refs "$CHAT_ID" "$CLASSIFIER_CORE_ID" "$ROUTER_ID"
fix_execute_workflow_refs "$TEST_HARNESS_ID" "$CLASSIFIER_CORE_ID" "$ROUTER_ID"

echo "== Activating in dependency order =="
activate "$CLASSIFIER_CORE_ID" "$CLASSIFIER_CORE_NAME"
activate "$ROUTER_ID" "$ROUTER_NAME"
activate "$CHAT_ID" "$CHAT_NAME"
activate "$TEST_HARNESS_ID" "$TEST_HARNESS_NAME"

echo "== Verifying chat/test-harness against the n8nac schema =="
npx n8nac verify "$CHAT_ID"
npx n8nac verify "$TEST_HARNESS_ID"

echo "Done."
