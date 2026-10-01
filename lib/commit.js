/**
 * Commit-title generation: read what changed, ask a model for one Conventional
 * Commits subject line, and fall back to a deterministic synthesis when no
 * model route is available.
 */

const SUBJECT_LIMIT = 72
const DIFF_LIMIT = 4000
const LOG_LIMIT = 20

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
 * Derive a Conventional Commits subject from `git status --porcelain`.
 *
 * The type follows the dominant change and the scope names the most specific
 * shared directory, which keeps the message informative without a model.
 */
export function heuristicSubject(statusText, fileCount) {
  const entries = String(statusText ?? '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 3)
    .map((line) => ({ code: line.slice(0, 2), file: line.slice(3).trim() }))

  const allAdded = entries.length > 0 && entries.every((entry) => entry.code.includes('A') || entry.code === '??')
  const allDeleted = entries.length > 0 && entries.every((entry) => entry.code.includes('D'))
  const docsOnly =
    entries.length > 0 &&
    entries.every((entry) => /(^|\/)(docs?|README|CHANGELOG|LICENSE)/i.test(entry.file) || /\.mdx?$/i.test(entry.file))

  let type = 'chore'
  if (allAdded) type = 'feat'
  else if (allDeleted) type = 'chore'
  else if (docsOnly) type = 'docs'
  else if (entries.some((entry) => entry.code.includes('A') || entry.code.includes('?'))) type = 'feat'
  else if (entries.some((entry) => /\.(test|spec)\.[a-z]+$/i.test(entry.file) || /(^|\/)tests?\//i.test(entry.file)))
    type = 'test'

  const scope = commonScope(entries.map((entry) => entry.file))
  const count = fileCount ?? entries.length
  const summary =
    count === 1 && entries.length === 1
      ? `update ${basename(entries[0].file)}`
      : `update ${count} file${count === 1 ? '' : 's'}`
  return scope === undefined ? `${type}: ${summary}` : `${type}(${scope}): ${summary}`
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
export function buildPrompt(context) {
  return [
    'Write one Git commit subject line for the staged changes below.',
    '',
    'Rules:',
    '- Output only the subject line: no body, no quotes, no code fence, no bullet points.',
    '- Use Conventional Commits: `<type>(<scope>): <summary>`, dropping the scope when it adds nothing.',
    '- Use the imperative mood and keep it within 72 characters.',
    '- Match the style of the recent commit subjects when they are consistent.',
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
  const fallback = () => ({
    subject: heuristicSubject(context.status, fileCount),
    source: 'heuristic',
  })

  if (config.generateCommitMessage !== true) return fallback()
  const llm = ctx.get('llm')
  if (llm === undefined) return { ...fallback(), detail: 'no llm service in this composition' }

  const resolved = resolveSelection(ctx, config)
  if (resolved === undefined) {
    return { ...fallback(), detail: 'no provider/model available for message generation' }
  }

  try {
    const stream = llm.stream({
      provider: resolved.provider,
      model: resolved.model,
      ...(resolved.reasoningEffort === undefined ? {} : { reasoningEffort: resolved.reasoningEffort }),
      messages: [{ role: 'user', content: [{ type: 'text', text: buildPrompt(context) }] }],
      system: 'You write concise, accurate Git commit subject lines.',
      maxTokens: 200,
      temperature: 0,
      ...(agent?.id === undefined ? {} : { sessionId: agent.id }),
      ...(signal === undefined ? {} : { signal }),
    })
    let text = ''
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') text += chunk.text
      else if (chunk.type === 'finish' && chunk.reason.kind === 'error') {
        return { ...fallback(), detail: chunk.reason.failure.message }
      } else if (chunk.type === 'finish' && chunk.reason.kind === 'aborted') {
        return { ...fallback(), detail: 'message generation aborted' }
      }
    }
    const subject = normalizeSubject(text)
    return subject.length > 0 ? { subject, source: 'model' } : { ...fallback(), detail: 'model returned no text' }
  } catch (error) {
    return { ...fallback(), detail: error instanceof Error ? error.message : String(error) }
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
