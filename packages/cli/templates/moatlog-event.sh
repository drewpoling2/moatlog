#!/usr/bin/env bash
set -euo pipefail

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

READ_PATH_JQ='
  def tool_obj:
    if (.tool_input | type) == "string" then
      (.tool_input | fromjson? // {})
    else
      (.tool_input // {})
    end;
  tool_obj
  | .target_file // .file_path // .filePath // .path // .file // empty
'

hook_event=$(echo "$input" | jq -r '.hook_event_name // empty')
session_id=$(echo "$input" | jq -r '.conversation_id // .session_id // .generation_id // empty')
generation_id=$(echo "$input" | jq -r '.generation_id // empty')

if [[ -z "$hook_event" ]] && echo "$input" | jq -e '.tool_name' >/dev/null 2>&1; then
  hook_event="postToolUse"
fi

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

recent_read_logged() {
  local rel="$1"
  local sid="$2"

  if [[ ! -f "$LOG_FILE" ]]; then
    return 1
  fi

  tail -n 30 "$LOG_FILE" | jq -se --arg sid "$sid" --arg rel "$rel" '
    map(select(.action == "read" and .sessionId == $sid and .relativePath == $rel)) | length > 0
  ' | grep -q true
}

append_read_event() {
  local source="$1"

  if recent_read_logged "$rel_path" "$session_id"; then
    return 0
  fi

  local event
  event=$(jq -nc \
    --arg id "$ID" \
    --arg timestamp "$TIMESTAMP" \
    --arg sessionId "$session_id" \
    --arg action "read" \
    --arg path "$file_path" \
    --arg relativePath "$rel_path" \
    --arg extension "$extension" \
    --arg directory "$directory" \
    --arg projectName "$PROJECT_NAME" \
    --arg source "$source" \
    '{id: $id, timestamp: $timestamp, sessionId: $sessionId, agent: "cursor", action: $action, path: $path, relativePath: $relativePath, extension: $extension, directory: $directory, projectName: $projectName, readSource: $source}')

  echo "$event" >> "$LOG_FILE"
}

log_read_from_path() {
  local raw_path="$1"
  local workspace_root="$2"
  local source="$3"

  local absolute_path
  absolute_path=$(resolve_absolute_path "$raw_path" "$workspace_root") || return 0
  prepare_file_metadata "$absolute_path" || return 0
  append_read_event "$source"
}

DATE=$(date -u +%Y-%m-%d)
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
LOG_FILE="$PROJECT_ROOT/.moatlog/events-$DATE.jsonl"
mkdir -p "$PROJECT_ROOT/.moatlog"

if [[ "$hook_event" == "beforeReadFile" ]]; then
  if [[ -z "$session_id" ]]; then
    session_id="unknown"
  fi

  workspace_root=$(echo "$input" | jq -r '.workspace_roots[0] // empty')
  raw_path=$(echo "$input" | jq -r '.file_path // empty')
  log_read_from_path "$raw_path" "$workspace_root" "beforeReadFile" || true
  echo '{"permission":"allow"}'
  exit 0
fi

if [[ "$hook_event" == "preToolUse" ]]; then
  tool_name=$(echo "$input" | jq -r '.tool_name // empty' | tr '[:upper:]' '[:lower:]')
  if [[ "$tool_name" != "read" ]]; then
    exit 0
  fi

  if [[ -z "$session_id" ]]; then
    session_id="unknown"
  fi

  workspace_root=$(echo "$input" | jq -r '.cwd // .workspace_roots[0] // empty')
  raw_path=$(echo "$input" | jq -r "$READ_PATH_JQ")
  log_read_from_path "$raw_path" "$workspace_root" "preToolUse" || true
  echo '{"permission":"allow"}'
  exit 0
fi

if [[ -z "$hook_event" ]]; then
  exit 0
fi

if [[ -z "$session_id" ]]; then
  session_id="unknown"
fi

action=""
file_path=""
rel_path=""
extension=""
directory=""
shell_command=""

case "$hook_event" in
  postToolUse)
    tool_name=$(echo "$input" | jq -r '.tool_name // empty' | tr '[:upper:]' '[:lower:]')
    if [[ "$tool_name" != "read" ]]; then
      exit 0
    fi

    workspace_root=$(echo "$input" | jq -r '.cwd // .workspace_roots[0] // empty')
    raw_path=$(echo "$input" | jq -r "$READ_PATH_JQ")
    log_read_from_path "$raw_path" "$workspace_root" "postToolUse" || true
    exit 0
    ;;
  afterFileEdit) action="write" ;;
  beforeSubmitPrompt) action="prompt_start" ;;
  sessionStart) action="session_start" ;;
  sessionEnd) action="session_end" ;;
  stop) action="agent_stop" ;;
  afterShellExecution) action="shell" ;;
  *) exit 0 ;;
esac

is_noisy_shell_command() {
  local cmd="$1"
  local first
  first=$(echo "$cmd" | awk '{print $1}')
  case "$first" in
    cat|echo|ls|pwd|which|cd) return 0 ;;
  esac
  return 1
}

