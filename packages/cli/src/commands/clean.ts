import chalk from 'chalk'
import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'

interface CleanOptions {
  logDir: string
  all?: boolean
  keepDays?: number
}

interface EventFileInfo {
  name: string
  filePath: string
  date: Date
  eventCount: number
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

function listEventFiles(logDir: string): EventFileInfo[] {
  if (!fs.existsSync(logDir)) return []

  return fs.readdirSync(logDir)
    .filter(f => f.endsWith('.jsonl') && f.startsWith('events-'))
    .map(name => {
      const dateStr = name.replace('events-', '').replace('.jsonl', '')
      const filePath = path.join(logDir, name)
      const content = fs.readFileSync(filePath, 'utf-8')
      const eventCount = content.trim()
        ? content.trim().split('\n').filter(Boolean).length
        : 0

      return {
        name,
        filePath,
        date: new Date(dateStr),
        eventCount
      }
    })
    .filter(f => !isNaN(f.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

function getFilesToDelete(
  files: EventFileInfo[],
  all: boolean,
  keepDays: number
): EventFileInfo[] {
  if (all) return files

  const cutoff = new Date()
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - keepDays)

  return files.filter(f => f.date < cutoff)
}

async function confirm(message: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.error(chalk.red('Confirmation required — run in an interactive terminal.'))
    return false
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  const answer = await new Promise<string>(resolve => {
    rl.question(message, resolve)
  })

  rl.close()
  return answer.trim().toLowerCase() === 'y'
}

export async function clean({
  logDir,
  all = false,
  keepDays = 30
}: CleanOptions): Promise<void> {
  const files = listEventFiles(logDir)
  const toDelete = getFilesToDelete(files, all, keepDays)

  if (toDelete.length === 0) {
    console.log(chalk.dim('No event files to delete.'))
    return
  }

  const totalEvents = toDelete.reduce((sum, f) => sum + f.eventCount, 0)
  const fileLabel = toDelete.length === 1 ? 'file' : 'files'
  const eventLabel = totalEvents === 1 ? 'event' : 'events'

  console.log('')

  if (all) {
    console.log(
      `  ${chalk.yellow('Warning:')} this will also invalidate your moat.json on next distill.`
    )
    console.log(
      chalk.dim('  Consider running `moatlog distill` first to preserve current insights.')
    )
    console.log('')
    console.log(
      `  This will delete ${chalk.bold(String(toDelete.length))} event ${fileLabel} ` +
      `(${chalk.bold(formatNumber(totalEvents))} ${eventLabel}), including today.`
    )
  } else {
    console.log(
      `  This will delete ${chalk.bold(String(toDelete.length))} event ${fileLabel} ` +
      `(${chalk.bold(formatNumber(totalEvents))} ${eventLabel}) older than ${keepDays} days.`
    )
  }

  if (!all) {
    console.log(chalk.dim('  Your moat.json will not be affected.'))
  }
  console.log('')

  const ok = await confirm('  Continue? (y/N) ')
  if (!ok) {
    console.log(chalk.dim('Cancelled.'))
    return
  }

  for (const file of toDelete) {
    fs.unlinkSync(file.filePath)
  }

  console.log(chalk.green(`✓ Deleted ${toDelete.length} event ${fileLabel}`))
}
