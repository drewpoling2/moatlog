#!/usr/bin/env node
import * as path from 'path'
import * as fs from 'fs'
import { report } from './commands/report.js'
import { distill } from './commands/distill.js'
import { checkMoat } from './commands/check-moat.js'
import { mcp } from './commands/mcp.js'
import { status } from './commands/status.js'
import { clean } from './commands/clean.js'
import { init } from './commands/init.js'
import { doctor } from './commands/doctor.js'
import { merge, runMergeDriver } from './commands/merge.js'
import { evalCommand } from './commands/eval.js'
import { skills } from './commands/skills.js'

import { resolveProjectRoot } from '@moatlog/core'
import * as theme from './theme.js'

const args = process.argv.slice(2)
const command = args[0]
const { projectRoot, fromCwd } = resolveProjectRoot()
const logDir = path.join(projectRoot, '.moatlog')

function noteProjectRoot(): void {
  if (projectRoot !== fromCwd) {
    console.log(theme.dim(`  project root: ${projectRoot}`))
    console.log('')
  }
}

// warn if .moatlog not gitignored
function checkGitignore(): void {
  const gitignorePath = path.join(projectRoot, '.gitignore')
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8')
    if (!content.includes('.moatlog')) {
      console.warn('⚠️  Add .moatlog/ to your .gitignore')
    }
  }
}

switch (command) {
  case 'report': {
    noteProjectRoot()
    const byAgent = args.includes('--by-agent')
    report({ projectRoot, logDir, byAgent })
    break
  }
  case 'distill': {
    noteProjectRoot()
    checkGitignore()
    const days = args[1] ? parseInt(args[1]) : 30
    distill({ projectRoot, logDir, days }).catch(err => {
      console.error(theme.error((err as Error).message))
      process.exit(1)
    })
    break
  }
  case 'check-moat': {
    noteProjectRoot()
    const days = args[1] ? parseInt(args[1]) : 30
    checkMoat({ projectRoot, logDir, days })
    break
  }
  case 'mcp':
    mcp({ projectRoot })
    break
  case 'status': {
    noteProjectRoot()
    const verbose = args.includes('--verbose') || args.includes('--detail')
    status({ projectRoot, logDir, verbose })
    break
  }
  case 'doctor':
    noteProjectRoot()
    doctor({ projectRoot, logDir }).catch(err => {
      console.error((err as Error).message)
      process.exit(1)
    })
    break
  case 'init': {
    if (projectRoot !== fromCwd) {
      console.log(theme.warn(`  moatlog already configured at ${projectRoot}`))
      console.log(theme.dim('  init will scaffold in the current directory instead'))
      console.log('')
    }
    const force = args.includes('--force')
    const agentArgIndex = args.indexOf('--agent')
    let agent: 'auto' | 'cursor' | 'claude-code' | 'all' = 'auto'
    if (agentArgIndex !== -1) {
      const value = args[agentArgIndex + 1]
      if (value === 'cursor' || value === 'claude-code' || value === 'all') {
        agent = value
      } else {
        console.error(theme.error('Invalid --agent value. Use cursor, claude-code, or all.'))
        process.exit(1)
      }
    }
    init({ projectRoot: fromCwd, force, agent })
    break
  }
  case 'clean': {
    let all = false
    let keepDays = 30

    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--all') {
        all = true
      } else if (args[i] === '--keep' && args[i + 1]) {
        keepDays = parseInt(args[++i], 10)
        if (isNaN(keepDays) || keepDays < 0) {
          console.error('Invalid --keep value')
          process.exit(1)
        }
      }
    }

    clean({ logDir, all, keepDays }).catch(err => {
      console.error((err as Error).message)
      process.exit(1)
    })
    break
  }
  case 'merge': {
    noteProjectRoot()
    let branch = 'main'
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--branch' && args[i + 1]) {
        branch = args[++i]
      }
    }
    merge({
      projectRoot,
      logDir,
      branch,
      dryRun: args.includes('--dry-run'),
      noLlm: args.includes('--no-llm'),
      help: args.includes('--help')
    })
      .then(exitCode => process.exit(exitCode))
      .catch(err => {
        console.error((err as Error).message)
        process.exit(1)
      })
    break
  }
  case 'merge-driver': {
    const ancestorPath = args[1]
    const currentPath = args[2]
    const otherPath = args[3]
    const outputPath = args[4] ?? currentPath
    if (!ancestorPath || !currentPath || !otherPath) {
      console.error('Usage: moatlog merge-driver <ancestor> <current> <other> [output]')
      process.exit(1)
    }
    process.exit(
      runMergeDriver({
        ancestorPath,
        currentPath,
        otherPath,
        outputPath
      })
    )
  }
  case 'eval': {
    noteProjectRoot()
    let threshold = 2
    let limit: number | undefined

    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--threshold' && args[i + 1]) {
        threshold = parseInt(args[++i], 10)
        if (isNaN(threshold) || threshold < 1) {
          console.error('Invalid --threshold value')
          process.exit(1)
        }
      } else if (args[i] === '--limit' && args[i + 1]) {
        limit = parseInt(args[++i], 10)
        if (isNaN(limit) || limit < 1) {
          console.error('Invalid --limit value')
          process.exit(1)
        }
      }
    }

    process.exit(
      evalCommand({
        projectRoot,
        logDir,
        threshold,
        limit,
        baseline: args.includes('--baseline'),
        json: args.includes('--json'),
        help: args.includes('--help')
      })
    )
  }
  case 'skills': {
    noteProjectRoot()
    let action: 'list' | 'generate' = 'list'
    let minOccurrences: number | undefined

    if (args[1] === 'generate') {
      action = 'generate'
    }

    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--min-occurrences' && args[i + 1]) {
        minOccurrences = parseInt(args[++i], 10)
        if (isNaN(minOccurrences) || minOccurrences < 1) {
          console.error('Invalid --min-occurrences value')
          process.exit(1)
        }
      }
    }

    skills({
      projectRoot,
      logDir,
      action,
      preview: args.includes('--preview'),
      minOccurrences,
      help: args.includes('--help')
    }).then(code => process.exit(code)).catch(err => {
      console.error((err as Error).message)
      process.exit(1)
    })
    break
  }
  default:
    console.log(`
moatlog — behavioral memory layer for AI coding agents

Usage:
  moatlog init [--force] [--agent cursor|claude-code|all]  Scaffold hooks, MCP config, rules, and .moatlog/
  moatlog status [--verbose]  Hooks status and moat strength
  moatlog doctor           Health check for hooks, MCP, moat.json, permissions
  moatlog report         Show what your agent has been doing
  moatlog report --by-agent  Group report output by agent
  moatlog distill [days] Compress events into moat.json
  moatlog skills         List detected skills from moat.json
  moatlog skills generate [--preview] [--min-occurrences <n>]  Generate .cursor/rules/moatlog-*.mdc files
  moatlog merge [--branch <branch>] [--dry-run] [--no-llm]
  moatlog eval [--threshold <n>] [--limit <n>] [--baseline] [--json]
  moatlog check-moat [days] Validate moat.json exists and is fresh
  moatlog mcp            Start the MCP server
  moatlog clean          Delete old event logs (keeps 30 days)
  moatlog clean --all    Delete all event logs
  moatlog clean --keep N Keep last N days of event logs
    `)
}
