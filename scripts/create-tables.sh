#!/usr/bin/env bash
# Creates the three n8n Data Tables router.workflow.ts writes to, via the
# n8n REST API. Idempotent: skips any table that already exists by name.
# Run once after a fresh n8n volume, before testing routed conversations.
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

echo "Data Tables ready:"
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$BASE_URL/api/v1/data-tables" | jq -r '.data[].name'
