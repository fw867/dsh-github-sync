/**
 * The Host route the client's diff tab reads.
 *
 * A slash command is a session operation: it is recorded in the conversation,
 * serialized with the session's other work, and answered through the Remote
 * bridge. Reading one file's patch is none of those things — it is a read of the
 * working tree that a browser tab asks for on a click — so the same engine
 * answers it directly over HTTP, the way the sidebar's own file routes do. The
 * command path stays as the fallback for a deployment without a web server or a
 * connection service.
 *
 * The route is fenced like every other plugin route: the connection service
 * decides whether the request comes from a trusted, authenticated page, and this
 * module never invents a second policy.
 */

/** The exact path the client posts to. */
export const DIFF_ROUTE = '/github-sync/diff'

/** The message-box route: a suggested commit message, generated on demand. */
export const MESSAGE_ROUTE = '/github-sync/message'

/** A patch request is two short strings and one optional directory. */
const MAX_BODY_BYTES = 64 * 1024

/** Every answer is JSON, and none of it may be cached by the browser. */
function respond(res, status, body, headers = {}) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    ...headers,
  })
  res.end(text)
}

/** The body as text, bounded; a client that sends more is refused. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/**
 * Whether a path is one this route may read.
 *
 * The pathspec is resolved inside the repository, so an absolute path or one
 * climbing out of it is refused rather than handed to git.
 */
export function isRepoRelative(path) {
  if (typeof path !== 'string' || path.length === 0 || path.includes('\0')) return false
  if (/^[A-Za-z]:[\\/]/.test(path) || path.startsWith('/') || path.startsWith('\\')) return false
  return !path.split(/[\\/]/).includes('..')
}

/**
 * Register the diff route on the Host.
 *
 * The caller runs this inside `ctx.inject(['webServer', 'connection',
 * 'sessions'])`: a deployment missing any of them keeps the command fallback and
 * registers nothing.
 *
 * @param ctx - the context that owns the three services.
 * @param engine - the shared operation engine.
 * @returns the route's disposer.
 */
export function registerDiffRoute(ctx, engine) {
  // A route this one cannot fence must not exist at all: the connection service
  // is the only admission policy a plugin route may use, and inventing a second
  // one here would be the bug.
  if (typeof ctx.connection?.requestRejection !== 'function') return () => {}
  return ctx.effect(() => {
    try {
      return ctx.webServer.register({
        kind: 'exact',
        path: DIFF_ROUTE,
        handler: async (req, res) => {
          const rejection = ctx.connection.requestRejection(req)
          if (rejection !== undefined) {
            respond(res, rejection, { ok: false, error: { code: 'forbidden', message: 'request not admitted' } })
            return
          }
          if (req.method !== 'POST') {
            respond(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } }, { allow: 'POST' })
            return
          }
          let payload
          try {
            payload = JSON.parse(await readBody(req))
          } catch {
            respond(res, 400, { ok: false, error: { code: 'bad-request', message: 'a JSON body is required' } })
            return
          }
          const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : ''
          const file = payload?.path
          if (sessionId.length === 0 || !isRepoRelative(file)) {
            respond(res, 400, { ok: false, error: { code: 'bad-request', message: 'sessionId and a repository-relative path are required' } })
            return
          }
          const session = ctx.sessions.get(sessionId)
          const cwd = session?.header?.cwd
          if (cwd === undefined) {
            respond(res, 404, { ok: false, error: { code: 'unknown-session', message: 'this session is not open on the Host' } })
            return
          }
          const dir = typeof payload?.dir === 'string' && payload.dir.length > 0 ? payload.dir : undefined
          try {
            const text = await engine.diffText({
              // The engine reads the workspace exactly as it does for a command;
              // only the shape it reads it from differs.
              agent: { session: { header: { cwd } } },
              path: file,
              staged: payload?.staged === true,
              dir,
            })
            respond(res, 200, { ok: true, text })
          } catch (error) {
            respond(res, 500, {
              ok: false,
              error: { code: 'git', message: error instanceof Error ? error.message : String(error) },
            })
          }
        },
      })
    } catch (error) {
      // A duplicate path throws — another copy of this plugin already owns the
      // route. The command bridge still answers, so this copy stays usable.
      ctx.logger?.warn?.('github-sync: the diff route is already registered', error)
      return () => {}
    }
  }, 'dsh-github-sync: /github-sync/diff route')
}

/**
 * Register the message route on the Host.
 *
 * The message box asks the model while a person waits. A slash command would put
 * that wait behind the session's command bridge and leave a row in the
 * conversation for a request nobody asked to see; the same engine answers here
 * instead, under the same fence as the diff route.
 *
 * @param ctx - the context that owns the three services.
 * @param engine - the shared operation engine.
 * @returns the route's disposer.
 */
export function registerMessageRoute(ctx, engine) {
  if (typeof ctx.connection?.requestRejection !== 'function') return () => {}
  return ctx.effect(() => {
    try {
      return ctx.webServer.register({
        kind: 'exact',
        path: MESSAGE_ROUTE,
        handler: async (req, res) => {
          const rejection = ctx.connection.requestRejection(req)
          if (rejection !== undefined) {
            respond(res, rejection, { ok: false, error: { code: 'forbidden', message: 'request not admitted' } })
            return
          }
          if (req.method !== 'POST') {
            respond(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } }, { allow: 'POST' })
            return
          }
          let payload
          try {
            payload = JSON.parse(await readBody(req))
          } catch {
            respond(res, 400, { ok: false, error: { code: 'bad-request', message: 'a JSON body is required' } })
            return
          }
          const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : ''
          if (sessionId.length === 0) {
            respond(res, 400, { ok: false, error: { code: 'bad-request', message: 'sessionId is required' } })
            return
          }
          const session = ctx.sessions.get(sessionId)
          const cwd = session?.header?.cwd
          if (cwd === undefined) {
            respond(res, 404, { ok: false, error: { code: 'unknown-session', message: 'this session is not open on the Host' } })
            return
          }
          const dir = typeof payload?.dir === 'string' && payload.dir.length > 0 ? payload.dir : undefined
          const files = Array.isArray(payload?.files) ? payload.files.filter(isRepoRelative) : []
          try {
            const message = await engine.suggestMessage({
              agent: { session: { header: { cwd } } },
              dir,
              files,
            })
            respond(res, 200, { ok: true, message })
          } catch (error) {
            respond(res, 500, {
              ok: false,
              error: { code: 'message', message: error instanceof Error ? error.message : String(error) },
            })
          }
        },
      })
    } catch (error) {
      ctx.logger?.warn?.('github-sync: the message route is already registered', error)
      return () => {}
    }
  }, 'dsh-github-sync: /github-sync/message route')
}
