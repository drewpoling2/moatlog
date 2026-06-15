#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MOATLOG_DIR="$PROJECT_ROOT/.moatlog"

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
