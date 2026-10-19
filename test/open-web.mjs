/**
 * The jump out of the menu to the project's GitHub page.
 *
 * The Host normalizes the configured remote into a browsable address and the
 * control renders it as an anchor with `target="_blank"` — the shape the desktop
 * shell already turns into an external browser open. A repository whose remote
 * has no web page must simply not offer the item, rather than offer a dead link.
 *
 * Run: node test/open-web.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { webUrlOfRemote } from '../lib/repo.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN = path.join(HERE, '..')

let failed = 0
const ok = (text, cond, extra) => {
  if (!cond) failed += 1
  console.log(cond ? 'ok  ' : 'FAIL', text, cond ? '' : JSON.stringify(extra))
}
const same = (text, actual, expected) => ok(text, actual === expected, { actual, expected })

console.log('=== every remote form a GitHub project uses ===')
same('https with .git', webUrlOfRemote('https://github.com/acme/widget.git'), 'https://github.com/acme/widget')
same('https without .git', webUrlOfRemote('https://github.com/acme/widget'), 'https://github.com/acme/widget')
same('scp-like ssh', webUrlOfRemote('git@github.com:acme/widget.git'), 'https://github.com/acme/widget')
same('ssh://', webUrlOfRemote('ssh://git@github.com/acme/widget.git'), 'https://github.com/acme/widget')
same('short owner/repo', webUrlOfRemote('acme/widget'), 'https://github.com/acme/widget')
same(
  'credentials are not carried into the page',
  webUrlOfRemote('https://token@github.com/acme/widget.git'),
  'https://github.com/acme/widget',
)
same('an enterprise host keeps its host', webUrlOfRemote('git@github.acme.test:acme/widget.git'), 'https://github.acme.test/acme/widget')

console.log('\n=== remotes with no browsable page ===')
same('a local path', webUrlOfRemote('/srv/git/widget.git'), undefined)
same('a file URL', webUrlOfRemote('file:///srv/git/widget.git'), undefined)
same('empty', webUrlOfRemote(''), undefined)
same('null', webUrlOfRemote(null), undefined)
same('not a repository reference', webUrlOfRemote('origin'), undefined)

console.log('\n=== the probe carries the normalized page ===')
{
  const { GithubSyncEngine } = await import(`file:///${PLUGIN.replace(/\\/g, '/')}/lib/engine.js`)
  const { resolveConfig } = await import(`file:///${PLUGIN.replace(/\\/g, '/')}/lib/config.js`)
  const root = path.join(os.tmpdir(), 'dsh-open-web')
  const g = (args) =>
    new Promise((resolve) => {
      const child = spawn('git', args, { cwd: root, env: process.env, windowsHide: true })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk) => (stdout += chunk))
      child.stderr.on('data', (chunk) => (stderr += chunk))
      child.on('close', (code) => resolve({ code, stdout, stderr }))
    })
  fs.rmSync(root, { recursive: true, force: true })
  fs.mkdirSync(root, { recursive: true })
  await g(['init', '-q', '-b', 'main'])
  await g(['config', 'user.name', 'T'])
  await g(['config', 'user.email', 't@e'])
  fs.writeFileSync(path.join(root, 'f.txt'), 'one\n')
  await g(['add', '-A'])
  await g(['commit', '-q', '-m', 'chore: seed'])
  await g(['remote', 'add', 'origin', 'git@github.com:acme/widget.git'])

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
  const engine = new GithubSyncEngine(ctx, resolveConfig({ generateCommitMessage: false }))
  const agent = { id: 's', session: { header: { cwd: root } } }
  const answer = await engine.probe(agent, undefined, { slim: true })
  same('the probe normalizes the configured remote', answer.web, 'https://github.com/acme/widget')

  await g(['remote', 'set-url', 'origin', root])
  const localAnswer = await engine.probe(agent, undefined, { slim: true })
  same('a local remote has no page, rather than a guess', localAnswer.web, null)
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('\n=== the control renders the item from the probe ===')
{
  globalThis.__DSH_TEST__ = true
  const SOURCE = fs.readFileSync(path.join(HERE, '..', 'client.js'), 'utf8')

  const EN = (() => {
    const start = SOURCE.indexOf('const EN = {')
    const open = SOURCE.indexOf('{', start)
    let depth = 0
    for (let i = open; i < SOURCE.length; i += 1) {
      if (SOURCE[i] === '{') depth += 1
      else if (SOURCE[i] === '}') {
        depth -= 1
        if (depth === 0) return new Function(`return (${SOURCE.slice(open, i + 1)})`)()
      }
    }
    throw new Error('EN not found')
  })()
  const ZH = (() => {
    const start = SOURCE.indexOf('const ZH = {')
    const open = SOURCE.indexOf('{', start)
    let depth = 0
    for (let i = open; i < SOURCE.length; i += 1) {
      if (SOURCE[i] === '{') depth += 1
      else if (SOURCE[i] === '}') {
        depth -= 1
        if (depth === 0) return new Function(`return (${SOURCE.slice(open, i + 1)})`)()
      }
    }
    throw new Error('ZH not found')
  })()
  const t = (key) => EN[key] ?? key

  ok('the label is translated', typeof EN['action.openWeb'] === 'string' && typeof ZH['action.openWeb'] === 'string', {
    en: EN['action.openWeb'],
    zh: ZH['action.openWeb'],
  })

  const PROBE = {
    state: 'repo',
    branch: 'main',
    dirty: false,
    ahead: 0,
    behind: 0,
    remote: 'git@github.com:acme/widget.git',
    web: 'https://github.com/acme/widget',
    changes: [],
    counts: [0, 0],
  }

  const collect = (n, pred, out = []) => {
    if (n === null || n === undefined) return out
    if (Array.isArray(n)) {
      for (const c of n) collect(c, pred, out)
      return out
    }
    if (typeof n !== 'object') return out
    if (pred(n)) out.push(n)
    if (typeof n.type === 'function') {
      collect(n.type(n.props), pred, out)
      return out
    }
    for (const c of n.children) collect(c, pred, out)
    return out
  }
  const textOf = (n) => {
    if (n === null || n === undefined) return ''
    if (typeof n === 'string') return n
    if (typeof n !== 'object') return ''
    if (Array.isArray(n)) return n.map(textOf).join('')
    if (typeof n.type === 'function') return textOf(n.type(n.props))
    return n.children.map(textOf).join('')
  }

  function boot(probeBody) {
    const backing = []
    const S = { index: 0 }
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
      useEffect(fn) { state.effects.push(fn) },
      useMemo(fn) { return fn() },
      useCallback(fn) { return fn },
    }
    const state = { effects: [], issued: [], S }
    let definition
    const windowStub = { __ModuleLoader__: { load: (d) => { definition = d } }, localStorage: { getItem: () => null, setItem() {} }, addEventListener() {}, removeEventListener() {} }
    const documentStub = { addEventListener() {}, removeEventListener() {} }
    new Function('window', 'document', 'require', SOURCE)(windowStub, documentStub, (id) => {
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
            state.issued.push(line)
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
    state.registration = registrations.find((r) => r.o.name === 'conversation.input.left')
    state.Component = state.registration.c
    state.props = { sessionId: 's1', t, ...state.registration.o.inject() }
    return state
  }

  /** Mount the sidebar pane, whose full probe is what draws the menu contents. */
  async function mountPane(state) {
    const { Component, props, S } = state
    S.index = 0
    let node = Component({ ...props, surface: 'pane' })
    for (let round = 0; round < 5; round += 1) {
      const effects = state.effects.slice()
      state.effects = []
      for (const effect of effects) await effect()
      await new Promise((resolve) => setTimeout(resolve, 30))
      S.index = 0
      node = Component({ ...props, surface: 'pane' })
    }
    return node
  }

  const state = boot(PROBE)
  const node = await mountPane(state)
  const link = collect(node, (n) => n.type === 'a' && n.props?.href === PROBE.web)[0]
  ok('the item is offered', link !== undefined)
  ok('it points at the project page', link?.props?.href === PROBE.web, link?.props)
  ok('it opens a new top-level context', link?.props?.target === '_blank', link?.props)
  ok('the opener cannot reach back', link?.props?.rel === 'noopener noreferrer', link?.props)
  ok('its label is the localized action', textOf(link) === EN['action.openWeb'], textOf(link))

  const noWeb = boot({ ...PROBE, remote: '/srv/git/widget.git', web: null })
  const noWebNode = await mountPane(noWeb)
  const deadLink = collect(noWebNode, (n) => n.type === 'a' && n.props?.role === 'menuitem')[0]
  ok('a repository with no page offers no item', deadLink === undefined, deadLink?.props)
}

console.log(failed === 0 ? '\nRESULT: ALL CHECKS PASSED' : `\nRESULT: ${failed} FAILURE(S)`)
process.exit(failed === 0 ? 0 : 1)
