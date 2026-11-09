/**
 * The diff route: fenced, POST-only, and honest about what it refuses.
 *
 * The route hands a browser a repository read, so the checks in front of the
 * engine are the whole point: an untrusted request never reaches git, an
 * unknown session is named rather than guessed at, and a path that leaves the
 * repository is refused before it becomes a pathspec.
 *
 * Run: node test/diff-route.mjs
 */
import { EventEmitter } from 'node:events'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN = path.resolve(HERE, '..')
const { registerDiffRoute, registerMessageRoute } = await import(`file:///${PLUGIN.replace(/\\/g, '/')}/lib/route.js`)

let failed = 0
const ok = (text, cond, extra) => {
  if (!cond) failed += 1
  console.log(cond ? 'ok  ' : 'FAIL', text, cond ? '' : JSON.stringify(extra))
}

/** A request that answers its body on the next tick. */
function request({ method = 'POST', body = '', rejection } = {}) {
  const req = new EventEmitter()
  req.method = method
  req.url = '/github-sync/diff'
  req.headers = {}
  req.destroy = () => {}
  setImmediate(() => {
    if (body !== '') req.emit('data', Buffer.from(body, 'utf8'))
    req.emit('end')
  })
  req.rejection = rejection
  return req
}

/** A response that keeps what it was told. */
function response() {
  return {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) {
      this.status = status
      this.headers = headers ?? {}
    },
    end(text) {
      this.body = text ?? ''
    },
  }
}

/** A harness whose engine answers a fixed patch and records its arguments. */
function harness({ rejection, cwd = '/repo', text = 'PATCH' } = {}) {
  const calls = []
  const ctx = {
    effect: (cb) => {
      cb()
      return () => {}
    },
    webServer: {
      register(route) {
        ctx.route = route
        return () => {}
      },
    },
    connection: { requestRejection: () => rejection },
    sessions: { get: (id) => (id === 's1' ? { header: { cwd } } : undefined) },
  }
  const engine = {
    async diffText(options) {
      calls.push(options)
      return text
    },
  }
  registerDiffRoute(ctx, engine)
  return { ctx, calls }
}

/** Send one payload through the registered route. */
async function send(route, payload, options) {
  const res = response()
  await route.handler(request({ body: JSON.stringify(payload), ...options }), res)
  await new Promise((resolve) => setImmediate(resolve))
  return { res, json: res.body === '' ? undefined : JSON.parse(res.body) }
}

console.log('=== a good request reaches the engine with the session workspace ===')
{
  const { ctx, calls } = harness()
  const { res, json } = await send(ctx.route, { sessionId: 's1', path: 'src/a.ts', dir: 'sub' })
  ok('it answers 200', res.status === 200, res)
  ok('the patch travels back', json?.ok === true && json.text === 'PATCH', json)
  ok('the engine saw the path', calls[0]?.path === 'src/a.ts', calls[0])
  ok('the engine saw the chosen directory', calls[0]?.dir === 'sub', calls[0])
  ok('the engine saw the session workspace', calls[0]?.agent?.session?.header?.cwd === '/repo', calls[0])
  ok('the answer is not cacheable', res.headers['cache-control'] === 'no-store', res.headers)
}

console.log('\n=== a staged review says so ===')
{
  const { ctx, calls } = harness()
  await send(ctx.route, { sessionId: 's1', path: 'a.ts', staged: true })
  ok('the index side is passed through', calls[0]?.staged === true, calls[0])
}

console.log('\n=== the fence runs before anything else ===')
{
  const { ctx, calls } = harness({ rejection: 403 })
  const { res } = await send(ctx.route, { sessionId: 's1', path: 'a.ts' })
  ok('an untrusted request is refused', res.status === 403, res)
  ok('the engine is never reached', calls.length === 0, calls)
}

console.log('\n=== the request is checked before the engine ===')
{
  const { ctx, calls } = harness()
  const wrongMethod = await send(ctx.route, { sessionId: 's1', path: 'a.ts' }, { method: 'GET' })
  ok('a GET is refused', wrongMethod.res.status === 405, wrongMethod.res)
  ok('the refusal names the method', wrongMethod.res.headers.allow === 'POST', wrongMethod.res.headers)

  const noSession = await send(ctx.route, { path: 'a.ts' })
  ok('a request without a session is refused', noSession.res.status === 400, noSession.res)

  const outside = await send(ctx.route, { sessionId: 's1', path: '../secret' })
  ok('a climbing path is refused', outside.res.status === 400, outside.res)

  const unknown = await send(ctx.route, { sessionId: 'nope', path: 'a.ts' })
  ok('an unknown session is named', unknown.res.status === 404 && JSON.parse(unknown.res.body).error.code === 'unknown-session', unknown.res)

  ok('none of those reached the engine', calls.length === 0, calls)
}

console.log('\n=== a body that is not JSON is refused ===')
{
  const { ctx, calls } = harness()
  const res = response()
  await ctx.route.handler(request({ body: 'not json' }), res)
  await new Promise((resolve) => setImmediate(resolve))
  ok('a malformed body is a bad request', res.status === 400, res)
  ok('the engine is not asked', calls.length === 0, calls)
}

console.log('\n=== an engine failure is reported, not thrown ===')
{
  const ctx = {
    effect: (cb) => {
      cb()
      return () => {}
    },
    webServer: { register(route) { ctx.route = route; return () => {} } },
    connection: { requestRejection: () => undefined },
    sessions: { get: () => ({ header: { cwd: '/repo' } }) },
  }
  registerDiffRoute(ctx, { async diffText() { throw new Error('no git repository here') } })
  const { res, json } = await send(ctx.route, { sessionId: 's1', path: 'a.ts' })
  ok('the failure is a 500', res.status === 500, res)
  ok('its reason travels', json?.ok === false && json.error.message.includes('no git repository'), json)
}

console.log('\n=== the message route asks the engine for a message, fenced the same way ===')
{
  const calls = []
  const ctx = {
    effect: (cb) => { cb(); return () => {} },
    webServer: { register(route) { ctx.route = route; return () => {} } },
    connection: { requestRejection: () => undefined },
    sessions: { get: (id) => (id === 's1' ? { header: { cwd: '/repo' } } : undefined) },
  }
  const engine = {
    async suggestMessage(options) {
      calls.push(options)
      return { subject: 'feat(ui): a box', body: '- read the tree' }
    },
  }
  registerMessageRoute(ctx, engine)
  ok('the route is registered at its own path', ctx.route?.path === '/github-sync/message', ctx.route?.path)

  const { res, json } = await send(ctx.route, { sessionId: 's1', files: ['src/a.ts', '../escape', '/abs'] })
  ok('it answers 200', res.status === 200, res)
  ok('the message travels whole', json?.ok === true && json.message.subject === 'feat(ui): a box' && json.message.body === '- read the tree', json)
  ok('only repository-relative paths are forwarded', JSON.stringify(calls[0]?.files) === JSON.stringify(['src/a.ts']), calls[0])
  ok('the engine saw the session workspace', calls[0]?.agent?.session?.header?.cwd === '/repo', calls[0])

  const wrongMethod = await send(ctx.route, { sessionId: 's1' }, { method: 'GET' })
  ok('a GET is refused', wrongMethod.res.status === 405, wrongMethod.res)

  const unknown = await send(ctx.route, { sessionId: 'nope' })
  ok('an unknown session is 404', unknown.res.status === 404, unknown.res)
}

console.log(failed === 0 ? '\nRESULT: ALL CHECKS PASSED' : `\nRESULT: ${failed} FAILURE(S)`)
process.exit(failed === 0 ? 0 : 1)
