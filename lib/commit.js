/**
 * Commit-title generation: read what changed, ask a model for one Conventional
 * Commits subject line in the workspace's own language, and fall back to a
 * deterministic synthesis that names the change — a declaration, a section, or
 * the files by name — composed to fit the subject limit instead of cut to it.
 */

/** The widest a subject line may be, in characters. */
export const SUBJECT_LIMIT = 72
const DIFF_LIMIT = 4000
const LOG_LIMIT = 20
/** How much of a generated body is kept, in characters. */
const BODY_LIMIT = 1600
/** Longest CI marker accepted, and how many one message may carry. */
const MARKER_LIMIT = 40
const MARKER_COUNT = 5
/** What a marker may contain: plain words, never brackets or control characters. */
const MARKER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _\-.:/]{0,39}$/
/** Files a synthesized summary names before it summarizes the rest. */
const NAMED_FILES = 2
/** Declarations a synthesized summary names before it summarizes the rest. */
const NAMED_SYMBOLS = 2
/** How many times a message is asked for when the config says nothing, and the ceiling. */
const DEFAULT_ATTEMPTS = 3
const MAX_ATTEMPTS = 5
/** Waits before each retry, in milliseconds: long enough for a hiccup, short enough to sit through. */
const RETRY_DELAYS = [300, 800]
/** Budget a reasoning-only answer is retried with, so a second attempt is not the same question. */
const REASONING_TOKEN_CEILING = 4096

/** Languages a generated subject is written in, keyed by primary subtag. */
export const SUMMARY_LANGUAGE = {
  en: 'English',
  zh: 'Simplified Chinese',
}

/**
 * Resolve the language a subject is written in.
 *
 * An explicit `commitLanguage` wins; otherwise the local language decides, read
 * from the POSIX locale variables and then from the runtime's own resolved
 * locale — on Windows that is the user's regional setting, e.g. `zh-CN`. Every
 * language outside Chinese falls back to English, which is the language the
 * plugin's tool and command text is in.
 *
 * The Conventional Commits **type token stays English** in every language, so a
 * conventional-commit parser or a generated changelog keeps working; only the
 * summary is localized.
 *
 * @param setting - the `commitLanguage` config value, `auto` or a locale tag.
 * @param env - the environment holding the POSIX locale variables.
 * @param intl - the `Intl` namespace the runtime locale is read from.
 * @returns `'zh'` or `'en'`.
 */
export function resolveSubjectLanguage(setting, env = process.env, intl = Intl) {
  const configured = String(setting ?? '')
    .trim()
    .toLowerCase()
  const locale = configured.length > 0 && configured !== 'auto' ? configured : localLocaleTag(env, intl)
  return locale.startsWith('zh') ? 'zh' : 'en'
}

/** The host's locale tag as `ll` or `ll-cc`, from the environment then `Intl`. */
function localLocaleTag(env, intl) {
  const fromEnvironment = ['LC_ALL', 'LC_MESSAGES', 'LANG']
    .map((name) => String(env?.[name] ?? '').trim())
    .find((value) => value.length > 0)
  if (fromEnvironment !== undefined) return normalizeLocaleTag(fromEnvironment)
  try {
    return normalizeLocaleTag(intl.DateTimeFormat().resolvedOptions().locale)
  } catch {
    return ''
  }
}

/** `zh_CN.UTF-8@euro` and `zh-CN` both read as `zh-cn`. */
function normalizeLocaleTag(value) {
  return String(value ?? '')
    .split('.')[0]
    .split('@')[0]
    .replace(/_/g, '-')
    .toLowerCase()
}

/**
 * Normalize the CI markers a caller asked for.
 *
 * A marker is a short plain-text instruction a pipeline looks for — `skip ci`,
 * `release`, `skip release` — and it ends up inside a commit message and on a git
 * command line, so it is cleaned here rather than trusted: surrounding brackets
 * are stripped (`[skip ci]` and `skip ci` are the same request), whitespace is
 * collapsed, anything that is not plain words is dropped, and the list is
 * deduplicated and capped.
 *
 * @param input - one marker, an array of them, or comma/semicolon-separated text.
 * @returns the markers, in order, ready to be bracketed into a message.
 */
