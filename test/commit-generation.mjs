/**
 * What the message generator asks the model for.
 *
 * Reasoning models reject `temperature` with a 400; sending it turned every
 * generation into a deterministic "更新 N 个文件" fallback after three identical
 * failures. The request must therefore carry only parameters every selected
 * model accepts, and a usable answer must still become the commit subject.
 *
 * Run: node test/commit-generation.mjs
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN = path.join(HERE, '..')
const { generateSubject } = await import(`file:///${PLUGIN.replace(/\\/g, '/')}/lib/commit.js`)

let failed = 0
const ok = (text, cond, extra) => {
  if (!cond) failed += 1
  console.log(cond ? 'ok  ' : 'FAIL', text, cond ? '' : JSON.stringify(extra))
}

const CONTEXT = {
  branch: 'main',
  stagedNames: 'lib/commit.js',
  stagedStat: ' lib/commit.js | 4 ++--',
  status: 'M  lib/commit.js',
  stagedDiff: [
    'diff --git a/lib/commit.js b/lib/commit.js',
    '--- a/lib/commit.js',
    '+++ b/lib/commit.js',
    '@@ -1 +1 @@',
    '-const temperature = 0',
    '+const temperature = undefined',
  ].join('\n'),
  recent: ['feat(ui): keep the menu inside the viewport'],
}

const REQUESTS = []

const llm = {
  stream(request) {
    REQUESTS.push(request)
    return (async function* stream() {
      yield { type: 'text-delta', text: 'fix(commit): 兼容不支持 temperature 的模型' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })()
  },
}

const ctx = {
  get(name) {
    if (name === 'llm') return llm
    if (name === 'sessionController') {
      return {
        selectionFor: (agent) => ({
          current: agent?.id === 'session-test'
            ? { provider: 'session-provider', model: 'session-model', reasoningEffort: 'high' }
            : { provider: 'other', model: 'other' },
        }),
      }
    }
    if (name === 'agentDefaultModel') {
      return { currentSelection: () => ({ provider: 'default-provider', model: 'default-model' }) }
    }
    return undefined
  },
}

const config = {
  generateCommitMessage: true,
  commitMaxTokens: 900,
  commitAttempts: 1,
  commitLanguage: 'zh',
  commitProvider: '',
  commitModel: '',
}

const generated = await generateSubject({
  ctx,
  agent: { id: 'session-test' },
  context: CONTEXT,
  fileCount: 1,
  config,
  signal: new AbortController().signal,
})

console.log('=== a usable answer becomes the subject ===')
ok('the model answer is used', generated.source === 'model', generated)
ok('the subject is the generated one', generated.subject.startsWith('fix(commit):'), generated.subject)

console.log('\n=== the request stays compatible with reasoning models ===')
const request = REQUESTS[0]
ok('the model was asked once', REQUESTS.length === 1, REQUESTS.length)
ok('no temperature is sent', request?.temperature === undefined, request?.temperature)
ok('the utility-call purpose is kept', request?.purpose === 'session-title', request?.purpose)
ok(
  'the conversation model is used, not the deployment default',
  request?.provider === 'session-provider' && request?.model === 'session-model',
  { provider: request?.provider, model: request?.model },
)
ok('the conversation effort is not forwarded to a utility call', request?.reasoningEffort === undefined, request?.reasoningEffort)
ok('the prompt still carries the diff', String(request?.messages?.[0]?.content?.[0]?.text ?? '').includes('lib/commit.js'))

console.log('\n=== without a session controller the deployment default is still valid ===')
{
  const fallbackRequests = []
  const fallbackCtx = {
    get(name) {
      if (name === 'llm') {
        return {
          stream(request) {
            fallbackRequests.push(request)
            return (async function* stream() {
              yield { type: 'text-delta', text: 'feat(commit): fall back to the default model' }
              yield { type: 'finish', reason: { kind: 'stop' } }
            })()
          },
        }
      }
      if (name === 'agentDefaultModel') {
        return { currentSelection: () => ({ provider: 'default-provider', model: 'default-model' }) }
      }
      return undefined
    },
  }
  const fallbackResult = await generateSubject({
    ctx: fallbackCtx,
    agent: { id: 'session-test' },
    context: CONTEXT,
    fileCount: 1,
    config,
    signal: new AbortController().signal,
  })
  ok('the generation still succeeds', fallbackResult.source === 'model', fallbackResult)
  ok(
    'the deployment default is used',
    fallbackRequests[0]?.provider === 'default-provider' && fallbackRequests[0]?.model === 'default-model',
    fallbackRequests[0],
  )
}

console.log(failed === 0 ? '\nRESULT: ALL CHECKS PASSED' : `\nRESULT: ${failed} FAILURE(S)`)
process.exit(failed === 0 ? 0 : 1)
