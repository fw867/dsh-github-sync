/**
 * Private-repository authentication.
 *
 * Three methods can authenticate an operation, and the order is what "use the
 * setup this machine already has" means in practice:
 *
 * 1. `ssh` — the system's own SSH identity: a key in `~/.ssh`, an entry in
 *    `~/.ssh/config`, an `SSH_AUTH_SOCK` agent, or ssh-agent identities. It is
 *    preferred because it is the setup the person already made for every other
 *    git client, and it needs nothing stored per repository.
 * 2. `token` — the plugin's `token`/`tokenEnv`, sent as a per-command HTTP
 *    header, so it never reaches `.git/config` and cannot leak through
 *    `git remote -v`.
 * 3. `system` — the system credential helper (Git Credential Manager and
 *    friends), reached by handing git the plain remote URL. This is what a
 *    machine with an already signed-in GitHub account uses.
 *
 * A failed attempt falls through to the next one **only when the failure looks
 * like an authentication failure**: a rejected push or a diverged branch must
 * never be retried under a different identity, because the second attempt could
 * succeed somewhere the first one intentionally failed.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Methods `auth: auto` tries, in order. */
export const AUTH_ORDER = ['ssh', 'token', 'system']

/** The methods a config value may name explicitly. */
export const AUTH_SETTINGS = ['auto', ...AUTH_ORDER]

/** Key files that make an SSH identity present without asking an agent. */
const SSH_KEY_FILES = ['id_ed25519', 'id_ecdsa', 'id_rsa', 'id_dsa']

/**
 * Whether a failure is worth another authentication method.
 *
 * The patterns are git's and ssh's own wording for "you are not who you say you
 * are"; anything else — a non-fast-forward, a missing repository the token can
 * also not see, a hook rejection — is reported as-is.
 */
export function isAuthFailure(text) {
  return /authentication failed|permission denied|could not read (?:Username|Password)|terminal prompts disabled|host key verification failed|publickey|repository not found|invalid username or password|403 forbidden|access denied/i.test(
    String(text ?? ''),
  )
}

/** The hostname a remote URL names, for the transport that carries it. */
export function hostOfRemote(remoteUrl) {
  const raw = String(remoteUrl ?? '').trim()
  if (raw.length === 0) return undefined
  // A local path has no host, and `D:/mirror` would otherwise read as the scp
  // form `host:path` with the host `D`.
  if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('/') || raw.startsWith('\\\\') || /^file:\/\//i.test(raw)) {
    return undefined
  }
  const http = /^https?:\/\/(?:[^@/]+@)?([^:/]+)/i.exec(raw)
  if (http !== null) return http[1]
  const ssh = /^ssh:\/\/(?:[^@/]+@)?([^:/]+)/i.exec(raw)
  if (ssh !== null) return ssh[1]
  // Any other URL scheme is not something this plugin knows how to route.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return undefined
  const scp = /^(?:[^@/]+@)?([^:/]+):/i.exec(raw)
  return scp === null ? undefined : scp[1]
}

/** True when a remote URL is already carried by ssh. */
export function isSshRemote(remoteUrl) {
  const raw = String(remoteUrl ?? '').trim()
  return /^ssh:\/\//i.test(raw) || /^[^/@\s]+@[^:/\s]+:.+$/.test(raw)
}

/**
 * The ssh form of a parsed repository reference.
 *
 * `#repo.js` normalizes every remote to an https URL, so the ssh form is derived
 * from it rather than from what the caller typed: `git@github.com:owner/repo.git`
 * for `https://github.com/owner/repo.git`.
 */
export function sshUrlOf(parsed) {
  if (parsed === undefined || parsed === null || parsed.host === 'file') return undefined
  let pathname
  try {
    pathname = new URL(parsed.url).pathname
  } catch {
    return undefined
  }
  const slug = pathname.replace(/^\/+/, '')
  return slug.length === 0 ? undefined : `git@${parsed.host}:${slug}`
}

/**
 * The `-c` override that routes one command over ssh without touching the
 * remote.
 *
 * `url.<ssh>.insteadOf = <https>` is the same rewrite people put in their global
 * config by hand; passing it per command means a repository whose `origin` is
 * https can be fetched over ssh for this call alone, leaving `.git/config`
 * exactly as the user left it.
 */
export function sshRoutingConfig(remoteUrl) {
  const host = hostOfRemote(remoteUrl)
  if (host === undefined || isSshRemote(remoteUrl)) return []
  return ['-c', `url.git@${host}:.insteadOf=https://${host}/`]
}

