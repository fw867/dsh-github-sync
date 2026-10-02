/**
 * Commit-title generation: read what changed, ask a model for one Conventional
 * Commits subject line in the workspace's own language, and fall back to a
 * deterministic synthesis that names the change rather than counting files.
 */

const SUBJECT_LIMIT = 72
const DIFF_LIMIT = 4000
const LOG_LIMIT = 20
/** Files a synthesized summary names before it summarizes the rest. */
const NAMED_FILES = 3
/** Declarations a synthesized summary names before it summarizes the rest. */
const NAMED_SYMBOLS = 2

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
 * Derive a Conventional Commits subject from the staged changes.
 *
 * The type follows what changed and the summary names it: the declarations the
 * patch adds or removes, the section a documentation edit opens, or — when the
 * patch offers no such name — the files it touches. How many files changed is
 * never the message, because that is the one fact a reader can get from the
 * diffstat and the one fact that says nothing about the change.
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
  const count = Number.isFinite(fileCount) ? fileCount : changes.length

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
  const summary = summarizeChange({ changes, facts, count, phrases })
  return scope === undefined ? `${type}: ${summary}` : `${type}(${scope}): ${summary}`
}

/** Phrase builders for a synthesized summary, one table per language. */
const SUMMARY_PHRASES = {
  en: {
    add: (names) => `add ${joinList(names)}`,
    remove: (names) => `remove ${joinList(names)}`,
    section: (name) => `update the "${name}" section`,
    files: (files, remaining) =>
      remaining > 0
        ? `update ${joinList(files)} and ${remaining} more file${remaining === 1 ? '' : 's'}`
        : `update ${joinList(files)}`,
  },
  zh: {
    add: (names) => `新增 ${joinList(names, '、', '、')}`,
    remove: (names) => `移除 ${joinList(names, '、', '、')}`,
    section: (name) => `更新「${name}」一节`,
    files: (files, remaining) =>
      remaining > 0
        ? `更新 ${joinList(files, '、', '、')} 等 ${files.length + remaining} 个文件`
        : `更新 ${joinList(files, '、', '、')}`,
  },
}

/** Join names the way the language does: `a, b and c` / `a、b、c`. */
function joinList(items, separator = ', ', conjunction = ' and ') {
  const values = items.filter((item) => String(item ?? '').length > 0)
  if (values.length === 0) return ''
  if (values.length === 1) return values[0]
  return `${values.slice(0, -1).join(separator)}${conjunction}${values[values.length - 1]}`
}

/** The summary clause: what the patch names, else the files it touches. */
function summarizeChange({ changes, facts, count, phrases }) {
  if (facts.added.length > 0) return phrases.add(facts.added.slice(0, NAMED_SYMBOLS))
  if (facts.removed.length > 0) return phrases.remove(facts.removed.slice(0, NAMED_SYMBOLS))
  if (facts.sections.length > 0) return phrases.section(facts.sections[0])
  const files = changes.map((entry) => entry.file)
  if (files.length === 1) return phrases.files([basename(files[0])], 0)
  const named = files.slice(0, NAMED_FILES)
  return phrases.files(named, Math.max(0, count - named.length))
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

/** Most specific directory shared by every path, when there is exactly one. */
function commonScope(files) {
  if (files.length === 0) return undefined
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
  const scope = shared[shared.length - 1]
  return scope === undefined || scope.length === 0 ? undefined : scope
}

/** Read HEAD, the staged summary, and the staged diff for prompt context. */
export async function gatherCommitContext({ run, config, signal }) {
  const read = async (args) => {
    const result = await run(args, signal)
    return result.exitCode === 0 ? result.stdout : ''
  }
  const branch = await read(['rev-parse', '--abbrev-ref', 'HEAD'])
  const status = await read(['status', '--porcelain'])
  const stagedNames = await read(['diff', '--cached', '--name-status'])
  const stagedStat = await read(['diff', '--cached', '--stat'])
  const stagedDiff = await read(['diff', '--cached', '--unified=1'])
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

/** Compose the instruction the model answers with a single subject line. */
export function buildPrompt(context, language = 'en') {
  const languageName = SUMMARY_LANGUAGE[language] ?? SUMMARY_LANGUAGE.en
  return [
    'Write one Git commit subject line for the staged changes below.',
    '',
    'Rules:',
    '- Output only the subject line: no body, no quotes, no code fence, no bullet points.',
    '- Use Conventional Commits: `<type>(<scope>): <summary>`, dropping the scope when it adds nothing.',
    `- Write the summary in ${languageName}, and name the module, behaviour, command, or file that actually changed — never how many files changed.`,
    '- Keep the type token itself in English (`feat`, `fix`, `docs`, …) whatever the summary language is.',
    '- Use the imperative mood and keep the whole line within 72 characters.',
    '- Follow the recent subject lines for scope naming and tone, but the language rule above wins over them.',
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
 * Generate a subject line.
 *
 * @returns `{ subject, source, detail? }`; `source` is `model` or `heuristic`.
 *   Generation never throws: an unavailable route degrades to the heuristic so
 *   a push is never blocked by the message generator.
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

  const resolved = resolveSelection(ctx, config)
  if (resolved === undefined) {
    return fallback('no provider/model available for message generation')
  }

  try {
    const stream = llm.stream({
      provider: resolved.provider,
      model: resolved.model,
      ...(resolved.reasoningEffort === undefined ? {} : { reasoningEffort: resolved.reasoningEffort }),
      messages: [{ role: 'user', content: [{ type: 'text', text: buildPrompt(context, language) }] }],
      system: `You write concise, accurate Git commit subject lines in ${SUMMARY_LANGUAGE[language] ?? SUMMARY_LANGUAGE.en}.`,
      maxTokens: 200,
      temperature: 0,
      ...(agent?.id === undefined ? {} : { sessionId: agent.id }),
      ...(signal === undefined ? {} : { signal }),
    })
    let text = ''
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') text += chunk.text
      else if (chunk.type === 'finish' && chunk.reason.kind === 'error') {
        return fallback(chunk.reason.failure.message)
      } else if (chunk.type === 'finish' && chunk.reason.kind === 'aborted') {
        return fallback('message generation aborted')
      }
    }
    const subject = normalizeSubject(text)
    return subject.length > 0 ? { subject, source: 'model' } : fallback('model returned no text')
  } catch (error) {
    return fallback(error instanceof Error ? error.message : String(error))
  }
}

/** Prefer explicit config, then the deployment's default model selection. */
function resolveSelection(ctx, config) {
  const provider = String(config.commitProvider ?? '').trim()
  const model = String(config.commitModel ?? '').trim()
  if (provider.length > 0 && model.length > 0) {
    return { provider, model, reasoningEffort: undefined }
  }
  const defaults = ctx.get('agentDefaultModel')
  if (defaults === undefined) return undefined
  const current = defaults.currentSelection()
  if (current === undefined || current.provider === undefined || current.model === undefined) return undefined
  return { provider: current.provider, model: current.model, reasoningEffort: undefined }
}
