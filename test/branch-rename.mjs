/**
 * A default branch renamed on the remote.
 *
 * A clone keeps the old name locally and keeps tracking `origin/<old>` until
 * something prunes it, so the probe can keep reporting the old branch as "in
 * sync" while the remote has moved on — and the new name is not in the branch
 * list at all, because that list is local. The panel then shows a branch nobody
 * can use and offers no way to the one the remote actually has.
 *
 * This pins the three answers that close that gap: the probe names the remote's
 * default and the branches only it has, switching to a remote-only branch creates
 * the local branch that tracks it, and a push whose upstream was deleted refuses
 * instead of quietly recreating the old name.
 *
 * Run: node test/branch-rename.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN = path.join(HERE, '..')
const asUrl = (file) => `file:///${file.replace(/\\/g, '/')}`

const { GithubSyncEngine } = await import(asUrl(path.join(PLUGIN, 'lib', 'engine.js')))
const { resolveConfig } = await import(asUrl(path.join(PLUGIN, 'lib', 'config.js')))
const { parseCommandLine } = await import(asUrl(path.join(PLUGIN, 'lib', 'command.js')))

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
const heads = async (repo) =>
  (await git(repo, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']))
    .stdout.split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort()

const root = path.join(os.tmpdir(), 'dsh-branch-rename')
fs.rmSync(root, { recursive: true, force: true })
fs.mkdirSync(root, { recursive: true })
const remote = path.join(root, 'remote.git')
const work = path.join(root, 'work')

console.log('=== a clone of a repository whose default branch is master ===')
await git(root, ['init', '--bare', '-q', '-b', 'master', remote])
await git(root, ['clone', '-q', remote, work])
await git(work, ['config', 'user.name', 'T'])
await git(work, ['config', 'user.email', 't@example.com'])
fs.writeFileSync(path.join(work, 'a.txt'), 'one\n')
await git(work, ['add', '-A'])
await git(work, ['commit', '-q', '-m', 'chore: seed'])
await git(work, ['push', '-q', '-u', 'origin', 'master'])
ok('the remote starts on master', (await heads(remote)).join(',') === 'master', await heads(remote))

// The provider shape the plugin has to tolerate: `done` for the exit facts and
// collect-mode readers for the output.
const subprocess = {
  async resolveExecutable(name) { return name },
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
// `fetchOnStatus` is what makes the probe see a rename without a separate pull:
// the fetch that brings the new default in is also the fetch that prunes the old
// remote-tracking branch away.
const engine = new GithubSyncEngine(ctx, resolveConfig({ fetchOnStatus: true, generateCommitMessage: false }))
const agent = { id: 's', session: { header: { cwd: work } } }

const runIn = async (argv) => {
  const run = await git(work, argv)
  return { argv: ['git', ...argv], exitCode: run.code, signal: null, stdout: run.stdout, stderr: run.stderr, timedOut: false, aborted: false }
}
const repo = { root: work, workspace: work, git: 'git', runIn }

const before = await engine.probe(agent, undefined, {})
ok('the probe reports the local branch', before.branch === 'master', before.branch)
ok('and the remote default it knows', before.remoteDefault === 'master', before.remoteDefault)
ok('nothing is gone before the rename', before.upstreamGone !== true, before.upstreamGone)
ok('and no remote-only branch is offered', before.remoteBranches === undefined, before.remoteBranches)

console.log('\n=== the remote renames its default branch to main ===')
await git(remote, ['branch', '-m', 'master', 'main'])
await git(remote, ['symbolic-ref', 'HEAD', 'refs/heads/main'])
ok('the remote now defaults to main', (await heads(remote)).join(',') === 'main', await heads(remote))

const after = await (async () => {
  // A deployment with `fetchOnStatus: false` — the default — asks the remote
  // nothing on its own, so the old answer survives until something fetches. That
  // is the state the panel shows before a refresh, and it has to be stated
  // honestly rather than guessed at.
  const lazy = () => new GithubSyncEngine(ctx, resolveConfig({ generateCommitMessage: false }))
  const stale = await lazy().probe(agent, undefined, {})
  console.log('stale probe:', JSON.stringify({ remoteDefault: stale.remoteDefault, upstreamGone: stale.upstreamGone, ahead: stale.ahead }))
  ok('without a fetch the old default is still reported', stale.remoteDefault === 'master', stale.remoteDefault)
  ok('and the old branch still reads as a live upstream', stale.upstreamGone !== true && stale.ahead === 0, {
    upstreamGone: stale.upstreamGone,
    ahead: stale.ahead,
  })
  // The pane's Refresh button travels as `status --json --fetch`: the person is
  // asking what the remote holds now, which is the one local action that can see
  // a rename in a deployment that does not fetch on every probe.
  return lazy().probe(agent, undefined, { fetch: true })
})()
console.log('probe:', JSON.stringify({
  branch: after.branch,
  upstreamGone: after.upstreamGone,
  upstream: after.upstream,
  remoteDefault: after.remoteDefault,
  remoteBranches: after.remoteBranches,
  ahead: after.ahead,
  behind: after.behind,
}))
ok('the local branch is still the old name', after.branch === 'master', after.branch)
ok('the remote default is reported as main', after.remoteDefault === 'main', after.remoteDefault)
ok('the vanished upstream is named', after.upstreamGone === true && after.upstream === 'origin/master', after.upstream)
// The counts used to read 0/0 against the stale ref, which is a claim of being in
// sync with a branch that no longer exists. Unknown is the honest answer.
ok('the drift is unknown rather than zero', after.ahead === null && after.behind === null, {
  ahead: after.ahead,
  behind: after.behind,
})
ok(
  'the renamed branch is offered as a remote-only branch, marked default',
  JSON.stringify(after.remoteBranches) === JSON.stringify([{ name: 'main', default: true }]),
  after.remoteBranches,
)

console.log('\n=== switching to the remote-only branch creates the tracking branch ===')
{
  const switched = await engine.switchBranch({ repo, name: 'main' })
  ok(
    'the local branch tracks the remote one',
    switched.step === 'switch' && /tracking origin\/main/.test(String(switched.detail)),
    switched,
  )
  ok('main is a local branch now', (await heads(work)).includes('main'), await heads(work))
  const onMain = await engine.probe(agent, undefined, {})
  ok('the probe follows the switch', onMain.branch === 'main', onMain.branch)
  ok('and nothing is gone any more', onMain.upstreamGone !== true, onMain.upstreamGone)
  ok('the remote-only list is empty again', onMain.remoteBranches === undefined, onMain.remoteBranches)
  ok(
    'main tracks origin/main',
    /\[origin\/main\]/.test((await git(work, ['branch', '-vv', '--list', 'main'])).stdout),
    (await git(work, ['branch', '-vv', '--list', 'main'])).stdout,
  )
}

console.log('\n=== the command reports the remote-only branch and the tracking switch ===')
{
  await git(work, ['switch', '-q', 'master'])
  // Back to the state the rename leaves behind: the new name exists only on the
  // remote, so the listing has something to report beyond the local branches.
  await git(work, ['branch', '-q', '-D', 'main'])
  const listing = await engine.sync({ action: 'branches', agent })
  const listingText = GithubSyncEngine.render(listing)
  console.log('branches:', listingText.replace(/\n/g, ' | '))
  ok('the listing names the remote-only branch', /on origin only: main/.test(listingText), listingText)
  ok('and counts it', /1 on origin only/.test(listingText), listingText)

  const switchedBack = await engine.sync({ action: 'switch', name: 'main', agent })
  const switchText = GithubSyncEngine.render(switchedBack)
  console.log('switch:', switchText.replace(/\n/g, ' | '))
  ok(
    'the switch answer is a real step, not a shapeless object',
    /switch: completed/.test(switchText) && !switchText.includes('undefined'),
    switchText,
  )
  ok('and names the tracking branch', /tracking origin\/main/.test(switchText), switchText)
}

console.log('\n=== pushing from the old branch refuses instead of recreating it ===')
{
  await git(work, ['switch', '-q', 'master'])
  fs.writeFileSync(path.join(work, 'b.txt'), 'two\n')
  await git(work, ['add', '-A'])
  await git(work, ['commit', '-q', '-m', 'feat: local work'])
  let refusal
  try {
    await engine.push({ repo, remote: 'origin', signal: undefined })
  } catch (error) {
    refusal = error instanceof Error ? error.message : String(error)
  }
  console.log('refusal:', refusal)
  ok('the push is refused', typeof refusal === 'string', refusal)
  ok('and names the missing upstream', /no longer exists/.test(String(refusal)) && /origin\/master/.test(String(refusal)), refusal)
  ok('and points at the remote default', /main/.test(String(refusal)) && /switch/.test(String(refusal)), refusal)
  ok('nothing was created on the remote', (await heads(remote)).join(',') === 'main', await heads(remote))
}

console.log('\n=== the real command path refuses too ===')
{
  // The command always sends the current branch as a refspec — that is how a first
  // push sets its upstream — so the refusal has to key off "was the branch named
  // deliberately", not off "was a refspec sent".
  const refused = await engine.sync({ action: 'push', agent, signal: undefined })
  const detail = refused.steps.find((entry) => entry.step === 'push')?.detail ?? ''
  console.log('command push step:', detail)
  ok('`/github push` fails rather than recreating the branch', refused.ok === false, refused.steps)
  ok('and names the missing upstream', /no longer exists/.test(detail) && /origin\/master/.test(detail), detail)
  ok('and the deliberate form to use instead', /\/github push <branch>/.test(detail), detail)
  ok('nothing was created on the remote', (await heads(remote)).join(',') === 'main', await heads(remote))
}

console.log('\n=== pulling from the vanished branch explains the rename ===')
{
  const pulled = await engine.sync({ action: 'pull', agent, signal: undefined })
  const detail = pulled.steps.find((entry) => entry.step === 'pull')?.detail ?? ''
  console.log('pull step:', detail)
  ok('the pull fails', pulled.ok === false, pulled.steps)
  ok('and names the missing branch', /origin\/master no longer exists/.test(detail), detail)
  ok('and points at the new default', /main/.test(detail) && /switch/.test(detail), detail)
}

console.log('\n=== naming the branch explicitly still publishes it ===')
{
  const pushed = await engine.sync({ action: 'push', name: 'master', agent, signal: undefined })
  ok('the named push completes', pushed.ok === true, pushed.steps)
  ok('the named branch exists on the remote', (await heads(remote)).includes('master'), await heads(remote))
  ok(
    'and the remote default is untouched',
    (await git(remote, ['symbolic-ref', '--short', 'HEAD'])).stdout.trim() === 'main',
    (await git(remote, ['symbolic-ref', '--short', 'HEAD'])).stdout,
  )
}

// ---------------------------------------------------------------------------
// The panel side: the same answer has to be drawable, and the remote-only branch
// has to be one click.
// ---------------------------------------------------------------------------
globalThis.__DSH_TEST__ = true
const CLIENT = fs.readFileSync(path.join(PLUGIN, 'client.js'), 'utf8')

function dictionary(name) {
  const start = CLIENT.indexOf(`const ${name} = {`)
  const open = CLIENT.indexOf('{', start)
  let depth = 0
  for (let i = open; i < CLIENT.length; i += 1) {
    if (CLIENT[i] === '{') depth += 1
    else if (CLIENT[i] === '}') {
      depth -= 1
      if (depth === 0) return new Function(`return (${CLIENT.slice(open, i + 1)})`)()
    }
  }
  throw new Error(`${name} not found`)
}
const EN = dictionary('EN')
const ZH = dictionary('ZH')
const t = (key, params) => {
  const template = EN[key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (m, n) => (n in params ? String(params[n]) : m))
}

const collect = (node, pred, out = []) => {
  if (node === null || node === undefined) return out
  if (Array.isArray(node)) { for (const child of node) collect(child, pred, out); return out }
  if (typeof node !== 'object') return out
  if (pred(node)) out.push(node)
  if (typeof node.type === 'function') { collect(node.type(node.props), pred, out); return out }
  for (const child of node.children) collect(child, pred, out)
  return out
}
const textOf = (node) => {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string') return node
  if (typeof node !== 'object') return ''
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (typeof node.type === 'function') return textOf(node.type(node.props))
  return node.children.map(textOf).join('')
}

/** Mount the pane with a recorded probe answer and expose the issued commands. */
async function mountPane(probeBody) {
  const backing = []
  const S = { index: 0 }
  const issued = []
  const effects = []
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
    useState(initial) {
      const slot = S.index
      S.index += 1
      const cell = backing[slot] ?? { value: typeof initial === 'function' ? initial() : initial }
      backing[slot] = cell
      return [cell.value, (n) => { cell.value = typeof n === 'function' ? n(cell.value) : n }]
    },
    useRef(initial) {
      const slot = S.index
      S.index += 1
      const cell = backing[slot] ?? { value: { current: initial } }
      backing[slot] = cell
      return cell.value
    },
    useEffect(fn) { effects.push(fn) },
    useMemo(fn) { return fn() },
    useCallback(fn) { return fn },
  }
  let definition
  const windowStub = { __ModuleLoader__: { load: (d) => { definition = d } }, addEventListener() {}, removeEventListener() {} }
  const documentStub = { addEventListener() {}, removeEventListener() {} }
  new Function('window', 'document', 'require', CLIENT)(windowStub, documentStub, (id) => {
    if (id === 'react') return React
    throw new Error(`unexpected require ${id}`)
  })
  const registrations = []
  const env = {
    slots: { inject: (_k, cb) => cb(), register: (o, c) => { registrations.push({ o, c }); return () => {} } },
    locale: { register: () => () => {}, bind: () => t },
    get: () => undefined,
    remote: {
      commands: {
        list: async () => ({ ok: true, value: [{ name: 'github' }] }),
        execute: async (_s, line) => {
          issued.push(line)
          if (line.includes('status --json')) {
            return { ok: true, value: { result: { kind: 'success', text: JSON.stringify(probeBody) } } }
          }
          return { ok: true, value: { result: { kind: 'success', text: 'ok' } } }
        },
      },
    },
    effect: (cb) => { cb(); return () => {} },
  }
  definition.factory((id) => {
    if (id === 'react') return React
    throw new Error(`unexpected require ${id}`)
  }).apply(env)
  const registration = registrations.find((entry) => entry.o.name === 'conversation.input.left')
  S.index = 0
  let node = registration.c({ sessionId: 's1', t, ...registration.o.inject(), surface: 'pane' })
  for (const effect of effects) effect()
  await new Promise((resolve) => setTimeout(resolve, 80))
  S.index = 0
  node = registration.c({ sessionId: 's1', t, ...registration.o.inject(), surface: 'pane' })
  return { node, issued }
}

