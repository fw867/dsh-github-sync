/**
 * A slim answer must not erase the lists a full answer provided.
 *
 * The mount check asks for a slim answer; the panel asks for a full one. On a slow
 * Host the slim reply — issued first — can land last, and replacing the cache with
 * it is how the change list disappeared while it was being read.
 *
 * The race is made deterministic here by delaying only the slim reply, then both
 * surfaces are mounted against the same module instance.
 *
 * Run: node test/probe-merge.mjs
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

const FULL = {
  state: 'repo', branch: 'main', dirty: true, ahead: 1, behind: 0, remote: 'origin',
  changes: [['src/a.js', ' M'], ['new.txt', '??']], counts: [2, 0],
  branches: [{ name: 'main', current: true, ahead: 1, behind: 0 }],
}
const SLIM = {
  state: 'repo', branch: 'main', dirty: true, ahead: 3, behind: 0, remote: 'origin',
  counts: [2, 0],
}

let failed = 0
const ok = (text, cond, extra) => {
  if (!cond) failed += 1
  console.log(cond ? 'ok  ' : 'FAIL', text, cond ? '' : JSON.stringify(extra))
}
const settle = (ms = 40) => new Promise((r) => setTimeout(r, ms))

function boot({ slimDelay = 0 } = {}) {
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
            if (slim && slimDelay > 0) await settle(slimDelay)
            const body = slim ? SLIM : FULL
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

/** Render once and drain whatever effects that produced. */
async function renderOnce(state, surface) {
  const { Component, props, S } = state
  S.index = 0
  const node = Component({ ...props, surface })
  const effects = state.effects.slice()
  state.effects = []
  for (const e of effects) e()
  await settle(20)
  return node
}

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

console.log('=== a full request while a slim check is in flight is queued, not dropped ===')
{
  const state = boot({ slimDelay: 120 })
  const internals = globalThis.__githubSyncInternals
  ok('the seam exposes the cache', internals?.probeCache instanceof Map)

  // The composer mounts: its eager check is issued, and answers late.
  await renderOnce(state, 'menu')
  console.log('issued after the composer mount:', JSON.stringify(state.issued))
  ok('the composer issued its slim check', state.issued.some((l) => l.includes('--slim')), state.issued)
  ok('the slim check is still in flight', internals.probeCache.get('s1') === undefined)

  // The panel mounts while that check is in flight. Its full request must not be
  // dropped: without it the panel draws from an answer that has no lists.
  await renderOnce(state, 'pane')
  console.log('issued after the panel mount:', JSON.stringify(state.issued))
  ok('the panel is registered as waiting for the queued answer', internals.probeWakeups.get('s1')?.size === 1, [...(internals.probeWakeups.get('s1') ?? [])])

  // Let the slim answer land, then the queued full one.
  await settle(500)
  console.log('issued in total:', JSON.stringify(state.issued))
  const probes = state.issued.filter((l) => l.includes('status --json'))
  const fulls = probes.filter((l) => !l.includes('--slim'))
  console.log(`slim: ${probes.length - fulls.length}, full: ${fulls.length}`)
  ok('the full request was replayed after the slim one', fulls.length === 1, probes)

  const cached = internals.probeCache.get('s1')
  console.log('cached:', JSON.stringify({
    changes: cached?.changes?.length ?? null,
    branches: cached?.branches?.length ?? null,
  }))
  ok('the change list is there', cached?.changes?.length === 2, cached?.changes)
  ok('the branch list is there', cached?.branches?.length === 1, cached?.branches)
  ok('the waiting panel was woken, not left on checking', internals.probeWakeups.get('s1') === undefined, [...(internals.probeWakeups.get('s1') ?? [])])
}

console.log('\n=== a warm cache: the composer does not probe at all ===')
{
  const state = boot({ slimDelay: 120 })
  const internals = globalThis.__githubSyncInternals
  // The panel asks first, so its full answer lands while nothing else is in flight.
  await renderOnce(state, 'pane')
  const afterFull = internals.probeCache.get('s1')
  console.log('after the full answer:', JSON.stringify({ changes: afterFull?.changes?.length ?? null }))
  ok('the full answer is cached', afterFull?.changes?.length === 2, afterFull?.changes)

  const before = state.issued.length
  await renderOnce(state, 'menu')
  await settle(400)
  const added = state.issued.slice(before)
  console.log('issued by the composer with a warm cache:', JSON.stringify(added))
  ok('the composer reuses the answer instead of probing', added.length === 0, added)
  ok('the change list is still there', internals.probeCache.get('s1')?.changes?.length === 2)
}

console.log(failed === 0 ? '\nRESULT: ALL CHECKS PASSED' : `\nRESULT: ${failed} FAILURE(S)`)
