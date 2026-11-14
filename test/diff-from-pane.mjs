/**
 * A file's patch opens in its own tab from the sidebar too.
 *
 * The change list can be taller than the window. Clicking a file used to put its
 * patch at the bottom of the panel — below the whole list — because only the
 * composer's menu was given the dock's tab opener; from inside the pane a click
 * looked like it did nothing. The pane now opens the same `github-diff` resource
 * tab the menu does, and the inline fallback stays for a dock that offers no
 * resource tabs.
 *
 * Run: node test/diff-from-pane.mjs
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
  state: 'repo',
  branch: 'main',
  dirty: true,
  ahead: 0,
  behind: 0,
  remote: 'https://github.com/acme/widget.git',
  web: 'https://github.com/acme/widget',
  // Two files are enough: the point is that the row's click reaches the dock,
  // not how long the list is.
  changes: [
    ['src/a.js', ' M'],
    ['src/b.js', ' M'],
  ],
  counts: [2, 0],
  branches: [{ name: 'main', current: true, ahead: 0, behind: 0 }],
}

let failed = 0
const ok = (text, cond, extra) => {
  if (!cond) failed += 1
  console.log(cond ? 'ok  ' : 'FAIL', text, cond ? '' : JSON.stringify(extra))
}
const settle = (ms = 70) => new Promise((resolve) => setTimeout(resolve, ms))

const collect = (node, pred, out = []) => {
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
const textOf = (node) => {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string') return node
  if (typeof node !== 'object') return ''
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (typeof node.type === 'function') return textOf(node.type(node.props))
  return node.children.map(textOf).join('')
}

/** Boot one client module instance against a dock stub that records tab opens. */
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
  const windowStub = {
    __ModuleLoader__: { load: (loaded) => { definition = loaded } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {},
    removeEventListener() {},
  }
  const documentStub = { addEventListener() {}, removeEventListener() {} }
  new Function('window', 'document', 'require', SOURCE)(windowStub, documentStub, (id) => {
    if (id === 'react') return React
    throw new Error(`unexpected require ${id}`)
  })
  const registrations = []
  const tabTypes = []
  const sidebar = {
    opened: [],
    openTab() {},
    openResource(address) { sidebar.opened.push(address) },
    isExpanded: () => true,
  }
  const sidebarTabs = { register(entry) { tabTypes.push(entry); return () => {} } }
  const env = {
    slots: {
      inject: (_name, callback) => callback(),
      register: (registration, component) => {
        registrations.push({ registration, component })
        return () => {}
      },
    },
    locale: { register: () => () => {}, bind: () => t },
    get: (name) =>
      name === 'sidebarRight' ? sidebar : name === 'sidebarRightTabs' ? sidebarTabs : undefined,
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
    effect: (callback) => { callback(); return () => {} },
  }
  definition.factory((id) => {
    if (id === 'react') return React
    throw new Error(`unexpected require ${id}`)
  }).apply(env)
  return { state, registrations, tabTypes, sidebar }
}

/** The registration for one slot name (and key, when several share the name). */
const registrationOf = (harness, name, key) =>
  harness.registrations.find(
    (entry) => entry.registration.name === name && (key === undefined || entry.registration.key === key),
  )

/** Render, run the effects they queue, and redraw with the answers. */
async function mount(harness, entry, extra = {}) {
  const injected = typeof entry.registration.inject === 'function' ? entry.registration.inject() : {}
  const props = { sessionId: 's1', t, ...injected, ...extra }
  harness.state.S.index = 0
  let node = entry.component(props)
  for (let round = 0; round < 4; round += 1) {
    const effects = harness.state.effects.splice(0)
    for (const effect of effects) effect()
    await settle()
    harness.state.S.index = 0
    node = entry.component(props)
  }
  harness.state.effects.length = 0
  return node
}

/** The clickable body of the file row whose path ends with `name`. */
const fileRow = (node, name) =>
  collect(
    node,
    (n) =>
      n.type === 'button' &&
      n.props?.className === 'gsy-main' &&
      textOf(n).includes(name),
  )[0]

console.log('=== the pane gives the file click the dock tab opener ===')
{
  const harness = boot()
  const paneEntry = registrationOf(harness, 'sidebar.right.pane.tab', 'github-sync')
  ok('the pane body is registered', paneEntry !== undefined)
  const injected = typeof paneEntry.registration.inject === 'function' ? paneEntry.registration.inject() : {}
  console.log('pane props:', JSON.stringify(Object.keys(injected)))
  ok('the pane can open a diff tab', typeof injected.openDiffTab === 'function', typeof injected.openDiffTab)
  ok('and it is still the pane surface', injected.surface === 'pane', injected.surface)
}

console.log('\n=== a click in the pane opens the patch as its own tab ===')
{
  const harness = boot()
  const paneEntry = registrationOf(harness, 'sidebar.right.pane.tab', 'github-sync')
  const node = await mount(harness, paneEntry)
  const row = fileRow(node, 'a.js')
  ok('the file row is drawn', row !== undefined, textOf(node))
  if (row !== undefined) row.props.onClick()
  await settle(120)
  console.log('opened:', JSON.stringify(harness.sidebar.opened))
  ok('the dock was asked for one resource tab', harness.sidebar.opened.length === 1, harness.sidebar.opened)
  ok(
    'the address names the file',
    harness.sidebar.opened[0] === 'dsh-resource://github-diff/s1/src%2Fa.js',
    harness.sidebar.opened[0],
  )
  ok(
    'and the command bridge was not the route',
    !harness.state.issued.some((line) => line.includes('diff --file')),
    harness.state.issued,
  )
}

console.log('\n=== a dock with no resource tabs still fetches the patch ===')
{
  const harness = boot()
  const paneEntry = registrationOf(harness, 'sidebar.right.pane.tab', 'github-sync')
  // `openDiffTab` answers "no", exactly as it does before the dock registers the
  // diff type; the inline fallback is what remains for such a deployment.
  const node = await mount(harness, paneEntry, { openDiffTab: () => false, openSidebar: null })
  const row = fileRow(node, 'a.js')
  ok('the file row is drawn', row !== undefined, textOf(node))
  if (row !== undefined) row.props.onClick()
  await settle(150)
  console.log('issued:', JSON.stringify(harness.state.issued.filter((line) => line.includes('diff'))))
  ok('no tab was opened', harness.sidebar.opened.length === 0, harness.sidebar.opened)
  ok(
    'the patch is requested through the command bridge',
    harness.state.issued.some((line) => line.includes('diff --file "src/a.js"')),
    harness.state.issued,
  )
}

console.log('\n=== the composer menu keeps its opener ===')
{
  const harness = boot()
  const menuEntry = registrationOf(harness, 'conversation.input.left')
  const injected = typeof menuEntry.registration.inject === 'function' ? menuEntry.registration.inject() : {}
  ok('the menu still receives the tab opener', typeof injected.openDiffTab === 'function', typeof injected.openDiffTab)
  ok('the menu still renders as the menu surface', injected.surface === 'menu', injected.surface)
}

console.log(failed === 0 ? '\nRESULT: ALL CHECKS PASSED' : `\nRESULT: ${failed} FAILURE(S)`)
process.exit(failed === 0 ? 0 : 1)
