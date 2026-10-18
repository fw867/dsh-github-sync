/**
 * Which CI markers a commit actually carries.
 *
 * The rule being pinned: the marker control decides, and nothing else does. A
 * subject that arrives carrying a marker — because a model imitated the recent
 * subjects it was shown, or because someone typed one — must not add one that was
 * not selected, and must not double one that was.
 *
 * The recorded message is read back from real git, because that is what a reader
 * sees; the composed argv would only prove the intent.
 *
 * Run: node test/commit-markers.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN = path.join(HERE, '..')
const { GithubSyncEngine } = await import(`file:///${PLUGIN.replace(/\\/g, '/')}/lib/engine.js`)
const { resolveConfig } = await import(`file:///${PLUGIN.replace(/\\/g, '/')}/lib/config.js`)
const { stripTrailingMarkers, withMarkerLine, markerLine } = await import(`file:///${PLUGIN.replace(/\\/g, '/')}/lib/commit.js`)

let failed = 0
const ok = (text, cond, extra) => {
  if (!cond) failed += 1
  console.log(cond ? 'ok  ' : 'FAIL', text, cond ? '' : JSON.stringify(extra))
}

const g = (cwd, args) =>
  new Promise((r) => {
    const c = spawn('git', args, { cwd, env: process.env, windowsHide: true })
    let o = '', e = ''
    c.stdout.on('data', (d) => (o += d))
    c.stderr.on('data', (d) => (e += d))
    c.on('close', (x) => r({ x, o, e }))
  })

const root = path.join(os.tmpdir(), 'dsh-commit-markers')
fs.rmSync(root, { recursive: true, force: true })
fs.mkdirSync(root, { recursive: true })
await g(root, ['init', '-q', '-b', 'main'])
await g(root, ['config', 'user.name', 'T'])
await g(root, ['config', 'user.email', 't@e'])
fs.writeFileSync(path.join(root, 'f.txt'), 'one\n')
await g(root, ['add', '-A'])
await g(root, ['commit', '-q', '-m', 'chore: seed'])

/**
 * The provider shape the plugin must tolerate: `handle.done` for the exit facts,
 * and collect-mode readers for the output. A live stream is deliberately absent,
 * because a provider that offers only readers is a real one.
 */
const subprocess = {
  async resolveExecutable(name) { return name },
  spawn({ argv, cwd }) {
    const child = spawn(argv[0], argv.slice(1), { cwd, env: process.env, windowsHide: true })
    let out = '', err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    const done = new Promise((resolve) => {
      child.on('error', (e) => resolve({ exitCode: -1, signal: null, error: String(e) }))
      child.on('close', (code, sig) => resolve({ exitCode: code ?? -1, signal: sig ?? null }))
    })
    return {
      done,
      collected: {
        stdout: { readFrom: (from) => ({ text: out.slice(from), nextOffset: out.length, lossy: false }) },
        stderr: { readFrom: (from) => ({ text: err.slice(from), nextOffset: err.length, lossy: false }) },
      },
    }
  },
}

const ctx = {
  subprocess,
  get: () => undefined,
  logger: { info: () => {} },
  effect: (cb) => { cb(); return () => {} },
}
const engine = new GithubSyncEngine(ctx, resolveConfig({ generateCommitMessage: false }))
const agent = { id: 's', session: { header: { cwd: root } } }
const signal = new AbortController().signal
const runIn = async (argv) => {
  const r = await g(root, argv)
  return { argv: ['git', ...argv], exitCode: r.x, signal: null, stdout: r.o, stderr: r.e, timedOut: false, aborted: false }
}
const repo = () => ({ root, git: 'git', runIn })
/** The recorded subject line. `%B` alone: `%s%B` would print the message twice. */
const recorded = async () => (await g(root, ['log', '-1', '--pretty=%B'])).o.split('\n')[0].trim()

/** Commit `text` with the given subject and selection, and read the message back. */
async function commit(subject, markers) {
  fs.writeFileSync(path.join(root, 'f.txt'), `${Math.random()}\n`)
  await g(root, ['add', '-A'])
  await engine.commitStaged({ repo: repo(), files: ['f.txt'], subject, markers, agent, signal })
  return recorded()
}

console.log('=== the strip keeps what is prose and drops what is a marker ===')
{
  const cases = [
    ['feat: x [release]', [], 'feat: x'],
    ['feat: x [release] [skip ci]', [], 'feat: x'],
    ['feat: x [release]', ['skip ci'], 'feat: x [skip ci]'],
    ['feat: x [release]', ['release'], 'feat: x [release]'],
    ['feat: x', ['release'], 'feat: x [release]'],
    ['feat: x', undefined, 'feat: x'],
    ['feat(ui): keep [x] inside', [], 'feat(ui): keep [x] inside'],
    ['fix: handle [TAG] and [other]', [], 'fix: handle [TAG] and [other]'],
    ['feat: add [release] flag', [], 'feat: add [release] flag'],
    ['chore: bump to 1.0.0', [], 'chore: bump to 1.0.0'],
    ['feat: x [HOTFIX]', ['hotfix'], 'feat: x [hotfix]'],
  ]
  for (const [subject, selected, want] of cases) {
    const got = withMarkerLine(stripTrailingMarkers(subject, selected), markerLine(selected?.length ? selected : undefined))
    ok(`${JSON.stringify(subject)} + ${JSON.stringify(selected ?? null)} -> ${JSON.stringify(want)}`, got === want, got)
  }
}

console.log('\n=== the recorded message ===')
{
  const message = await commit('feat: x [release]', undefined)
  console.log('recorded:', JSON.stringify(message))
  ok('an inherited marker is not recorded', message === 'feat: x', message)
}
{
  const message = await commit('feat: y [release]', ['skip ci'])
  console.log('recorded:', JSON.stringify(message))
  ok('the selection replaces the inherited marker', message === 'feat: y [skip ci]', message)
}
{
  const message = await commit('feat: z', ['release', 'skip ci'])
  console.log('recorded:', JSON.stringify(message))
  ok('a clean subject gains both, in order', message === 'feat: z [release] [skip ci]', message)
}
{
  const message = await commit('feat: w [skip ci]', ['skip ci'])
  console.log('recorded:', JSON.stringify(message))
  ok('selecting the inherited marker does not double it', message === 'feat: w [skip ci]', message)
}
{
  const message = await commit('fix: handle [TAG] and [other]', undefined)
  console.log('recorded:', JSON.stringify(message))
  ok('prose brackets survive', message === 'fix: handle [TAG] and [other]', message)
}
{
  const message = await commit('chore: nothing at all', undefined)
  console.log('recorded:', JSON.stringify(message))
  ok('nothing is added when nothing was selected', message === 'chore: nothing at all', message)
}

console.log(failed === 0 ? '\nRESULT: ALL CHECKS PASSED' : `\nRESULT: ${failed} FAILURE(S)`)
