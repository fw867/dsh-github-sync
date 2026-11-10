/**
 * A commit message is printed once.
 *
 * The commit step already prints the recorded message — subject and body — followed
 * by git's own summary. The step also carries a `subject` field, and rendering that
 * field in the step head put the same message (whole paragraphs of it) on screen a
 * second time. git's summary line repeats the subject too, which was a third copy.
 *
 * The command text is what the panel and the model both read, so the contract
 * pinned here is about that text: one message block, a head that says where the
 * message came from, and a summary line that keeps the branch and commit id.
 *
 * Run: node test/commit-display.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN = path.join(HERE, '..')
const asUrl = (file) => `file:///${file.replace(/\\/g, '/')}`

const { GithubSyncEngine, renderOutcome } = await import(asUrl(path.join(PLUGIN, 'lib', 'engine.js')))
const { resolveConfig } = await import(asUrl(path.join(PLUGIN, 'lib', 'config.js')))

let failed = 0
const ok = (text, cond, extra) => {
  if (!cond) failed += 1
  console.log(cond ? 'ok  ' : 'FAIL', text, cond ? '' : JSON.stringify(extra))
}
/** How many times `needle` occurs in `haystack`. */
const count = (haystack, needle) => haystack.split(needle).length - 1

console.log('=== the rendered step does not repeat a subject that has an output ===')
{
  const text = renderOutcome({
    repository: 'https://github.com/acme/widget.git',
    root: '/repo',
    branch: 'main',
    remote: 'origin',
    steps: [
      {
        step: 'commit',
        status: 'completed',
        subject: 'fix(a): one title',
        source: 'provided',
        detail: 'message provided',
        output: 'fix(a): one title\n\n[main 1234abc]\n 1 file changed',
      },
    ],
  })
  console.log(text.replace(/\n/g, ' | '))
  ok('the head carries the provenance', text.includes('message provided'), text)
  ok('the head does not quote the subject', !text.includes('"fix(a): one title"'), text)
  ok('the message appears once', count(text, 'fix(a): one title') === 1, text)
}

console.log('\n=== a subject with no output is still rendered (the fallback) ===')
{
  const text = renderOutcome({
    repository: 'repo',
    root: '/repo',
    branch: null,
    remote: null,
    steps: [{ step: 'note', status: 'completed', subject: 'only a subject', source: 'model' }],
  })
  ok('the only copy of a subject is kept', text.includes('— "only a subject" (model)'), text)
}

// ---------------------------------------------------------------------------
// The real path: a commit's message travels through git and back out again.
// ---------------------------------------------------------------------------
const git = (cwd, args) =>
  new Promise((resolve) => {
    const child = spawn('git', args, { cwd, env: process.env, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', (error) => resolve({ code: -1, stdout, stderr: `${stderr}${error}` }))
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }))
  })

const root = path.join(os.tmpdir(), 'dsh-commit-display')
fs.rmSync(root, { recursive: true, force: true })
fs.mkdirSync(root, { recursive: true })
await git(root, ['init', '-q', '-b', 'main'])
await git(root, ['config', 'user.name', 'T'])
await git(root, ['config', 'user.email', 't@example.com'])
const file = path.join(root, 'a.txt')
fs.writeFileSync(file, 'one\n')
await git(root, ['add', '-A'])

