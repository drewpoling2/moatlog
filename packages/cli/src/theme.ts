import chalk from 'chalk'

/** Gameboy green palette — matches docs site code colors */
export const GB = {
  bright: '#9bbc0f',
  regular: '#8bac0f',
  dim: '#306230',
  bg: '#0f380f'
} as const

type ColorFn = (text: string) => string

function hexOrFallback(hex: string, fallback: ColorFn): ColorFn {
  return (text: string) => {
    if (chalk.level === 0) return text
    if (chalk.level >= 2) return chalk.hex(hex)(text)
    return fallback(text)
  }
}

/** Bright green — active indicators, highlighted values */
export const bright: ColorFn = hexOrFallback(GB.bright, chalk.greenBright)

/** Regular green — labels, section titles */
export const label: ColorFn = hexOrFallback(GB.regular, chalk.green)

/** Dim green — secondary text, bars, hints */
export const dim: ColorFn = hexOrFallback(GB.dim, (text) => chalk.dim(text))

/** Section heading */
export const heading: ColorFn = (text: string) =>
  chalk.level === 0 ? text : chalk.bold(bright(text))

export function padLabel(text: string, width: number): string {
  return text.padEnd(width)
}

/** `  label:          value` with Gameboy colors */
export function field(labelText: string, value: string, width = 15): string {
  return `  ${label(padLabel(labelText, width))}${bright(value)}`
}

/** `  label          value` — value not highlighted */
export function fieldPlain(labelText: string, value: string, width = 17): string {
  return `  ${label(labelText.padEnd(width))}${value}`
}

/** Errors stay red for visibility */
export function error(text: string): string {
  return chalk.level === 0 ? text : chalk.red(text)
}

/** Success messages */
export function success(text: string): string {
  return bright(text)
}

/** Warnings stay yellow */
export function warn(text: string): string {
  return chalk.level === 0 ? text : chalk.yellow(text)
}
