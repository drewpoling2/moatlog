import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function log(msg) {
  console.log(`\n${msg}`)
}

async function simulate() {
  console.log('simulating all event types...\n')

  // --- WRITE events (existing behavior) ---
  log('1. write events — modifying existing files')
  const authPath = path.join(__dirname, 'src/api/auth.ts')
  const dbPath = path.join(__dirname, 'src/lib/db.ts')
  const routesPath = path.join(__dirname, 'src/api/routes.ts')

  fs.writeFileSync(authPath, fs.readFileSync(authPath, 'utf-8'))
  await sleep(200)
  fs.writeFileSync(dbPath, fs.readFileSync(dbPath, 'utf-8'))
  await sleep(200)
  fs.writeFileSync(routesPath, fs.readFileSync(routesPath, 'utf-8'))
  await sleep(300)

  // --- CREATE events ---
  log('2. create events — new files appearing')
  const newFile1 = path.join(__dirname, 'src/api/middleware.ts')
  const newFile2 = path.join(__dirname, 'src/lib/cache.ts')

  fs.writeFileSync(newFile1, `// middleware\nexport function middleware() {}\n`)
  await sleep(200)
  fs.writeFileSync(newFile2, `// cache\nexport const cache = new Map()\n`)
  await sleep(300)

  // --- WRITE to new files ---
  log('3. write events on newly created files')
  fs.writeFileSync(newFile1, `// middleware v2\nexport function middleware() { return true }\n`)
  await sleep(200)
  fs.writeFileSync(newFile2, `// cache v2\nexport const cache = new Map<string, unknown>()\n`)
  await sleep(300)

  // --- DELETE events ---
  log('4. delete events — removing files')
  fs.unlinkSync(newFile1)
  await sleep(200)
  fs.unlinkSync(newFile2)
  await sleep(300)

  // --- RENAME events ---
  log('5. rename events — moving files')
  const tempFile = path.join(__dirname, 'src/lib/temp.ts')
  const renamedFile = path.join(__dirname, 'src/lib/renamed.ts')

  fs.writeFileSync(tempFile, `// temp file\n`)
  await sleep(300)
  fs.renameSync(tempFile, renamedFile)
  await sleep(300)
  fs.unlinkSync(renamedFile)
  await sleep(200)

  // --- SESSION PATTERN (co-access) ---
  log('6. co-access pattern — agent reads auth+db before editing routes')
  fs.writeFileSync(authPath, fs.readFileSync(authPath, 'utf-8'))
  await sleep(200)
  fs.writeFileSync(dbPath, fs.readFileSync(dbPath, 'utf-8'))
  await sleep(200)
  fs.writeFileSync(routesPath, fs.readFileSync(routesPath, 'utf-8'))
  await sleep(200)
  fs.writeFileSync(routesPath, fs.readFileSync(routesPath, 'utf-8'))
  await sleep(300)

  console.log('\ndone. run moatlog report to see all event types captured.')
}

simulate()