const subprocess = {
  async resolveExecutable(name) { return name },
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
const ctx = { subprocess, get: () => undefined, logger: { info: () => {} }, effect: (cb) => { cb(); return () => {} } }
// The deterministic fallback is what a message-generation failure produces; it also
// keeps the test off the model.
const engine = new GithubSyncEngine(ctx, resolveConfig({ generateCommitMessage: false }))
const agent = { id: 's', session: { header: { cwd: root } } }
const runIn = async (argv) => {
  const run = await git(root, argv)
  return { argv: ['git', ...argv], exitCode: run.code, signal: null, stdout: run.stdout, stderr: run.stderr, timedOut: false, aborted: false }
}
const repo = { root, workspace: root, git: 'git', runIn }
const render = (step) =>
  renderOutcome({
    repository: 'https://github.com/acme/widget.git',
    root,
    branch: 'main',
    remote: 'origin',
    steps: [step],
  })

const TITLE = 'fix(xwall): DNS 劫持改走 NAT 加固定目的入站'
const BODY = ['- 新增 dns-in 入站接管局域网 53 端口查询', '- 透明 TCP/UDP 入站嗅探改为 routeOnly']
const MESSAGE = [TITLE, '', ...BODY].join('\n')

console.log('\n=== a provided multi-line message is printed once ===')
{
  const step = await engine.commitStaged({ repo, files: ['a.txt'], subject: MESSAGE, agent, signal: undefined })
  const text = render(step)
  console.log(text.replace(/\n/g, ' | '))
  ok('the commit landed', step.status === 'completed', step)
  ok('the structured subject is the title only', step.subject === TITLE, step.subject)
  ok('the provenance is named', text.includes('message provided'), text)
  ok('the title appears once', count(text, TITLE) === 1, text)
  ok('the first body line appears once', count(text, BODY[0]) === 1, text)
  ok('the second body line appears once', count(text, BODY[1]) === 1, text)
  ok('no subject is quoted in the head', !text.includes(`— "${TITLE}`), text)
  // git's own echo keeps the branch and commit id, because that is what proves the
  // commit landed — only its copy of the subject is dropped.
  ok('the summary keeps the branch and commit id', /\[main\b[^\]]*\]/.test(text), text)
  ok('the summary does not echo the subject', count(text, `] ${TITLE}`) === 0, text)
  const recorded = (await git(root, ['log', '-1', '--pretty=%B'])).stdout.trim()
  ok('and git recorded the whole message', recorded === MESSAGE, recorded)
}

console.log('\n=== a generated message is printed once too ===')
{
  fs.writeFileSync(file, 'two\n')
  await git(root, ['add', '-A'])
  const step = await engine.commitStaged({ repo, files: ['a.txt'], agent, signal: undefined })
  const text = render(step)
  console.log(text.replace(/\n/g, ' | '))
  ok('the commit landed', step.status === 'completed', step)
  ok('the generated subject is in the message block', text.includes(step.subject), text)
  ok('exactly once', count(text, step.subject) === 1, text)
  ok('and it is not quoted in the head', !text.includes(`— "${step.subject}"`), text)
}

console.log('\n=== an amended message is printed once ===')
{
  fs.writeFileSync(file, 'three\n')
  await git(root, ['add', '-A'])
  await git(root, ['commit', '-q', '-m', 'wip: throwaway'])
  const step = await engine.amendHead({ repo, subject: 'fix: amended title', agent, signal: undefined })
  const text = render(step)
  console.log(text.replace(/\n/g, ' | '))
  ok('the amend landed', step.status === 'completed', step)
  ok('the new title appears once', count(text, 'fix: amended title') === 1, text)
  ok('and is not quoted in the head', !text.includes('— "fix: amended title"'), text)
  const recorded = (await git(root, ['log', '-1', '--pretty=%B'])).stdout.trim()
  ok('git recorded it', recorded === 'fix: amended title', recorded)
}

console.log('\n=== the reported flow: commit and push prints the message once ===')
{
  // The bare remote lives beside the clone, not inside it: a remote created in the
  // working tree would be staged by the commit this test is checking.
  const remote = path.join(os.tmpdir(), 'dsh-commit-display-remote.git')
  fs.rmSync(remote, { recursive: true, force: true })
  await git(os.tmpdir(), ['init', '--bare', '-q', '-b', 'main', remote])
  await git(root, ['remote', 'add', 'origin', remote])
  fs.writeFileSync(file, 'four\n')
  const outcome = await engine.sync({ action: 'sync', message: MESSAGE, agent, signal: undefined })
  const text = renderOutcome({ ...outcome, branch: outcome.branch ?? 'main' })
  console.log(text.replace(/\n/g, ' | '))
  ok('the sync completed', outcome.ok === true, outcome.steps)
  ok('the commit step is there', outcome.steps.some((entry) => entry.step === 'commit'), outcome.steps)
  ok('the push step is there', outcome.steps.some((entry) => entry.step === 'push'), outcome.steps)
  ok('the title appears once', count(text, TITLE) === 1, text)
  ok('the first body line appears once', count(text, BODY[0]) === 1, text)
  ok('the second body line appears once', count(text, BODY[1]) === 1, text)
  ok('the provenance is named once', count(text, 'message provided') === 1, text)
  ok('no subject is quoted', !text.includes(`— "${TITLE}`), text)
  fs.rmSync(remote, { recursive: true, force: true })
}

fs.rmSync(root, { recursive: true, force: true })
console.log(failed === 0 ? '\nRESULT: ALL CHECKS PASSED' : `\nRESULT: ${failed} FAILURE(S)`)
process.exit(failed === 0 ? 0 : 1)
