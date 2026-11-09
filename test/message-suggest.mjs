/**
 * `/github message`: a subject for the current change, committed nowhere.
 *
 * The panel's AI button is only as honest as this action: it must fill the
 * message box without staging, committing, or otherwise deciding anything. This
 * drives the command registration (the action is wired, the paths travel) and the
 * engine (against real git: a subject comes back, the index and the history do
 * not move).
 *
 * Run: node test/message-suggest.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN = path.resolve(HERE, '..')
const { GithubSyncEngine } = await import(`file:///${PLUGIN.replace(/\\/g, '/')}/lib/engine.js`)
const { resolveConfig } = await import(`file:///${PLUGIN.replace(/\\/g, '/')}/lib/config.js`)
const { registerCommand, ACTIONS, parseCommandLine } = await import(`file:///${PLUGIN.replace(/\\/g, '/')}/lib/command.js`)

let failed = 0
const ok = (text, cond, extra) => {
  if (!cond) failed += 1
  console.log(cond ? 'ok  ' : 'FAIL', text, cond ? '' : JSON.stringify(extra))
}

/** Run git and collect its answer. */
function git(cwd, args) {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, env: process.env, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', (error) => resolve({ code: -1, stdout, stderr: `${stderr}${error}` }))
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }))
  })
}

console.log('=== the action is wired to the engine ===')
{
  const calls = []
  let definition
  const ctx = {
    commands: {
      register(def) {
        definition = def
        return () => {}
      },
    },
  }
  registerCommand(ctx, {
    async suggestMessage(options) {
      calls.push(options)
      return { subject: 'feat(engine): a subject', body: '- why the engine changed' }
    },
  })
  ok('the command is registered', definition?.name === 'github', definition?.name)
  ok('message is a known action', ACTIONS.includes('message'), ACTIONS)
  const parsed = parseCommandLine('message --file "lib/a.js" --file "lib/b.js"')
  ok('the paths parse', JSON.stringify(parsed.files) === JSON.stringify(['lib/a.js', 'lib/b.js']), parsed.files)
  // The box holds a subject and a body; the command line stays one line, so the
  // client writes the newlines as `\n` and the parser restores them.
  const multiline = parseCommandLine('commit --message "feat: x\\n\\n- body line"')
  ok('a body survives the command line', multiline.message === 'feat: x\n\n- body line', multiline.message)
  const answer = await definition.handler({ rawInput: 'message --file "lib/a.js"', agent: { session: { header: { cwd: '/x' } } }, signal: undefined })
  // The command answers the message as text so a person reading it sees a commit
  // message, not JSON: the subject, then the body.
  ok('the answer is the message', answer?.kind === 'success' && answer.text === 'feat(engine): a subject\n\n- why the engine changed', answer)
  ok('the engine saw the named path', JSON.stringify(calls[0]?.files) === JSON.stringify(['lib/a.js']), calls[0])
}

