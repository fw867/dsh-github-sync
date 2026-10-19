/**
 * How many command rows each surface costs.
 *
 * Every probe is a `/github` command, and the Host appends every command to the
 * session log — that is the only Client-to-Host channel, so the count is the noise
 * a person sees above the composer. This measures it per surface so the tradeoff is
 * a number rather than a guess.
 *
 * Run: node test/probes.mjs
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
const settle = (ms = 70) => new Promise((r) => setTimeout(r, ms))

function boot() {
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
  const state = { effects: [], issued: [], backing, S }
  let definition
  const windowStub = { __ModuleLoader__: { load: (d) => { definition = d } }, addEventListener() {}, removeEventListener() {} }
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
            const slim = line.includes('--slim')
            const body = slim
              ? { state: 'repo', branch: 'main', dirty: true, ahead: 0, behind: 0, remote: 'origin', counts: [1, 0] }
              : PROBE
            return { ok: true, value: { result: { kind: 'success', text: JSON.stringify(body) } } }
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

/** Mount a component and drain its effects, counting probes by shape. */
async function mount(state, surface) {
  state.issued.length = 0
  state.backing.length = 0
  // `useEffect` collects into `state.effects`; draining any other array runs nothing.
  state.effects.length = 0
  const { Component, props, S } = state
  S.index = 0
  let node = Component({ ...props, surface })
  for (let i = 0; i < 4; i += 1) {
    const effects = state.effects.slice()
    state.effects = []
    for (const e of effects) e()
    await settle()
    S.index = 0
    node = Component({ ...props, surface })
  }
  await settle()
  S.index = 0
  node = Component({ ...props, surface })
  const probes = state.issued.filter((l) => l.includes('status --json'))
  return {
    node,
    all: state.issued.slice(),
    probes: probes.slice(),
    slim: probes.filter((l) => l.includes('--slim')),
    full: probes.filter((l) => !l.includes('--slim')),
  }
}

console.log('=== the composer button on its own ===')
{
  const state = boot()
  const run = await mount(state, 'menu')
  console.log('probes:', JSON.stringify(run.probes))
  ok('the mount check is one slim probe', run.probes.length === 1 && run.slim.length === 1, run.probes)
  ok('a closed menu costs no full probe', run.full.length === 0, run.full)
}

console.log('\n=== the sidebar pane on its own ===')
{
  const state = boot()
  const run = await mount(state, 'pane')
  console.log('probes:', JSON.stringify(run.probes))
  ok('the pane pays one probe, not two', run.probes.length === 1, run.probes)
  ok('and it is the full answer the panel draws from', run.full.length === 1 && run.slim.length === 0, run.probes)
}

console.log('\n=== a second tab-open within the reuse window costs nothing ===')
{
  const state = boot()
  await mount(state, 'pane')
  const again = await mount(state, 'pane')
  console.log('probes on reopen:', JSON.stringify(again.probes))
  ok('the cached answer is reused', again.probes.length === 0, again.probes)
}

console.log('\n=== what removing the composer button would change ===')
{
  const composer = boot()
  const menuCost = (await mount(composer, 'menu')).probes.length
  const pane = boot()
  const paneCost = (await mount(pane, 'pane')).probes.length
  console.log(`composer mount: ${menuCost} row(s); pane mount: ${paneCost} row(s)`)
  ok('the pane still costs a row, so the logs do not disappear', paneCost >= 1, paneCost)
  ok('what disappears is the per-session mount check', menuCost === 1 && paneCost === 1, { menuCost, paneCost })
}

console.log(failed === 0 ? '\nRESULT: ALL CHECKS PASSED' : `\nRESULT: ${failed} FAILURE(S)`)