console.log('\n=== the panel draws the renamed default and offers the switch ===')
{
  const answer = {
    state: 'repo',
    branch: 'master',
    dirty: false,
    ahead: null,
    behind: null,
    remote: 'https://github.com/acme/widget.git',
    remoteDefault: 'main',
    upstreamGone: true,
    upstream: 'origin/master',
    changes: [],
    counts: [0, 0],
    branches: [{ name: 'master', current: true, ahead: 0, behind: 0, gone: true }],
    remoteBranches: [{ name: 'main', default: true }],
  }
  const { node, issued } = await mountPane(answer)
  const text = textOf(node)
  console.log('panel text:', JSON.stringify(text))
  ok('the panel says the tracked branch is gone', text.includes('origin/master') && /gone/i.test(text), text)
  ok('and names the new remote default', text.includes('main'), text)
  const remoteRow = collect(node, (n) => n.type === 'button' && /main/.test(textOf(n)) && n.props?.title === `Switch to main`)[0]
  ok('the remote-only branch is a switch button', remoteRow !== undefined, collect(node, (n) => n.type === 'button').map(textOf))
  if (remoteRow !== undefined) {
    remoteRow.props.onClick()
    await new Promise((resolve) => setTimeout(resolve, 40))
  }
  ok('clicking it issues the switch', issued.some((line) => /\/github switch "main"/.test(line)), issued)
  // The Refresh button is the one action that asks the remote now, which is how a
  // deployment without `fetchOnStatus` ever learns about the rename.
  const refreshButton = collect(node, (n) => n.type === 'button' && textOf(n).trim() === EN['action.refresh'])[0]
  ok('the pane offers a refresh button', refreshButton !== undefined, collect(node, (n) => n.type === 'button').map(textOf))
  if (refreshButton !== undefined) {
    refreshButton.props.onClick()
    await new Promise((resolve) => setTimeout(resolve, 60))
  }
  ok(
    'refresh asks the remote for the current state',
    issued.some((line) => line.includes('status --json') && line.includes('--fetch')),
    issued,
  )
}

