/**
 * The "auto-rebase before push" switch.
 *
 * The deployment setting is the default, but the switch is what a person can
 * actually see and touch. A click has to travel with the command — otherwise the
 * panel would show one thing and the Host would do another — and the choice has
 * to survive a page reload without silently pinning a stale override.
 *
 * Run: node test/integrate-toggle.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN = path.join(HERE, '..')
const CLIENT = path.join(PLUGIN, 'client.js')

const { parseCommandLine } = await import(`file:///${PLUGIN.replace(/\\/g, '/')}/lib/command.js`)
const { GithubSyncEngine } = await import(`file:///${PLUGIN.replace(/\\/g, '/')}/lib/engine.js`)
const { resolveConfig } = await import(`file:///${PLUGIN.replace(/\\/g, '/')}/lib/config.js`)

globalThis.__DSH_TEST__ = true
const SOURCE = fs.readFileSync(CLIENT, 'utf8')

/** Pull a top-level object literal out of the source by its opening line. */
function dictionary(name) {
  const start = SOURCE.indexOf(`const ${name} = {`)
  if (start < 0) throw new Error(`${name} not found`)
  const open = SOURCE.indexOf('{', start)
  let depth = 0
  for (let i = open; i < SOURCE.length; i += 1) {
    if (SOURCE[i] === '{') depth += 1
    else if (SOURCE[i] === '}') {
      depth -= 1
      if (depth === 0) return new Function(`return (${SOURCE.slice(open, i + 1)})`)()
    }
  }
  throw new Error(`${name} is not closed`)
}
const EN = dictionary('EN')
const ZH = dictionary('ZH')
const t = (key) => EN[key] ?? key

const collect = (node, pred, out = []) => {
  if (node === null || node === undefined) return out
  if (Array.isArray(node)) { for (const c of node) collect(c, pred, out); return out }
  if (typeof node !== 'object') return out
  if (pred(node)) out.push(node)
  if (typeof node.type === 'function') { collect(node.type(node.props), pred, out); return out }
  for (const c of node.children) collect(c, pred, out)
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
const buttonNamed = (node, label) =>
  collect(node, (n) => n.type === 'button' && textOf(n).trim() === label)[0]
const integrateToggleOf = (node) =>
  collect(
    node,
    (n) =>
      n.type === 'button' &&
      n.props?.['role'] === 'menuitemcheckbox' &&
      textOf(n).trim().replace(/^✓\s*/, '') === EN['action.integrate'],
  )[0]

const PROBE = {
  state: 'repo',
  branch: 'main',
  dirty: true,
  ahead: 0,
  behind: 0,
  remote: 'https://github.com/acme/widget.git',
  web: 'https://github.com/acme/widget',
  integrateBeforePush: false,
  changes: [['f.txt', ' M']],
  counts: [1, 0],
}

let failed = 0
const ok = (text, cond, extra) => {
  if (!cond) failed += 1
  console.log(cond ? 'ok  ' : 'FAIL', text, cond ? '' : JSON.stringify(extra))
}
const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))

/** A localStorage stub with the operations the client uses. */
function storage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    raw: map,
  }
}

