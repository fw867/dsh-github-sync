/**
 * A visible panel re-reads the workspace.
 *
 * The list the panel shows is git's answer at one moment. The window keeps focus
 * the whole time an agent edits files in the session, so the focus refresh never
 * fires and the list quietly stops matching the tree. This pins the timer that
 * closes that gap: created only while the panel is on screen, one probe per
 * interval at most, nothing while the tab is hidden or a probe is in flight, and
 * disposed when the panel goes away.
 *
 * The timers are the test's own: the bundle runs in Node, where `setInterval` is
 * captured here so a tick happens when the test says so.
 *
 * Run: node test/panel-refresh.mjs
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
  state: 'repo', branch: 'main', dirty: true, ahead: 0, behind: 0, remote: 'origin',
  changes: [['src/a.js', ' M']], counts: [1, 0],
}

let failed = 0
const ok = (text, cond, extra) => {
  if (!cond) failed += 1
  console.log(cond ? 'ok  ' : 'FAIL', text, cond ? '' : JSON.stringify(extra))
}
const settle = (ms = 90) => new Promise((r) => setTimeout(r, ms))

/** Fake timers, so a tick is the test's decision and the process can exit. */
const fakeTimers = { created: [], cleared: [], nextId: 1 }
const realSetInterval = globalThis.setInterval
const realClearInterval = globalThis.clearInterval
const realNow = Date.now
let clock = 1_000_000

function installTimers() {
  fakeTimers.created.length = 0
  fakeTimers.cleared.length = 0
  globalThis.setInterval = (fn, ms) => {
    const id = fakeTimers.nextId
    fakeTimers.nextId += 1
    fakeTimers.created.push({ id, fn, ms })
    return id
  }
  globalThis.clearInterval = (id) => fakeTimers.cleared.push(id)
  Date.now = () => clock
}

function uninstallTimers() {
  globalThis.setInterval = realSetInterval
  globalThis.clearInterval = realClearInterval
  Date.now = realNow
}

/** The interval the panel created, when there is exactly one. */
const panelTimer = () => fakeTimers.created.find((timer) => timer.ms === 10000)

function boot() {
  installTimers()
  clock = 1_000_000
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
  const listeners = new Map()
  const state = { effects: [], cleanups: [], issued: [], backing, S, listeners, probeDelay: 0 }
  const windowStub = {
    __ModuleLoader__: { load: (d) => { definition = d } },
    addEventListener() {},
    removeEventListener() {},
  }
  const documentStub = {
    // A real browser always has this. The other tests' stub has none, and the
    // panel then behaves as it would in a hidden tab — which is what keeps those
    // tests free of a timer that fires under them.
    visibilityState: 'visible',
    addEventListener(type, fn) {
      const set = listeners.get(type) ?? new Set()
      set.add(fn)
      listeners.set(type, set)
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn)
    },
  }
  let definition
  new Function('window', 'document', 'require', SOURCE)(windowStub, documentStub, (id) => {
    if (id === 'react') return React
    throw new Error(`unexpected require ${id}`)
  })
  state.document = documentStub
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
            if (state.probeDelay > 0) await new Promise((resolve) => setTimeout(resolve, state.probeDelay))
            return { ok: true, value: { result: { kind: 'success', text: JSON.stringify(state.probeBody ?? PROBE) } } }
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
  const registration = registrations.find((r) => r.o.name === 'conversation.input.left')
  state.Component = registration.c
  state.props = { sessionId: 's1', t, ...registration.o.inject() }
  return state
}

/**
 * Render once and drain the effects a first render runs.
 *
 * One render is deliberate: a real React effect runs once until its dependencies
 * change, and re-running this stub's effects would create a second interval that
 * the real component never creates.
 */
function mount(state, surface) {
  const { Component, props, S } = state
  S.index = 0
  const node = Component({ ...props, surface })
  const effects = state.effects.slice()
  state.effects = []
  for (const effect of effects) {
    const cleanup = effect()
    if (typeof cleanup === 'function') state.cleanups.push(cleanup)
  }
  return node
}

