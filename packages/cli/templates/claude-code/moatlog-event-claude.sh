#!/usr/bin/env bash
set -uo pipefail

input=$(cat)

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROJECT_NAME="__PROJECT_NAME__"

DEFAULT_MOATLOGIGNORE_PATTERNS=(
  ".env*"
  "*.pem"
  "*.key"
  "id_rsa*"
  "*credentials*"
  ".npmrc"
)

MOATLOGIGNORE_USER_PATTERNS=()

load_moatlogignore_patterns() {
  MOATLOGIGNORE_USER_PATTERNS=()
  local ignore_file="$PROJECT_ROOT/.moatlogignore"

  if [[ ! -f "$ignore_file" ]]; then
    return 0
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "$line" ]] && continue
    MOATLOGIGNORE_USER_PATTERNS+=("$line")
  done < "$ignore_file"
}

matches_moatlogignore_pattern() {
  local rel="$1"
  local pattern="$2"
  local basename="${rel##*/}"

  if [[ "$pattern" == */* ]]; then
    [[ "$rel" == $pattern ]]
    return
  fi

  [[ "$basename" == $pattern || "$rel" == $pattern ]]
}

matches_moatlogignore() {
  local rel="$1"
  local pattern

  for pattern in "${DEFAULT_MOATLOGIGNORE_PATTERNS[@]}"; do
    if matches_moatlogignore_pattern "$rel" "$pattern"; then
      return 0
    fi
  done

  for pattern in "${MOATLOGIGNORE_USER_PATTERNS[@]}"; do
    if matches_moatlogignore_pattern "$rel" "$pattern"; then
      return 0
    fi
  done

  return 1
}

load_moatlogignore_patterns

hook_event=$(echo "$input" | jq -r '.hook_event_name // empty' | tr '[:upper:]' '[:lower:]')
session_id=$(echo "$input" | jq -r '.session_id // .conversation_id // empty')
tool_use_id=$(echo "$input" | jq -r '.tool_use_id // empty')
tool_name=$(echo "$input" | jq -r '.tool_name // empty' | tr '[:upper:]' '[:lower:]')

should_log_path() {
  local rel="$1"

  if [[ "$rel" == *node_modules* ]]; then return 1; fi
  if [[ "$rel" == */dist/* || "$rel" == dist/* ]]; then return 1; fi
  if [[ "$rel" == *".git"* ]]; then return 1; fi
  if [[ "$rel" == .moatlog/* ]]; then return 1; fi
  if [[ "$rel" == */.next/* || "$rel" == .next/* ]]; then return 1; fi
  if [[ "$rel" == */build/* || "$rel" == build/* ]]; then return 1; fi
  if [[ "$rel" == */coverage/* ]]; then return 1; fi
  if [[ "$rel" == *.map ]]; then return 1; fi
  if [[ "$rel" == *.d.ts ]]; then return 1; fi
  if matches_moatlogignore "$rel"; then return 1; fi

  return 0
}

resolve_absolute_path() {
  local raw_path="$1"
  local workspace_root="$2"

  if [[ -z "$raw_path" ]]; then
    return 1
  fi

  if [[ "$raw_path" == /* ]]; then
    printf '%s' "$raw_path"
    return 0
  fi

  if [[ -n "$workspace_root" ]]; then
    printf '%s' "$workspace_root/$raw_path"
    return 0
  fi

  printf '%s' "$PROJECT_ROOT/$raw_path"
  return 0
}

prepare_file_metadata() {
  local absolute_path="$1"

  rel_path="${absolute_path#$PROJECT_ROOT/}"
  if [[ "$rel_path" == "$absolute_path" ]]; then
    return 1
  fi

  if ! should_log_path "$rel_path"; then
    return 1
  fi

  if [[ "$rel_path" == *.* ]]; then
    extension=".${rel_path##*.}"
  else
    extension=""
  fi

  directory=$(dirname "$rel_path")
  if [[ "$directory" == "." ]]; then
    directory=""
  fi

  file_path="$absolute_path"
  return 0
}

is_noisy_shell_command() {
  local cmd="$1"
  local first
  first=$(echo "$cmd" | awk '{print $1}')
  case "$first" in
    cat|echo|ls|pwd|which|cd) return 0 ;;
  esac
  return 1
}

append_event() {
  echo "$event" >> "$LOG_FILE"
}

emit_path_event() {
  local action="$1"

  if [[ -n "$tool_use_id" ]]; then
    event=$(jq -nc \
      --arg id "$ID" \
      --arg timestamp "$TIMESTAMP" \
      --arg sessionId "$session_id" \
      --arg generationId "$tool_use_id" \
      --arg action "$action" \
      --arg path "$file_path" \
      --arg relativePath "$rel_path" \
      --arg extension "$extension" \
      --arg directory "$directory" \
      --arg projectName "$PROJECT_NAME" \
      '{id: $id, timestamp: $timestamp, sessionId: $sessionId, generationId: $generationId, agent: "claude-code", action: $action, path: $path, relativePath: $relativePath, extension: $extension, directory: $directory, projectName: $projectName}')
  else
    event=$(jq -nc \
      --arg id "$ID" \
      --arg timestamp "$TIMESTAMP" \
      --arg sessionId "$session_id" \
      --arg action "$action" \
      --arg path "$file_path" \
      --arg relativePath "$rel_path" \
      --arg extension "$extension" \
      --arg directory "$directory" \
      --arg projectName "$PROJECT_NAME" \
      '{id: $id, timestamp: $timestamp, sessionId: $sessionId, agent: "claude-code", action: $action, path: $path, relativePath: $relativePath, extension: $extension, directory: $directory, projectName: $projectName}')
  fi

  append_event
}

DATE=$(date -u +%Y-%m-%d)
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
LOG_FILE="$PROJECT_ROOT/.moatlog/events-$DATE.jsonl"
mkdir -p "$PROJECT_ROOT/.moatlog"

if [[ -z "$hook_event" ]]; then
  exit 0
fi

if [[ -z "$session_id" ]]; then
  session_id="unknown"
fi

workspace_root=$(echo "$input" | jq -r '.cwd // .workspace_roots[0] // empty')
action=""

case "$hook_event" in
  pretooluse)
    case "$tool_name" in
      read)
        action="read"
        raw_path=$(echo "$input" | jq -r '.tool_input.file_path // .tool_input.path // .tool_input.file // empty')
        ;;
      bash)
        action="shell"
        ;;
      *)
        exit 0
        ;;
    esac
    ;;
  posttooluse)
    case "$tool_name" in
      write|edit|multiedit)
        action="write"
        raw_path=$(echo "$input" | jq -r '.tool_input.file_path // .tool_input.path // .tool_input.file // empty')
        ;;
      *)
        exit 0
        ;;
    esac
    ;;
  userpromptsubmit)
    action="prompt_start"
    ;;
  stop)
    action="agent_stop"
    ;;
  *)
    exit 0
    ;;
esac

if [[ "$action" == "read" || "$action" == "write" ]]; then
  if [[ -z "$raw_path" ]]; then
    exit 0
  fi
  file_path=$(resolve_absolute_path "$raw_path" "$workspace_root") || exit 0
  prepare_file_metadata "$file_path" || exit 0
  emit_path_event "$action"
  exit 0
fi

if [[ "$action" == "shell" ]]; then
  shell_command=$(echo "$input" | jq -r '.tool_input.command // .tool_input.cmd // empty')
  if [[ -z "$shell_command" ]] || is_noisy_shell_command "$shell_command"; then
    exit 0
  fi

  event=$(jq -nc \
    --arg id "$ID" \
    --arg timestamp "$TIMESTAMP" \
    --arg sessionId "$session_id" \
    --arg action "$action" \
    --arg command "$shell_command" \
    --arg projectName "$PROJECT_NAME" \
    '{id: $id, timestamp: $timestamp, sessionId: $sessionId, agent: "claude-code", action: $action, command: $command, projectName: $projectName}')
  append_event
  exit 0
fi

if [[ "$action" == "prompt_start" ]]; then
  task=$(echo "$input" | jq -r '.prompt // .user_prompt // .message // .transcript // .input // empty')
  if [[ -z "$task" ]]; then
    exit 0
  fi

  if [[ -n "$tool_use_id" ]]; then
    event=$(jq -nc \
      --arg id "$ID" \
      --arg timestamp "$TIMESTAMP" \
      --arg sessionId "$session_id" \
      --arg generationId "$tool_use_id" \
      --arg action "$action" \
      --arg task "$task" \
      --arg projectName "$PROJECT_NAME" \
      '{id: $id, timestamp: $timestamp, sessionId: $sessionId, generationId: $generationId, agent: "claude-code", action: $action, task: $task, projectName: $projectName}')
  else
    event=$(jq -nc \
      --arg id "$ID" \
      --arg timestamp "$TIMESTAMP" \
      --arg sessionId "$session_id" \
      --arg action "$action" \
      --arg task "$task" \
      --arg projectName "$PROJECT_NAME" \
      '{id: $id, timestamp: $timestamp, sessionId: $sessionId, agent: "claude-code", action: $action, task: $task, projectName: $projectName}')
  fi
  append_event
  exit 0
fi

if [[ "$action" == "agent_stop" ]]; then
  if [[ -n "$tool_use_id" ]]; then
    event=$(jq -nc \
      --arg id "$ID" \
      --arg timestamp "$TIMESTAMP" \
      --arg sessionId "$session_id" \
      --arg generationId "$tool_use_id" \
      --arg action "$action" \
      --arg projectName "$PROJECT_NAME" \
      '{id: $id, timestamp: $timestamp, sessionId: $sessionId, generationId: $generationId, agent: "claude-code", action: $action, projectName: $projectName}')
  else
    event=$(jq -nc \
      --arg id "$ID" \
      --arg timestamp "$TIMESTAMP" \
      --arg sessionId "$session_id" \
      --arg action "$action" \
      --arg projectName "$PROJECT_NAME" \
      '{id: $id, timestamp: $timestamp, sessionId: $sessionId, agent: "claude-code", action: $action, projectName: $projectName}')
  fi
  append_event
  exit 0
fi

exit 0