export function normalizeMarkers(input) {
  const raw = Array.isArray(input) ? input : input === undefined || input === null ? [] : [input]
  const seen = new Set()
  const markers = []
  for (const value of raw) {
    for (const piece of String(value ?? '').split(/[,;\n]/)) {
      const cleaned = piece
        .trim()
        .replace(/^\[+/, '')
        .replace(/\]+$/, '')
        .trim()
        .replace(/\s+/g, ' ')
      if (cleaned.length === 0 || cleaned.length > MARKER_LIMIT || !MARKER_PATTERN.test(cleaned)) continue
      const key = cleaned.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      markers.push(cleaned)
      if (markers.length >= MARKER_COUNT) return markers
    }
  }
  return markers
}

/**
 * The bracketed text a commit message carries for CI, or `undefined` when there
 * is none.
 *
 * This is only the text: where it sits in the message is the caller's decision,
 * and both commit paths put it on the subject line so a pipeline that reads only
 * the first line still sees it.
 *
 * @param input - one marker, an array of them, or comma/semicolon-separated text.
 * @returns the markers bracketed and space-joined, or `undefined` for none.
 */
export function markerLine(input) {
  const markers = normalizeMarkers(input)
  return markers.length === 0 ? undefined : markers.map((marker) => `[${marker}]`).join(' ')
}

/**
 * The markers this plugin offers as chips, used to recognise an inherited one.
 *
 * Syntax alone cannot tell a marker from prose: `[other]` and `[skip ci]` are both
 * plain words in brackets, and a sentence may end with either. So only a group the
 * caller names is treated as a marker — the chips, plus whatever was selected.
 */
const KNOWN_MARKERS = ['skip ci', 'release']

/**
 * Drop markers from the end of a subject that the caller did not select.
 *
 * The marker control is the only thing that decides which markers a commit
 * carries, and the engine composes them onto the subject. A subject that arrives
 * already carrying one is therefore either an echo of the recent subjects the
 * prompt quotes — a model copying the shape it was shown — or a message written by
 * hand on a `/github` line. Either way it is not the current choice, and leaving it
 * would both contradict a deselected marker and double one that is selected.
 *
 * - `feat: x [release] [skip ci]` with nothing selected → `feat: x`
 * - `feat: x [release]` with `[skip ci]` selected → `feat: x`, then `[skip ci]` is added
 * - `feat(ui): keep [x] inside` → unchanged: a marker is at the end by construction
 * - `fix: handle [TAG] and [other]` → unchanged: neither is a marker this plugin knows
 *
 * @param subject - a subject line, possibly ending in `[something]`.
 * @param selected - the markers the caller asked for, so they are not stripped and
 *   re-added; anything else that matches a known marker is removed.
 * @returns the subject without trailing known markers.
 */
export function stripTrailingMarkers(subject, selected = []) {
  if (typeof subject !== 'string' || subject.length === 0) return subject
  const known = new Set([...KNOWN_MARKERS, ...normalizeMarkers(selected)].map((marker) => marker.toLowerCase()))
  let text = subject
  for (;;) {
    const match = /\[([^\]\n]*)\]\s*$/.exec(text)
    if (match === null) break
    const inner = match[1].trim().replace(/\s+/g, ' ').toLowerCase()
    if (!known.has(inner)) break
    text = text.slice(0, match.index)
  }
  return text.replace(/\s+$/, '')
}

/**
 * Put the CI markers at the end of the subject line.
 *
 * The markers sit *after the main title*, not in a paragraph of their own: a
 * marker on line one is visible everywhere the title is, and it cannot be lost
 * by a tool that keeps only the summary. A subject that is capped for length is
 * capped before this runs, so the markers are never what pushes it over.
 *
 * It is idempotent: a title that already ends with exactly these markers is
 * returned untouched. That matters for `amend --keep-message`, which re-sends the
 * recorded title — appending blindly would write `[skip ci] [skip ci]`.
 *
 * @param subject - the title line, with or without markers already.
 * @param ci - the bracketed marker text from {@link markerLine}.
 * @returns the title with the markers appended, or the title unchanged.
 */
export function withMarkerLine(subject, ci) {
  if (ci === undefined || subject === undefined || subject.length === 0) return subject
  const escaped = ci.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escaped}\\s*$`).test(subject) ? subject : `${subject} ${ci}`
}

/** Clamp model output to one clean subject line. */
export function normalizeSubject(input) {
  let text = String(input ?? '')
  text = text.replace(/^```[a-zA-Z]*\s*/m, '').replace(/```/g, '')
  text = text.replace(/\r\n/g, '\n')
  const numbered = /^\s*(?:commit message|message|subject|title)\s*[:\-]\s*(.+)$/im.exec(text)
  const line =
    (numbered?.[1] ?? '')
      .trim()
      .split('\n')[0]
      ?.trim() ||
    text
      .split('\n')
      .map((candidate) => candidate.trim())
      .find((candidate) => candidate.length > 0) ||
    ''
  const collapsed = line.replace(/\s+/g, ' ').replace(/^["'`]|["'`]$/g, '').trim()
  if (collapsed.length === 0) return ''
  return collapsed.length <= SUBJECT_LIMIT ? collapsed : `${collapsed.slice(0, SUBJECT_LIMIT - 1).trimEnd()}…`
}

