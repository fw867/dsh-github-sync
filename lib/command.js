/**
 * The `/github` human command.
 *
 * It drives the same {@link GithubSyncEngine} the agent tools use, so a button
 * press and a model tool call perform one identical operation. The command
 * reports outcomes as text, and the Host logs its lifecycle, so the result is
 * durable in the session and the Client button needs no result rendering of
 * its own.
 *
 * `status --json` is the one machine-readable form: the composer button uses it
 * to learn whether the workspace holds a repository before it draws its menu.
 */
import { renderOutcome } from './engine.js'

/** Actions the command accepts, in the order its help text lists them. */
export const ACTIONS = ['status', 'pull', 'commit', 'push', 'sync', 'clone', 'init', 'setup']

const HELP = [
  'Usage: /github <action>',
  '',
  '  status        inspect the working tree and the upstream branch',
  '  pull          fetch and integrate the remote branch',
  '  commit        stage everything and commit with a generated subject',
  '  push          publish the current branch',
  '  sync          stage, commit, and push in one step',
  '  clone <repo>  download a repository into the workspace',
  '  init [url]    create a repository here; with a URL it also connects, commits, and pushes',
  '  setup <url>   the same as `init <url>`, under a shorter name',
  '',
  'The repository is looked for in the workspace, then in the configured',
  '`subdirectory`. Pass --dir to aim this invocation somewhere else, which also',
  'works for `status`, `pull`, `commit`, `push`, and `sync`; for `clone` it names',
  'the directory the repository is downloaded into.',
  '',
  'Options:',
  '  -m, --message "<subject>"  override the generated commit subject',
  '  -C, --dir <subdirectory>   the directory that holds (or becomes) the repository',
].join('\n')

/**
 * Split a raw command line into an action, a positional argument, and options.
 *
 * @param raw - everything after the command name.
 * @returns the parsed invocation; `action` is empty when none was given.
 */
export function parseCommandLine(raw) {
  const tokens = []
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g
  let match
  while ((match = pattern.exec(String(raw ?? ''))) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3])
  }
  let message
  let json = false
  let dir
  const positional = []
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === '--message' || token === '-m') {
      message = tokens[index + 1]
      index += 1
      continue
    }
    if (token.startsWith('--message=')) {
      message = token.slice('--message='.length)
      continue
    }
    if (token === '--dir' || token === '-C') {
      dir = tokens[index + 1]
      index += 1
      continue
    }
    if (token.startsWith('--dir=')) {
      dir = token.slice('--dir='.length)
      continue
    }
    if (token === '--json') {
      json = true
      continue
    }
    positional.push(token)
  }
  return { action: positional[0] ?? '', argument: positional[1], message, json, dir }
}

/**
 * Register the `/github` command.
 *
 * @param ctx - the plugin's Cordis context.
 * @param engine - the shared operation engine.
 * @returns the registration disposer.
 */
export function registerCommand(ctx, engine) {
  return ctx.commands.register({
    name: 'github',
    description: 'Sync this workspace with GitHub: status, pull, commit, push, clone, init, or setup.',
    input: { hint: 'status | pull | commit | push | sync | clone <repo> | init [url] | setup <url>' },
    handler: async (invocation) => {
      const parsed = parseCommandLine(invocation.rawInput)
      if (parsed.action === '' || parsed.action === 'help') {
        return { kind: 'success', text: HELP }
      }
      if (!ACTIONS.includes(parsed.action)) {
        return { kind: 'error', text: `unknown action "${parsed.action}"\n\n${HELP}` }
      }
      if (parsed.action === 'status' && parsed.json === true) {
        return { kind: 'success', text: JSON.stringify(await engine.probe(invocation.agent, parsed.dir)) }
      }
      try {
        if (parsed.action === 'clone') {
          if (parsed.argument === undefined) {
            return { kind: 'error', text: 'usage: /github clone <owner/repo | url | path>' }
          }
          const cloned = await engine.clone({
            repo: parsed.argument,
            dir: parsed.dir,
            agent: invocation.agent,
            signal: invocation.signal,
          })
          return { kind: 'success', text: renderOutcome(cloned) }
        }
        if (parsed.action === 'init') {
          // With a URL this finishes the whole job — create if needed, record
          // `origin`, commit, push — so the action a session already knows can
          // publish, without depending on a newly added action name.
          if (parsed.argument !== undefined) {
            const published = await engine.initAndPublish({
              url: parsed.argument,
              message: parsed.message,
              dir: parsed.dir,
              agent: invocation.agent,
              signal: invocation.signal,
            })
            const publishedText = renderOutcome(published)
            return published.ok ? { kind: 'success', text: publishedText } : { kind: 'error', text: publishedText }
          }
          const initialized = await engine.init({
            dir: parsed.dir,
            agent: invocation.agent,
            signal: invocation.signal,
          })
          return { kind: 'success', text: renderOutcome(initialized) }
        }
        if (parsed.action === 'setup') {
          if (parsed.argument === undefined) {
            return {
              kind: 'error',
              text: 'usage: /github setup <owner/repo | url> [--dir <subdirectory>]\n\nCreate the repository on GitHub first, then run this to connect, commit, and push.',
            }
          }
          const connected = await engine.initAndPublish({
            url: parsed.argument,
            message: parsed.message,
            dir: parsed.dir,
            agent: invocation.agent,
            signal: invocation.signal,
          })
          const connectedText = renderOutcome(connected)
          return connected.ok ? { kind: 'success', text: connectedText } : { kind: 'error', text: connectedText }
        }
        const outcome = await engine.sync({
          action: parsed.action,
          repo: parsed.dir,
          message: parsed.message,
          agent: invocation.agent,
          signal: invocation.signal,
        })
        const text = renderOutcome(outcome)
        return outcome.ok ? { kind: 'success', text } : { kind: 'error', text }
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
    },
  })
}
