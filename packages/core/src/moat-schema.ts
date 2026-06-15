export const MOAT_SCHEMA_VERSION = '1.5.0'

export class MoatSchemaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MoatSchemaError'
  }
}

function parseVersion(version: string): [number, number, number] {
  const parts = version.split('.').map(part => parseInt(part, 10))
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new MoatSchemaError(
      `moat.json schema outdated — run \`moatlog distill\` to regenerate.`
    )
  }
  return [parts[0], parts[1], parts[2]]
}

function compareVersion(a: string, b: string): number {
  const [aMajor, aMinor, aPatch] = parseVersion(a)
  const [bMajor, bMinor, bPatch] = parseVersion(b)

  if (aMajor !== bMajor) return aMajor - bMajor
  if (aMinor !== bMinor) return aMinor - bMinor
  return aPatch - bPatch
}

export function assertMoatSchemaCurrent(version: string | undefined): void {
  if (!version || compareVersion(version, MOAT_SCHEMA_VERSION) < 0) {
    throw new MoatSchemaError(
      'moat.json schema outdated — run `moatlog distill` to regenerate.'
    )
  }
}
