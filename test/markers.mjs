/**
 * The CI-marker control: what the menu says, and what the command carries.
 *
 * Both halves matter. The command line is what the Host acts on, so it is what is
 * asserted; the panel's own statement is asserted too, because a marker is
 * invisible once it is on the command line and this state outlives one commit.
 *
 * Run: node test/markers.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLIENT = path.join(HERE, '..', 'client.js')

// The seam the client publishes for tests only; see the README.
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
const t = (key, params) => {
  const template = EN[key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (m, n) => (n in params ? String(params[n]) : m))
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
const buttonNamed = (node, label) =>
  collect(node, (n) => n.type === 'button' && textOf(n).trim() === label)[0]
/** A marker chip, whether or not it carries the tick. */
const chipNamed = (node, name) =>
  collect(node, (n) => n.type === 'button' && textOf(n).trim().replace(/^✓\s*/, '') === `[${name}]`)[0]

const PROBE = {
  state: 'repo', branch: 'main', dirty: true, ahead: 0, behind: 0, remote: 'origin',
  changes: [['src/a.js', ' M']], counts: [1, 0],
}

let failed = 0
const ok = (text, cond, extra) => {
  if (!cond) failed += 1
  console.log(cond ? 'ok  ' : 'FAIL', text, cond ? '' : JSON.stringify(extra))
}

const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms))

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
    throw new Error(`unexpected require: ${id}`)
  }).apply(env)
  state.Component = state.registration.c
  state.props = { sessionId: 's1', t, ...state.registration.o.inject() }
  return state
}

