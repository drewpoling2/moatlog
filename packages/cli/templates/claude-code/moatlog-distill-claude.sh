#!/usr/bin/env bash
set -uo pipefail

input=$(cat)

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROJECT_NAME="__PROJECT_NAME__"
MOATLOG_DIR="$PROJECT_ROOT/.moatlog"

DATE=$(date -u +%Y-%m-%d)
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
LOG_FILE="$MOATLOG_DIR/events-$DATE.jsonl"

session_id=$(echo "$input" | jq -r '.session_id // .conversation_id // empty')
tool_use_id=$(echo "$input" | jq -r '.tool_use_id // empty')

if [[ -z "$session_id" ]]; then
  session_id="unknown"
fi

mkdir -p "$MOATLOG_DIR"

if [[ -n "$tool_use_id" ]]; then
  event=$(jq -nc \
    --arg id "$ID" \
    --arg timestamp "$TIMESTAMP" \
    --arg sessionId "$session_id" \
    --arg generationId "$tool_use_id" \
    --arg action "agent_stop" \
    --arg projectName "$PROJECT_NAME" \
    '{id: $id, timestamp: $timestamp, sessionId: $sessionId, generationId: $generationId, agent: "claude-code", action: $action, projectName: $projectName}')
else
  event=$(jq -nc \
    --arg id "$ID" \
    --arg timestamp "$TIMESTAMP" \
    --arg sessionId "$session_id" \
    --arg action "agent_stop" \
    --arg projectName "$PROJECT_NAME" \
    '{id: $id, timestamp: $timestamp, sessionId: $sessionId, agent: "claude-code", action: $action, projectName: $projectName}')
fi

echo "$event" >> "$LOG_FILE"

if [[ ! -d "$MOATLOG_DIR" ]]; then
  exit 0
fi

cd "$PROJECT_ROOT"

if command -v moatlog >/dev/null 2>&1; then
  moatlog distill >/dev/null 2>&1 || true
elif [[ -x "$PROJECT_ROOT/node_modules/.bin/moatlog" ]]; then
  "$PROJECT_ROOT/node_modules/.bin/moatlog" distill >/dev/null 2>&1 || true
else
  npx -y @moatlog/cli distill >/dev/null 2>&1 || true
fi

exit 0
