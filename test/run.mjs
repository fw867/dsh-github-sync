/**
 * Run every test in this directory.
 *
 * Each file is self-contained and prints its own result; this runs them in order
 * and fails if any of them did. Run: npm test
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const files = fs
  .readdirSync(HERE)
  .filter((name) => name.endsWith('.mjs') && name !== 'run.mjs')
  .sort()

let failed = 0
for (const file of files) {
  console.log(`\n${'='.repeat(64)}\n  ${file}\n${'='.repeat(64)}`)
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(HERE, file)], { stdio: 'inherit' })
    child.on('close', (c) => resolve(c ?? 1))
  })
  if (code !== 0) {
    failed += 1
    console.log(`  -> FAILED (exit ${code})`)
  }
}

console.log(`\n${'='.repeat(64)}`)
console.log(failed === 0 ? `all ${files.length} test file(s) passed` : `${failed} of ${files.length} test file(s) FAILED`)
process.exit(failed === 0 ? 0 : 1)
