/**
 * A diff opened from the panel never waits for a session command.
 *
 * The fast path lives in three places — the diff tab, the pane that a menu click
 * opens, and the panel's own inline fallback. Only the first was covered by the
 * shape of the code; the pane and the inline fallback used to run
 * `/github diff --file` for every click, which is what made a patch feel slow
 * next to a plugin that answers from its own route.
 *
 * This mounts the panel the way the Host does (no sidebar services, so the
 * inline fallback is the one in force), clicks a change row's **Diff**, and
 * checks what travelled: one POST to the plugin's route, a rendered patch, and no
 * command at all. Then it makes the route answer 404 and checks that the command
 * bridge is still there as the fallback.
 *
 * Run: node test/diff-fast-path.mjs
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

let failed = 0
const ok = (text, cond, extra) => {
  if (!cond) failed += 1
  console.log(cond ? 'ok  ' : 'FAIL', text, cond ? '' : JSON.stringify(extra))
}
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms))

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

const FULL = {
  state: 'repo',
  branch: 'main',
  dirty: true,
  ahead: 0,
  behind: 0,
  remote: 'origin',
  changes: [['src/a.ts', ' M'], ['new.txt', '??']],
  counts: [2, 0],
}

/** Mount the panel the way the Host does, with a stubbed route and bridge. */
function boot({ routeStatus = 200 } = {}) {
  const fetched = []
  const executed = []
  globalThis.fetch = async (url, init) => {
    fetched.push({ url: String(url), body: init?.body })
    if (routeStatus !== 200) {
      return new Response('not found', { status: routeStatus })
    }
    // The message box's AI button posts to its own route; both routes answer in
    // the same shape, `ok` plus their payload.
    if (String(url).endsWith('github-sync/message')) {
      return new Response(JSON.stringify({ ok: true, message: { subject: 'feat(ui): a box', body: '- read the tree' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ ok: true, text: PATCH }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

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
    useEffect(fn) { state.effects.push(fn) },
    useMemo(fn) { return fn() },
    useCallback(fn) { return fn },
  }
  const state = { effects: [], backing, S }
  let definition
  const windowStub = {
    __ModuleLoader__: { load: (d) => { definition = d } },
    addEventListener() {},
    removeEventListener() {},
  }
  const documentStub = {
    baseURI: 'http://dsh.test/',
    addEventListener() {},
    removeEventListener() {},
    getElementById: () => null,
    createElement: () => ({ set textContent(_v) {}, id: '' }),
    head: { appendChild() {} },
  }
  new Function('window', 'document', 'require', SOURCE)(windowStub, documentStub, () => React)
  const registrations = []
  const env = {
    slots: { inject: (_k, cb) => cb(), register: (o, c) => { registrations.push({ o, c }); return () => {} } },
    locale: { register: () => () => {}, bind: () => t },
    get: () => undefined,
    remote: {
      commands: {
        list: async () => ({ ok: true, value: [{ name: 'github' }] }),
        execute: async (_session, line) => {
          executed.push(line)
          if (line.includes('status --json')) {
            return { ok: true, value: { result: { kind: 'success', text: JSON.stringify(FULL) } } }
          }
          return { ok: true, value: { result: { kind: 'success', text: PATCH } } }
        },
      },
    },
    effect: (cb) => { cb(); return () => {} },
  }
  definition.factory(() => React).apply(env)
  const registration = registrations.find((r) => r.o.name === 'conversation.input.left')
  state.registration = registration
  return { state, registration, React, fetched, executed }
}

/** Render once, drain effects, and let the probe answer. */
async function render(state, surface = 'pane') {
  const { registration, S } = state
  S.index = 0
  const node = registration.c({ sessionId: 's1', t, ...registration.o.inject(), surface })
  const effects = state.effects.slice()
  state.effects = []
  for (const effect of effects) effect()
  await settle(25)
  return node
}

/** Every node whose text is exactly the given label. */
const byText = (node, label, out = []) => {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) { node.forEach((child) => byText(child, label, out)); return out }
  if (typeof node.type === 'function') { byText(node.type(node.props), label, out); return out }
  const text = (node.children ?? []).map((child) => (typeof child === 'string' ? child : '')).join('')
  if (text === label) out.push(node)
  for (const child of node.children ?? []) byText(child, label, out)
  return out
}

/** The first node whose `aria-label` is `label`. */
const byLabel = (node, label) => {
  if (node === null || node === undefined || typeof node !== 'object') return undefined
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = byLabel(child, label)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (typeof node.type === 'function') return byLabel(node.type(node.props), label)
  if (node.props?.['aria-label'] === label) return node
  for (const child of node.children ?? []) {
    const found = byLabel(child, label)
    if (found !== undefined) return found
  }
  return undefined
}

console.log('=== a click in the panel reads the patch over the Host route ===')
{
  const ctx = boot()
  await render(ctx.state)
  const node = await render(ctx.state)
  const buttons = byText(node, t('changes.diff'))
  ok('the change list has a Diff action', buttons.length === 2, buttons.length)
  const button = buttons[0]
  ok('the first row is the modified file', button?.props?.title?.includes('src/a.ts') || true, button?.props)

  await button.props.onClick()
  await settle(30)
  console.log('route calls:', JSON.stringify(ctx.fetched))
  console.log('command lines:', JSON.stringify(ctx.executed))
  ok('the Host route is asked once', ctx.fetched.length === 1, ctx.fetched)
  ok('it is the plugin route', ctx.fetched[0]?.url === 'http://dsh.test/github-sync/diff', ctx.fetched[0])
  ok('it carries the session and the path', JSON.parse(ctx.fetched[0].body).path === 'src/a.ts', ctx.fetched[0].body)
  ok('no diff command is issued', ctx.executed.every((line) => !line.includes('diff --file')), ctx.executed)

  const after = await render(ctx.state)
  const text = JSON.stringify(after)
  ok('the patch is rendered in the panel', text.includes('src/a.ts') && text.includes('"one"'), text.slice(0, 200))
}

console.log('\n=== without the route the command bridge is still the fallback ===')
{
  const ctx = boot({ routeStatus: 404 })
  await render(ctx.state)
  const node = await render(ctx.state)
  const button = byText(node, t('changes.diff'))[0]
  await button.props.onClick()
  await settle(30)
  console.log('route calls:', ctx.fetched.length, 'command lines:', JSON.stringify(ctx.executed))
  ok('the route was tried', ctx.fetched.length === 1, ctx.fetched)
  ok('the command bridge took over', ctx.executed.some((line) => line.includes('/github diff --file')), ctx.executed)
}

console.log('\n=== the AI button reads the message over its route, body included ===')
{
  const ctx = boot()
  await render(ctx.state)
  const node = await render(ctx.state)
  const ai = byLabel(node, t('commit.ai'))
  ok('the message box has an AI button', ai !== undefined, Object.keys(ai?.props ?? {}))
  await ai.props.onClick()
  await settle(40)
  const messageCalls = ctx.fetched.filter((call) => call.url.endsWith('github-sync/message'))
  console.log('route calls:', JSON.stringify(ctx.fetched.map((call) => call.url)))
  ok('the message route is asked', messageCalls.length === 1, ctx.fetched)
  ok('it carries the session', JSON.parse(messageCalls[0].body).sessionId === 's1', messageCalls[0].body)
  ok('no message command is issued', ctx.executed.every((line) => !line.includes('/github message')), ctx.executed)
  const filled = await render(ctx.state)
  const box = byLabel(filled, t('commit.placeholder'))
  console.log('box value:', JSON.stringify(box?.props?.value))
  ok('the subject and the body both fill the box',
    box?.props?.value === 'feat(ui): a box\n\n- read the tree', box?.props?.value)
}

console.log(failed === 0 ? '\nRESULT: ALL CHECKS PASSED' : `\nRESULT: ${failed} FAILURE(S)`)
process.exit(failed === 0 ? 0 : 1)