/**
 * Split model output into a subject and the body under it.
 *
 * A commit message is not one line: the subject says what changed at a glance and
 * the body says what it actually did, which is the part a reader needs a week
 * later. The subject is clamped like any other; the body is kept as written —
 * indentation, bullets and all — up to a sane ceiling, because reformatting prose
 * the model wrote for a diff is how a message stops matching its change.
 *
 * @returns `{ subject, body? }`; `body` is absent when the model wrote one line.
 */
export function normalizeMessage(input) {
  const stripped = String(input ?? '')
    .replace(/^```[a-zA-Z]*\s*\n?/m, '')
    .replace(/\n?```\s*$/m, '')
    .replace(/\r\n/g, '\n')
  const lines = stripped.split('\n')
  const firstIndex = lines.findIndex((line) => line.trim().length > 0)
  if (firstIndex === -1) return { subject: '' }
  const subject = normalizeSubject(lines[firstIndex])
  if (subject.length === 0) return { subject: '' }
  const body = lines
    .slice(firstIndex + 1)
    .join('\n')
    .replace(/^\s*\n/, '')
    .replace(/\s+$/, '')
  if (body.length === 0) return { subject }
  return { subject, body: body.length <= BODY_LIMIT ? body : `${body.slice(0, BODY_LIMIT).trimEnd()}\n…` }
}

/**
 * Derive a Conventional Commits subject from the staged changes.
 *
 * The type follows what changed and the summary names it: the declarations the
 * patch adds or removes, the section a documentation edit opens, or — when the
 * patch offers no such name — the files it touches, by file name. A bare count is
 * the floor of that order, not the summary: it is what the line falls back to
 * when even one name would overflow the subject.
 *
 * A short summary is composed, never cut: when `type(scope): summary` would pass
 * the subject limit the summary gets shorter — fewer names, then the count — so a
 * fallback cannot ship the shape `chore: update app/src/…/A.kt、app/src/…/B.kt 等 …`,
 * which is a list of paths sliced at character 72 and tells a reader nothing.
 *
 * @param context - the gathered context: `stagedNames`, `status`, `stagedDiff`.
 * @param fileCount - how many files the staged change holds, when it is known.
 * @param language - `en` or `zh`, from {@link resolveSubjectLanguage}.
 */
export function heuristicSubject(context, fileCount, language = 'en') {
  const phrases = SUMMARY_PHRASES[language] ?? SUMMARY_PHRASES.en
  const changes = parseChanges(context)
  const facts = diffFacts(context?.stagedDiff)
  const classes = new Set(changes.map((entry) => classify(entry.file)))
  // Count what the commit records, not what the change list held: a commit of
  // selected paths is generated from those paths, and saying "and 11 more files"
  // about files that stay behind would describe the wrong commit.
  const count = changes.length > 0 ? changes.length : Number.isFinite(fileCount) ? fileCount : 0

  const every = (code) => changes.length > 0 && changes.every((entry) => entry.code === code)
  const only = (name) => changes.length > 0 && classes.size === 1 && classes.has(name)

  let type = 'chore'
  if (every('A')) type = 'feat'
  else if (every('D')) type = 'chore'
  else if (only('docs')) type = 'docs'
  else if (only('test')) type = 'test'
  else if (only('ci')) type = 'ci'
  else if (only('build')) type = 'build'
  else if (facts.added.length > 0) type = 'feat'

  const scope = commonScope(changes.map((entry) => entry.file))
  // `docs(docs):` repeats the type instead of narrowing it.
  return fitSubject(type, scope === type ? undefined : scope, summaryCandidates({ changes, facts, count, phrases }))
}