console.log('\n=== the command line carries the same request ===')
{
  ok('--fetch parses on status --json', parseCommandLine('status --json --fetch').fetch === true)
  ok('and stays off otherwise', parseCommandLine('status --json').fetch === false)
}

console.log('\n=== a branch with no remote counterpart offers nothing extra ===')
{
  const answer = {
    state: 'repo',
    branch: 'main',
    dirty: false,
    ahead: 0,
    behind: 0,
    remoteDefault: 'main',
    changes: [],
    counts: [0, 0],
    branches: [{ name: 'main', current: true, ahead: 0, behind: 0 }],
  }
  const { node } = await mountPane(answer)
  const text = textOf(node)
  ok('no remote-only section is drawn', !text.includes(EN['branches.remoteTitle']), text)
  ok('no gone note is drawn', !text.includes('gone'), text)
}

console.log('\n=== both dictionaries agree on the new copy ===')
{
  for (const key of [
    'branches.gone',
    'branches.remoteTitle',
    'branches.default',
    'branches.remoteTruncated',
    'branches.upstreamGone',
    'branches.upstreamGoneDefault',
    'state.upstreamGone',
  ]) {
    ok(`${key} is translated`, typeof EN[key] === 'string' && typeof ZH[key] === 'string', { en: EN[key], zh: ZH[key] })
  }
  ok(
    'the en and zh key sets are identical',
    JSON.stringify(Object.keys(EN).sort()) === JSON.stringify(Object.keys(ZH).sort()),
    Object.keys(EN).filter((key) => !(key in ZH)),
  )
}

fs.rmSync(root, { recursive: true, force: true })
console.log(failed === 0 ? '\nRESULT: ALL CHECKS PASSED' : `\nRESULT: ${failed} FAILURE(S)`)
process.exit(failed === 0 ? 0 : 1)
