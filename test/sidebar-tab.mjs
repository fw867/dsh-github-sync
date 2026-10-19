/**
 * The sidebar tab's type and body have to answer to the same name.
 *
 * The dock dispatches a tab body under its type definition's `id`, but a restored
 * tab can render before (or without) that definition, and then the dispatch falls
 * back to `tab.kind`. When the two strings differ, that fallback looks for a body
 * nobody registered and the pane shows "nothing can view this" — which is exactly
 * what happened to a restored GitHub tab.
 *
 * Run: node test/sidebar-tab.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SOURCE = fs.readFileSync(path.join(HERE, '..', 'client.js'), 'utf8')

let failed = 0
const ok = (text, cond, extra) => {
  if (!cond) failed += 1
  console.log(cond ? 'ok  ' : 'FAIL', text, cond ? '' : JSON.stringify(extra))
}

// The client publishes its internals only to a declared test.
globalThis.__DSH_TEST__ = true

const backing = []
const S = { index: 0 }
const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
  useState(initial) {
    const slot = S.index
    S.index += 1
    const cell = backing[slot] ?? { value: typeof initial === 'function' ? initial() : initial }
    backing[slot] = cell
    return [cell.value, (next) => { cell.value = typeof next === 'function' ? next(cell.value) : next }]
  },
  useRef(initial) {
    const slot = S.index
    S.index += 1
    const cell = backing[slot] ?? { value: { current: initial } }
    backing[slot] = cell
    return cell.value
  },
  useEffect() {},
  useMemo(fn) { return fn() },
  useCallback(fn) { return fn },
}

const tabTypes = []
const slotRegistrations = []
let definition
const sidebar = {
  openTab() {},
  openResource() {},
  isExpanded: () => false,
}
const sidebarTabs = {
  register(entry) {
    tabTypes.push(entry)
    return () => {}
  },
}
const windowStub = {
  __ModuleLoader__: { load: (loaded) => { definition = loaded } },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  addEventListener() {},
  removeEventListener() {},
}
const documentStub = { addEventListener() {}, removeEventListener() {} }

new Function('window', 'document', 'require', SOURCE)(windowStub, documentStub, (id) => {
  if (id === 'react') return React
  throw new Error(`unexpected require: ${id}`)
})

const env = {
  slots: {
    inject: (_name, callback) => callback(),
    register: (registration, component) => {
      slotRegistrations.push({ registration, component })
      return () => {}
    },
  },
  locale: { register: () => () => {}, bind: () => (key) => key },
  get: (name) => (name === 'sidebarRight' ? sidebar : name === 'sidebarRightTabs' ? sidebarTabs : undefined),
  remote: { commands: { list: async () => ({ ok: true, value: [] }), execute: async () => ({ ok: true }) } },
  effect: (callback) => { callback(); return () => {} },
}

const plugin = definition.factory((id) => {
  if (id === 'react') return React
  throw new Error(`unexpected require ${id}`)
})
plugin.apply(env)

console.log('=== the plugin waits for the dock before it activates ===')
{
  const inject = Array.isArray(plugin.inject) ? plugin.inject : []
  ok('sidebarRight is a declared dependency', inject.includes('sidebarRight'), inject)
  ok('sidebarRightTabs is a declared dependency', inject.includes('sidebarRightTabs'), inject)
}

console.log('\n=== every tab type and its body share one identity ===')
{
  ok('the plugin registered two tab types', tabTypes.length === 2, tabTypes.map((entry) => entry.kind))
  for (const type of tabTypes) {
    ok(`${type.kind}: id equals kind`, type.id === type.kind, { id: type.id, kind: type.kind })
    const bodies = slotRegistrations
      .filter((entry) => entry.registration.name === 'sidebar.right.pane.tab')
      .map((entry) => entry.registration.key)
    const titles = slotRegistrations
      .filter((entry) => entry.registration.name === 'sidebar.right.pane.tab.title')
      .map((entry) => entry.registration.key)
    ok(`${type.kind}: a body is registered under the fallback key`, bodies.includes(type.kind), bodies)
    ok(`${type.kind}: a chip title is registered under the fallback key`, titles.includes(type.kind), titles)
  }
}

console.log('\n=== the probe row is kept out of the conversation ===')
{
  const commandRow = slotRegistrations.find(
    (entry) => entry.registration.name === 'conversation.chat.commandview' && entry.registration.key === 'github',
  )
  ok('the github command row is owned by this plugin', commandRow !== undefined)
  const render = (args, text) => commandRow.component({
    // The chat's commandview seat receives the command object itself.
    node: { args, outcome: text === undefined ? null : { kind: 'success', text } },
  })
  ok('a status probe renders nothing', render(' status --json', '{"state":"repo"}') === null)
  ok('a slim status probe renders nothing', render(' status --json --slim', '{"state":"repo"}') === null)
  ok('a typed status is sidebar-only too', render(' status', 'clean') === null)
  ok('a failed status is sidebar-only too', render(' status --json', 'boom') === null)
  ok('a status that is still running renders nothing', render(' status --json', undefined) === null)
  const explicit = render(' pull', 'pulled')
  ok('an explicit non-status command keeps a row', explicit !== null, explicit)
  const textOf = (n) => (typeof n === 'string' ? n : (n?.children ?? []).map(textOf).join(''))
  ok('the explicit row names the command', /\/github pull/.test(textOf(explicit)), textOf(explicit))
  ok('the outcome text is not repeated in the row', !/pulled/.test(textOf(explicit)), textOf(explicit))
  ok('the full outcome is available on hover', explicit.props.title === 'pulled', explicit.props.title)
  ok('the row uses the minimum line height', explicit.props.style.lineHeight === '14px' && explicit.props.style.padding === 0, explicit.props.style)

}

console.log('\n=== a restored tab with no type definition still finds its body ===')
{
  // This is the dock's dispatch expression when `definition` is undefined.
  const restored = [{ kind: 'github-sync' }, { kind: 'github-sync-diff' }]
  const bodyKeys = new Set(
    slotRegistrations
      .filter((entry) => entry.registration.name === 'sidebar.right.pane.tab')
      .map((entry) => entry.registration.key),
  )
  for (const tab of restored) {
    const entryKey = tab.kind
    ok(`${tab.kind}: the entry key is registered`, bodyKeys.has(entryKey), [...bodyKeys])
  }
}

console.log(failed === 0 ? '\nRESULT: ALL CHECKS PASSED' : `\nRESULT: ${failed} FAILURE(S)`)
process.exit(failed === 0 ? 0 : 1)
