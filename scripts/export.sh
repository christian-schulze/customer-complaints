#!/usr/bin/env bash
# Exports all project workflows from the Local n8n instance as importable JSON
# into n8n-export/, for reviewers who don't want to run n8n-as-code.
# Run before every commit that changes workflows.
set -euo pipefail

cd "$(dirname "$0")/.."

mkdir -p n8n-export

docker compose exec -T n8n n8n export:workflow \
  --all \
  --published \
  --pretty \
  --separate \
  --output=/tmp/n8n-export

docker compose cp n8n:/tmp/n8n-export/. ./n8n-export/
docker compose exec -T n8n rm -rf /tmp/n8n-export

# Rename from workflow-id.json to a readable slug of the workflow's name.
for f in n8n-export/*.json; do
  slug=$(jq -r '.name' "$f" | tr '[:upper:]' '[:lower:]' | tr -s ' ' '-')
  mv "$f" "n8n-export/${slug}.json"
done

echo "Exported workflows to n8n-export/:"
ls -1 n8n-export/
