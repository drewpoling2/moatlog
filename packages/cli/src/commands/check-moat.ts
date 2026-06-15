import chalk from 'chalk'
import * as fs from 'fs'
import * as path from 'path'
import { Distiller, EventLogger, MoatSchemaError } from '@moatlog/core'
import type { Moat } from '@moatlog/core'

interface CheckMoatOptions {
  projectRoot: string
  logDir: string
  days?: number
}

function validateShape(moat: Moat): string[] {
  const errors: string[] = []
  if (!moat._generated) errors.push('missing _generated field')
  if (!moat._version) errors.push('missing _version field')
  if (!moat.scope) errors.push('missing scope field')
  if (!Array.isArray(moat.hotFiles)) errors.push('missing hotFiles array')
  if (!moat.dataHealth) errors.push('missing dataHealth block')
  return errors
}

export function checkMoat({ projectRoot, logDir, days = 30 }: CheckMoatOptions): void {
  const projectName = path.basename(projectRoot)
  const moatPath = path.join(logDir, 'moat.json')

  if (!fs.existsSync(moatPath)) {
    console.error(chalk.red('✗ moat.json not found'))
    console.error(chalk.dim(`  expected at ${moatPath}`))
    console.error(chalk.dim('  run: moatlog distill'))
    process.exit(1)
  }

  const distiller = new Distiller(logDir, projectName)
  let moat
  try {
    moat = distiller.load()
  } catch (err) {
    if (err instanceof MoatSchemaError) {
      console.error(chalk.red('✗ moat.json schema outdated'))
      console.error(chalk.dim(`  ${err.message}`))
      process.exit(1)
    }
    throw err
  }

  if (!moat) {
    console.error(chalk.red('✗ moat.json exists but could not be parsed'))
    process.exit(1)
  }

  const shapeErrors = validateShape(moat)
  if (shapeErrors.length > 0) {
    console.error(chalk.red('✗ moat.json has invalid shape'))
    for (const err of shapeErrors) {
      console.error(chalk.dim(`  ${err}`))
    }
    process.exit(1)
  }

  const events = EventLogger.readAll(logDir, days)
  const distilledAt = new Date(moat.generatedAt).getTime()
  const eventsAfterDistill = events.filter(
    e => new Date(e.timestamp).getTime() > distilledAt
  )

  if (eventsAfterDistill.length > 0) {
    console.error(
      chalk.yellow(`✗ moat is stale (${eventsAfterDistill.length} events since last distill)`)
    )
    console.error(chalk.dim(`  distilled: ${moat.generatedAt} (${moat.totalEvents} events)`))
    console.error(chalk.dim(`  current:   ${events.length} events in last ${days} days`))
    console.error(chalk.dim('  run: moatlog distill'))
    process.exit(1)
  }

  console.log(chalk.green('✓ moat.json is valid and fresh'))
  console.log(chalk.dim(`  scope: ${moat.scope} · ${moat.generatedFrom}`))
  console.log(chalk.dim(`  generated: ${moat.generatedAt}`))
}