/** Open the menu, enter the commit step, act, confirm. */
async function enterStep(state) {
  const { Component, props, S } = state
  // useEffect collects into state.effects; draining any other array runs nothing.
  state.effects.length = 0
  S.index = 0
  let node = Component(props)
  const render = async (rounds = 3) => {
    for (let i = 0; i < rounds; i += 1) {
      const effects = state.effects.slice()
      state.effects = []
      for (const e of effects) e()
      await settle()
      S.index = 0
      node = Component(props)
    }
    S.index = 0
    node = Component(props)
    return node
  }
  node = await render()
  // The panel only renders while the popup is open, so the control is pressed the
  // way a person presses it. Setting a state slot by index would depend on the
  // hook order, which is not part of what this file is testing.
  const trigger = collect(node, (n) => n.type === 'button' && n.props?.['aria-haspopup'] === 'menu')[0]
  if (trigger === undefined) throw new Error(`the control button was not found; have ${JSON.stringify(collect(node, (n) => n.type === 'button').map((n) => textOf(n).trim()))}`)
  trigger.props.onClick()
  node = await render()
  const enter = buttonNamed(node, EN['action.sync'])
  if (enter === undefined) throw new Error(`no commit button; have ${JSON.stringify(collect(node, (n) => n.type === 'button').map((n) => textOf(n).trim()))}`)
  enter.props.onClick()
  node = await render()
  return {
    node: () => node,
    panel: () => textOf(node),
    toggle: async (name) => {
      const chip = chipNamed(node, name)
      if (chip === undefined) throw new Error(`no chip [${name}]`)
      chip.props.onClick()
      node = await render(2)
    },
    typeOthers: async (value) => {
      const input = collect(node, (n) => n.type === 'input' && n.props['aria-label'] === EN['commit.otherMarkers'])[0]
      if (input === undefined) throw new Error('no others field')
      input.props.onChange({ target: { value } })
      node = await render(2)
    },
    clickConfirm: async () => {
      const confirm = collect(node, (n) =>
        n.type === 'button' && !/^\[/.test(textOf(n).trim()) && /Confirm|Commit/.test(textOf(n)),
      ).pop()
      if (confirm === undefined) throw new Error(`no confirming button; have ${JSON.stringify(collect(node, (n) => n.type === 'button').map((n) => textOf(n).trim()))}`)
      confirm.props.onClick()
      await render(3)
    },
  }
}
const commitLines = (state) => state.issued.filter((l) => /^\/github (commit|sync)\b/.test(l))

console.log('=== nothing selected: no marker, and the panel says so ===')
{
  const state = boot()
  const step = await enterStep(state)
  console.log('panel marker line:', JSON.stringify((step.panel().match(/No marker will be added\.|Will add: [^\n]*/) ?? [])[0] ?? null))
  ok('the panel states that nothing will be added', step.panel().includes(EN['commit.markerNone']), step.panel().slice(0, 300))
  ok('no Clear control is offered when there is nothing to clear',
    buttonNamed(step.node(), EN['commit.markerClear']) === undefined)
  await step.clickConfirm()
  const lines = commitLines(state)
  console.log('commit line:', JSON.stringify(lines))
  ok('a commit-shaped command was issued', lines.length > 0, state.issued)
  ok('the command carries no marker', !lines.some((l) => l.includes('--marker')), lines)
}

console.log('\n=== selecting one: appended once, and the panel states it ===')
{
  const state = boot()
  const step = await enterStep(state)
  await step.toggle('release')
  console.log('panel marker line:', JSON.stringify((step.panel().match(/Will add: [^\n]*/) ?? [])[0] ?? null))
  ok('the panel names the marker it will add',
    step.panel().includes(t('commit.markerWillAdd', { markers: '[release]' })), step.panel().slice(0, 300))
  ok('the chip carries the tick', textOf(chipNamed(step.node(), 'release')).trim() === '✓ [release]',
    textOf(chipNamed(step.node(), 'release')).trim())
  await step.clickConfirm()
  const lines = commitLines(state)
  console.log('commit line:', JSON.stringify(lines))
  ok('the marker is appended', lines.some((l) => l.includes('--marker "release"')), lines)
  ok('it is appended once', lines.every((l) => (l.match(/--marker "release"/g) ?? []).length === 1), lines)
}

console.log('\n=== selecting then deselecting: nothing is appended ===')
{
  const state = boot()
  const step = await enterStep(state)
  await step.toggle('release')
  await step.toggle('release')
  console.log('panel marker line:', JSON.stringify((step.panel().match(/No marker will be added\./) ?? [])[0] ?? null))
  ok('the tick is gone', textOf(chipNamed(step.node(), 'release')).trim() === '[release]',
    textOf(chipNamed(step.node(), 'release')).trim())
  ok('the panel says nothing will be added', step.panel().includes(EN['commit.markerNone']))
  await step.clickConfirm()
  const lines = commitLines(state)
  console.log('commit line:', JSON.stringify(lines))
  ok('the command carries no marker', !lines.some((l) => l.includes('--marker')), lines)
}

console.log('\n=== the Clear control empties both the chips and the free-text field ===')
{
  const state = boot()
  const step = await enterStep(state)
  await step.toggle('release')
  await step.toggle('skip ci')
  await step.typeOthers('hotfix')
  console.log('panel after selecting three:', JSON.stringify((step.panel().match(/Will add: [^\n]*/) ?? [])[0] ?? null))
  ok('all three are stated',
    step.panel().includes(t('commit.markerWillAdd', { markers: '[release] [skip ci] [hotfix]' })),
    (step.panel().match(/Will add: [^\n]*/) ?? [])[0])
  buttonNamed(step.node(), EN['commit.markerClear']).props.onClick()
  await settle(60)
  const after = await (async () => {
    const { Component, props, backing, S } = state
    S.index = 0
    let n = Component(props)
    for (let i = 0; i < 2; i += 1) {
      const effects = state.effects.slice()
      state.effects = []
      for (const e of effects) e()
      await settle()
      S.index = 0
      n = Component(props)
    }
    return n
  })()
  const afterText = textOf(after)
  console.log('panel after Clear:', JSON.stringify((afterText.match(/No marker will be added\.|Will add: [^\n]*/) ?? [])[0] ?? null))
  ok('nothing will be added after Clear', afterText.includes(EN['commit.markerNone']), afterText.slice(0, 300))
  ok('no chip is ticked', chipNamed(after, 'release') !== undefined && !textOf(chipNamed(after, 'release')).includes('✓'))
  // Re-render, then confirm: the confirming button captured before Clear still
  // closes over the markers that were selected then.
  S: {
    const { Component, props, S } = state
    S.index = 0
    let n = Component(props)
    for (let i = 0; i < 2; i += 1) {
      const effects = state.effects.slice()
      state.effects = []
      for (const e of effects) e()
      await settle()
      S.index = 0
      n = Component(props)
    }
    const confirm = collect(n, (x) => x.type === 'button' && /Confirm/.test(textOf(x))).pop()
    confirm.props.onClick()
    await settle(120)
  }
  const lines = commitLines(state)
  console.log('all commit lines:', JSON.stringify(lines))
  // Whatever landed after Clear must be marker-free. One line is enough: the
  // confirming button captured before Clear closes over the old state and issues
  // nothing, so only the fresh one reaches the Host.
  ok('the commit after Clear carries no marker',
    lines.length > 0 && !lines.some((l) => l.includes('--marker')), lines)
}

console.log('\n=== the free-text field alone is enough to add one ===')
{
  const state = boot()
  const step = await enterStep(state)
  await step.typeOthers('hotfix, deploy')
  ok('the panel lists both', step.panel().includes('[hotfix] [deploy]'), (step.panel().match(/Will add: [^\n]*/) ?? [])[0])
  await step.clickConfirm()
  const lines = commitLines(state)
  console.log('commit line:', JSON.stringify(lines))
  ok('both are appended',
    lines.some((l) => l.includes('--marker "hotfix"') && l.includes('--marker "deploy"')), lines)
}

console.log('\n=== both dictionaries agree on the new copy ===')
{
  for (const key of ['commit.markerNone', 'commit.markerWillAdd', 'commit.markerClear']) {
    ok(`${key} is translated`, typeof ZH[key] === 'string' && ZH[key].length > 0, ZH[key])
  }
  ok('the en and zh key sets are identical',
    JSON.stringify(Object.keys(EN).sort()) === JSON.stringify(Object.keys(ZH).sort()),
    Object.keys(EN).filter((k) => !(k in ZH)))
}

console.log(failed === 0 ? '\nRESULT: ALL CHECKS PASSED' : `\nRESULT: ${failed} FAILURE(S)`)
