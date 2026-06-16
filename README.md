# moatlog

Behavioral memory for AI coding agents.

[GitHub](https://github.com/drewpoling2/moatlog) · [Docs](https://moatlog.dev)

moatlog hooks into Cursor, Claude Code, and Devin to capture what
your agent reads, writes, and asks. It distills that history into
`.moatlog/moat.json` — a committed file any agent can read before
starting work.

## Why

Every AI coding session starts cold. Git tracks what changed;
nothing tracks what your agent explored to get there. CLAUDE.md
captures what you declare; moatlog captures what agents actually do.

There's no shared source of truth for agent behavior across a
codebase. moatlog is that artifact.

Three properties make this different:

- **Observed, not declared.** moat.json reflects real agent
  behavior — which files get touched together, which tasks led
  to which edits. You don't maintain it manually.
- **Git-native.** moat.json commits with your code. Diffable,
  PR-reviewable, team-shared. No external service.
- **Agent-agnostic.** Cursor, Claude Code, and Devin all write
  to the same event log and read from the same moat. Switch
  agents — context comes with you.

## Install

```bash
npm install -g @moatlog/cli
```

## Quick start

```bash
# scaffold hooks, MCP config, and .moatlog/ in your project
moatlog init

# restart Cursor or Claude Code so hooks reload
# work in agent mode for a few sessions, then check
moatlog status
```

`moatlog init` creates:

- `.cursor/hooks.json` — captures reads, writes, prompts, shell
  commands, and session boundaries
- `.claude/settings.json` — same capture for Claude Code and Devin
- `.cursor/mcp.json` — wires `get_task_context` into your agent
- `.cursor/rules/moatlog.mdc` — tells agents to call
  `get_task_context` at session start
- `.moatlogignore` — excludes `.env*`, keys, credentials by default
- `.gitattributes` — registers the moatlog git merge driver

## How it works

```
agent reads, writes, prompts
         ↓
.moatlog/events-YYYY-MM-DD.jsonl
         ↓
moatlog distill
         ↓
.moatlog/moat.json
         ↓
get_task_context (MCP)
         ↓
agent starts next session with context
```

The stop hook runs `moatlog distill` automatically. moat.json
accumulates across sessions — the more you work, the more
signal it has.

## CLI

```bash
moatlog status             # hooks status and moat strength
moatlog report             # hot files and co-access patterns
moatlog report --by-agent  # grouped by agent
moatlog distill            # regenerate moat.json from events
moatlog check-moat         # validate moat.json is fresh
moatlog doctor             # full health check
moatlog merge              # merge another branch's moat.json
moatlog eval               # offline retrieval quality report
moatlog eval --baseline    # compare vs naive hot-file baseline
moatlog clean              # delete old event logs
```

## MCP tools

| Tool | Description |
|------|-------------|
| `get_task_context` | Files historically relevant to a task description |
| `get_hot_files` | Most frequently accessed files |
| `get_file_history` | Read/write counts and co-access for one file |
| `get_co_accessed_files` | Files opened in the same sessions as a given file |

## Retrieval quality

moatlog ships with an offline eval harness:

```bash
moatlog eval --baseline
```

Leave-one-out evaluation — for each high-quality prompt window,
hide it, run retrieval with its task description, check whether
returned files match what the agent actually touched. Run it on
your own repo to measure retrieval quality on your codebase.

`moatlog benchmark --api` (v0.1.2) will measure cold vs. warm
agent behavior directly — tokens used, files explored, time to
completion.

## Team use

moat.json commits to your repo. Team members get behavioral
context from your sessions without replaying them. When two
developers distill independently:

```bash
moatlog merge --branch main
```

Three-way delta merge: counts sum, arrays union, conflicts
resolved deterministically. Ambiguous cases sent to `cursor`
or `claude` CLI for resolution unless `--no-llm` is passed.

The git merge driver registered by `moatlog init` handles
moat.json conflicts automatically on `git merge`.

## Requirements

- Node.js 20+
- jq (`brew install jq` or `apt install jq`)
- Cursor, Claude Code, or Devin
- Git

## Docs

https://moatlog.dev

## License

MIT
