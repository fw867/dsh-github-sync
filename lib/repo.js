import fs from 'node:fs'
import path from 'node:path'
import { runGit, succeeded } from './git.js'

/** GitHub HTTPS host used for short `owner/repo` references. */
const GITHUB_HOST = 'github.com'

/**
 * Normalize a repository reference into a clean URL without credentials.
 *
 * Accepts `owner/repo`, `github.com/owner/repo`, `https://…`, `git@…:owner/repo`,
 * `ssh://…`, and — so the tools also work against a local mirror — an absolute
 * filesystem path or a `file://` URL. Embedded credentials are dropped so
 * nothing secret is written into `.git/config`; the token travels as a
 * per-command HTTP header instead.
 */
export function parseRepoRef(input) {
  const raw = String(input ?? '').trim()
  if (raw.length === 0) throw new Error('invalid repository: expected a non-empty string')

  // A local path or file URL is a legitimate clone source (tests, mirrors, shares).
  if (/^file:\/\//i.test(raw)) {
    const url = new URL(raw)
    const localPath = decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:)/, '$1')
    return { url: raw, host: 'file', webUrl: localPath }
  }
  if (path.isAbsolute(raw)) {
    return { url: raw, host: 'file', webUrl: raw }
  }

  // git@github.com:owner/repo(.git) and ssh://git@github.com/owner/repo
  const scp = /^(?:ssh:\/\/)?(?:[^@/]+@)?([^:/]+)(?::|\/)(.+)$/.exec(raw)
  const isScpLike = /^[^/@\s]+@[^:/\s]+:.+$/.test(raw) || raw.startsWith('ssh://')

  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw)
    url.username = ''
    url.password = ''
    return { url: url.toString().replace(/\/$/, ''), host: url.hostname, webUrl: stripGit(cleanUrl(url)) }
  }
  if (isScpLike && scp !== null) {
    const host = scp[1]
    const slug = scp[2].replace(/^\/+/, '')
    return { url: `https://${host}/${slug}`, host, webUrl: `https://${host}/${stripGit(slug)}` }
  }
  if (/^[^/\s]+\/[^/\s]+$/.test(raw)) {
    return {
      url: `https://${GITHUB_HOST}/${raw}`,
      host: GITHUB_HOST,
      webUrl: `https://${GITHUB_HOST}/${stripGit(raw)}`,
    }
  }
  // Bare `host/owner/repo` without a scheme.
  if (/^[^/\s@]+\/[^/\s]+\/[^/\s]+$/.test(raw)) {
    const [host, ...rest] = raw.split('/')
    const slug = rest.join('/')
    return { url: `https://${host}/${slug}`, host, webUrl: `https://${host}/${stripGit(slug)}` }
  }
  throw new Error(`invalid repository: cannot interpret ${JSON.stringify(raw)} as a GitHub repository`)
}

/** Repository directory name derived from a normalized reference. */
export function repoDirectoryName(parsed) {
  if (parsed.host === 'file') {
    const name = path.basename(parsed.webUrl)
    const cleaned = stripGit(name)
    if (cleaned.length === 0) throw new Error(`invalid repository: no name in ${parsed.webUrl}`)
    return cleaned
  }
  const slug = stripGit(new URL(parsed.url).pathname.replace(/^\/+/, ''))
  const name = slug.split('/').pop()
  if (name === undefined || name.length === 0) throw new Error(`invalid repository: no name in ${parsed.url}`)
  return name
}

function cleanUrl(url) {
  return url.toString().replace(/\/$/, '')
}

function stripGit(slug) {
  return slug.replace(/\.git$/i, '')
}

/** True when `directory` exists and holds a `.git` entry. */
export function hasGitDirectory(directory) {
  try {
    return fs.existsSync(path.join(directory, '.git'))
  } catch {
    return false
  }
}

/** True when `directory` exists and is empty. */
export function isEmptyDirectory(directory) {
  try {
    return fs.readdirSync(directory).length === 0
  } catch {
    return false
  }
}

/** Resolve a model-supplied absolute path, or the session workspace when absent. */
export function resolveDirectory(cwd, requested) {
  const base = cwd === undefined || cwd.length === 0 ? process.cwd() : cwd
  if (requested === undefined || String(requested).trim().length === 0) return path.resolve(base)
  const trimmed = String(requested).trim()
  return path.isAbsolute(trimmed) ? path.normalize(trimmed) : path.resolve(base, trimmed)
}

/** Where a clone should land, given an explicit target or a repo-derived name. */
export function resolveCloneTarget(baseDirectory, directoryName) {
  const trimmed = directoryName === undefined ? '' : String(directoryName).trim()
  if (trimmed.length === 0) return baseDirectory
  if (path.isAbsolute(trimmed)) return path.normalize(trimmed)
  return path.resolve(baseDirectory, trimmed)
}

/** Locate the repository root at or above `directory`. */
export async function findRepositoryRoot(ctx, options) {
  const run = await runGit(ctx, {
    git: options.git,
    cwd: options.directory,
    args: ['rev-parse', '--show-toplevel'],
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  })
  if (!succeeded(run)) return undefined
  const root = run.stdout.replace(/\r?\n/g, '').trim()
  return root.length > 0 ? path.resolve(root) : undefined
}

/** Read one `git config --get` value, or `undefined` when unset. */
export async function readGitConfig(ctx, options) {
  const run = await runGit(ctx, {
    git: options.git,
    cwd: options.cwd,
    args: ['config', '--get', options.key],
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  })
  if (!succeeded(run)) return undefined
  const value = run.stdout.replace(/\r?\n/g, '').trim()
  return value.length > 0 ? value : undefined
}

/** Current branch name, or `undefined` on a detached HEAD. */
export async function currentBranch(ctx, options) {
  const run = await runGit(ctx, {
    git: options.git,
    cwd: options.cwd,
    args: ['rev-parse', '--abbrev-ref', 'HEAD'],
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  })
  if (!succeeded(run)) return undefined
  const branch = run.stdout.replace(/\r?\n/g, '').trim()
  return branch.length > 0 && branch !== 'HEAD' ? branch : undefined
}

/** Resolve the token from explicit config, then the configured environment variable. */
export function resolveToken(gitConfig, env = process.env) {
  const configured = String(gitConfig.token ?? '').trim()
  if (configured.length > 0) return configured
  const name = String(gitConfig.tokenEnv ?? '').trim()
  if (name.length === 0) return undefined
  const value = env[name]
  return value === undefined || String(value).trim().length === 0 ? undefined : String(value).trim()
}