const probes = (state) => state.issued.filter((line) => line.includes('status --json'))

/** A tick of the visible-panel timer, as the browser would run it. */
const tickPanel = async (state) => {
  const timer = panelTimer()
  if (timer === undefined) return
  timer.fn()
  await settle()
}

try {
  console.log('=== a visible pane starts exactly one panel timer ===')
  {
    const state = boot()
    mount(state, 'pane')
    await settle()
    const timer = panelTimer()
    console.log('timer:', JSON.stringify(timer === undefined ? null : { ms: timer.ms }))
    ok(
      'the pane schedules one interval',
      fakeTimers.created.filter((entry) => entry.ms === 10000).length === 1,
      fakeTimers.created,
    )
    ok('the timer is the panel interval', timer?.ms === 10000, timer)
    ok('mounting already paid the open probe', probes(state).length === 1, probes(state))
  }

  console.log('\n=== a stale tick re-reads the workspace, a fresh one does not ===')
  {
    const state = boot()
    mount(state, 'pane')
    await settle()
    clock += 11000
    await tickPanel(state)
    console.log('probes after tick:', JSON.stringify(probes(state)))
    ok('the tick probes again', probes(state).length === 2, probes(state))
    const full = probes(state)[1]
    ok('and asks for the full answer the list needs', full.includes('status --json') && !full.includes('--slim'), full)
    await tickPanel(state)
    ok('a tick inside the interval is skipped', probes(state).length === 2, probes(state))
  }

  console.log('\n=== a hidden tab and a probe in flight both skip a tick ===')
  {
    const state = boot()
    mount(state, 'pane')
    await settle()
    clock += 11000
    state.document.visibilityState = 'hidden'
    await tickPanel(state)
    ok('a hidden tab skips the tick', probes(state).length === 1, probes(state))
    state.document.visibilityState = 'visible'
    for (const listener of state.listeners.get('visibilitychange') ?? []) listener()
    await settle()
    ok('coming back to the tab probes without waiting for the interval', probes(state).length === 2, probes(state))
  }
  {
    const state = boot()
    mount(state, 'pane')
    await settle()
    clock += 11000
    state.probeDelay = 60
    const timer = panelTimer()
    timer.fn()
    timer.fn()
    await settle(200)
    ok('a tick while a probe runs is skipped', probes(state).length === 2, probes(state))
  }

  console.log('\n=== closing the panel disposes the timer ===')
  {
    const state = boot()
    mount(state, 'pane')
    await settle()
    const timer = panelTimer()
    for (const cleanup of state.cleanups) cleanup()
    ok('the interval is cleared', timer !== undefined && fakeTimers.cleared.includes(timer.id), fakeTimers.cleared)
    const visibilityListeners = state.listeners.get('visibilitychange') ?? new Set()
    ok('the visibility listener is removed', visibilityListeners.size === 0, visibilityListeners.size)
  }

  console.log('\n=== the composer menu polls only while it is open ===')
  {
    const state = boot()
    mount(state, 'menu')
    await settle()
    ok('a closed menu schedules no panel timer', panelTimer() === undefined, fakeTimers.created)
  }

  console.log('\n=== a workspace with no repository is not polled ===')
  {
    const state = boot()
    state.probeBody = { state: 'empty', detail: 'not a repository' }
    mount(state, 'pane')
    await settle()
    clock += 15000
    await tickPanel(state)
    ok('the timer exists while the pane is open', panelTimer() !== undefined, fakeTimers.created)
    ok('but the answer is not re-read', probes(state).length === 1, probes(state))
  }
} finally {
  uninstallTimers()
}

console.log(failed === 0 ? '\nRESULT: ALL CHECKS PASSED' : `\nRESULT: ${failed} FAILURE(S)`)
process.exit(failed === 0 ? 0 : 1)
