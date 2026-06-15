import * as path from 'path'
import { Distiller } from '@moatlog/core'
import { autoRegenerateSkills } from '../skills-auto-regen.js'
import * as theme from '../theme.js'

interface DistillOptions {
  projectRoot: string
  logDir: string
  days?: number
}

export async function distill({ projectRoot, logDir, days = 30 }: DistillOptions): Promise<void> {
  const projectName = path.basename(projectRoot)

  console.log(theme.dim(`distilling last ${days} days of events...\n`))

  try {
    const distiller = new Distiller(logDir, projectName)
    const { moat, filterStats } = distiller.distill(days)
    const outPath = distiller.save(moat)

    console.log(theme.label('filter'))
    console.log(theme.fieldPlain('total events', String(filterStats.total)))
    console.log(theme.fieldPlain('kept', String(filterStats.kept)))
    if (filterStats.excluded.no_path > 0) {
      console.log(theme.fieldPlain('excluded (no path)', String(filterStats.excluded.no_path)))
    }
    if (filterStats.excluded.node_modules > 0) {
      console.log(theme.fieldPlain('excluded (node_modules)', String(filterStats.excluded.node_modules)))
    }
    if (filterStats.excluded.dist > 0) {
      console.log(theme.fieldPlain('excluded (dist)', String(filterStats.excluded.dist)))
    }
    if (filterStats.excluded.config > 0) {
      console.log(theme.fieldPlain('excluded (config)', String(filterStats.excluded.config)))
    }
    if (filterStats.excluded.moatlogignore > 0) {
      console.log(theme.fieldPlain('excluded (moatlogignore)', String(filterStats.excluded.moatlogignore)))
    }
    console.log()

    console.log(theme.heading('moatlog moat\n'))
    console.log(theme.field('project', moat.projectName, 17))
    console.log(theme.field('scope', moat.scope, 17))
    console.log(theme.field('generated from', moat.generatedFrom, 17))
    console.log(theme.field('hot files', String(moat.hotFiles.length), 17))
    console.log(theme.field('sessions', String(moat.totalSessions), 17))
    console.log()

    console.log(theme.label('top files'))
    for (const profile of moat.hotFiles.slice(0, 5)) {
      const bar = '█'.repeat(Math.min(profile.totalEvents, 20))
      console.log(
        `  ${theme.bright(profile.relativePath.padEnd(40))} ` +
        `${theme.dim(bar)} ${theme.bright(String(profile.totalEvents))}`
      )
    }

    console.log()
    console.log(theme.label('co-access patterns'))
    for (const profile of moat.hotFiles.filter(p => p.coAccessedWith.length > 0).slice(0, 3)) {
      const top = profile.coAccessedWith[0]
      if (!top) continue
      console.log(
        `  ${theme.bright(profile.relativePath)} ` +
        `${theme.dim('→')} ` +
        `${theme.label(top.path)} ` +
        `${theme.dim(`support ${top.support}`)}`
      )
    }

    console.log()
    console.log(theme.bright(`✓ moat saved to ${outPath}`))
    console.log(theme.dim('  commit this file to share with your team'))

    await autoRegenerateSkills(moat, projectRoot)

  } catch (err) {
    console.error(theme.error((err as Error).message))
    process.exit(1)
  }
}
