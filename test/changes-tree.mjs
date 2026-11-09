/**
 * The change list's tree, and the patch's row model.
 *
 * Both are pure — no DOM, no Host — and both are the parts a screenshot cannot
 * check: whether a directory chain folds into one row, whether a rewritten line
 * pairs with the line that replaced it, and whether a conflict is still a
 * conflict after a status letter is picked for its badge.
 *
 * Run: node test/changes-tree.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
globalThis.__DSH_TEST__ = true
const SOURCE = fs.readFileSync(path.join(HERE, '..', 'client.js'), 'utf8')

const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useRef: (initial) => ({ current: initial }),
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
}

let definition
const windowStub = { __ModuleLoader__: { load: (value) => { definition = value } }, addEventListener() {}, removeEventListener() {} }
new Function('window', 'document', 'require', SOURCE)(windowStub, undefined, () => React)
definition.factory(() => React)

const internals = globalThis.__githubSyncInternals
let failed = 0
const ok = (text, cond, extra) => {
  if (!cond) failed += 1
  console.log(cond ? 'ok  ' : 'FAIL', text, cond ? '' : JSON.stringify(extra))
}

const {
  statusOfCode,
  buildChangeTree,
  flattenChangeTree,
  inlineSegments,
  pairModifiedRows,
  splitHunkRows,
  preparePatch,
  parseUnifiedDiff,
  ChangesTree,
} = internals

console.log('=== a status code becomes one badge and one tone ===')
{
  const untracked = statusOfCode('??')
  ok('untracked reads as U, green', untracked?.letter === 'U' && untracked.tone === 'untracked', untracked)
  ok('untracked is not staged', untracked.staged === false && untracked.untracked === true, untracked)

  const modified = statusOfCode(' M')
  ok('a worktree modification is not staged', modified?.staged === false && modified.tone === 'modified', modified)
  ok('its letter is M', modified.letter === 'M', modified)

  const stagedOnly = statusOfCode('M ')
  ok('an index modification is staged', stagedOnly?.staged === true, stagedOnly)

  const both = statusOfCode('MM')
  ok('MM is staged and still modified afterwards', both.staged === true, both)

  const conflict = statusOfCode('UU')
  ok('a conflict has its own tone', conflict?.tone === 'conflict' && conflict.conflicted === true, conflict)
  ok('a conflict still names a letter', conflict.letter === 'U', conflict)

  ok('an ignored code is not a row', statusOfCode('!!') === null)
  ok('a clean code is not a row', statusOfCode('  ') === null)

  const renamed = statusOfCode('R ')
  ok('a staged rename is blue-toned and staged', renamed?.tone === 'renamed' && renamed.staged === true, renamed)
}

console.log('\n=== the flat list folds into a directory tree ===')
{
  const entries = [
    { path: 'src/a/b.ts', code: ' M' },
    { path: 'src/a/c.ts', code: '??' },
    { path: 'src/a/deep/x.ts', code: 'M ' },
    { path: 'README.md', code: ' M' },
  ]
  const tree = buildChangeTree(entries)
  console.log('roots:', tree.map((node) => `${node.kind}:${node.name}`).join(' | '))
  ok('directories come before files', tree[0].kind === 'dir' && tree[1].kind === 'file', tree.map((n) => n.name))
  ok('the single-child chain compresses to src/a', tree[0].name === 'src/a', tree[0].name)
  ok('the directory counts every file beneath it', tree[0].count === 3, tree[0])

  const nested = tree[0].children
  ok('the branch that has files stops compressing', nested[0].kind === 'dir' && nested[0].name === 'deep', nested.map((n) => n.name))
  ok('files are sorted after the nested directory', nested[1].name === 'b.ts' && nested[2].name === 'c.ts', nested.map((n) => n.name))
  ok('a file keeps git\u2019s own path spelling', nested[1].path === 'src/a/b.ts', nested[1])

  const open = flattenChangeTree(tree, new Set())
  ok('open, every node is a row', open.length === 6, open.map((r) => r.node.name))
  const folded = flattenChangeTree(tree, new Set(['src/a']))
  ok('a collapsed directory hides its subtree', folded.length === 2, folded.map((r) => r.node.name))
  ok('the collapsed row itself stays', folded[0].node.name === 'src/a')

  const duplicate = buildChangeTree([{ path: 'a.txt', code: ' M' }, { path: 'a.txt', code: ' M' }])
  ok('a repeated path counts once', duplicate.length === 1, duplicate)

  const rename = buildChangeTree([{ path: 'new/name.ts', code: 'R ', from: 'old/name.ts' }])
  const leaf = rename[0].children[0]
  ok('a rename carries its original path', leaf.from === 'old/name.ts', leaf)
}

console.log('\n=== a rewritten line pairs with its replacement ===')
{
  const segments = inlineSegments('const value = 1', 'const value = 2')
  ok('the common prefix stays unmarked', segments.old[0].text === 'const value = ' && segments.old[0].changed === false, segments.old)
  ok('only the digit is marked as changed', segments.old[1].text === '1' && segments.old[1].changed === true, segments.old)
  ok('the new side marks its own digit', segments.new[1].text === '2' && segments.new[1].changed === true, segments.new)

  const rows = [
    { kind: 'ctx', sign: ' ', oldNo: 1, newNo: 1, text: 'header' },
    { kind: 'del', sign: '-', oldNo: 2, newNo: null, text: 'const a = 1' },
    { kind: 'add', sign: '+', oldNo: null, newNo: 2, text: 'const a = 2' },
    { kind: 'ctx', sign: ' ', oldNo: 3, newNo: 3, text: 'tail' },
  ]
  const paired = pairModifiedRows(rows)
  ok('the deletion carries its intra-line runs', Array.isArray(paired[1].inline), paired[1])
  ok('the addition carries its own', Array.isArray(paired[2].inline), paired[2])
  ok('an untouched context row carries none', paired[0].inline === undefined && paired[3].inline === undefined)

  const unpaired = pairModifiedRows([
    { kind: 'del', sign: '-', oldNo: 1, newNo: null, text: 'gone' },
    { kind: 'ctx', sign: ' ', oldNo: 2, newNo: 1, text: 'kept' },
  ])
  ok('a deletion with nothing replacing it is not a rewrite', unpaired[0].inline === undefined, unpaired[0])

  const split = splitHunkRows(paired)
  ok('a context row covers both halves', split[0].left !== undefined && split[0].right !== undefined)
  ok('a rewrite is one side-by-side row', split[1].left.kind === 'del' && split[1].right.kind === 'add', split[1])

  const lopsided = splitHunkRows(pairModifiedRows([
    { kind: 'del', sign: '-', oldNo: 1, newNo: null, text: 'a' },
    { kind: 'del', sign: '-', oldNo: 2, newNo: null, text: 'b' },
    { kind: 'add', sign: '+', oldNo: null, newNo: 1, text: 'a' },
  ]))
  ok('a removal with no counterpart keeps its own row', lopsided.some((row) => row.left !== undefined && row.right === undefined), lopsided)

  const prepared = preparePatch({ path: 'x', additions: 1, deletions: 1, binary: false, hunks: [{ header: '@@ -1 +1 @@', rows }] })
  ok('preparing a patch pairs every hunk', Array.isArray(prepared.hunks[0].rows[1].inline))
}

console.log('\n=== a CRLF patch does not render carriage returns ===')
{
  const raw = [
    'diff --git a/a.txt b/a.txt',
    '--- a/a.txt',
    '+++ b/a.txt',
    '@@ -1,2 +1,2 @@',
    '-old line',
    '+new line',
    ' context line',
    '',
  ].join('\r\n')
  const patch = parseUnifiedDiff(raw)
  ok('the patch parses', patch !== null && patch.hunks.length === 1, patch)
  const texts = patch.hunks[0].rows.map((row) => row.text)
  console.log('row texts:', JSON.stringify(texts))
  ok('no row keeps its carriage return', texts.every((text) => !text.endsWith('\r')), texts)
  ok('the trailing newline is not a row of its own', texts.length === 3, texts)
}

console.log('\n=== the tree renders rows and keeps the checkbox contract ===')
{
  const tree = ChangesTree({
    entries: [
      { path: 'src/a.ts', code: ' M' },
      { path: 'src/b.ts', code: '??' },
      { path: 'gone.ts', code: ' D' },
    ],
    t: (key, params) => (params === undefined ? key : `${key}:${Object.values(params).join(',')}`),
    disabled: false,
    excluded: new Set(['src/b.ts']),
    collapsed: new Set(),
    onTogglePath: () => {},
    onTogglePaths: () => {},
    onToggleDir: () => {},
    onOpenDiff: () => {},
  })
  const rows = tree.children.filter((child) => child.props?.className === 'gsy-row')
  ok('every node became a row', rows.length === 4, rows.length)
  const checkboxes = []
  const walk = (node) => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (node.type === 'input' && node.props.type === 'checkbox') checkboxes.push(node)
    ;(node.children ?? []).forEach(walk)
  }
  walk(tree)
  ok('every row carries a checkbox', checkboxes.length === 4, checkboxes.length)
  const excludedRow = checkboxes.find((box) => String(box.props['aria-label']).includes('src/b.ts'))
  ok('an excluded path renders unticked', excludedRow?.props.checked === false, excludedRow?.props)
  const dir = checkboxes[0]
  ok('a directory tick follows its subtree', dir.props.checked === false, dir.props)
}

console.log(failed === 0 ? '\nRESULT: ALL CHECKS PASSED' : `\nRESULT: ${failed} FAILURE(S)`)
process.exit(failed === 0 ? 0 : 1)
