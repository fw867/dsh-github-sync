import { resolveConfig } from './lib/config.js'
import { PLUGIN_REVISION, GithubSyncEngine } from './lib/engine.js'
import { registerCommand } from './lib/command.js'
import { registerTools } from './lib/tools.js'

/**
 * GitHub sync for the workspace.
 *
 * The Host half registers two agent tools (`github_clone`, `github_sync`) and
 * the human `/github` command; all three drive one shared operation engine. The
 * Client half (`./client.js`) renders a composer button whose menu runs that
 * same command.
 *
 * @module dsh-github-sync
 */
export const name = 'github-sync'

/** The tools need the registry and a subprocess seam; the command its registry. */
export const inject = ['tools', 'subprocess', 'commands']

/**
 * Activate the plugin.
 *
 * @param ctx - the plugin's Cordis context.
 * @param rawConfig - the row's `config` from the loader patch, if any.
 */
export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig)
  const engine = new GithubSyncEngine(ctx, config)
  registerTools(ctx, config)
  ctx.effect(() => registerCommand(ctx, engine))
  ctx.logger?.info?.('github-sync %s active (remote %s)', PLUGIN_REVISION, config.remote)
}
