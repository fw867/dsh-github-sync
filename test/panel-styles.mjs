/**
 * The plugin installs its stylesheet before any panel draws.
 *
 * The title bar's pull / project-page / refresh controls are class-styled
 * (`gsy-iconbtn`), and the sheet that styles them used to be installed only by the
 * change tree and the diff view. A clean working tree mounts neither, so a panel
 * opened on a clean workspace reached the browser's default button chrome — a
 * bordered, padded box around each icon — while the same panel with one changed
 * file looked right. The sheet is now installed when the plugin activates, with the
 * panel's own draw as a fallback, so no component has to be the one that happens to
 * bring the styles.
 *
 * This test mounts the pane against a clean probe, with a document stub that can
 * hold a `<style>` element, and pins three things: the sheet is installed before the
 * panel draws, it carries the icon rules, and drawing the panel again does not add a
 * second copy.
 *
 * Run: node test/panel-styles.mjs
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

/** A clean repository: no changes, so neither the change tree nor a diff mounts. */
const PROBE = {
  state: 'repo',
  branch: 'master',
  dirty: false,
  ahead: 0,
  behind: 0,
  remote: 'https://github.com/acme/widget.git',
  web: 'https://github.com/acme/widget',
  changes: [],
  counts: [0, 0],
  branches: [{ name: 'master', current: true, ahead: 0, behind: 0 }],
}

let failed = 0
const ok = (text, cond, extra) => {
  if (!cond) failed += 1
  console.log(cond ? 'ok  ' : 'FAIL', text, cond ? '' : JSON.stringify(extra))
}
const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))

/** A document that can hold the injected `<style>` element. */
function documentStub() {
  const head = {
    children: [],
    appendChild(element) {
      this.children.push(element)
      return element
    },
  }
  return {
    head,
    visibilityState: 'visible',
    createElement(tag) {
      return { tag, id: '', textContent: '' }
    },
    getElementById(id) {
      return head.children.find((element) => element.id === id) ?? null
    },
    addEventListener() {},
    removeEventListener() {},
  }
}

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
  const state = { effects: [], issued: [], backing, S, document: documentStub() }
  let definition
  const windowStub = { __ModuleLoader__: { load: (d) => { definition = d } }, addEventListener() {}, removeEventListener() {} }
  new Function('window', 'document', 'require', SOURCE)(windowStub, state.document, (id) => {
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
            return { ok: true, value: { result: { kind: 'success', text: JSON.stringify(PROBE) } } }
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
  state.Component = registration.c
  state.props = { sessionId: 's1', t, ...registration.o.inject(), surface: 'pane' }
  return state
}

/** Render once, run the effects it queued, then draw again with the answer. */
async function render(state) {
  state.S.index = 0
  state.Component(state.props)
  const effects = state.effects.slice()
  state.effects = []
  for (const effect of effects) {
    const cleanup = effect()
    if (typeof cleanup === 'function') state.cleanups = [...(state.cleanups ?? []), cleanup]
  }
  await settle()
  // The probe answer arrives through state, so a second draw is what paints the
  // header and the branch row; the effects it queues are not run again here.
  state.S.index = 0
  const node = state.Component(state.props)
  state.effects = []
  return node
}

/** Every element carrying a class name, walked without a real React tree. */
function collect(node, pred, out = []) {
  if (node === null || node === undefined) return out
  if (Array.isArray(node)) {
    for (const child of node) collect(child, pred, out)
    return out
  }
  if (typeof node !== 'object') return out
  if (pred(node)) out.push(node)
  if (typeof node.type === 'function') {
    collect(node.type(node.props), pred, out)
    return out
  }
  for (const child of node.children) collect(child, pred, out)
  return out
}

const state = boot()

console.log("=== a clean workspace still gets the panel's stylesheet ===")
{
  ok('the sheet is installed at activation, before the panel draws', state.document.head.children.length === 1, state.document.head.children.length)
  const node = await render(state)
  const sheets = state.document.head.children
  console.log('style elements:', JSON.stringify(sheets.map((element) => ({ id: element.id, bytes: element.textContent.length }))))
  ok('the pane installs exactly one style element', sheets.length === 1, sheets.length)
  ok('with the plugin sheet id', sheets[0]?.id === 'dsh-github-sync-styles', sheets[0]?.id)
  const css = sheets[0]?.textContent ?? ''
  ok('it carries the icon-button rule', css.includes('.gsy-iconbtn'), css.slice(0, 120))
  ok('and the header row rule', css.includes('.gsy-head-actions'))
  ok(
    'the icons are drawn with that class',
    collect(node, (n) => n.props?.className === 'gsy-iconbtn').length === 4,
    collect(node, (n) => n.props?.className === 'gsy-iconbtn').length,
  )
}

console.log('\n=== a second draw does not add a second sheet ===')
{
  await render(state)
  const sheets = state.document.head.children
  ok('still one style element', sheets.length === 1, sheets.length)

  // The sheet is the one the browser would also find by id, which is what makes
  // the guard cheap: a panel mounted years later still sees it.
  ok('and it is the one getElementById answers with', state.document.getElementById('dsh-github-sync-styles') === sheets[0])
}

console.log(failed === 0 ? '\nRESULT: ALL CHECKS PASSED' : `\nRESULT: ${failed} FAILURE(S)`)
process.exit(failed === 0 ? 0 : 1)