if [[ "$action" == "write" ]]; then
  workspace_root=$(echo "$input" | jq -r '.workspace_roots[0] // empty')
  raw_path=$(echo "$input" | jq -r '.file_path // empty')
  if [[ -z "$raw_path" ]]; then
    exit 0
  fi
  file_path=$(resolve_absolute_path "$raw_path" "$workspace_root") || exit 0
fi

if [[ "$action" == "read" || "$action" == "write" ]]; then
  prepare_file_metadata "$file_path" || exit 0
fi

if [[ "$action" == "shell" ]]; then
  shell_command=$(echo "$input" | jq -r '.command // empty')
  if [[ -z "$shell_command" ]] || is_noisy_shell_command "$shell_command"; then
    exit 0
  fi
fi

if [[ "$action" == "prompt_start" ]]; then
  task=$(echo "$input" | jq -r '.prompt // empty')
  if [[ -z "$task" ]]; then
    exit 0
  fi
  if [[ -n "$generation_id" ]]; then
    event=$(jq -nc \
      --arg id "$ID" \
      --arg timestamp "$TIMESTAMP" \
      --arg sessionId "$session_id" \
      --arg generationId "$generation_id" \
      --arg action "$action" \
      --arg task "$task" \
      --arg projectName "$PROJECT_NAME" \
      '{id: $id, timestamp: $timestamp, sessionId: $sessionId, generationId: $generationId, agent: "cursor", action: $action, task: $task, projectName: $projectName}')
  else
    event=$(jq -nc \
      --arg id "$ID" \
      --arg timestamp "$TIMESTAMP" \
      --arg sessionId "$session_id" \
      --arg action "$action" \
      --arg task "$task" \
      --arg projectName "$PROJECT_NAME" \
      '{id: $id, timestamp: $timestamp, sessionId: $sessionId, agent: "cursor", action: $action, task: $task, projectName: $projectName}')
  fi
elif [[ "$action" == "read" || "$action" == "write" ]]; then
  if [[ -n "$generation_id" ]]; then
    event=$(jq -nc \
      --arg id "$ID" \
      --arg timestamp "$TIMESTAMP" \
      --arg sessionId "$session_id" \
      --arg generationId "$generation_id" \
      --arg action "$action" \
      --arg path "$file_path" \
      --arg relativePath "$rel_path" \
      --arg extension "$extension" \
      --arg directory "$directory" \
      --arg projectName "$PROJECT_NAME" \
      '{id: $id, timestamp: $timestamp, sessionId: $sessionId, generationId: $generationId, agent: "cursor", action: $action, path: $path, relativePath: $relativePath, extension: $extension, directory: $directory, projectName: $projectName}')
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
      '{id: $id, timestamp: $timestamp, sessionId: $sessionId, agent: "cursor", action: $action, path: $path, relativePath: $relativePath, extension: $extension, directory: $directory, projectName: $projectName}')
  fi
elif [[ "$action" == "agent_stop" ]]; then
  if [[ -n "$generation_id" ]]; then
    event=$(jq -nc \
      --arg id "$ID" \
      --arg timestamp "$TIMESTAMP" \
      --arg sessionId "$session_id" \
      --arg generationId "$generation_id" \
      --arg action "$action" \
      --arg projectName "$PROJECT_NAME" \
      '{id: $id, timestamp: $timestamp, sessionId: $sessionId, generationId: $generationId, agent: "cursor", action: $action, projectName: $projectName}')
  else
    event=$(jq -nc \
      --arg id "$ID" \
      --arg timestamp "$TIMESTAMP" \
      --arg sessionId "$session_id" \
      --arg action "$action" \
      --arg projectName "$PROJECT_NAME" \
      '{id: $id, timestamp: $timestamp, sessionId: $sessionId, agent: "cursor", action: $action, projectName: $projectName}')
  fi
elif [[ "$action" == "session_end" ]]; then
  duration_ms=$(echo "$input" | jq -r '.duration_ms // 0')
  reason=$(echo "$input" | jq -r '.reason // empty')
  event=$(jq -nc \
    --arg id "$ID" \
    --arg timestamp "$TIMESTAMP" \
    --arg sessionId "$session_id" \
    --arg action "$action" \
    --argjson duration_ms "$duration_ms" \
    --arg reason "$reason" \
    --arg projectName "$PROJECT_NAME" \
    '{id: $id, timestamp: $timestamp, sessionId: $sessionId, agent: "cursor", action: $action, duration_ms: $duration_ms, reason: $reason, projectName: $projectName}')
elif [[ "$action" == "shell" ]]; then
  event=$(jq -nc \
    --arg id "$ID" \
    --arg timestamp "$TIMESTAMP" \
    --arg sessionId "$session_id" \
    --arg action "$action" \
    --arg command "$shell_command" \
    --arg projectName "$PROJECT_NAME" \
    '{id: $id, timestamp: $timestamp, sessionId: $sessionId, agent: "cursor", action: $action, command: $command, projectName: $projectName}')
else
  event=$(jq -nc \
    --arg id "$ID" \
    --arg timestamp "$TIMESTAMP" \
    --arg sessionId "$session_id" \
    --arg action "$action" \
    --arg projectName "$PROJECT_NAME" \
    '{id: $id, timestamp: $timestamp, sessionId: $sessionId, agent: "cursor", action: $action, projectName: $projectName}')
fi

echo "$event" >> "$LOG_FILE"
exit 0