console.log('\n=== the engine answers from the working tree, and changes nothing ===')
{
  const root = path.join(os.tmpdir(), 'dsh-message-suggest')
  fs.rmSync(root, { recursive: true, force: true })
  fs.mkdirSync(root, { recursive: true })
  await git(root, ['init', '-q'])
  await git(root, ['config', 'user.name', 'T'])
  await git(root, ['config', 'user.email', 't@example.com'])
  fs.writeFileSync(path.join(root, 'a.txt'), 'one\n')
  await git(root, ['add', '-A'])
  await git(root, ['commit', '-q', '-m', 'chore: seed'])
  const beforeHead = (await git(root, ['rev-parse', 'HEAD'])).stdout.trim()
  const beforeIndex = (await git(root, ['diff', '--cached', '--name-only'])).stdout.trim()

  fs.writeFileSync(path.join(root, 'a.txt'), 'one\ntwo\n')
  fs.writeFileSync(path.join(root, 'new.txt'), 'brand new\n')
  const beforeStatus = (await git(root, ['status', '--porcelain'])).stdout

  const subprocess = {
    async resolveExecutable(name) {
      return name
    },
    spawn({ argv, cwd }) {
      const child = spawn(argv[0], argv.slice(1), { cwd, env: process.env, windowsHide: true })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk) => (stdout += chunk))
      child.stderr.on('data', (chunk) => (stderr += chunk))
      const done = new Promise((resolve) => {
        child.on('error', (error) => resolve({ exitCode: -1, signal: null, error: String(error) }))
        child.on('close', (code, signal) => resolve({ exitCode: code ?? -1, signal: signal ?? null }))
      })
      return {
        done,
        collected: {
          stdout: { readFrom: (from) => ({ text: stdout.slice(from), nextOffset: stdout.length, lossy: false }) },
          stderr: { readFrom: (from) => ({ text: stderr.slice(from), nextOffset: stderr.length, lossy: false }) },
        },
      }
    },
  }
  const ctx = { subprocess, get: () => undefined, logger: { info() {} }, effect: (cb) => { cb(); return () => {} } }
  const engine = new GithubSyncEngine(ctx, resolveConfig({ generateCommitMessage: true }))
  const agent = { session: { header: { cwd: root } } }

  const suggestion = await engine.suggestMessage({ agent, files: [], signal: undefined })
  const subject = suggestion?.subject ?? ''
  console.log('subject:', JSON.stringify(suggestion))
  ok('a non-empty subject comes back', typeof subject === 'string' && subject.trim().length > 0, suggestion)
  ok('it names the changed file, not a meaningless placeholder', subject.includes('a.txt') || subject.includes('new.txt'), subject)

  const scoped = await engine.suggestMessage({ agent, files: ['new.txt'], signal: undefined })
  console.log('scoped subject:', JSON.stringify(scoped))
  ok('a narrowed request answers about the named path', String(scoped?.subject ?? '').includes('new.txt'), scoped)

  const afterHead = (await git(root, ['rev-parse', 'HEAD'])).stdout.trim()
  const afterIndex = (await git(root, ['diff', '--cached', '--name-only'])).stdout.trim()
  const afterStatus = (await git(root, ['status', '--porcelain'])).stdout
  ok('no commit was recorded', afterHead === beforeHead, { beforeHead, afterHead })
  ok('nothing was staged', afterIndex === beforeIndex, { beforeIndex, afterIndex })
  ok('the working tree is exactly as it was', afterStatus === beforeStatus, { beforeStatus, afterStatus })

  fs.rmSync(root, { recursive: true, force: true })
}

console.log('\n=== the box asks on the model\u2019s lightest reasoning face ===')
{
  const { generateSubject } = await import(`file:///${PLUGIN.replace(/\\/g, '/')}/lib/commit.js`)
  const calls = []
  const llm = {
    async resolveModelInfo() {
      return { reasoning: { efforts: [{ id: 'high' }, { id: 'low' }], defaultEffort: 'high' } }
    },
    stream(params) {
      calls.push(params)
      return (async function* emit() {
        yield { type: 'text-delta', text: 'feat(ui): a message' }
        yield { type: 'finish', reason: { kind: 'done' } }
      })()
    },
  }
  const ctx = { get: (name) => (name === 'llm' ? llm : undefined) }
  const context = { branch: 'main', status: ' M a.ts\n', stagedNames: 'a.ts', stagedStat: '', stagedDiff: '+x', recent: [] }
  const config = resolveConfig({ generateCommitMessage: true, commitProvider: 'p', commitModel: 'm' })

  const fast = await generateSubject({ ctx, agent: undefined, context, fileCount: 1, config, signal: undefined, preferFast: true })
  ok('the fast call answers', fast.subject === 'feat(ui): a message', fast)
  ok('it asks with the lightest advertised effort', calls[0]?.reasoningEffort === 'low', calls[0]?.reasoningEffort)

  const normal = await generateSubject({ ctx, agent: undefined, context, fileCount: 1, config, signal: undefined })
  ok('a commit\u2019s own generation keeps the configured effort', calls[1]?.reasoningEffort === undefined, calls[1]?.reasoningEffort)
  ok('and still answers', normal.subject === 'feat(ui): a message', normal)
}

console.log(failed === 0 ? '\nRESULT: ALL CHECKS PASSED' : `\nRESULT: ${failed} FAILURE(S)`)
process.exit(failed === 0 ? 0 : 1)
