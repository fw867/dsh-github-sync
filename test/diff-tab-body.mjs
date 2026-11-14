/**
 * A diff tab reads its address from the tab, and its chip names the file.
 *
 * A resource tab body is not given the address as a prop: the slot hands every
 * body the `useTabInfo` hook, and the address is `tab.contentId`. The body was
 * reading `props.address`, finding nothing, and drawing "This tab has no file to
 * compare." for a file that had just been clicked. The chip had the opposite
 * problem: it was a static "Diff", so the tab strip never said which file it
 * showed, even though the registry captures `Diff: <path>` when the tab opens.
 *
 * Run: node test/diff-tab-body.mjs
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

const ADDRESS = 'dsh-resource://github-diff/s1/src%2Fa.ts'
const TITLE = 'Diff: src/a.ts'

const PATCH = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 1111111..2222222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1 +1 @@',
  '-one',
  '+two',
  '',
].join('\n')

let failed = 0
const ok = (text, cond, extra) => {
  if (!cond) failed += 1
  console.log(cond ? 'ok  ' : 'FAIL', text, cond ? '' : JSON.stringify(extra))
}
const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))

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

/** What the dock hands every tab body and chip: the live tab, by hook. */
const tabInfo = {
  tab: {
    id: 'tab-1',
    contentId: ADDRESS,
    title: TITLE,
    navigation: { address: ADDRESS, params: undefined, revision: 1 },
    visible: true,
  },
}
const useTabInfo = () => tabInfo

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
  const state = { effects: [], issued: [], sessions: [], backing, S }
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
  // The dock is what registers the diff tab type and its body; a stub is enough
  // for the registration to happen, and nothing here opens a tab.
  const tabTypes = []
  const sidebar = { openTab() {}, openResource() {}, isExpanded: () => false }
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
        execute: async (session, line) => {
          state.issued.push(line)
          state.sessions.push(session)
          if (line.includes('diff --file')) {
            return { ok: true, value: { result: { kind: 'success', text: PATCH } } }
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
  return { state, registrations }
}

const registrationOf = (harness, key) =>
  harness.registrations.find(
    (entry) => entry.registration.name === 'sidebar.right.pane.tab' && entry.registration.key === key,
  )
const chipOf = (harness, key) =>
  harness.registrations.find(
    (entry) => entry.registration.name === 'sidebar.right.pane.tab.title' && entry.registration.key === key,
  )

/** Render a tab body, run its effects, and redraw with the answer. */
async function renderBody(harness, entry, extra = {}) {
  const injected = typeof entry.registration.inject === 'function' ? entry.registration.inject() : {}
  const props = { sessionId: 's1', t, ...injected, ...extra }
  harness.state.S.index = 0
  let node = entry.component(props)
  for (let round = 0; round < 3; round += 1) {
    const effects = harness.state.effects.splice(0)
    for (const effect of effects) effect()
    await settle()
    harness.state.S.index = 0
    node = entry.component(props)
  }
  harness.state.effects.length = 0
  return node
}

console.log('=== the diff body reads the address from the tab it was opened for ===')
{
  const harness = boot()
  const entry = registrationOf(harness, 'github-sync-diff')
  ok('the diff body is registered', entry !== undefined)
  const node = await renderBody(harness, entry, { useTabInfo, sessionId: 's2' })
  const text = textOf(node)
  console.log('rendered:', JSON.stringify(text.slice(0, 160)))
  ok('it does not claim there is no file', !text.includes(t('diff.noPath')), text)
  ok("it fetches the file's patch", harness.state.issued.some((line) => line.includes('diff --file "src/a.ts"')), harness.state.issued)
  ok('and draws the patch header with the path', text.includes('src/a.ts'), text)
  // The tab belongs to the session in its address, not to whichever session is in
  // front: switching sessions must not re-read the old path in another workspace.
  ok('it reads through the address session, not the active one', harness.state.sessions[0] === 's1', harness.state.sessions)
}

console.log('\n=== the chip names the file the registry captured ===')
{
  const harness = boot()
  const chip = chipOf(harness, 'github-sync-diff')
  ok('the diff chip is registered', chip !== undefined)
  const node = chip.component({ t, useTabInfo })
  const text = textOf(node)
  console.log('chip:', JSON.stringify(text))
  ok('the chip carries the file name, not just "Diff"', text.includes('src/a.ts'), text)
  ok('and it is the captured title', text.includes(TITLE), text)
}

console.log('\n=== a body with no tab information still says so instead of crashing ===')
{
  const harness = boot()
  const entry = registrationOf(harness, 'github-sync-diff')
  const node = await renderBody(harness, entry)
  ok('it renders the no-file line', textOf(node).includes(t('diff.noPath')), textOf(node))
}

console.log(failed === 0 ? '\nRESULT: ALL CHECKS PASSED' : `\nRESULT: ${failed} FAILURE(S)`)
process.exit(failed === 0 ? 0 : 1)
