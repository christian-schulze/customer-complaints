#!/usr/bin/env bash
# Creates the httpHeaderAuth credential test-harness.workflow.ts's Webhook
# node uses, via the n8n REST API. Idempotent: skips if a credential with
# the same name already exists. Run once after a fresh n8n volume, before
# testing the harness.
set -euo pipefail

cd "$(dirname "$0")/.."
set -a
source .env
set +a

BASE_URL="${N8N_BASE_URL:-http://localhost:5678}"
CRED_NAME="Test Harness Webhook Secret"

existing=$(curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$BASE_URL/api/v1/credentials" | jq -r '.data[]? | select(.name == "'"$CRED_NAME"'") | .id')

if [[ -n "$existing" ]]; then
  echo "skip: $CRED_NAME (already exists, id=$existing)"
  exit 0
fi

body=$(jq -n --arg name "$CRED_NAME" --arg secret "$TEST_WEBHOOK_SECRET" \
  '{name: $name, type: "httpHeaderAuth", data: {name: "TEST_WEBHOOK_SECRET", value: $secret}}')

resp=$(curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" -H "Content-Type: application/json" \
  "$BASE_URL/api/v1/credentials" -d "$body")

if jq -e '.id' >/dev/null 2>&1 <<<"$resp"; then
  echo "created: $CRED_NAME (id=$(jq -r '.id' <<<"$resp"))"
else
  echo "error creating credential: $resp" >&2
  exit 1
fi
