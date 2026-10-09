#!/usr/bin/env bash
# Adds a `referenceId` string column to the not_legitimate_log Data Table,
# via the n8n REST API. Idempotent: skips if the column already exists.
# Existing rows get a null referenceId; new ones get it once
# router.workflow.ts's Write Not Legitimate Log node maps it.
set -euo pipefail

cd "$(dirname "$0")/.."
set -a
source .env
set +a

BASE_URL="${N8N_BASE_URL:-http://localhost:5678}"

TABLE_ID=$(curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$BASE_URL/api/v1/data-tables" \
  | jq -r '.data[] | select(.name == "not_legitimate_log") | .id')

if [[ -z "$TABLE_ID" ]]; then
  echo "error: not_legitimate_log table not found" >&2
  exit 1
fi

existing=$(curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$BASE_URL/api/v1/data-tables/$TABLE_ID/columns" \
  | jq -r '.[].name')

if grep -qx "referenceId" <<<"$existing"; then
  echo "skip: referenceId column already exists on not_legitimate_log"
  exit 0
fi

resp=$(curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" -H "Content-Type: application/json" \
  "$BASE_URL/api/v1/data-tables/$TABLE_ID/columns" \
  -d '{"name": "referenceId", "type": "string"}')

if jq -e '.id' >/dev/null 2>&1 <<<"$resp"; then
  echo "created: referenceId column on not_legitimate_log"
else
  echo "error creating column: $resp" >&2
  exit 1
fi
