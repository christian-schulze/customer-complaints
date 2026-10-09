#!/usr/bin/env bash
# Creates the three n8n Data Tables router.workflow.ts writes to, via the
# n8n REST API, and ensures not_legitimate_log has the referenceId column
# the test runner's cleanup command needs. Idempotent: skips any table or
# column that already exists. Run once after a fresh n8n volume, before
# testing routed conversations.
set -euo pipefail

cd "$(dirname "$0")/.."
set -a
source .env
set +a

BASE_URL="${N8N_BASE_URL:-http://localhost:5678}"

existing=$(curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$BASE_URL/api/v1/data-tables" | jq -r '.data[].name')

create_table() {
  local name="$1"
  local columns="$2"

  if grep -qx "$name" <<<"$existing"; then
    echo "skip: $name (already exists)"
    return
  fi

  local body
  body=$(jq -n --arg name "$name" --argjson columns "$columns" '{name: $name, columns: $columns}')

  local resp
  resp=$(curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" -H "Content-Type: application/json" \
    "$BASE_URL/api/v1/data-tables" -d "$body")

  if jq -e '.id' >/dev/null 2>&1 <<<"$resp"; then
    echo "created: $name"
  else
    echo "error creating $name: $resp" >&2
    exit 1
  fi
}

create_table "complaints_register" '[
  {"name": "referenceId", "type": "string"},
  {"name": "timestamp", "type": "string"},
  {"name": "summary", "type": "string"},
  {"name": "extracted", "type": "string"},
  {"name": "category", "type": "string"},
  {"name": "priority", "type": "string"},
  {"name": "customerTone", "type": "string"},
  {"name": "acknowledgementDraft", "type": "string"},
  {"name": "escalated", "type": "boolean"}
]'

create_table "review_queue" '[
  {"name": "referenceId", "type": "string"},
  {"name": "timestamp", "type": "string"},
  {"name": "label", "type": "string"},
  {"name": "reason", "type": "string"},
  {"name": "summary", "type": "string"},
  {"name": "transcript", "type": "string"}
]'

create_table "not_legitimate_log" '[
  {"name": "timestamp", "type": "string"},
  {"name": "reasons", "type": "string"},
  {"name": "summary", "type": "string"}
]'

# not_legitimate_log was the one table without a referenceId (PRD §6.8),
# which left the test runner's cleanup command unable to identify its own
# rows there the way it could for the other two tables.
not_legit_table_id=$(curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$BASE_URL/api/v1/data-tables" \
  | jq -r '.data[] | select(.name == "not_legitimate_log") | .id')

existing_columns=$(curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$BASE_URL/api/v1/data-tables/$not_legit_table_id/columns" \
  | jq -r '.[].name')

if grep -qx "referenceId" <<<"$existing_columns"; then
  echo "skip: referenceId column on not_legitimate_log (already exists)"
else
  resp=$(curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" -H "Content-Type: application/json" \
    "$BASE_URL/api/v1/data-tables/$not_legit_table_id/columns" \
    -d '{"name": "referenceId", "type": "string"}')

  if jq -e '.id' >/dev/null 2>&1 <<<"$resp"; then
    echo "created: referenceId column on not_legitimate_log"
  else
    echo "error creating referenceId column: $resp" >&2
    exit 1
  fi
fi

echo "Data Tables ready:"
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$BASE_URL/api/v1/data-tables" | jq -r '.data[].name'
