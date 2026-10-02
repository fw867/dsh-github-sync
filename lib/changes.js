/**
 * Reading the working tree: what changed, and which side of the index it is on.
 *
 * `git status --porcelain=v1 -z` is the source because it is stable, scriptable,
 * and NUL-separated: a path containing a space, a quote, or a newline stays one
 * field instead of being quoted and needing to be unquoted. A rename or a copy
 * arrives as two fields — the new path, then the original — which is the one
 * shape the parser has to know about.
 */

/** The two-letter status codes git reports, as the words a person reads. */
const CODE_WORDS = {
  M: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  T: 'type changed',
  U: 'updated but unmerged',
  '?': 'untracked',
  '!': 'ignored',
}

/** Two-letter codes that mean a conflict is waiting to be resolved. */
const CONFLICT_CODES = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])

/**
 * Parse `git status --porcelain=v1 -z` into change entries.
 *
 * @param raw - the command's stdout.
 * @returns entries `{ code, index, worktree, path, from?, staged, untracked, conflicted }`.
 */
export function parseStatus(raw) {
  const fields = String(raw ?? '').split('\0')
  const entries = []
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]
    if (field.length < 4) continue
    const code = field.slice(0, 2)
    const path = field.slice(3)
    const carriesOriginal = code.includes('R') || code.includes('C')
    const from = carriesOriginal ? fields[index + 1] : undefined
    if (carriesOriginal && from !== undefined) index += 1
    const indexState = code[0]
    const worktreeState = code[1]
    entries.push({
      code,
      index: indexState,
      worktree: worktreeState,
      path,
      ...(from === undefined || from.length === 0 ? {} : { from }),
      staged: indexState !== ' ' && indexState !== '?',
      untracked: code === '??',
      conflicted: CONFLICT_CODES.has(code),
    })
  }
  return entries
}

/** The words one status code reads as: `MM` is "modified, and modified again". */
export function describeCode(entry) {
  if (entry.untracked === true) return 'untracked'
  if (entry.conflicted === true) return 'conflicted'
  const words = []
  if (entry.staged === true) words.push(`staged ${CODE_WORDS[entry.index] ?? 'changed'}`)
  if (entry.worktree !== ' ' && entry.worktree !== undefined) {
    words.push(`${entry.staged === true ? 'further ' : ''}${CODE_WORDS[entry.worktree] ?? 'changed'}`)
  }
  return words.length === 0 ? 'changed' : words.join(', ')
}

/** How many entries are in each state, for a one-line summary. */
export function countChanges(entries) {
  let staged = 0
  let unstaged = 0
  let untracked = 0
  let conflicted = 0
  for (const entry of entries) {
    if (entry.conflicted === true) conflicted += 1
    if (entry.untracked === true) untracked += 1
    else if (entry.staged === true) staged += 1
    if (entry.untracked !== true && entry.worktree !== ' ' && entry.conflicted !== true) unstaged += 1
  }
  return { total: entries.length, staged, unstaged, untracked, conflicted }
}

/** The one-line summary of a change set. */
export function summarizeChanges(entries) {
  const counts = countChanges(entries)
  if (counts.total === 0) return 'working tree clean'
  const parts = []
  if (counts.staged > 0) parts.push(`${counts.staged} staged`)
  if (counts.unstaged > 0) parts.push(`${counts.unstaged} modified, not staged`)
  if (counts.untracked > 0) parts.push(`${counts.untracked} untracked`)
  if (counts.conflicted > 0) parts.push(`${counts.conflicted} conflicted`)
  return `${counts.total} changed file${counts.total === 1 ? '' : 's'}: ${parts.join(', ')}`
}

/**
 * The change list as text, one line per path.
 *
 * A rename names both ends, because "renamed" alone does not say what moved.
 */
export function renderChanges(entries) {
  if (entries.length === 0) return 'working tree clean'
  return entries
    .map((entry) => {
      const arrow = entry.from === undefined ? '' : ` (from ${entry.from})`
      return `${entry.code} ${entry.path}${arrow} — ${describeCode(entry)}`
    })
    .join('\n')
}

/**
 * Pick the paths a caller named, matched against what actually changed.
 *
 * A path that did not change is reported instead of being silently dropped: a
 * typo in a path otherwise looks like a commit that did nothing.
 *
 * @returns `{ selected, unknown }` — `selected` keeps the order it was given.
 */
export function selectPaths(entries, wanted) {
  const known = new Set(entries.map((entry) => entry.path))
  const selected = []
  const unknown = []
  for (const path of wanted) {
    if (known.has(path)) {
      if (!selected.includes(path)) selected.push(path)
    } else if (!unknown.includes(path)) {
      unknown.push(path)
    }
  }
  return { selected, unknown }
}