function boot({ probeBody = PROBE, store = storage() } = {}) {
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
  const state = { effects: [], issued: [], backing, S, store }
  let definition
  const windowStub = {
    __ModuleLoader__: { load: (d) => { definition = d } },
    localStorage: store,
    addEventListener() {},
    removeEventListener() {},
  }
  const documentStub = { addEventListener() {}, removeEventListener() {} }
  new Function('window', 'document', 'require', SOURCE)(windowStub, documentStub, (id) => {
    if (id === 'react') return React
    throw new Error(`unexpected require: ${id}`)
  })
  const env = {
    slots: { inject: (_k, cb) => cb(), register: (o, c) => { state.registration = { o, c }; return () => {} } },
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
  state.Component = state.registration.c
  state.props = { sessionId: 's1', t, ...state.registration.o.inject() }
  return state
}

/** Open the menu and return helpers that re-render after each interaction. */
async function openMenu(state) {
  const { Component, props, S } = state
  state.effects.length = 0
  S.index = 0
  let node = Component(props)
  const render = async (rounds = 3) => {
    for (let i = 0; i < rounds; i += 1) {
      const effects = state.effects.slice()
      state.effects = []
      for (const effect of effects) effect()
      await settle()
      S.index = 0
      node = Component(props)
    }
    S.index = 0
    node = Component(props)
    return node
  }
  node = await render()
  const trigger = collect(node, (n) => n.type === 'button' && n.props?.['aria-haspopup'] === 'menu')[0]
  if (trigger === undefined) throw new Error('the control button was not found')
  trigger.props.onClick()
  node = await render()
  return {
    node: () => node,
    render,
    click: async (button) => {
      if (button === undefined) throw new Error('the button was not found')
      button.props.onClick()
      node = await render(2)
      return node
    },
    enterSyncStep: async () => {
      const enter = buttonNamed(node, EN['action.sync'])
      if (enter === undefined) {
        throw new Error(`no Commit & push button; have ${JSON.stringify(collect(node, (n) => n.type === 'button').map((n) => textOf(n).trim()))}`)
      }
      enter.props.onClick()
      node = await render()
      return node
    },
    confirm: async () => {
      const confirm = collect(node, (n) => n.type === 'button' && /Confirm/.test(textOf(n))).pop()
      if (confirm === undefined) throw new Error('no Confirm button')
      confirm.props.onClick()
      await render(3)
    },
  }
}

const syncLines = (state) => state.issued.filter((line) => /^\/github sync\b/.test(line))

console.log('=== auto-rebase is on by default ===')
{
  ok('the deployment default replays before pushing', resolveConfig().integrateBeforePush === true, resolveConfig().integrateBeforePush)
}

console.log('\n=== turned off while behind: the menu warns before the refused push ===')
{
  const state = boot({ probeBody: { ...PROBE, integrateBeforePush: false, behind: 2 } })
  const menu = await openMenu(state)
  const warning = t('integrate.behind', { count: 2 })
  ok('the warning names the count', textOf(menu.node()).includes(warning), textOf(menu.node()).slice(0, 500))
  await menu.click(integrateToggleOf(menu.node()))
  ok('turning it on removes the warning', !textOf(menu.node()).includes(warning), textOf(menu.node()).slice(0, 500))
}

console.log('\n=== the switch is visible, reflects a config of false, and is remembered ===')
{
  const store = storage()
  const state = boot({ store })
  const menu = await openMenu(state)
  let toggle = integrateToggleOf(menu.node())
  ok('the switch is in the menu', toggle !== undefined)
  ok('it starts from the deployment setting', toggle?.props?.['aria-checked'] === false, toggle?.props?.['aria-checked'])
  await menu.click(toggle)
  toggle = integrateToggleOf(menu.node())
  ok('a click checks it', toggle?.props?.['aria-checked'] === true, toggle?.props?.['aria-checked'])
  ok(
    'the on state is green',
    String(toggle?.props?.style?.background ?? '').includes('state-success-primary'),
    toggle?.props?.style,
  )
  ok('the choice is written for the next page', store.getItem('dsh-github-sync:integrate-before-push') === 'true', store.raw)

  await menu.enterSyncStep()
  await menu.confirm()
  const lines = syncLines(state)
  console.log('sync line:', JSON.stringify(lines))
  ok('the command carries the click', lines.some((line) => line.includes('--integrate')), lines)
  ok('it carries no contradictory flag', !lines.some((line) => line.includes('--no-integrate')), lines)
}

console.log('\n=== a deployment setting of true is the default, and a click can suppress it ===')
{
  const state = boot({ probeBody: { ...PROBE, integrateBeforePush: true } })
  const menu = await openMenu(state)
  let toggle = integrateToggleOf(menu.node())
  ok('the switch follows the deployment setting', toggle?.props?.['aria-checked'] === true, toggle?.props?.['aria-checked'])
  await menu.click(toggle)
  toggle = integrateToggleOf(menu.node())
  ok('clicking it turns it off', toggle?.props?.['aria-checked'] === false, toggle?.props?.['aria-checked'])
  await menu.enterSyncStep()
  await menu.confirm()
  const lines = syncLines(state)
  console.log('sync line:', JSON.stringify(lines))
  ok('the command suppresses the deployment setting', lines.some((line) => line.includes('--no-integrate')), lines)
}

console.log('\n=== untouched, the command carries no override ===')
{
  const state = boot({ probeBody: { ...PROBE, integrateBeforePush: true } })
  const menu = await openMenu(state)
  const toggle = integrateToggleOf(menu.node())
  ok('the switch shows the deployment setting', toggle?.props?.['aria-checked'] === true, toggle?.props?.['aria-checked'])
  await menu.enterSyncStep()
  await menu.confirm()
  const lines = syncLines(state)
  console.log('sync line:', JSON.stringify(lines))
  ok('no flag is sent, so the Host config decides', !lines.some((line) => /--(no-)?integrate/.test(line)), lines)
}

console.log('\n=== clicking back to the deployment value forgets the override ===')
{
  const store = storage({ 'dsh-github-sync:integrate-before-push': 'false' })
  const state = boot({ store, probeBody: { ...PROBE, integrateBeforePush: true } })
  const menu = await openMenu(state)
  const toggle = integrateToggleOf(menu.node())
  ok('the stored choice wins over the deployment', toggle?.props?.['aria-checked'] === false, toggle?.props?.['aria-checked'])
  await menu.click(toggle)
  ok('the stored override is removed', !store.raw.has('dsh-github-sync:integrate-before-push'), store.raw)
  await menu.enterSyncStep()
  await menu.confirm()
  const lines = syncLines(state)
  ok('and the command follows the config again', !lines.some((line) => /--(no-)?integrate/.test(line)), lines)
}

console.log('\n=== the command line and the Host agree on the override ===')
{
  ok('--integrate means on', parseCommandLine('sync --integrate').integrate === true)
  ok('--no-integrate means off', parseCommandLine('sync --no-integrate').integrate === false)
  ok('no flag means follow the config', parseCommandLine('sync').integrate === undefined)
  ok('the last flag wins', parseCommandLine('sync --integrate --no-integrate').integrate === false)

  // A tiny fake repository: `sync` only needs a remote URL, a branch, and the
  // methods this test intercepts. That keeps the assertion on the decision under
  // test — which setting wins — rather than on git itself.
  const run = { argv: ['git'], exitCode: 0, signal: null, stdout: '', stderr: '', timedOut: false, aborted: false }
  const repo = {
    root: '/repo',
    workspace: '/workspace',
    git: 'git',
    runIn: async (argv) => ({
      ...run,
      argv: ['git', ...argv],
      stdout: argv[0] === 'remote' && argv[1] === 'get-url' ? 'https://github.com/acme/widget.git\n' : '',
    }),
  }
  const subprocess = {
    async resolveExecutable(name) { return name },
    spawn() {
      return {
        done: Promise.resolve({ exitCode: 0, signal: null }),
        collected: {
          stdout: { readFrom: (from) => ({ text: from === 0 ? 'main\n' : '', nextOffset: 'main\n'.length, lossy: false }) },
          stderr: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) },
        },
      }
    },
  }
  const ctx = { subprocess, get: () => undefined, logger: { info: () => {} }, effect: (cb) => { cb(); return () => {} } }

  async function syncWith(configValue, override) {
    const steps = []
    const engine = new GithubSyncEngine(ctx, resolveConfig({ integrateBeforePush: configValue }))
    engine.locate = async () => repo
    engine.stageAll = async () => []
    engine.commitStaged = async () => {
      steps.push('commit')
      return { step: 'commit', status: 'completed' }
    }
    engine.integrateUpstream = async () => {
      steps.push('integrate')
      return { step: 'integrate', status: 'completed' }
    }
    engine.push = async () => {
      steps.push('push')
      return { step: 'push', status: 'completed' }
    }
    engine.isDirty = async () => false
    await engine.sync({ action: 'sync', integrate: override, agent: {}, signal: new AbortController().signal })
    return steps
  }

  const cases = [
    [false, undefined, false],
    [false, true, true],
    [true, undefined, true],
    [true, false, false],
  ]
  for (const [configValue, override, expected] of cases) {
    const steps = await syncWith(configValue, override)
    const integrated = steps.includes('integrate')
    ok(
      `config ${configValue}, override ${String(override)} -> integrate ${expected}`,
      integrated === expected && steps.at(-1) === 'push',
      steps,
    )
  }
}

console.log('\n=== both dictionaries agree on the new copy ===')
{
  for (const key of ['action.integrate', 'integrate.hint', 'integrate.behind']) {
    ok(`${key} is translated`, typeof EN[key] === 'string' && typeof ZH[key] === 'string', { en: EN[key], zh: ZH[key] })
  }
  ok('the en and zh key sets are identical',
    JSON.stringify(Object.keys(EN).sort()) === JSON.stringify(Object.keys(ZH).sort()),
    Object.keys(EN).filter((key) => !(key in ZH)))
}

console.log(failed === 0 ? '\nRESULT: ALL CHECKS PASSED' : `\nRESULT: ${failed} FAILURE(S)`)
process.exit(failed === 0 ? 0 : 1)
