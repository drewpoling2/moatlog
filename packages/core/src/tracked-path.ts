import { isMoatlogIgnoredPath } from './moatlogignore.js'
import { isDistillTrackedPath } from './paths.js'

export function isMoatlogTrackedPath(
  relativePath: string,
  projectRoot: string
): boolean {
  if (isMoatlogIgnoredPath(relativePath, projectRoot)) return false
  return isDistillTrackedPath(relativePath)
}
