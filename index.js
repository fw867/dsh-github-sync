import { resolveConfig } from './lib/config.js'
import { PLUGIN_REVISION, GithubSyncEngine } from './lib/engine.js'
import { registerCommand } from './lib/command.js'
import { registerTools } from './lib/tools.js'
import { registerDiffRoute, registerMessageRoute } from './lib/route.js'

/**
 * GitHub sync for the workspace.
 *
 * The Host half registers two agent tools (`github_clone`, `github_sync`) and
 * the human `/github` command; all three drive one shared operation engine. The
 * Client half (`./client.js`) renders a composer button whose menu runs that
 * same command, and reads a single file's patch over a Host route when the
 * deployment has one — a click on a row is not a session operation, and should
 * not wait like one.
 *
 * @module dsh-github-sync
 */
export const name = 'github-sync'

/**
 * The tools need the registry and a subprocess seam; the command its registry.
 * `sessionController` is what exposes the calling Session's live model
 * selection, so commit-message generation follows the model shown in the
 * composer instead of the deployment default.
 */
export const inject = ['tools', 'subprocess', 'commands', 'sessionController']

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
  // The diff fast path is optional: a deployment without a web server, or
  // without the connection service that fences plugin routes, keeps the command
  // bridge and registers nothing here. `inject` waits for the three services
  // instead of failing activation when the composition does not offer them.
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer', 'connection', 'sessions'], (routeCtx) => {
      registerDiffRoute(routeCtx, engine)
      registerMessageRoute(routeCtx, engine)
    })
  }
  ctx.logger?.info?.('github-sync %s active (remote %s)', PLUGIN_REVISION, config.remote)
}