/** Phrase builders for a synthesized summary, one table per language. */
const SUMMARY_PHRASES = {
  en: {
    verbUpdate: 'update',
    verbRemove: 'remove',
    add: (names) => `add ${joinList(names)}`,
    remove: (names) => `remove ${joinList(names)}`,
    section: (name) => `update the "${name}" section`,
    files: (files, remaining, verb) =>
      remaining > 0
        ? `${verb} ${joinList(files, ', ', ', ')} and ${remaining} more file${remaining === 1 ? '' : 's'}`
        : `${verb} ${joinList(files)}`,
    count: (files, verb) => `${verb} ${files} file${files === 1 ? '' : 's'}`,
    empty: () => 'record a change with no staged diff',
  },
  zh: {
    verbUpdate: '更新',
    verbRemove: '移除',
    add: (names) => `新增 ${joinList(names, '、', '、')}`,
    remove: (names) => `移除 ${joinList(names, '、', '、')}`,
    section: (name) => `更新「${name}」一节`,
    files: (files, remaining, verb) =>
      remaining > 0
        ? `${verb} ${joinList(files, '、', '、')} 等 ${files.length + remaining} 个文件`
        : `${verb} ${joinList(files, '、', '、')}`,
    count: (files, verb) => `${verb} ${files} 个文件`,
    empty: () => '记录一次无暂存差异的提交',
  },
}

/** Join names the way the language does: `a, b and c` / `a、b、c`. */
function joinList(items, separator = ', ', conjunction = ' and ') {
  const values = items.filter((item) => String(item ?? '').length > 0)
  if (values.length === 0) return ''
  if (values.length === 1) return values[0]
  return `${values.slice(0, -1).join(separator)}${conjunction}${values[values.length - 1]}`
}

/**
 * The summaries to try, best first.
 *
 * A name the patch itself supplies — a declaration, a heading — describes the
 * change; a file name at least says where it happened. So those come first, and
 * each is offered with fewer names before the count, which is the only form short
 * enough to fit any subject. File names are basenames: a repository path is long,
 * says less than the module scope already on the line, and is what turns a
 * fallback into a truncated directory listing.
 */
function summaryCandidates({ changes, facts, count, phrases }) {
  const candidates = []
  for (const [names, phrase] of [
    [facts.added, phrases.add],
    [facts.removed, phrases.remove],
  ]) {
    if (names.length === 0) continue
    candidates.push(phrase(names.slice(0, NAMED_SYMBOLS)))
    if (names.length > 1) candidates.push(phrase(names.slice(0, 1)))
  }
  if (facts.sections.length > 0) candidates.push(phrases.section(facts.sections[0]))
  // "update 12 files" for a change that only deletes them says the reverse of
  // what happened, so the verb follows the change.
  const deleting = changes.length > 0 && changes.every((entry) => entry.code === 'D')
  const verb = deleting ? phrases.verbRemove : phrases.verbUpdate
  const files = changes.map((entry) => basename(entry.file))
  for (const take of [NAMED_FILES, 1]) {
    if (take > files.length) continue
    candidates.push(phrases.files(files.slice(0, take), Math.max(0, count - take), verb))
  }
  // Always last, so the floor is short enough to fit even when every name is not.
  candidates.push(count > 0 ? phrases.count(count, verb) : phrases.empty())
  return candidates
}

/**
 * Compose `type(scope): summary` within the subject limit.
 *
 * The candidates are already ordered by what they say, so each one is offered
 * with and without the scope before the next, shorter one is tried: naming the
 * change is worth more than naming the directory it happened in. The count is
 * last and short by construction, so this returns a subject that fits rather than
 * a line {@link normalizeSubject} must cut.
 */
function fitSubject(type, scope, candidates) {
  for (const summary of candidates) {
    if (summary.length === 0) continue
    if (scope !== undefined) {
      const scoped = `${type}(${scope}): ${summary}`
      if (scoped.length <= SUBJECT_LIMIT) return scoped
    }
    const plain = `${type}: ${summary}`
    if (plain.length <= SUBJECT_LIMIT) return plain
  }
  return `${type}: ${candidates[candidates.length - 1]}`
}

/**
 * Read the staged paths and how each one changed.
 *
 * `diff --cached --name-status` is the primary source because it describes what
 * is about to be committed; `status --porcelain` is the fallback for a context
 * gathered without it. A rename reports its new path, which is the one that
 * exists afterwards.
 */
