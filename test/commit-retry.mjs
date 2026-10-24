/**
 * Retrying the model call before falling back.
 *
 * The rule being pinned: a commit message is asked for more than once. A
 * provider hiccup, a rate limit, or a thinking model that spent the whole budget
 * before writing a word are transient, and the deterministic subject is the one
 * failure that shows up as a worse title rather than as an error — so it is the
 * last resort, not the first response to a single empty stream.
 *
 * The fake `llm` is a real stream, because the retry has to work against the same
 * reader the plugin uses: `text-delta`, `reasoning-delta`, and a `finish` chunk
 * that carries the reason.
 *
 * Run: node test/commit-retry.mjs
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN = path.join(HERE, '..').replace(/\\/g, '/')
const { generateSubject, heuristicSubject, resolveSubjectLanguage } = await import(`file:///${PLUGIN}/lib/commit.js`)
const { resolveConfig } = await import(`file:///${PLUGIN}/lib/config.js`)

let failed = 0
const ok = (text, cond, extra) => {
  if (!cond) failed += 1
  console.log(cond ? 'ok  ' : 'FAIL', text, cond ? '' : JSON.stringify(extra))
}

const context = {
  branch: 'main',
  status: '',
  stagedNames: 'M\tlib/commit.js',
  stagedStat: '',
  stagedDiff: '',
  recent: [],
}

/** Chunks for one streamed answer. */
const text = (value) => ({ type: 'text-delta', text: value })
const reasoning = (value) => ({ type: 'reasoning-delta', text: value })
const finish = (kind, failure) => ({ type: 'finish', reason: failure === undefined ? { kind } : { kind, failure } })
const failedStream = (message) => [finish('error', { message })]

/**
 * A ctx whose `llm.stream` answers from `behaviour(request, attempt)`.
 *
 * The behaviour returns the chunks to stream, or `'throw'` to fail the call the
 * way a broken socket does. Every request is recorded so the test can see how
 * many attempts were made and with which budget.
 */
function harness(behaviour, patch = {}) {
  const requests = []
  const llm = {
    stream(request) {
      requests.push(request)
      const chunks = behaviour(request, requests.length)
      return (async function* streamed() {
        if (chunks === 'throw') throw new Error('socket hang up')
        for (const chunk of chunks) yield chunk
      })()
    },
  }
  const ctx = {
    get(name) {
      if (name === 'llm') return llm
      if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'p', model: 'm' }) }
      return undefined
    },
  }
  return { ctx, requests, config: resolveConfig({ commitProvider: 'p', commitModel: 'm', ...patch }) }
}

const generate = (h, signal) => generateSubject({ ctx: h.ctx, agent: { id: 's' }, context, fileCount: 1, config: h.config, signal })

console.log('=== one failure is retried and the answer is used ===')
{
  const h = harness((request, attempt) =>
    attempt === 1 ? failedStream('rate limited') : [text('fix(lib): keep the retry'), finish('stop')],
  )
  const result = await generate(h)
  console.log(JSON.stringify(result))
  ok('the model answered on the second attempt', result.source === 'model', result)
  ok('the subject is the model\'s, not the fallback\'s', result.subject === 'fix(lib): keep the retry', result)
  ok('the retry is recorded on the result', result.attempts === 2, result)
  ok('exactly two requests were made', h.requests.length === 2, h.requests.length)
}

console.log('\n=== a reasoning-only answer is retried with more budget ===')
{
  const h = harness((request, attempt) =>
    attempt === 1 ? [reasoning('thinking…'), finish('length')] : [text('chore(lib): update commit.js'), finish('stop')],
  )
  const result = await generate(h)
  console.log(JSON.stringify(result))
  ok('an empty first answer does not lose the message', result.source === 'model', result)
  ok('the first attempt used the configured budget', h.requests[0].maxTokens === 900, h.requests[0].maxTokens)
  ok('the retry asked with twice the room', h.requests[1].maxTokens === 1800, h.requests[1].maxTokens)
}

console.log('\n=== a thrown call is retried too ===')
{
  const h = harness((request, attempt) =>
    attempt === 1 ? 'throw' : [text('feat(lib): survive a broken socket'), finish('stop')],
  )
  const result = await generate(h)
  console.log(JSON.stringify(result))
  ok('a thrown stream is retried', result.source === 'model' && result.attempts === 2, result)
}

console.log('\n=== the fallback is the last resort ===')
{
  const h = harness(() => failedStream('provider unavailable'))
  const result = await generate(h)
  console.log(JSON.stringify(result))
  ok('three attempts were made', h.requests.length === 3, h.requests.length)
  ok('then the deterministic subject was used', result.source === 'heuristic', result)
  const language = resolveSubjectLanguage(h.config.commitLanguage)
  ok('the fallback subject is the synthesized one', result.subject === heuristicSubject(context, 1, language), result)
  ok('the reason names the attempts', result.detail === 'provider unavailable (after 3 attempts)', result.detail)
}

console.log('\n=== an abort stops the loop ===')
{
  const h = harness(() => [finish('aborted')])
  const result = await generate(h)
  ok('an aborted stream is not retried', h.requests.length === 1, h.requests.length)
  ok('and is reported as aborted', result.source === 'heuristic' && result.detail === 'message generation aborted', result)
}
{
  const h = harness(() => [text('never asked'), finish('stop')])
  const controller = new AbortController()
  controller.abort()
  const result = await generate(h, controller.signal)
  ok('a cancelled caller costs no request', h.requests.length === 0, h.requests.length)
  ok('and is reported as aborted', result.detail === 'message generation aborted', result)
}

console.log('\n=== retrying is configurable, and its absence is not a fault ===')
{
  const h = harness(() => failedStream('no route'), { commitAttempts: 1 })
  const result = await generate(h)
  ok('commitAttempts: 1 disables retrying', h.requests.length === 1, h.requests.length)
  ok('the reason carries no attempt count', result.detail === 'no route', result.detail)
}
{
  const h = harness(() => failedStream('no route'), { commitAttempts: 0 })
  const result = await generate(h)
  ok('a value below one is clamped to one', h.requests.length === 1, h.requests.length)
}
{
  let thrown
  try {
    resolveConfig({ commitAttempts: '3' })
  } catch (error) {
    thrown = error
  }
  ok('the config field is type-checked', thrown instanceof TypeError, String(thrown))
}
{
  const h = harness(() => [text('never asked'), finish('stop')])
  h.ctx.get = () => undefined
  const result = await generate(h)
  ok('a missing llm service is not retried', h.requests.length === 0 && result.detail === 'no llm service in this composition', result)
}

console.log(failed === 0 ? '\nRESULT: ALL CHECKS PASSED' : `\nRESULT: ${failed} FAILURE(S)`)
process.exit(failed === 0 ? 0 : 1)