/**
 * What the machine itself offers for ssh, without touching the network.
 *
 * A live handshake is deliberately not part of this: it costs a connection on
 * every operation, and a wrong guess is recoverable — the caller falls through
 * to the next method when ssh turns out not to work.
 *
 * @param options.home - the user's home directory, for `~/.ssh`.
 * @param options.env - the environment carrying `SSH_AUTH_SOCK` and `GIT_SSH_COMMAND`.
 * @param options.agentIdentities - identities `ssh-add -l` reported, when probed.
 * @returns `{ usable, evidence }` — evidence is human-readable, for the report.
 */
export function sshAvailability(options = {}) {
  const home = options.home ?? os.homedir()
  const env = options.env ?? process.env
  const directory = path.join(home, '.ssh')
  const evidence = []

  for (const name of SSH_KEY_FILES) {
    try {
      if (fs.existsSync(path.join(directory, name))) evidence.push(`~/.ssh/${name}`)
    } catch {
      // An unreadable home directory is not an ssh setup.
    }
  }

  let config = ''
  try {
    config = fs.readFileSync(path.join(directory, 'config'), 'utf8')
  } catch {
    config = ''
  }
  if (/^\s*Host\s+\S*github\S*/im.test(config)) evidence.push('~/.ssh/config has a github host entry')
  if (/^\s*IdentityFile\s+\S+/im.test(config)) evidence.push('~/.ssh/config names an IdentityFile')

  const command = String(env.GIT_SSH_COMMAND ?? '').trim()
  if (command.length > 0) evidence.push('GIT_SSH_COMMAND is set')
  const sock = String(env.SSH_AUTH_SOCK ?? '').trim()
  if (sock.length > 0) evidence.push('SSH_AUTH_SOCK is set')
  if (typeof options.agentIdentities === 'number' && options.agentIdentities > 0) {
    evidence.push(`ssh-agent holds ${options.agentIdentities} identit${options.agentIdentities === 1 ? 'y' : 'ies'}`)
  }

  return { usable: evidence.length > 0, evidence }
}

/** Identities an ssh-agent holds, or 0 when there is no agent to ask. */
export async function agentIdentities(run) {
  const result = await run(['ssh-add', '-l'])
  if (result.exitCode !== 0) return 0
  const text = String(result.stdout ?? '').trim()
  if (text.length === 0 || /no identities/i.test(text)) return 0
  return text.split('\n').filter((line) => line.trim().length > 0).length
}

/**
 * The methods one operation may try, in order.
 *
 * `setting` is the `auth` config value: `auto` keeps every available method in
 * {@link AUTH_ORDER}; a named method keeps only that one, which is how a
 * deployment pins authentication it has verified.
 */
export function resolveAuthMethods(options) {
  const setting = String(options.setting ?? 'auto')
    .trim()
    .toLowerCase()
  const sshReady = options.ssh?.usable === true || options.isSsh === true
  const available = {
    ssh: sshReady,
    token: options.hasToken === true,
    system: true,
  }
  if (setting !== 'auto' && AUTH_ORDER.includes(setting)) {
    return available[setting] ? [setting] : []
  }
  return AUTH_ORDER.filter((method) => available[method])
}

/**
 * Turn the chosen methods into what a git command needs.
 *
 * @param options.methods - the ordered method names.
 * @param options.token - the resolved token, for the `token` method.
 * @param options.host - the host the remote is on, for the token header.
 * @param options.remoteUrl - the remote URL in use, which decides whether ssh
 *   needs an `insteadOf` rewrite.
 * @param options.parsed - the parsed reference, for a clone that can use the
 *   ssh URL outright.
 * @returns an ordered list of `{ method, prefix, url? }` attempts.
 */
export function authAttempts(options) {
  const { methods, token, host, remoteUrl, parsed } = options
  const attempts = []
  for (const method of methods) {
    if (method === 'ssh') {
      if (parsed !== undefined && parsed.host !== 'file') {
        const url = sshUrlOf(parsed)
        if (url !== undefined) attempts.push({ method, prefix: [], url })
      } else {
        const prefix = sshRoutingConfig(remoteUrl)
        if (prefix.length > 0) attempts.push({ method, prefix })
      }
      continue
    }
    if (method === 'token') {
      if (typeof token !== 'string' || token.length === 0) continue
      attempts.push({ method, prefix: authHeaderConfig(token, host) })
      continue
    }
    attempts.push({ method, prefix: [] })
  }
  return attempts
}

/**
 * The `-c` override that authenticates one HTTPS command.
 *
 * The token never enters the remote URL, so it cannot leak through
 * `.git/config`, `git remote -v`, or a later push of repository metadata.
 */
export function authHeaderConfig(token, host) {
  const basic = Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64')
  return ['-c', `http.https://${host}/.extraHeader=Authorization: Basic ${basic}`]
}
