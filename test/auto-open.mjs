/**
 * Bringing the panel along to the next session.
 *
 * Every session's sidebar starts collapsed, so without this a panel left open in
 * one conversation is gone in the next. The behaviour is narrow on purpose, and
 * each of the narrowings is asserted here: only a repository session, only a
 * collapsed column, only when the person asked for it — and a call that lands
 * before the column's store exists is retried, not lost.
 *
 * Run: node test/auto-open.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
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
const t = (key, params) => {
  const template = EN[key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (m, n) => (n in params ? String(params[n]) : m))
}

const PROBE = {
  state: 'repo', branch: 'main', dirty: false, ahead: 0, behind: 0, remote: 'origin',
  changes: [], counts: [0, 0],
}
const NO_REPO = { state: 'empty', workspace: '/tmp/x', branch: null, dirty: false, ahead: null, behind: null }

let failed = 0
const ok = (text, cond, extra) => {
  if (!cond) failed += 1
  console.log(cond ? 'ok  ' : 'FAIL', text, cond ? '' : JSON.stringify(extra))
}
const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms))

const collect = (n, pred, out = []) => {
  if (n === null || n === undefined) return out
  if (Array.isArray(n)) { for (const c of n) collect(c, pred, out); return out }
  if (typeof n !== 'object') return out
  if (pred(n)) out.push(n)
  if (typeof n.type === 'function') { collect(n.type(n.props), pred, out); return out }
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

/** A localStorage stub that a test can drive. */
function storage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    get size() { return map.size },
    raw: map,
  }
}

function boot({ probeBody = PROBE, expanded = false, throwsOnOpen = 0, store = storage() } = {}) {
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
  const state = {
    effects: [], issued: [], opens: [], backing, S, expanded, store,
    throwLeft: throwsOnOpen,
  }
  let definition
  const localStorageStub = store
  const windowStub = {
    __ModuleLoader__: { load: (d) => { definition = d } },
    localStorage: localStorageStub,
    addEventListener() {}, removeEventListener() {},
  }
  const documentStub = { addEventListener() {}, removeEventListener() {} }
  new Function('window', 'document', 'require', SOURCE)(windowStub, documentStub, (id) => {
    if (id === 'react') return React
    throw new Error(`unexpected require ${id}`)
  })
  const registrations = []
  const sidebar = {
    openTab: (kind) => {
      if (state.throwLeft > 0) {
        state.throwLeft -= 1
        throw new Error('no on-screen surface yet')
      }
      state.opens.push(kind)
      state.expanded = true
    },
    openResource: () => {},
    isExpanded: () => state.expanded,
    register: () => () => {},
  }
  const env = {
    slots: { inject: (_k, cb) => cb(), register: (o, c) => { registrations.push({ o, c }); return () => {} } },
    locale: { register: () => () => {}, bind: () => t },
    get: (name) => (name === 'sidebarRight' || name === 'sidebarRightTabs' ? sidebar : undefined),
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
  state.buildProps = (sessionId) => ({ sessionId, t, ...state.registration.o.inject() })
  return state
}

/** Mount a session's control and drain its effects, as a session switch would. */
async function mountSession(state, sessionId) {
  const { Component, S } = state
  S.index = 0
  let node = Component(state.buildProps(sessionId))
  for (let i = 0; i < 4; i += 1) {
    const effects = state.effects.slice()
    state.effects = []
    for (const e of effects) e()
    await settle()
    S.index = 0
    node = Component(state.buildProps(sessionId))
  }
  await settle(80)
  S.index = 0
  node = Component(state.buildProps(sessionId))
  return node
}

console.log('=== a repository session with the column collapsed: it opens ===')
{
  const state = boot({ expanded: false })
  await mountSession(state, 's1')
  console.log('opens:', JSON.stringify(state.opens))
  ok('the panel is opened once', state.opens.length === 1, state.opens)
  ok('for the plugin tab', state.opens[0] === 'github-sync', state.opens)
}

console.log('\n=== an already-expanded column is left alone ===')
{
  const state = boot({ expanded: true })
  await mountSession(state, 's1')
  console.log('opens:', JSON.stringify(state.opens))
  ok('nothing is opened, so focus is not stolen from another tab', state.opens.length === 0, state.opens)
}

console.log('\n=== a workspace that is not a repository: nothing to show ===')
{
  const state = boot({ probeBody: NO_REPO, expanded: false })
  await mountSession(state, 's1')
  console.log('opens:', JSON.stringify(state.opens))
  ok('the panel stays shut', state.opens.length === 0, state.opens)
}

console.log('\n=== the preference is honoured and remembered ===')
{
  const store = storage({ 'dsh-github-sync:auto-open': 'false' })
  const state = boot({ expanded: false, store })
  await mountSession(state, 's1')
  console.log('opens with the preference off:', JSON.stringify(state.opens))
  ok('a stored "off" is respected', state.opens.length === 0, state.opens)

  // Turning it on in the panel writes the preference for the next page load. The
  // panel only renders while the popup is open, so the button is pressed first.
  let node = await mountSession(state, 's1')
  const clickTheControl = (tree) => {
    const trigger = collect(tree, (n) => n.type === 'button' && n.props?.['aria-haspopup'] === 'menu')[0]
    if (trigger === undefined) throw new Error('the control button was not found')
    trigger.props.onClick()
  }
  const render = async (rounds = 3) => {
    const { Component, S } = state
    for (let i = 0; i < rounds; i += 1) {
      const effects = state.effects.slice()
      state.effects = []
      for (const e of effects) e()
      await settle()
      S.index = 0
      node = Component(state.buildProps('s1'))
    }
    S.index = 0
    node = Component(state.buildProps('s1'))
    return node
  }
  clickTheControl(node)
  node = await render()
  const label = EN['autoOpen.label']
  const toggle = collect(node, (n) => n.type === 'button' && textOf(n).includes(label))[0]
  ok('the toggle is offered', toggle !== undefined)
  ok('and reads as off', toggle.props['aria-checked'] === false, toggle.props['aria-checked'])
  toggle.props.onClick()
  ok('the preference is written', store.getItem('dsh-github-sync:auto-open') === 'true', store.raw.get('dsh-github-sync:auto-open'))
}

console.log('\n=== a call that lands before the store exists is retried ===')
{
  const state = boot({ expanded: false, throwsOnOpen: 1 })
  await mountSession(state, 's1')
  await settle(500)
  console.log('opens after the retry:', JSON.stringify(state.opens))
  ok('the retry opens it', state.opens.length === 1, state.opens)
}

console.log('\n=== a second session is opened as well ===')
{
  const state = boot({ expanded: false })
  await mountSession(state, 's1')
  // A session switch collapses again, because each session owns its layout.
  state.expanded = false
  await mountSession(state, 's2')
  console.log('opens:', JSON.stringify(state.opens))
  ok('both sessions were opened', state.opens.length === 2, state.opens)
}

console.log('\n=== the pane surface never tries to open itself ===')
{
  const state = boot({ expanded: false })
  const node = state.Component({ ...state.buildProps('s1'), surface: 'pane' })
  const effects = state.effects.slice()
  state.effects = []
  for (const e of effects) e()
  await settle(150)
  console.log('opens from the pane:', JSON.stringify(state.opens))
  ok('the pane does not open a column it is already in', state.opens.length === 0, state.opens)
  void node
}

console.log(failed === 0 ? '\nRESULT: ALL CHECKS PASSED' : `\nRESULT: ${failed} FAILURE(S)`)