function parseChanges(context) {
  const fromNames = String(context?.stagedNames ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split('\t')
      return { code: statusKind(parts[0]), file: (parts[parts.length - 1] ?? '').trim() }
    })
    .filter((entry) => entry.file.length > 0)
  if (fromNames.length > 0) return fromNames

  return String(context?.status ?? '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 3)
    .map((line) => {
      const renamed = / -> (.+)$/.exec(line)
      return { code: statusKind(line.slice(0, 2)), file: (renamed?.[1] ?? line.slice(3)).trim() }
    })
    .filter((entry) => entry.file.length > 0)
}

/** One change kind per path, whichever status format it came from. */
function statusKind(code) {
  const value = String(code ?? '')
  if (value.includes('?')) return 'A'
  for (const letter of ['A', 'D', 'R', 'M']) {
    if (value.includes(letter)) return letter
  }
  return 'M'
}

/** What kind of file a path holds, in the order the classes are tested. */
const FILE_CLASSES = [
  {
    name: 'docs',
    test: (file) => /(^|\/)(docs?|README|CHANGELOG|LICENSE|NOTICE)/i.test(file) || /\.(md|mdx|rst)$/i.test(file),
  },
  {
    name: 'test',
    test: (file) => /\.(test|spec)\.[a-z]+$/i.test(file) || /(^|\/)(tests?|__tests__|spec)\//i.test(file),
  },
  {
    name: 'ci',
    test: (file) =>
      /(^|\/)\.(github\/workflows|gitlab-ci|circleci)\//i.test(file) ||
      /(^|\/)(Jenkinsfile|\.travis\.yml|azure-pipelines\.yml)$/i.test(file),
  },
  {
    name: 'build',
    test: (file) =>
      /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Dockerfile|Makefile|\.npmrc|\.nvmrc)$/i.test(
        file,
      ) ||
      /(^|\/)tsconfig[^/]*\.json$/i.test(file) ||
      /\.config\.[a-z]+$/i.test(file),
  },
]

/** The class of one path: `docs`, `test`, `ci`, `build`, or `source`. */
function classify(file) {
  for (const entry of FILE_CLASSES) {
    if (entry.test(file)) return entry.name
  }
  return 'source'
}

/**
 * The names the staged patch actually adds or removes, and the headings it opens.
 *
 * These are the only facts a subject can be built from without a model, and they
 * are what lets the fallback describe the change instead of counting files.
 *
 * @param patch - the staged unified diff.
 * @returns `{ added, removed, sections }`, each deduplicated and in patch order.
 */
export function diffFacts(patch) {
  const added = []
  const removed = []
  const sections = []
  for (const line of String(patch ?? '').split('\n')) {
    if (line.startsWith('+++ ') || line.startsWith('--- ')) continue
    const isAdded = line.startsWith('+')
    const isRemoved = line.startsWith('-')
    if (!isAdded && !isRemoved) continue
    const body = line.slice(1)
    if (isAdded) {
      const heading = /^#{1,4}\s+(.+?)\s*$/.exec(body)
      if (heading !== null) {
        sections.push(heading[1])
        continue
      }
    }
    const name = declarationName(body)
    if (name === undefined) continue
    ;(isAdded ? added : removed).push(name)
  }
  return { added: unique(added), removed: unique(removed), sections: unique(sections) }
}

