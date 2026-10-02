/**
 * Thin wrapper over `ctx.subprocess` for running git.
 *
 * A non-zero exit is a normal result the model reads, not an exception: git
 * reports ordinary situations such as "nothing to commit" or "no upstream
 * branch" through its exit code. Only provider or spawn failures throw.
 */
import fs from 'node:fs'

/** Per-stream collection ceiling; beyond it the reader reports lossy reads. */
export const STDOUT_LIMIT_BYTES = 4 * 1024 * 1024
export const STDERR_LIMIT_BYTES = 1024 * 1024

/**
 * Append one line of git-call diagnostics, when enabled.
 *
 * The live Host runs a subprocess provider this plugin cannot reproduce from a
 * test harness, so a repository that reads as absent has to be diagnosable from
 * the running application. Setting `DSH_GITHUB_SYNC_DIAGNOSTICS` to a file path
 * makes every git call append what it actually returned there; with no such
 * variable there is no file, no I/O, and no behaviour change.
 *
 * @param entry - the facts about one finished call.
 */
function diagnose(entry) {
  const file = process.env.DSH_GITHUB_SYNC_DIAGNOSTICS
  if (file === undefined || file.length === 0) return
  try {
    fs.appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`)
  } catch {
    // Diagnostics must never break the operation they observe.
  }
}

/** Ordered stream chunks, decoded once so split multi-byte characters survive. */
function collector() {
  const chunks = []
  return {
    push(chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8'))
    },
    text() {
      if (chunks.length === 0) return ''
      return Buffer.concat(chunks).toString('utf8')
    },
  }
}

/**
 * Read a collect-mode output to its end.
 *
 * `SubprocessOutputReader.readFrom` is offset-based and non-consuming, so this
 * loops until the reader stops advancing. A reader that throws contributes
 * nothing rather than failing the call it belongs to.
 *
 * @param reader - the collected reader, when the provider supplies one.
 * @returns everything the reader holds.
 */
function drainCollected(reader) {
  if (reader === undefined || typeof reader.readFrom !== 'function') return ''
  let offset = 0
  let text = ''
  try {
    for (;;) {
      const read = reader.readFrom(offset)
      if (read === undefined || typeof read.text !== 'string') return text
      text += read.text
      if (typeof read.nextOffset !== 'number' || read.nextOffset <= offset) return text
      offset = read.nextOffset
    }
  } catch {
    return text
  }
}

/**
 * Resolve one stream's output, whichever shape the provider uses.
 *
 * A provider may hand over a live stream, or implement only the documented
 * collect-mode readers, or both. Reading just one of them makes a real answer
 * look like an empty one: with a collect-only provider the stream is absent, so
 * a stream-only reader reports no output while git exited `0`.
 *
 * @param streamed - bytes observed on the live stream, if there was one.
 * @param reader - the provider's collected reader for the same stream.
 * @returns the stream's complete text.
 */
function resolveOutput(streamed, reader) {
  const collected = drainCollected(reader)
  return streamed.length > 0 ? streamed : collected
}

/**
 * Environment handed to git.
 *
 * Inherited values are kept, including an askpass helper the person configured:
 * that helper is part of the setup this plugin exists to reuse, and replacing it
 * with an empty value would break the very credential path it should use. What
 * is neutralized is only the *terminal* prompt, which the Host can never answer
 * — git must fail with `terminal prompts disabled` rather than block until the
 * command times out. `GCM_INTERACTIVE=never` keeps the credential helper from
 * opening a browser flow on its own; credentials it already holds are used.
 */
function gitEnvironment(extra) {
  const env = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue
    env[key] = value
  }
  env.GIT_TERMINAL_PROMPT = '0'
  env.GCM_INTERACTIVE = 'never'
  if (extra !== undefined) Object.assign(env, extra)
  return env
}

/**
 * Run one git command in `cwd`.
 *
 * @returns `{ argv, exitCode, signal, stdout, stderr, timedOut, aborted }`.
 *   `exitCode` is `null` when the process was killed by a signal.
 */
export async function runGit(ctx, options) {
  const { git, cwd, args, timeoutMs, env, signal } = options
  const controller = new AbortController()
  const cancelFromCaller = () => controller.abort()
  if (signal !== undefined) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', cancelFromCaller, { once: true })
  }
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const started = Date.now()
  const stdout = collector()
  const stderr = collector()
  try {
    const handle = ctx.subprocess.spawn({
      argv: [git, ...args],
      cwd,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: STDOUT_LIMIT_BYTES },
        stderr: { maxBytes: STDERR_LIMIT_BYTES },
      },
      graceMs: 5000,
      env: gitEnvironment(env),
      signal: controller.signal,
    })
    handle.stdout?.on('data', (chunk) => stdout.push(chunk))
    handle.stderr?.on('data', (chunk) => stderr.push(chunk))
    const outcome = await handle.done
    const stdoutText = resolveOutput(stdout.text(), handle.collected?.stdout)
    const stderrText = resolveOutput(stderr.text(), handle.collected?.stderr)
    const result = {
      argv: ['git', ...args],
      exitCode: outcome.exitCode,
      signal: outcome.signal,
      stdout: stdoutText,
      stderr: stderrText,
      timedOut,
      aborted: signal?.aborted ?? false,
    }
    diagnose({
      argv: ['git', ...args],
      cwd,
      exitCode: result.exitCode,
      signal: result.signal ?? null,
      stdoutBytes: result.stdout.length,
      stderrBytes: result.stderr.length,
      stdoutIsStream: handle.stdout !== undefined,
      hasCollected: handle.collected !== undefined,
      milliseconds: Date.now() - started,
      timedOut,
    })
    return result
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancelFromCaller)
  }
}

/** Normalize git's CRLF line endings so model-facing text stays stable. */
export function tidy(text) {
  return text.replace(/\r\n/g, '\n').replace(/\s+$/, '')
}

/** Render one command result as the compact block the model reads. */
export function describeRun(run) {
  const lines = [`$ ${run.argv.join(' ')}`]
  const out = tidy(run.stdout)
  const err = tidy(run.stderr)
  if (out.length > 0) lines.push(out)
  if (err.length > 0) lines.push(`[stderr] ${err}`)
  if (run.timedOut) lines.push('[timed out]')
  else if (run.signal !== null && run.signal !== undefined) lines.push(`[killed by signal: ${run.signal}]`)
  if (run.exitCode !== null && run.exitCode !== 0) lines.push(`[exit code: ${run.exitCode}]`)
  if (lines.length === 1) lines.push('(no output)')
  return lines.join('\n')
}

/** True when the command reported success. */
export function succeeded(run) {
  return run.exitCode === 0
}
