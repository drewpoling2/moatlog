# moatlog roadmap

moatlog ships a working core first — hooks capture behavior, distill compresses it, MCP serves it back. Retrieval quality improves in small releases once the loop is proven. Team and platform features come after individual moat value is clear. Version numbers track capability, not calendar dates.

---

## v0.1.0 — publish (current)

### Core loop

- ✅ Cursor hooks capture (read, write, prompt_start, agent_stop, shell, session)
- ✅ Auto-distill on agent stop
- ✅ moat.json v1.5.0 schema (promptWindows, taskFileSets, dataHealth, agents)
- ✅ moat.json schema 1.4.0 / 1.5.0 — dropped windowCoAccess, coAccessPatterns, absolute paths, fileCount, exampleTasks
- ✅ assertMoatSchemaCurrent() — rejects stale schema versions at distill time
- ✅ dataHealth block (readsCaptured, windowCounts)
- ✅ windowQuality + meta window filtering
- ✅ pathsInTaskNormalized
- ✅ 3-pass get_task_context retrieval
- ✅ Window-derived co-access at query time (support scores on hotFiles)
- ✅ Task truncation to taskExcerpt / taskKeywords in moat.json output
- ✅ Agent attribution in distilled output (agents on hotFiles, agent on promptWindows)
- ✅ moatlog status with coverage and moat strength
- ✅ moatlog distill with filter breakdown
- ✅ moatlog report
- ✅ moatlog report --by-agent
- ✅ moatlog check-moat
- ✅ moatlog clean command with age options
- ✅ moatlog merge — three-way delta, LLM cascade, git merge driver
- ✅ MCP server with 4 tools
- ✅ `.cursor/rules/moatlog.mdc` with alwaysApply
- ✅ Docs site with Gameboy design system
- ✅ Docs/content refresh to moat.json v1.5.0

### Capture & attribution fixes

- ✅ Read event capture — beforeReadFile + preToolUse/postToolUse Read wired in hooks
- ✅ Fix window attribution — agent_stop closes windows (FIFO), event_log_boundary cross-day fix
- ✅ Task provenance detection — contamination stripping, taskExcerpt/taskKeywords extraction
- ✅ Fix meta-window classifier — head-anchored patterns, file-count override for attributed windows
- ✅ .moatlogignore with default secret/env patterns — enforced at hook + distill layers; init writes the file

### Retrieval quality (shipped early)

- ✅ Offline retrieval eval harness — `moatlog eval` leave-one-out hit rate
- ✅ Retrieval quality fixes — cluster boost (not filter), set-size normalization, hotFile frequency prior

### Tooling & setup

- ✅ moatlog doctor — hooks, MCP, moat.json, permissions health check
- ✅ moatlog init — hooks, MCP, rules, permissions, .gitignore, .gitattributes, merge driver
- ✅ moatlog mcp wired in CLI

### Remaining for publish

- ⬜ README
- ⬜ npm publish
- ⬜ LICENSE file (currently missing — yarn warns "No license field" on every command)
- ⬜ versioned events JSONL schema doc — moat.json is fully re-derivable, but the events format itself needs a stable documented contract since it can't be regenerated

---

## v0.1.1 — retrieval depth

- workAreas — directory-level clusters
- editSequences — ordered file chains within a window
- sessionSummaries — one line per session
- Recency decay on hotFiles ranking
- moat.json size budget / compaction — retain last N windows, age out single-occurrence taskFileSets, cap hotFiles count
- get_task_context `limit`/token-budget param with compact output

### Observability

- Per-session assist summary: get_task_context call count, files surfaced, and how many surfaced files were subsequently touched in that session (suggested-then-touched rate). This is both a user-facing value signal and an internal retrieval-quality metric.

---

## v0.1.2 — moat strength (next)

- Claude Code hooks support — cross-agent support (one moat, multiple agents, committed to repo) is the core differentiation vs. first-party agent memory features (Cursor memories, CLAUDE.md, Windsurf memories) that are converging on similar single-agent solutions.
- moatlog eval --sessions breakdown — hit rate by moat age / session count
- Hot-file prior improvements — push retrieval hit rate past naive baseline
- `moatlog benchmark --api` (Claude API, cold vs warm, token diff) — after Claude Code hooks
- Fixed benchmark task suite for comparable results across releases — e.g. "update docs CSS design system", "add MCP tool", "fix CLI command". Results must be reproducible, not ad hoc.
- Stale lockfile auto-cleanup (dead PID check)
- `moatlog init` seeding via Cursor deeplink
- `moatlog init --seed-from-git` — seed hotFiles/co-access from `git log --name-only` commit co-occurrence, so a freshly-init'd repo has a non-empty moat immediately instead of an empty one for the first weeks

---

## v0.2.0 — team moat

- moat.json team aggregation (`moatlog aggregate`)
- Merge strategy for conflicting moat.json when multiple developers edit the same hotFiles/taskFileSets. Aggregation without conflict resolution will break quickly.
- Per-developer moat contribution via committed moat files
- CI freshness check (`moatlog check-moat` in GitHub Actions)
- Coverage weighted by contributor count
- Confidence scores across developers

---

## v0.3.0 — platform

- moatlog API (event ingestion, moat retrieval)
- Team dashboard
- Cross-machine moat sync
- moatlog benchmark results trending over time
- Cursor Marketplace plugin
- Semantic layer / record_decision

---

## Deferred / under consideration

- Semantic similarity / embeddings for task matching
- Per-file edit summaries
- Git diff integration
- Cross-project moat
- SQLite events store (replace JSONL at scale)
- fileRole classification (content / source / config / scaffold)
- Fix hook capture differences between Agent mode and Ask mode
- Partial path alias false positives in normalization as hotFiles grows

---

## Privacy

`prompt_start` events capture raw prompt text verbatim including pasted content.
Before team and platform milestones, moatlog needs:

- ✅ Truncation of task text beyond N characters at distill time (taskExcerpt / taskKeywords)
- ✅ `.moatlogignore` — paths and patterns excluded from event logging
- ⬜ Opt-out for sensitive prompt content
- ⬜ Scrubbing of PII from promptWindows before team aggregation

These are required for enterprise adoption and responsible defaults.