/** The name a line declares, when it declares one worth naming. */
function declarationName(body) {
  const patterns = [
    /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/,
    /\b(?:function|class)\s+([A-Za-z_$][\w$]*)\s*[(<]/,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(body)
    if (match !== null && match[1] !== undefined) return match[1]
  }
  return undefined
}

function unique(values) {
  return [...new Set(values)]
}

function basename(file) {
  const parts = file.split('/')
  return parts[parts.length - 1]
}

/**
 * Directory names that describe a layout convention rather than a module.
 *
 * `chore(src): …` is the shape a change spanning `src/main` and `src/test` would
 * otherwise get: it names the build layout, not the code, and it is on the line
 * for every commit that touches both sides of a source tree.
 */
const GENERIC_SCOPES = new Set([
  'src',
  'source',
  'sources',
  'main',
  'java',
  'kotlin',
  'test',
  'tests',
  '__tests__',
  'spec',
  'specs',
])

/**
 * The module a change lives in, when the paths agree on one.
 *
 * Parent directory names decide first: they are what a project calls its module,
 * and they still agree when the change spans `src/main/…/iap2` and
 * `src/test/…/iap2`. Otherwise the deepest directory every path shares is used.
 * A layout segment is not a scope, and neither is one the type already states.
 */
function commonScope(files) {
  if (files.length === 0) return undefined
  const parents = files.map((file) => file.split('/').slice(0, -1).pop())
  if (parents[0] !== undefined && parents.every((name) => name === parents[0])) {
    return meaningfulScope(parents[0])
  }
  const segments = files.map((file) => file.split('/').slice(0, -1))
  const first = segments[0]
  if (first === undefined || first.length === 0) return undefined
  let shared = first
  for (const candidate of segments.slice(1)) {
    const limit = Math.min(shared.length, candidate.length)
    let index = 0
    while (index < limit && shared[index] === candidate[index]) index += 1
    shared = shared.slice(0, index)
    if (shared.length === 0) return undefined
  }
  return meaningfulScope(shared[shared.length - 1])
}

/** A scope worth printing, or `undefined` when the segment says nothing. */
function meaningfulScope(name) {
  if (name === undefined || name.length === 0) return undefined
  return GENERIC_SCOPES.has(name.toLowerCase()) ? undefined : name
}

/**
 * Read HEAD, the staged summary, and the staged diff for prompt context.
 *
 * `paths` narrows every read to the files the commit will actually record, so a
 * commit of selected paths gets a subject about those paths instead of about
 * everything else that happened to be dirty.
 */
export async function gatherCommitContext({ run, config, paths, signal }) {
  const scope = Array.isArray(paths) && paths.length > 0 ? ['--', ...paths] : []
  const read = async (args) => {
    const result = await run(args, signal)
    return result.exitCode === 0 ? result.stdout : ''
  }
  const branch = await read(['rev-parse', '--abbrev-ref', 'HEAD'])
  const status = await read(['status', '--porcelain', ...scope])
  const stagedNames = await read(['diff', '--cached', '--name-status', ...scope])
  const stagedStat = await read(['diff', '--cached', '--stat', ...scope])
  const stagedDiff = await read(['diff', '--cached', '--unified=1', ...scope])
  const recent = await read(['log', `-${LOG_LIMIT}`, '--pretty=%s'])
  return {
    branch: branch.trim(),
    status,
    stagedNames,
    stagedStat,
    stagedDiff: stagedDiff.slice(0, config.commitDiffBytes ?? 12000),
    recent: recent.trim().split('\n').filter((line) => line.length > 0),
  }
}

/**
 * Compose the instruction the model answers with a commit message.
 *
 * The subject is the glance and the body is the record, so the prompt asks for
 * both: a subject that names the behaviour the change alters, and bullets that
 * say what it does now, why, and what a reader should know. "Update files" is
 * what happens when a model is only asked for a title.
 */
export function buildPrompt(context, language = 'en') {
  const languageName = SUMMARY_LANGUAGE[language] ?? SUMMARY_LANGUAGE.en
  return [
    'Write the Git commit message for the staged changes below.',
    '',
    'Format:',
    '- Line 1 is the subject: `type(scope): summary` per Conventional Commits, scope dropped when it adds nothing, whole line within 72 characters, imperative mood.',
    `- Write the subject and the body in ${languageName}. Keep the type token itself in English (\`feat\`, \`fix\`, \`docs\`, …).`,
    '- Then a blank line, then a body of two to four `- ` bullets.',
    '- Output the message only: no code fence, no commentary, no "commit message:" label.',
    '',
    'What makes it useful:',
    '- Name the behaviour, module, command, or option that changed — the thing a reader would search for.',
    '- Never how many files changed, never a list of file names or paths, and never just the name of a symbol that was added.',
    '- A file list is not a summary: the diffstat already shows it. "chore: update app/src/main/A.kt、B.kt 等 12 个文件" is the failure to avoid.',
    '- Say what the change does that it did not do before, and what it means for whoever uses it.',
    '- Mention a concrete detail from the patch — a function, a config field, a command, a default — when it makes the subject specific.',
    '- If the change is a fix, say what was broken; if it is a feature, say what is now possible.',
    '- Do not restate the diff line by line, and do not pad: three good bullets beat ten.',
    '- Follow the recent subject lines for scope naming and tone, but the language rule above wins over them.',
    // The recent subjects are quoted verbatim, so a marker in one of them is an
    // example the model will happily copy — and markers are composed separately, so
    // a copied one lands on top of whatever was selected.
    '- Never write a bracketed CI marker (`[skip ci]`, `[release]`, …): they are added separately, and copying one from the recent subjects would duplicate or contradict the choice already made.',
    '',
    `Branch: ${context.branch.length > 0 ? context.branch : '(detached HEAD)'}`,
    '',
    'Staged files:',
    context.stagedNames.trim().length > 0 ? truncate(context.stagedNames, DIFF_LIMIT) : '(none)',
    '',
    'Staged diffstat:',
    context.stagedStat.trim().length > 0 ? truncate(context.stagedStat, DIFF_LIMIT) : '(none)',
    '',
    'Working tree status:',
    truncate(context.status, DIFF_LIMIT),
    '',
    'Staged patch:',
    context.stagedDiff.trim().length > 0 ? truncate(context.stagedDiff, DIFF_LIMIT) : '(none)',
    '',
    'Recent subject lines:',
    context.recent.length > 0 ? context.recent.slice(0, 20).join('\n') : '(none)',
  ].join('\n')
}

function truncate(text, limit) {
  const value = String(text ?? '')
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}\n…[diff truncated]`
}

/**
 * Generate a commit message.
 *
 * A model call is retried before the deterministic subject is used: the failures
 * worth caring about — a provider hiccup, a rate limit, a thinking model that
 * spent the whole budget before writing a word — are transient, and the fallback
 * is the one outcome that is visible as a worse title rather than as an error.
 * The number of tries is `commitAttempts` (default 3, 1 disables retrying), and
 * the waits between them are short because this happens inside a commit.
 *
 * @returns `{ subject, body?, source, attempts?, detail? }`; `source` is `model`
 *   or `heuristic`. Generation never throws: an unavailable route degrades to the
 *   heuristic so a push is never blocked by the message generator.
 */
export async function generateSubject(options) {
  const { ctx, agent, context, fileCount, config, signal } = options
  const language = resolveSubjectLanguage(config.commitLanguage)
  const fallback = (detail) => ({
    subject: heuristicSubject(context, fileCount, language),
    source: 'heuristic',
    ...(detail === undefined ? {} : { detail }),
  })

  if (config.generateCommitMessage !== true) return fallback()
  const llm = ctx.get('llm')
  if (llm === undefined) return fallback('no llm service in this composition')

  const resolved = resolveSelection(ctx, config, agent)
  if (resolved === undefined) {
    return fallback('no provider/model available for message generation')
  }

  const attempts = attemptCount(config)
  let budget = Number.isFinite(config.commitMaxTokens) && config.commitMaxTokens > 0 ? config.commitMaxTokens : 900
  let failure = 'the model was not asked'
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (signal?.aborted) return fallback('message generation aborted')
    const result = await askModel({
      llm,
      resolved,
      context,
      language,
      budget,
      sessionId: agent?.id,
      signal,
    })
    if (result.message !== undefined) {
      return {
        subject: result.message.subject,
        ...(result.message.body === undefined ? {} : { body: result.message.body }),
        source: 'model',
        ...(attempt === 1 ? {} : { attempts: attempt }),
      }
    }
    if (result.aborted === true) return fallback('message generation aborted')
    failure = result.failure
    if (attempt === attempts) break
    // A reasoning-only answer spent the budget before any text arrived. Repeating
    // the same question with the same budget is how a thinking model fails twice,
    // so the next attempt gets more room — never less than it had.
    if (result.kind === 'empty' && result.reasoning > 0) {
      budget = Math.min(budget * 2, Math.max(budget, REASONING_TOKEN_CEILING))
    }
    try {
      await pause(RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)], signal)
    } catch {
      return fallback('message generation aborted')
    }
  }
  return fallback(attempts > 1 ? `${failure} (after ${attempts} attempts)` : failure)
}

/** How many times a message is asked for, within the range the plugin supports. */
function attemptCount(config) {
  const raw = Number(config.commitAttempts)
  if (!Number.isFinite(raw)) return DEFAULT_ATTEMPTS
  return Math.min(Math.max(Math.floor(raw), 1), MAX_ATTEMPTS)
}

/**
 * One attempt at the message.
 *
 * @returns `{ message }` when the model produced a usable message,
 *   `{ aborted: true }` when the caller cancelled, or
 *   `{ failure, kind, reasoning }` when it produced nothing usable.
 */
async function askModel({ llm, resolved, context, language, budget, sessionId, signal }) {
  try {
    const stream = llm.stream({
      provider: resolved.provider,
      model: resolved.model,
      ...(resolved.reasoningEffort === undefined ? {} : { reasoningEffort: resolved.reasoningEffort }),
      messages: [{ role: 'user', content: [{ type: 'text', text: buildPrompt(context, language) }] }],
      system: `You write commit messages that tell a reader what changed and why, in ${SUMMARY_LANGUAGE[language] ?? SUMMARY_LANGUAGE.en}.`,
      // A message is a utility call, not a task: `purpose: 'session-title'` is how
      // the adapter is told not to spend the budget thinking — which is exactly
      // what an unset effort did before, leaving `maxTokens` consumed by
      // `reasoning-delta` chunks and no `text-delta` at all.
      purpose: 'session-title',
      maxTokens: budget,
      // No `temperature`: reasoning models (GPT-5/o-series and this deployment's
      // `gpt-6.1-sol`) reject it with a 400 that no retry can cure. The prompt
      // already fixes the shape, and sampling temperature is not what made the
      // subject deterministic.
      ...(sessionId === undefined ? {} : { sessionId }),
      ...(signal === undefined ? {} : { signal }),
    })
    let text = ''
    // Counting the chunks is what turns "the model returned no text" into a
    // diagnosis: a stream of reasoning with no text means the budget went to
    // thinking, which is a different problem from a provider that failed.
    const seen = { text: 0, reasoning: 0, other: 0 }
    let finished
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') {
        seen.text += 1
        text += chunk.text
      } else if (chunk.type === 'reasoning-delta') {
        seen.reasoning += 1
      } else if (chunk.type === 'finish') {
        finished = chunk
      } else {
        seen.other += 1
      }
    }
    if (finished !== undefined && finished.reason.kind === 'error') {
      return { failure: finished.reason.failure.message, kind: 'error', reasoning: seen.reasoning }
    }
    if (finished !== undefined && finished.reason.kind === 'aborted') {
      return { aborted: true }
    }
    const message = normalizeMessage(text)
    if (message.subject.length === 0) {
      return {
        failure: `model returned no text (${seen.text} text, ${seen.reasoning} reasoning, ${seen.other} other chunks)`,
        kind: 'empty',
        reasoning: seen.reasoning,
      }
    }
    return { message }
  } catch (error) {
    if (signal?.aborted) return { aborted: true }
    return { failure: error instanceof Error ? error.message : String(error), kind: 'error', reasoning: 0 }
  }
}

/** Wait before a retry, waking early — as an abort — when the caller cancels. */
function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'))
      return
    }
    const abort = () => {
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', abort)
      reject(new Error('aborted'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', abort)
      resolve()
    }, ms)
    signal?.addEventListener?.('abort', abort, { once: true })
  })
}

/**
 * Resolve the model that writes the message.
 *
 * Explicit `commitProvider`/`commitModel` win, because that pair exists for a
 * deployment that wants a cheap utility model regardless of the conversation.
 * Otherwise the **calling Session's selection** is used: the model shown in the
 * composer is the one the person expects the message to come from, and a session
 * that switched models should not silently keep generating with the old default.
 * The deployment default is only the fallback when the Session has no selection
 * (a headless call, or a composition without the session controller).
 *
 * `reasoningEffort` is deliberately not forwarded: this is a utility call, and
 * `purpose: 'session-title'` is the adapter's signal to skip thinking. Carrying
 * the conversation's `high` effort here would spend the message budget on
 * reasoning, which is the other way this generator used to fall back.
 */
function resolveSelection(ctx, config, agent) {
  const provider = String(config.commitProvider ?? '').trim()
  const model = String(config.commitModel ?? '').trim()
  if (provider.length > 0 && model.length > 0) {
    return { provider, model, reasoningEffort: undefined }
  }
  const sessionSelection = sessionModelSelection(ctx, agent)
  if (sessionSelection !== undefined) return sessionSelection
  const defaults = ctx.get('agentDefaultModel')
  if (defaults === undefined) return undefined
  const current = defaults.currentSelection()
  if (current === undefined || current.provider === undefined || current.model === undefined) return undefined
  return { provider: current.provider, model: current.model, reasoningEffort: undefined }
}

/** The calling Session's live model selection, when this Host exposes one. */
function sessionModelSelection(ctx, agent) {
  if (agent === undefined) return undefined
  try {
    const controller = ctx.get('sessionController')
    if (controller === undefined || typeof controller.selectionFor !== 'function') return undefined
    const current = controller.selectionFor(agent)?.current
    if (current === undefined || current.provider === undefined || current.model === undefined) return undefined
    return { provider: current.provider, model: current.model, reasoningEffort: undefined }
  } catch {
    // A projection missing from a headless composition is not an error here:
    // the deployment default is still a valid answer.
    return undefined
  }
}
