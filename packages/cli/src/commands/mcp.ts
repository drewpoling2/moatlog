import { spawn } from 'child_process'
import { createRequire } from 'module'
import * as path from 'path'
import { fileURLToPath } from 'url'

interface McpOptions {
  projectRoot: string
}

function resolveMcpServer(): string {
  try {
    const require = createRequire(import.meta.url)
    return require.resolve('@moatlog/mcp/dist/server.js')
  } catch {
    return path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../mcp/dist/server.js'
    )
  }
}

export function mcp({ projectRoot }: McpOptions): void {
  const serverPath = resolveMcpServer()

  const child = spawn(process.execPath, [serverPath], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env
  })

  child.on('exit', (code) => process.exit(code ?? 0))
}
