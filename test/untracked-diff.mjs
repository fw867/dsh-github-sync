/**
 * A file git does not track yet still opens a patch.
 *
 * `git diff` — with `HEAD`, with `--cached`, with anything — cannot see an
 * untracked file: it is in neither the index nor a commit, so the panel used to
 * open an empty tab for every new file. `git diff --no-index -- /dev/null` is the
 * one form that renders it as the all-addition it is, and this pins that the
 * engine reaches for it exactly where it should: a named path, on the review
 * side, and never for a staged review or a whole-tree read.
 *
 * It also pins the diff route's path guard: the route is reachable from a
 * browser, so an absolute path or one climbing out of the repository is refused
 * before git ever sees it.
 *
 * Run: node test/untracked-diff.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN = path.resolve(HERE, '..')
const { GithubSyncEngine } = await import(`file:///${PLUGIN.replace(/\\/g, '/')}/lib/engine.js`)
const { resolveConfig } = await import(`file:///${PLUGIN.replace(/\\/g, '/')}/lib/config.js`)
const { isRepoRelative } = await import(`file:///${PLUGIN.replace(/\\/g, '/')}/lib/route.js`)

let failed = 0
const ok = (text, cond, extra) => {
  if (!cond) failed += 1
  console.log(cond ? 'ok  ' : 'FAIL', text, cond ? '' : JSON.stringify(extra))
}

/** Run git and collect its answer. */
function git(cwd, args) {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, env: process.env, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', (error) => resolve({ code: -1, stdout, stderr: `${stderr}${error}` }))
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }))
  })
}

// The provider shape the plugin has to tolerate: `done` for the exit facts and
// collect-mode readers for the output.
const subprocess = {
  async resolveExecutable(name) {
    return name
  },
  spawn({ argv, cwd }) {
    const child = spawn(argv[0], argv.slice(1), { cwd, env: process.env, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    const done = new Promise((resolve) => {
      child.on('error', (error) => resolve({ exitCode: -1, signal: null, error: String(error) }))
      child.on('close', (code, signal) => resolve({ exitCode: code ?? -1, signal: signal ?? null }))
    })
    return {
      done,
      collected: {
        stdout: { readFrom: (from) => ({ text: stdout.slice(from), nextOffset: stdout.length, lossy: false }) },
        stderr: { readFrom: (from) => ({ text: stderr.slice(from), nextOffset: stderr.length, lossy: false }) },
      },
    }
  },
}
const ctx = { subprocess, get: () => undefined, logger: { info: () => {} }, effect: (cb) => { cb(); return () => {} } }
const engine = new GithubSyncEngine(ctx, resolveConfig({ generateCommitMessage: false }))

const root = path.join(os.tmpdir(), 'dsh-untracked-diff')
fs.rmSync(root, { recursive: true, force: true })
fs.mkdirSync(root, { recursive: true })
await git(root, ['init', '-q'])
await git(root, ['config', 'user.name', 'T'])
await git(root, ['config', 'user.email', 't@example.com'])
fs.writeFileSync(path.join(root, 'tracked.txt'), 'one\ntwo\n')
await git(root, ['add', '-A'])
await git(root, ['commit', '-q', '-m', 'chore: seed'])
fs.writeFileSync(path.join(root, 'tracked.txt'), 'one\nchanged\n')
fs.writeFileSync(path.join(root, 'new.txt'), 'new line one\nnew line two\n')
fs.writeFileSync(path.join(root, 'blob.bin'), Buffer.from([0x00, 0x01, 0x02, 0x00, 0x03]))
const agent = { session: { header: { cwd: root } } }

console.log('=== an untracked file opens as an addition ===')
{
  const text = await engine.diffText({ agent, path: 'new.txt' })
  console.log(text.split('\n').slice(0, 6).join('\n'))
  ok('the patch names the new file', text.startsWith('diff --git a/new.txt b/new.txt'), text.slice(0, 80))
  ok('it is a new-file patch', text.includes('new file mode'), text)
  ok('every line is an addition', text.includes('+new line one') && text.includes('+new line two'), text)
  ok('nothing is reported as removed', !text.includes('\n-new line'), text)
}

console.log('\n=== a tracked modification keeps its ordinary patch ===')
{
  const text = await engine.diffText({ agent, path: 'tracked.txt' })
  ok('the removal is there', text.includes('-two'), text)
  ok('the addition is there', text.includes('+changed'), text)
  ok('the untracked file is not swept in', !text.includes('new.txt'), text)
}

console.log('\n=== a staged review shows the index only, and the index has no new file ===')
{
  const text = await engine.diffText({ agent, path: 'new.txt', staged: true })
  ok('an untracked path has nothing staged', text === '', text)
}

console.log('\n=== a whole-tree review keeps reading HEAD ===')
{
  const repo = await engine.locate(agent, undefined)
  const patch = await engine.diffOf({ repo, files: [], mode: 'head', stat: false, signal: undefined })
  ok('the tracked change is in it', patch.text.includes('tracked.txt'), patch.text)
  ok('the untracked file is not', !patch.text.includes('new.txt'), patch.text)
}

console.log('\n=== a binary new file is named, not dumped ===')
{
  const text = await engine.diffText({ agent, path: 'blob.bin' })
  ok('git calls it binary', text.includes('Binary files'), text)
  ok('the path is still named', text.includes('blob.bin'), text)
}

console.log('\n=== the route refuses paths outside the repository ===')
{
  ok('a plain relative path is admitted', isRepoRelative('src/a.ts') === true)
  ok('a nested path is admitted', isRepoRelative('a/b/c.txt') === true)
  ok('an absolute path is refused', isRepoRelative('/etc/passwd') === false)
  ok('a drive path is refused', isRepoRelative('C:\\Windows\\win.ini') === false)
  ok('a climbing path is refused', isRepoRelative('../outside.txt') === false)
  ok('a path that climbs in the middle is refused', isRepoRelative('a/../../b') === false)
  ok('a NUL byte is refused', isRepoRelative('a\u0000b') === false)
  ok('an empty path is refused', isRepoRelative('') === false)
}

fs.rmSync(root, { recursive: true, force: true })
console.log(failed === 0 ? '\nRESULT: ALL CHECKS PASSED' : `\nRESULT: ${failed} FAILURE(S)`)
process.exit(failed === 0 ? 0 : 1)
