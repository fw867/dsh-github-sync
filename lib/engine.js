import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runGit, describeRun, succeeded, tidy } from './git.js'
import {
  parseRepoRef,
  repoDirectoryName,
  hasGitDirectory,
  isEmptyDirectory,
  resolveDirectory,
  resolveCloneTarget,
  findRepositoryRoot,
  readGitConfig,
  currentBranch,
  resolveToken,
} from './repo.js'
import {
  agentIdentities,
  authAttempts,
  hostOfRemote,
  isAuthFailure,
  isSshRemote,
  resolveAuthMethods,
  sshAvailability,
} from './auth.js'
import { gatherCommitContext, generateSubject, markerLine } from './commit.js'
import { countChanges, parseStatus, renderChanges, selectPaths, summarizeChanges } from './changes.js'

/** How long a single git command may run before it is cancelled. */
const COMMAND_TIMEOUT_MS = 600000
/** Time allowed for the one-off probe commands such as `git --version`. */
const PROBE_TIMEOUT_MS = 20000
/** The host a token is sent to when nothing else names one. */
const DEFAULT_HOST = 'github.com'
/** How much of a patch one report may carry before it is cut. */
const MAX_DIFF_CHARS = 60000
/** How many changed paths a probe reports before it summarizes the rest. */
const MAX_PROBE_CHANGES = 100
/** How many branches a probe reports before it summarizes the rest. */
const MAX_PROBE_BRANCHES = 20
/** Plugin revision, reported in activation diagnostics. */
export const PLUGIN_REVISION = 'rev15'

/**
 * Resolve the workspace directory a call acts on from the calling session.
 *
 * The session header carries the workspace cwd; a session without one has no
 * default repository, so callers must name `repo` explicitly.
 */
export function sessionCwd(agent) {
  const cwd = agent?.session?.header?.cwd
  return typeof cwd === 'string' && cwd.length > 0 ? cwd : undefined
}

/** Resolve the git executable, failing with an actionable message when missing. */
async function resolveGit(ctx, signal) {
  try {
    return await ctx.subprocess.resolveExecutable('git', undefined, signal)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`git is not available in this environment (${detail})`)
  }
}

/** One step of a multi-step operation, as reported to both call surfaces. */
function step(name, status, extra) {
  return { step: name, status, ...(extra ?? {}) }
}

/**
 * The line of ssh output that explains what happened.
 *
 * ssh writes its own notices first — a newly recorded host key above all — and
 * reporting that as the reason for a failure hides the reason.
 */
function explainLine(text) {
  const lines = String(text ?? '')
    .split('\n')
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0)
  const reason = lines.find((candidate) =>
    /permission denied|host key verification|could not resolve|connection (?:timed out|refused|closed)|no such file|publickey|authentication failed/i.test(
      candidate,
    ),
  )
  if (reason !== undefined) return reason
  return lines.find((candidate) => !/^warning:/i.test(candidate)) ?? lines[0] ?? '(no output)'
}

/**
 * Remove anything credential-shaped from text that reaches a report.
 *
 * A token travels as a request header and never as an argument, so this is
 * belt-and-braces: no message that reports a failed attempt may carry a secret,
 * whatever a future command or a proxy decides to echo.
 */
function redact(text) {
  return String(text ?? '')
    .replace(/Authorization: Basic \S+/gi, 'Authorization: Basic <redacted>')
    .replace(/(https?:\/\/)[^@/\s]+@/gi, '$1')
}

/** The failure text of an authenticated attempt, with what every method said. */
function failureText(result) {
  const run = result?.run ?? {}
  const base = redact(tidy(run.stderr) || tidy(run.stdout) || `exit code ${run.exitCode}`)
  const tried = Array.isArray(result?.tried) ? result.tried.filter((line) => line.length > 0) : []
  return tried.length > 1 ? `${base} (methods tried — ${tried.join('; ')})` : base
}

/**
 * What a commit step reports: the message that landed, then git's own summary.
 *
 * `describeRun` echoes the command line, which for a commit now holds a whole
 * multi-paragraph message — so the message is shown once, as a message, followed
 * by the lines `git commit` printed about it.
 */
function commitOutput(run, subject, body, ci) {
  const paragraphs = [subject]
  if (body !== undefined && body.length > 0) paragraphs.push(body)
  if (ci !== undefined) paragraphs.push(ci)
  const message = paragraphs.join('\n\n')
  const summary = [tidy(run.stdout), tidy(run.stderr)].filter((part) => part.length > 0).join('\n')
  return summary.length === 0 ? message : `${message}\n\n${summary}`
}

/** The note a commit or amend step carries: why the message, what, and for CI. */
function describeCommitStep({ note, selected, ci }) {
  const parts = []
  if (note !== undefined) parts.push(note)
  if (Array.isArray(selected) && selected.length > 0) {
    parts.push(`committed ${selected.length} selected path${selected.length === 1 ? '' : 's'}`)
  }
  if (ci !== undefined) parts.push(`CI markers: ${ci}`)
  return parts.length === 0 ? undefined : parts.join('; ')
}

/** One change as the probe reports it: the path, and git's two status letters. */
function probeChange(entry) {
  return entry.from === undefined ? [entry.path, entry.code] : [entry.path, entry.code, entry.from]
}

/** The counts the control's header draws, as `[total, staged]`. */
function probeCounts(changes) {
  const counts = countChanges(changes)
  return [counts.total, counts.staged]
}

/**
 * A caller's path list as clean strings: one path, many, or none.
 *
 * Both call surfaces reach the same code, and a model may send a string where
 * the schema says array; normalizing here keeps every path-taking action
 * behaving the same way.
 */
function normalizePathList(input) {
  const raw = Array.isArray(input) ? input : input === undefined || input === null ? [] : [input]
  const seen = new Set()
  const paths = []
  for (const value of raw) {
    const path = String(value ?? '').trim()
    if (path.length === 0 || seen.has(path)) continue
    seen.add(path)
    paths.push(path)
  }
  return paths
}

/**
 * Read whether a directory holds anything.
 *
 * A directory that cannot be read is reported as non-empty: assuming "empty"
 * would permit a clone into a folder whose real contents are unknown.
 *
 * @param directory - the absolute directory to inspect.
 * @returns `{ empty, entries? }`, where `entries` counts what was found.
 */
function readDirectory(directory) {
  try {
    const names = fs.readdirSync(directory)
    return names.length === 0 ? { empty: true } : { empty: false, entries: names.length }
  } catch {
    return { empty: false }
  }
}

/**
 * The git operations shared by the agent tools and the human command.
 *
 * Both callers describe the workspace the same way and receive the same
 * outcome object, so a push started from the button and one started by the
 * model cannot diverge.
 */
export class GithubSyncEngine {
  /** @param ctx - the plugin's Cordis context. @param config - resolved configuration. */
  constructor(ctx, config) {
    this.ctx = ctx
    this.config = config
    this.timeoutMs = Number.isFinite(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : COMMAND_TIMEOUT_MS
  }

  /**
   * Resolve the repository a call acts on.
   *
   * @param agent - the calling session's agent, which supplies the workspace.
   * @param requested - an explicit repository directory, or nothing.
   * @returns `{ root, runIn, git, token, workspace }`.
   */
  async locate(agent, requested) {
    const cwd = sessionCwd(agent)
    if (cwd === undefined) {
      throw new Error(
        'this call has no session workspace; pass an absolute `repo` directory instead of relying on the default',
      )
    }
    const workspace = path.resolve(cwd)
    const git = await resolveGit(this.ctx, undefined)
    const token = resolveToken(this.config)
    const candidate = resolveDirectory(workspace, requested)
    const root = await findRepositoryRoot(this.ctx, {
      git,
      directory: candidate,
      timeoutMs: this.timeoutMs,
      signal: undefined,
    })
    if (root === undefined) {
      const where = path.relative(workspace, candidate)
      const label = where.length === 0 || where.startsWith('..') ? candidate : `${workspace} (${where})`
      throw new Error(
        `no git repository at ${label}; run github_clone first to download a GitHub repository into this workspace`,
      )
    }
    const runIn = (argv, signal) =>
      runGit(this.ctx, { git, cwd: root, args: argv, timeoutMs: this.timeoutMs, signal })
    return { root, runIn, git, token, workspace }
  }

  /** Apply the configured identity only where the repository resolves none. */
  async identityOptions(git, root) {
    const name = await readGitConfig(this.ctx, {
      git,
      cwd: root,
      key: 'user.name',
      timeoutMs: PROBE_TIMEOUT_MS,
    })
    if (name !== undefined) return []
    return ['-c', `user.name=${this.config.gitUserName}`, '-c', `user.email=${this.config.gitUserEmail}`]
  }

  /**
   * What this machine offers for ssh, probed once per engine.
   *
   * The filesystem answers first because it is free: a key file, an
   * `~/.ssh/config` entry, `GIT_SSH_COMMAND`, or `SSH_AUTH_SOCK`. Only when
   * nothing is found is the agent asked, because a key can live in an agent
   * without any key file being present.
   */
  async sshCapability() {
    if (this.sshProbe === undefined) {
      this.sshProbe = (async () => {
        const local = sshAvailability({ env: process.env, home: os.homedir() })
        if (local.usable) return local
        let identities = 0
        try {
          identities = await agentIdentities((argv) =>
            runGit(this.ctx, {
              git: argv[0],
              cwd: process.cwd(),
              args: argv.slice(1),
              timeoutMs: PROBE_TIMEOUT_MS,
            }),
          )
        } catch {
          identities = 0
        }
        return sshAvailability({ env: process.env, home: os.homedir(), agentIdentities: identities })
      })()
    }
    return this.sshProbe
  }

  /** The URL of a named remote, or `undefined` when it has none. */
  async remoteUrlOf(repo, remote, signal) {
    const result = await repo.runIn(['remote', 'get-url', remote], signal)
    const url = succeeded(result) ? tidy(result.stdout).trim() : ''
    return url.length > 0 ? url : undefined
  }

  /**
   * A repository handle for a root the caller has already resolved.
   *
   * {@link locate} builds the same shape from a session workspace; the probe
   * resolves its own root and needs one for the authenticated fetch it may run.
   */
  repositoryHandle(git, root, workspace) {
    return {
      root,
      git,
      workspace: workspace ?? root,
      token: resolveToken(this.config),
      runIn: (argv, signal) =>
        runGit(this.ctx, { git, cwd: root, args: argv, timeoutMs: this.timeoutMs, signal }),
    }
  }

  /**
   * The authentication attempts one operation may try, in order.
   *
   * The order is the deployment's `auth` setting, defaulting to the machine's
   * own setup: ssh when it exists, then the plugin token, then the system
   * credential helper.
   */
  async authenticationFor({ repo, remote, parsed, signal }) {
    const token = repo.token ?? resolveToken(this.config)
    const remoteUrl = remote === undefined ? undefined : await this.remoteUrlOf(repo, remote, signal)
    const host = hostOfRemote(remoteUrl) ?? parsed?.host ?? DEFAULT_HOST
    const ssh = await this.sshCapability()
    // `injectToken: false` keeps the token out of every request, so the token
    // method is not offered at all rather than offered and unused.
    const inject = this.config.injectToken !== false
    const methods = resolveAuthMethods({
      setting: this.config.auth,
      ssh,
      isSsh: remoteUrl === undefined ? false : isSshRemote(remoteUrl),
      hasToken: inject && typeof token === 'string' && token.length > 0,
    })
    return {
      host,
      methods,
      ssh,
      remoteUrl,
      token,
      attempts: authAttempts({ methods, token, host, remoteUrl, parsed }),
    }
  }

  /**
   * Run one git command under each authentication attempt until one works.
   *
   * A failed attempt is retried under the next method **only** when the failure
   * looks like an authentication failure; any other refusal is returned to the
   * caller as it is, because a second identity must never be given the chance to
   * succeed where the first one was told no.
   *
   * @returns `{ run, attempt, tried }` — `tried` is what each method reported,
   *   redacted, for the failure message.
   */
  async runAuthenticated({ repo, remote, parsed, signal, build }) {
    const auth = await this.authenticationFor({ repo, remote, parsed, signal })
    const tried = []
    if (auth.attempts.length === 0) {
      return {
        run: {
          argv: [],
          exitCode: 1,
          signal: null,
          stdout: '',
          stderr: `no authentication method is available for auth: ${this.config.auth}`,
          timedOut: false,
        },
        attempt: undefined,
        tried,
        auth,
      }
    }
    let last
    for (const attempt of auth.attempts) {
      const run = await repo.runIn([...attempt.prefix, ...build(attempt)], signal)
      last = run
      if (succeeded(run)) return { run, attempt, tried, auth }
      const text = `${tidy(run.stderr)}\n${tidy(run.stdout)}`
      tried.push(`${attempt.method}: ${redact(explainLine(text))}`)
      if (!isAuthFailure(text)) return { run, attempt, tried, auth }
    }
    return { run: last, attempt: undefined, tried, auth }
  }

  /**
   * Inspect the workspace without requiring a repository.
   *
   * The composer button calls this to decide whether to offer repository
   * actions or the new-repository menu, so it must never throw for the ordinary
   * "no repository yet" state.
   *
   * `slim` answers only what the badge shows — branch, drift, and whether a
   * repository exists at all — without the change list or the branch list. Every
   * probe is a logged command, so the answer that runs on every session mount is
   * kept to the size of the question: the panel's data is asked for when the
   * panel is opened.
   *
   * @returns `{ state: 'repo' | 'empty', workspace, root?, branch?, dirty?, remote?, ahead? }`.
   */
  async probe(agent, requested, options = {}) {
    const slim = options.slim === true
    const cwd = sessionCwd(agent)
    if (cwd === undefined) {
      return {
        state: 'empty',
        workspace: null,
        detail: 'this session has no workspace directory',
        ...this.clientHints(),
      }
    }
    const workspace = path.resolve(cwd)
    // The workspace root is not always where the repository is: a project can
    // live in a subdirectory, and `findRepositoryRoot` walks upward, so it will
    // never find one below. An explicit directory wins; otherwise the configured
    // `subdirectory` applies, which is what lets the control point at the
    // repository that actually exists.
    const chosen = this.resolveSubdirectory(workspace, requested)
    const candidates = this.repositorySubdirectories(workspace)
    let git
    try {
      git = await resolveGit(this.ctx, undefined)
    } catch (error) {
      return {
        state: 'empty',
        workspace,
        detail: error instanceof Error ? error.message : String(error),
        ...this.clientHints(),
      }
    }
    const root = await findRepositoryRoot(this.ctx, {
      git,
      directory: chosen.directory,
      timeoutMs: PROBE_TIMEOUT_MS,
    })
    if (root === undefined) {
      // Whether the folder already holds files is reported for the caller's
      // copy, not as a permission: a clone gets a directory of its own, so a
      // workspace that already holds files is no obstacle to one. It is what
      // tells the menu to explain that the clone lands beside them.
      const listing = readDirectory(workspace)
      return {
        state: 'empty',
        workspace,
        // What to look at next time, and what this workspace could point at.
        subdirectory: chosen.relative,
        ...(candidates.length > 0 ? { subdirectories: candidates } : {}),
        empty: listing.empty,
        ...(listing.empty ? {} : { entries: listing.entries }),
        ...this.clientHints(),
      }
    }
    const runIn = (argv) => runGit(this.ctx, { git, cwd: root, args: argv, timeoutMs: PROBE_TIMEOUT_MS })
    // Refresh remote-tracking refs first when asked, so the ahead/behind counts
    // below describe the remote now. A fetch never touches the working tree, the
    // index, or local branches; merging what it finds stays a deliberate action.
    // A fetch that fails is not the probe's failure: the counts then describe
    // the last successful fetch, which is still the best answer available.
    if (this.config.fetchOnStatus === true) {
      // The fetch authenticates like every other command: a private repository
      // must report current counts rather than a permanent `stale`.
      const fetched = await this.runAuthenticated({
        repo: this.repositoryHandle(git, root, workspace),
        remote: this.config.remote,
        signal: undefined,
        build: () => ['fetch', '--quiet', this.config.remote],
      })
      if (!succeeded(fetched.run)) {
        return this.describeRepository({
          git,
          root,
          workspace,
          runIn,
          fetchFailed: true,
          subdirectory: chosen.relative,
          candidates,
        })
      }
    }
    return this.describeRepository({
      git,
      root,
      workspace,
      runIn,
      subdirectory: chosen.relative,
      candidates,
      slim,
    })
  }

  /**
   * Decide which directory a probe or operation should look in.
   *
   * An explicit request wins, then the configured `subdirectory`, then the
   * workspace itself. `relative` is reported so the control can show and change
   * the choice.
   */
  resolveSubdirectory(workspace, requested) {
    const explicit = typeof requested === 'string' && requested.trim().length > 0 ? requested.trim() : undefined
    const want = explicit ?? this.configuredSubdirectory()
    if (want === undefined) return { directory: workspace, relative: null }
    const resolved = resolveDirectory(workspace, want)
    return { directory: resolved, relative: path.relative(workspace, resolved) || null }
  }

  /** The configured subdirectory, if any, as a non-empty string. */
  configuredSubdirectory() {
    return typeof this.config.subdirectory === 'string' && this.config.subdirectory.trim().length > 0
      ? this.config.subdirectory.trim()
      : undefined
  }

  /**
   * Immediate subdirectories that are repositories themselves.
   *
   * A workspace root that is not a repository can still contain one, and the
   * control offers these as targets. Only the first level is inspected: deeper
   * trees are not what "the repository in this workspace" means.
   */
  repositorySubdirectories(workspace) {
    let names
    try {
      names = fs.readdirSync(workspace)
    } catch {
      return []
    }
    return names
      .filter((name) => !name.startsWith('.'))
      .filter((name) => {
        try {
          return fs.statSync(path.join(workspace, name)).isDirectory()
        } catch {
          return false
        }
      })
      .filter((name) => fs.existsSync(path.join(workspace, name, '.git')))
      .sort()
  }

  /**
   * Read one repository's state for the composer control.
   *
   * @param options.git - the resolved git executable.
   * @param options.root - the repository root.
   * @param options.workspace - the workspace directory the call belongs to.
   * @param options.runIn - runs git inside `root`.
   * @param options.fetchFailed - whether a requested fetch did not succeed.
   */
  async describeRepository(options) {
    const { git, root, workspace, runIn, fetchFailed, subdirectory, candidates, slim } = options
    const branch = (await currentBranch(this.ctx, { git, cwd: root, timeoutMs: PROBE_TIMEOUT_MS })) ?? null
    // One porcelain read answers both "is anything changed" and "which paths may
    // be named", so the control can offer a change list without a second command.
    // `--untracked-files=all` is what makes that list selectable: the default
    // collapses a new directory into `sub/`, which is not a path anyone picked.
    const changes = parseStatus((await runIn(['status', '--porcelain=v1', '-z', '--untracked-files=all'])).stdout)
    const dirty = changes.length > 0
    // What the list may show, and therefore what a commit records: modifications
    // to files git already tracks. An untracked file is a file git does not have
    // yet, and a tracked path matched by `.gitignore` is one the repository says
    // it does not want — git keeps reporting the second kind because a commit
    // would include it, but the list and the commit agree here instead.
    const strict = this.config.changesScope !== 'all'
    let ignored = new Set()
    if (strict) {
      const listed = await runIn(['ls-files', '--cached', '--ignored', '--exclude-standard', '-z'])
      if (succeeded(listed)) {
        ignored = new Set(
          tidy(listed.stdout)
            .split('\0')
            .map((line) => line.trim())
            .filter((line) => line.length > 0),
        )
      }
    }
    const visible = strict ? changes.filter((entry) => !entry.untracked && !ignored.has(entry.path)) : changes
    // Everything the list leaves out is still disclosed as a count: a repository
    // whose only change is a new file must not look untouched.
    const hidden = changes.length - visible.length
    const remoteRun = await runIn(['remote', 'get-url', this.config.remote])
    const remote = succeeded(remoteRun) ? tidy(remoteRun.stdout).trim() || null : null
    const aheadRun = await runIn(['rev-list', '--count', `@{u}..HEAD`])
    const behindRun = await runIn(['rev-list', '--count', `HEAD..@{u}`])
    // The branch list is what lets the control offer a switch without a second
    // command. A repository that cannot list its branches still has a state to
    // report, so a failure here degrades to "not reported" rather than to an
    // error the menu would have to explain. A slim answer does not ask for it.
    let branches
    if (slim !== true) {
      try {
        branches = await this.listBranches({ repo: { root, git, runIn }, signal: undefined })
      } catch {
        branches = undefined
      }
    }
    return {
      state: 'repo',
      workspace,
      branch,
      dirty,
      // A change entry is a `[path, code]` pair and nothing else: the words a
      // person reads are derived where they are rendered, and the answer travels
      // as the text of a logged command row, so it carries only what the caller
      // cannot work out for itself.
      ...(slim === true
        ? { changes: [], counts: probeCounts(visible) }
        : {
            changes: visible.slice(0, MAX_PROBE_CHANGES).map(probeChange),
            ...(visible.length > MAX_PROBE_CHANGES ? { changesTruncated: true } : {}),
            counts: probeCounts(visible),
          }),
      ...(hidden > 0 ? { hidden } : {}),
      ...(branches === undefined
        ? {}
        : {
            branches: branches.slice(0, MAX_PROBE_BRANCHES).map((entry) => ({
              name: entry.name,
              current: entry.current,
              ahead: entry.ahead,
              behind: entry.behind,
              ...(entry.gone === true ? { gone: true } : {}),
            })),
            ...(branches.length > MAX_PROBE_BRANCHES ? { branchesTruncated: true } : {}),
          }),
      remote,
      ahead: succeeded(aheadRun) ? Number(tidy(aheadRun.stdout)) || 0 : null,
      behind: succeeded(behindRun) ? Number(tidy(behindRun.stdout)) || 0 : null,
      ...(subdirectory ? { subdirectory } : {}),
      ...(Array.isArray(candidates) && candidates.length > 0 ? { subdirectories: candidates } : {}),
      ...(fetchFailed === true ? { stale: true } : {}),
      ...this.clientHints(),
    }
  }

  /**
   * Configuration the composer control needs but cannot read for itself.
   *
   * The Client has no access to the plugin's config, so the answer that reaches
   * it carries what decides when it may check the workspace.
   */
  clientHints() {
    return {
      statusOnMount: this.config.statusOnMount !== false,
      // The revision of the Host half that answered. The control has its own
      // build marker, and a page reload updates that one while the Host keeps the
      // module it loaded at startup — so the two are reported separately, and
      // "which half am I running" stops being a guess.
      revision: PLUGIN_REVISION,
    }
  }

  /**
   * Create a repository, by default in the session's workspace.
   *
   * This is the "no `.git` here yet" path: it initializes a repository, points
   * `origin` at a remote when one is given, and stages everything so the first
   * commit is one `/github commit` away.
   *
   * `dir` chooses *which* directory becomes the repository. Git's root is the
   * directory it is initialized in, and every path committed is relative to that
   * directory — so a repository created at the workspace root publishes
   * `<workspace>/<subfolder>/…`, while one created inside a subfolder publishes
   * that subfolder's contents at the remote root. Choosing the wrong one is the
   * difference between a remote that holds your project and one that holds a
   * folder containing it.
   */
  async init(options) {
    const { branch, url, dir, agent, signal } = options
    const cwd = sessionCwd(agent)
    if (cwd === undefined) {
      throw new Error('this call has no session workspace; open a workspace directory first')
    }
    const workspace = path.resolve(cwd)
    const workspaceRepo = resolveDirectory(workspace, dir)
    // Both checks come before any git call. Handing git a directory that does
    // not exist surfaces as a bare `spawn git ENOENT`, which names neither the
    // directory nor the problem.
    if (!fs.existsSync(workspaceRepo)) {
      throw new Error(`${workspaceRepo} does not exist; create the directory before initializing a repository there`)
    }
    // A `.git` entry is the same evidence git itself uses, and it is read
    // without spawning anything. Checking it first means a false negative from
    // `git rev-parse` can never lead to creating a repository inside an existing
    // one — a plain `git init` there would otherwise succeed silently.
    if (fs.existsSync(path.join(workspaceRepo, '.git'))) {
      throw new Error(`${workspaceRepo} already contains .git; there is nothing to initialize`)
    }
    const git = await resolveGit(this.ctx, signal)
    const root = await findRepositoryRoot(this.ctx, {
      git,
      directory: workspaceRepo,
      timeoutMs: PROBE_TIMEOUT_MS,
      signal,
    })
    if (root !== undefined) {
      throw new Error(`${root} is already a git repository; there is nothing to initialize`)
    }
    const steps = []
    const run = (argv) =>
      runGit(this.ctx, { git, cwd: workspaceRepo, args: argv, timeoutMs: this.timeoutMs, signal })
    const name = typeof branch === 'string' && branch.trim().length > 0 ? branch.trim() : this.config.branch
    const initRun = await run(['init', ...(name.length > 0 ? ['-b', name] : [])])
    if (!succeeded(initRun)) {
      throw new Error(`git init failed: ${tidy(initRun.stderr) || `exit code ${initRun.exitCode}`}`)
    }
    steps.push(step('init', 'completed', { output: describeRun(initRun) }))

    if (typeof url === 'string' && url.trim().length > 0) {
      const parsed = parseRepoRef(url.trim())
      const remoteRun = await run(['remote', 'add', this.config.remote, parsed.url])
      if (!succeeded(remoteRun)) {
        throw new Error(`git remote add failed: ${tidy(remoteRun.stderr) || `exit code ${remoteRun.exitCode}`}`)
      }
      steps.push(step('remote', 'completed', { detail: `${this.config.remote} → ${parsed.webUrl}`, output: describeRun(remoteRun) }))
    }

    const staged = await this.stageAll({ root: workspaceRepo, runIn: run, git }, signal)
    steps.push(
      step('stage', 'completed', {
        detail: staged.length === 0 ? 'nothing to stage yet' : `${staged.length} file(s) staged`,
      }),
    )
    const branchNow = await currentBranch(this.ctx, { git, cwd: workspaceRepo, timeoutMs: PROBE_TIMEOUT_MS, signal })
    return {
      ok: true,
      repository: url !== undefined && String(url).trim().length > 0 ? String(url).trim() : workspaceRepo,
      root: workspaceRepo,
      workspace,
      branch: branchNow ?? null,
      remote: this.config.remote,
      unchanged: true,
      steps,
    }
  }

  async isDirty(repo, signal) {
    const status = await repo.runIn(['status', '--porcelain'], signal)
    return tidy(status.stdout).trim().length > 0
  }

  /**
   * The working tree's changes, structured.
   *
   * One call answers both questions a caller has — is anything changed, and
   * which paths may be named — so no surface has to parse porcelain itself.
   */
  async readChanges(repo, signal) {
    const status = await repo.runIn(['status', '--porcelain=v1', '-z', '--untracked-files=all'], signal)
    if (!succeeded(status)) {
      throw new Error(`git status failed: ${tidy(status.stderr) || `exit code ${status.exitCode}`}`)
    }
    return parseStatus(status.stdout)
  }

  /**
   * Stage the named paths, and only them.
   *
   * `-A` is deliberate: it stages a deletion and a rename of a named path too,
   * which is what "stage this file" means once it has been deleted or moved.
   */
  async stagePaths({ repo, files, signal }) {
    if (files.length === 0) throw new Error('no paths given: pass the files to stage')
    const add = await repo.runIn(['add', '-A', '--', ...files], signal)
    if (!succeeded(add)) {
      throw new Error(`git add failed: ${tidy(add.stderr) || `exit code ${add.exitCode}`}`)
    }
    return add
  }

  /**
   * Unstage the named paths, leaving the working tree alone.
   *
   * `git restore --staged` is the readable form and needs git 2.23; `reset` is
   * the older equivalent and needs a commit to reset against, which a repository
   * without a first commit does not have — hence the third form.
   */
  async unstagePaths({ repo, files, signal }) {
    if (files.length === 0) throw new Error('no paths given: pass the files to unstage')
    const restore = await repo.runIn(['restore', '--staged', '--', ...files], signal)
    if (succeeded(restore)) return restore
    const reset = await repo.runIn(['reset', '-q', 'HEAD', '--', ...files], signal)
    if (succeeded(reset)) return reset
    return repo.runIn(['rm', '--cached', '-r', '-q', '--', ...files], signal)
  }

  /** Whether the repository has a commit to compare against. */
  async hasHead(repo, signal) {
    return succeeded(await repo.runIn(['rev-parse', '--verify', '--quiet', 'HEAD'], signal))
  }

  /**
   * The patch for the named paths, or for everything.
   *
   * `head` is the review view — what committing these paths as they stand would
   * record — and falls back to the index on a repository with no commit yet.
   * `index` is what is staged, `worktree` is what is not.
   */
  async diffOf({ repo, files, mode, stat, signal }) {
    const tail = files.length === 0 ? ['.'] : files
    const argv = ['diff']
    if (mode === 'index') argv.push('--cached')
    else if (mode === 'head') {
      if (await this.hasHead(repo, signal)) argv.push('HEAD')
      else argv.push('--cached')
    }
    if (stat === true) argv.push('--stat')
    argv.push('--', ...tail)
    const run = await repo.runIn(argv, signal)
    if (!succeeded(run)) {
      throw new Error(`git diff failed: ${tidy(run.stderr) || `exit code ${run.exitCode}`}`)
    }
    const text = tidy(run.stdout)
    return {
      run,
      text: text.length <= MAX_DIFF_CHARS ? text : `${text.slice(0, MAX_DIFF_CHARS)}\n…[diff truncated at ${MAX_DIFF_CHARS} characters]`,
      truncated: text.length > MAX_DIFF_CHARS,
    }
  }

  /**
   * Stage the working tree for a commit.
   *
   * With the default scope this stages **changes to files git already has**: a
   * modification, a deletion, or a rename is recorded, while a file git does not
   * track is left alone. That is deliberate — the menu's change list is what the
   * button records, and a new file is not on it, so staging it here would commit
   * something the list never showed.
   *
   * A tracked path matched by `.gitignore` is a case git itself keeps reporting,
   * because a commit would include it. The strict scope excludes those too, by
   * naming them as pathspec exclusions rather than by rewriting the index.
   *
   * @returns the staged paths, as `git diff --cached --name-only` reports them.
   */
  async stageAll(repo, signal) {
    const strict = this.config.changesScope !== 'all'
    const excluded = strict ? await this.ignoredTracked(repo, signal) : []
    const add = await repo.runIn(
      strict
        ? ['add', '--update', '--', '.', ...excluded.map((path) => `:(exclude)${path}`)]
        : ['add', '-A', '--', '.'],
      signal,
    )
    if (!succeeded(add)) {
      throw new Error(`git add failed: ${tidy(add.stderr) || `exit code ${add.exitCode}`}`)
    }
    const staged = await repo.runIn(['diff', '--cached', '--name-only'], signal)
    return tidy(staged.stdout)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  }

  /**
   * The paths git tracks that `.gitignore` also matches.
   *
   * Git keeps reporting these because a commit includes them; the strict scope
   * treats `.gitignore` as the last word instead, so they are excluded from both
   * the list and the commit.
   */
  async ignoredTracked(repo, signal) {
    const listed = await repo.runIn(['ls-files', '--cached', '--ignored', '--exclude-standard', '-z'], signal)
    if (!succeeded(listed)) return []
    return tidy(listed.stdout)
      .split('\0')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  }

  /**
   * Commit the staged changes, with an explicit subject or a generated one.
   *
   * `paths` narrows the commit to those files — `git commit --only` records them
   * and leaves every other staged change staged — and narrows the context the
   * subject is generated from, so the message describes the commit that lands
   * rather than everything that was dirty.
   */
  async commitStaged({ repo, files, paths, subject, markers, allowEmpty, agent, signal }) {
    if (files.length === 0 && allowEmpty !== true) return step('commit', 'skipped', { detail: 'nothing to commit' })
    // Named paths are staged by the caller, and staging the working tree can
    // leave a named path with nothing to record — a file edited back to its
    // committed content is the ordinary case. That is "nothing to commit" for
    // the paths asked about, not a failure.
    if (paths !== undefined && paths.length > 0) {
      const staged = await repo.runIn(['diff', '--cached', '--quiet', '--', ...paths], signal)
      if (succeeded(staged)) {
        return step('commit', 'skipped', {
          detail: `nothing to commit in ${paths.length} selected path${paths.length === 1 ? '' : 's'}`,
        })
      }
    }
    const identity = await this.identityOptions(repo.git, repo.root)
    const scope = paths === undefined || paths.length === 0 ? [] : ['--only', '--', ...paths]
    // A CI marker is its own paragraph at the end, so it can ride both a written
    // message and a generated one without touching the subject.
    const ci = markerLine(markers)
    const markerArgs = ci === undefined ? [] : ['-m', ci]
    if (subject !== undefined) {
      const commit = await repo.runIn(['commit', '-m', subject, ...markerArgs, ...identity, ...scope], signal)
      if (!succeeded(commit)) {
        throw new Error(
          `git commit failed: ${tidy(commit.stderr) || tidy(commit.stdout) || `exit code ${commit.exitCode}`}`,
        )
      }
      return step('commit', 'completed', {
        subject,
        source: 'provided',
        detail: describeCommitStep({ selected: paths, ci }),        output: commitOutput(commit, subject, undefined, ci),
      })
    }

    const context = await gatherCommitContext({
      run: (argv, sig) => repo.runIn(argv, sig),
      config: this.config,
      paths,
      signal,
    })
    const generated = await generateSubject({
      ctx: this.ctx,
      agent,
      context,
      fileCount: files.length,
      config: this.config,
      signal,
    })
    // A generated body travels as a second `-m`, which is how git joins the
    // paragraphs; a subject on its own stays a one-line commit.
    const bodyArgs = generated.body === undefined ? [] : ['-m', generated.body]
    const commit = await repo.runIn(
      ['commit', '-m', generated.subject, ...bodyArgs, ...markerArgs, ...identity, ...scope],
      signal,
    )
    if (!succeeded(commit)) {
      throw new Error(
        `git commit failed: ${tidy(commit.stderr) || tidy(commit.stdout) || `exit code ${commit.exitCode}`}`,
      )
    }
    return step('commit', 'completed', {
      subject: generated.subject,
      source: generated.source,
      // Why a fallback was used, when one was: the deterministic subject is the
      // visible symptom, and this is the only place its cause is reported.
      detail: describeCommitStep({
        note:
          generated.detail === undefined
            ? undefined
            : `subject generated by the ${generated.source === 'model' ? 'model' : 'deterministic fallback'}: ${generated.detail}`,
        selected: paths,
        ci,
      }),
      output: commitOutput(commit, generated.subject, generated.body, ci),
    })
  }

  async pull({ repo, remote, branch, signal }) {
    const pull = await this.runAuthenticated({
      repo,
      remote,
      signal,
      build: () => [
        'pull',
        ...(this.config.pullRebase === true ? ['--rebase', '--autostash'] : []),
        remote,
        ...(branch === undefined ? [] : [branch]),
      ],
    })
    if (!succeeded(pull.run)) {
      throw new Error(
        `git pull failed: ${failureText(pull)}. Resolve the reported divergence or conflict, then retry.`,
      )
    }
    return step('pull', 'completed', {
      detail: pull.attempt === undefined ? undefined : `authenticated over ${pull.attempt.method}`,
      output: describeRun(pull.run),
    })
  }

  /**
   * Publish the current branch, or a named one.
   *
   * `force` is **always** `--force-with-lease`, never a bare `--force`: the lease
   * is what makes the overwrite conditional on the remote still being where this
   * clone last saw it, so a colleague's push cannot be thrown away silently.
   */
  async push({ repo, remote, branch, signal, force }) {
    const hasUpstream = succeeded(
      await repo.runIn(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], signal),
    )
    const push = await this.runAuthenticated({
      repo,
      remote,
      signal,
      build: () =>
        branch === undefined
          ? ['push', ...(force === true ? ['--force-with-lease'] : []), remote]
          : ['push', ...(force === true ? ['--force-with-lease'] : []), ...(hasUpstream ? [] : ['-u']), remote, branch],
    })
    if (!succeeded(push.run)) {
      throw new Error(
        `git push failed: ${failureText(push)}. Check the remote URL, the credentials, and whether the branch has diverged from its upstream.`,
      )
    }
    return step('push', 'completed', {
      detail: [
        push.attempt === undefined ? undefined : `authenticated over ${push.attempt.method}`,
        force === true ? 'forced with --force-with-lease' : undefined,
      ]
        .filter((part) => part !== undefined)
        .join('; ') || undefined,
      output: describeRun(push.run),
    })
  }

  /**
   * Every local branch, with what it tracks.
   *
   * `for-each-ref` is one call and needs no worktree: the language here is what
   * the control and the model both read, so it carries the upstream, how far it
   * has drifted, and which branch is checked out.
   */
  async listBranches({ repo, signal }) {
    const format = [
      '%(refname:short)',
      '%(objectname:short)',
      '%(upstream:short)',
      '%(upstream:track,nobracket)',
      '%(committerdate:relative)',
      '%(HEAD)',
    ].join('%09')
    const run = await repo.runIn(['for-each-ref', `--format=${format}`, '--sort=-committerdate', 'refs/heads'], signal)
    if (!succeeded(run)) {
      throw new Error(`git for-each-ref failed: ${tidy(run.stderr) || `exit code ${run.exitCode}`}`)
    }
    return tidy(run.stdout)
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const [name, sha, upstream, track, when, head] = line.split('\t')
        const text = String(track ?? '')
        return {
          name,
          sha: sha ?? '',
          upstream: upstream === undefined || upstream.length === 0 ? null : upstream,
          ahead: Number(/ahead (\d+)/.exec(text)?.[1] ?? 0) || 0,
          behind: Number(/behind (\d+)/.exec(text)?.[1] ?? 0) || 0,
          gone: /gone/.test(text),
          when: when ?? '',
          current: head === '*',
        }
      })
  }

  /** Switch to a branch, creating it first when `create` is set. */
  async switchBranch({ repo, name, create, from, signal }) {
    const target = String(name ?? '').trim()
    if (target.length === 0) throw new Error('a branch name is required')
    const start = String(from ?? '').trim()
    const args =
      create === true
        ? ['switch', '-c', target, ...(start.length === 0 ? [] : [start])]
        : ['switch', target]
    let run = await repo.runIn(args, signal)
    if (!succeeded(run) && /not a git command|unknown option/i.test(`${run.stderr}${run.stdout}`)) {
      // `git switch` needs 2.23; `checkout` does the same job on anything older.
      const fallback =
        create === true
          ? ['checkout', '-b', target, ...(start.length === 0 ? [] : [start])]
          : ['checkout', target]
      run = await repo.runIn(fallback, signal)
    }
    if (!succeeded(run)) {
      const reason = tidy(run.stderr) || tidy(run.stdout) || `exit code ${run.exitCode}`
      const dirty = await this.isDirty(repo, signal)
      throw new Error(
        `${create === true ? 'creating' : 'switching to'} ${target} failed: ${reason}${dirty ? '. The working tree has uncommitted changes; commit them first, or stash them by hand' : ''}`,
      )
    }
    return { run, name: target }
  }

  /**
   * Delete a local branch.
   *
   * `git branch -d` refuses to delete a branch whose commits are not merged
   * anywhere, which is the behaviour worth keeping: `force` is what says "yes,
   * really", and it has to be asked for by name.
   */
  async deleteBranch({ repo, name, force, signal }) {
    const target = String(name ?? '').trim()
    if (target.length === 0) throw new Error('a branch name is required')
    const current = await currentBranch(this.ctx, { git: repo.git, cwd: repo.root, timeoutMs: PROBE_TIMEOUT_MS, signal })
    if (current === target) {
      throw new Error(
        `${target} is the checked-out branch; switch to another branch first (or undo the last commit instead)`,
      )
    }
    const exists = await repo.runIn(['show-ref', '--verify', '--quiet', `refs/heads/${target}`], signal)
    if (!succeeded(exists)) throw new Error(`no local branch named ${target}`)
    const run = await repo.runIn(['branch', force === true ? '-D' : '-d', '--', target], signal)
    if (!succeeded(run)) {
      throw new Error(
        `deleting ${target} failed: ${tidy(run.stderr) || tidy(run.stdout) || `exit code ${run.exitCode}`}. An unmerged branch needs \`force\`; the remote branch is not touched either way.`,
      )
    }
    return { run, name: target, forced: force === true }
  }

  /**
   * Rewrite the last commit.
   *
   * The subject is generated like any other commit's — from the staged changes,
   * narrowed to `paths` when they are named — unless one is given, and
   * `keepMessage` leaves the existing message alone for the ordinary "add the
   * file I forgot" case.
   */
  async amendHead({ repo, paths, subject, markers, keepMessage, agent, signal }) {
    if (!(await this.hasHead(repo, signal))) throw new Error('there is no commit to amend yet')
    const previous = tidy((await repo.runIn(['log', '-1', '--pretty=%s'], signal)).stdout)
    // Nothing staged and nothing named means the rewrite would change nothing but
    // the commit's identity. That is worth refusing rather than doing quietly: the
    // usual intent is "fold in the file I forgot", and it needs the path.
    const nothingStaged = succeeded(await repo.runIn(['diff', '--cached', '--quiet'], signal))
    if (nothingStaged && (paths === undefined || paths.length === 0) && subject === undefined) {
      return step('amend', 'skipped', {
        detail:
          'nothing is staged, so amending would rewrite the commit unchanged; name the files to fold in (`files`), stage them first, or pass a subject to rewrite the message',
      })
    }
    const identity = await this.identityOptions(repo.git, repo.root)
    const scope = paths === undefined || paths.length === 0 ? [] : ['--only', '--', ...paths]
    const ci = markerLine(markers)
    let finalSubject = subject
    let generated
    if (finalSubject === undefined && keepMessage !== true) {
      const context = await gatherCommitContext({
        run: (argv, sig) => repo.runIn(argv, sig),
        config: this.config,
        paths,
        signal,
      })
      generated = await generateSubject({
        ctx: this.ctx,
        agent,
        context,
        fileCount: paths === undefined || paths.length === 0 ? undefined : paths.length,
        config: this.config,
        signal,
      })
      finalSubject = generated.subject
    }
    const argv = ['commit', '--amend', ...identity]
    if (finalSubject === undefined) argv.push('--no-edit')
    else {
      argv.push('-m', finalSubject)
      if (generated?.body !== undefined) argv.push('-m', generated.body)
      if (ci !== undefined) argv.push('-m', ci)
    }
    argv.push(...scope)
    const run = await repo.runIn(argv, signal)
    if (!succeeded(run)) {
      throw new Error(`git commit --amend failed: ${tidy(run.stderr) || tidy(run.stdout) || `exit code ${run.exitCode}`}`)
    }
    const branch = await currentBranch(this.ctx, { git: repo.git, cwd: repo.root, timeoutMs: PROBE_TIMEOUT_MS, signal })
    const upstream = await repo.runIn(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], signal)
    return step('amend', 'completed', {
      subject: finalSubject ?? previous,
      ...(generated === undefined ? {} : { source: generated.source }),
      detail: [
        `revised "${previous}"`,
        upstream === undefined || !succeeded(upstream)
          ? 'this branch has no upstream yet'
          : 'the branch now differs from its upstream, so publishing it needs force (with a lease)',
        ci === undefined ? undefined : `CI markers: ${ci}`,
      ]
        .filter((part) => part !== undefined)
        .join('; '),
      output: commitOutput(run, finalSubject ?? previous, generated?.body, ci),
    })
  }

  /**
   * Uncommit the last commit, keeping every change staged.
   *
   * `--soft` is the whole point: nothing is discarded, so the operation is
   * reversible by committing again. A harder reset is deliberately not offered —
   * it is the one that loses work, and a wrong click must not be able to.
   */
  async undoLastCommit({ repo, signal }) {
    if (!(await this.hasHead(repo, signal))) throw new Error('there is no commit to undo')
    const parent = await repo.runIn(['rev-parse', '--verify', '--quiet', 'HEAD~1'], signal)
    if (!succeeded(parent)) {
      throw new Error(
        'HEAD is the first commit of this repository, so there is no earlier state to return to',
      )
    }
    const undone = tidy((await repo.runIn(['log', '-1', '--pretty=%h %s'], signal)).stdout)
    const run = await repo.runIn(['reset', '--soft', 'HEAD~1'], signal)
    if (!succeeded(run)) {
      throw new Error(`git reset --soft failed: ${tidy(run.stderr) || `exit code ${run.exitCode}`}`)
    }
    return step('undo', 'completed', {
      detail: `uncommitted "${undone}"; its changes are staged again`,
      output: describeRun(run),
    })
  }

  /** Add `workspace`, `root`, and `repository` identity to a step list. */
  buildOutcome(options) {
    const { repository, repo, branch, remote, steps, unchanged } = options
    return {
      ok: steps.every((entry) => entry.status !== 'failed'),
      repository,
      root: repo.root,
      workspace: repo.workspace,
      branch: branch ?? null,
      remote: remote ?? null,
      unchanged: unchanged === true,
      steps,
    }
  }

  /**
   * Run one repository action.
   *
   * @param options.action - `status`, `pull`, `commit`, `push`, or `sync`.
   * @returns the same outcome shape the tools return.
   */
  async sync(options) {
    const {
      action,
      repo: requested,
      remote: requestedRemote,
      message,
      pull: pullFirst,
      allowEmpty,
      files,
      staged,
      stat,
      name,
      create,
      from,
      force,
      keepMessage,
      markers,
      dir,
      agent,
      signal,
    } = options
    // `auth` inspects the environment, not a repository, and answers with its own
    // steps; routing it here keeps one entry point honest whichever surface calls.
    if (action === 'auth') return this.authenticate({ dir, agent, signal })
    // An explicit `dir` selects the subdirectory; otherwise the configured one
    // applies, so every action lands on the same repository the control shows.
    const repo = await this.locate(agent, requested ?? this.configuredSubdirectory())
    const remote = typeof requestedRemote === 'string' && requestedRemote.trim().length > 0 ? requestedRemote.trim() : this.config.remote
    const remoteCheck = await repo.runIn(['remote', 'get-url', remote], signal)
    // A repository with no remote is a legitimate state, not an error: it is
    // exactly what `/github init` produces, and a fresh repository must still be
    // committable before anyone decides where it should be published.
    const remoteMissing = !succeeded(remoteCheck)
    const repository = remoteMissing ? repo.root : tidy(remoteCheck.stdout).trim()
    const branch = await currentBranch(this.ctx, {
      git: repo.git,
      cwd: repo.root,
      timeoutMs: PROBE_TIMEOUT_MS,
      signal,
    })
    const steps = []
    const runStep = async (name, body) => {
      try {
        steps.push(await body())
        return true
      } catch (error) {
        steps.push(step(name, 'failed', { detail: error instanceof Error ? error.message : String(error) }))
        return false
      }
    }
    /** Record the missing remote where the blocked step would have gone. */
    const noteRemoteMissing = (name) =>
      steps.push(
        step(name, 'skipped', {
          detail: `no "${remote}" remote is configured, so nothing was published. Connect one and retry.`,
        }),
      )

    if (action === 'branches' || action === 'switch' || action === 'delete-branch') {
      if (action === 'branches') {
        const branches = await this.listBranches({ repo, signal })
        steps.push(
          step('branches', 'completed', {
            detail: `${branches.length} local branch${branches.length === 1 ? '' : 'es'}`,
            output: renderBranches(branches),
          }),
        )
        return this.buildOutcome({ repository, repo, branch, remote, steps })
      }
      if (action === 'switch') {
        const switched = await runStep('switch', () =>
          this.switchBranch({ repo, name, create: create === true, from, signal }),
        )
        const now = await currentBranch(this.ctx, { git: repo.git, cwd: repo.root, timeoutMs: PROBE_TIMEOUT_MS, signal })
        if (switched) {
          steps.push(step('branch', 'completed', { detail: `now on ${now ?? '(detached HEAD)'}` }))
        }
        return this.buildOutcome({ repository, repo, branch: now, remote, steps })
      }
      await runStep('delete-branch', () => this.deleteBranch({ repo, name, force: force === true, signal }))
      return this.buildOutcome({ repository, repo, branch, remote, steps })
    }

    if (action === 'undo') {
      await runStep('undo', () => this.undoLastCommit({ repo, signal }))
      const now = await currentBranch(this.ctx, { git: repo.git, cwd: repo.root, timeoutMs: PROBE_TIMEOUT_MS, signal })
      return this.buildOutcome({ repository, repo, branch: now ?? branch, remote, steps })
    }

    if (action === 'amend') {
      const wanted = normalizePathList(options.files)
      let paths
      if (wanted.length > 0) {
        const changes = await this.readChanges(repo, signal)
        const { selected, unknown } = selectPaths(changes, wanted)
        if (unknown.length > 0) throw new Error(`not changed in this repository: ${unknown.join(', ')}`)
        if (selected.length === 0) throw new Error('nothing to amend: no named path is changed')
        await this.stagePaths({ repo, files: selected, signal })
        paths = selected
      }
      const subject = typeof message === 'string' && message.trim().length > 0 ? message.trim() : undefined
      await runStep('amend', () =>
        this.amendHead({ repo, paths, subject, markers, keepMessage: keepMessage === true, agent, signal }),
      )
      const now = await currentBranch(this.ctx, { git: repo.git, cwd: repo.root, timeoutMs: PROBE_TIMEOUT_MS, signal })
      return this.buildOutcome({ repository, repo, branch: now ?? branch, remote, steps })
    }

    if (action === 'status') {
      const dirty = await this.isDirty(repo, signal)
      const status = await repo.runIn(['status', '--short', '--branch'], signal)
      steps.push(
        step('status', 'completed', {
          detail: dirty ? 'working tree has uncommitted changes' : 'working tree clean',
          output: describeRun(status),
        }),
      )
      if (remoteMissing) {
        steps.push(step('remote', 'skipped', { detail: `no "${remote}" remote is configured; this repository is local only` }))
      } else {
        const ahead = await repo.runIn(['rev-list', '--count', '@{u}..HEAD'], signal)
        if (succeeded(ahead)) {
          steps.push(
            step('unpublished', 'completed', { output: `${tidy(ahead.stdout)} commit(s) not on the upstream branch` }),
          )
        }
      }
      return this.buildOutcome({ repository, repo, branch, remote, steps, unchanged: !dirty })
    }

    if (action === 'changes' || action === 'diff' || action === 'stage' || action === 'unstage') {
      const changes = await this.readChanges(repo, signal)
      const wanted = normalizePathList(options.files)
      if (action === 'changes') {
        steps.push(
          step('changes', 'completed', { detail: summarizeChanges(changes), output: renderChanges(changes) }),
        )
        return this.buildOutcome({ repository, repo, branch, remote, steps, unchanged: changes.length === 0 })
      }
      if (action === 'diff') {
        const patch = await this.diffOf({
          repo,
          files: wanted,
          mode: options.staged === true ? 'index' : 'head',
          stat: options.stat === true,
          signal,
        })
        steps.push(
          step('diff', 'completed', {
            detail:
              wanted.length === 0
                ? options.staged === true ? 'everything staged' : 'every change against HEAD'
                : `${wanted.length} path${wanted.length === 1 ? '' : 's'}`,
            output: patch.text.length === 0 ? '(no changes)' : patch.text,
          }),
        )
        return this.buildOutcome({ repository, repo, branch, remote, steps, unchanged: patch.text.length === 0 })
      }
      if (wanted.length === 0) {
        throw new Error(`\`${action}\` needs the paths to act on; run \`changes\` to see them`)
      }
      const { selected, unknown } = selectPaths(changes, wanted)
      if (unknown.length > 0) throw new Error(`not changed in this repository: ${unknown.join(', ')}`)
      if (selected.length === 0) throw new Error(`nothing to ${action}: no named path is changed`)
      const run =
        action === 'stage'
          ? await this.stagePaths({ repo, files: selected, signal })
          : await this.unstagePaths({ repo, files: selected, signal })
      steps.push(
        step(action, 'completed', {
          detail: `${selected.length} path${selected.length === 1 ? '' : 's'}`,
          output: describeRun(run),
        }),
      )
      return this.buildOutcome({ repository, repo, branch, remote, steps })
    }

    if (action === 'pull') {
      if (remoteMissing) {
        noteRemoteMissing('pull')
        return this.buildOutcome({ repository, repo, branch, remote: null, steps })
      }
      await runStep('pull', () => this.pull({ repo, remote, branch, signal }))
      const clean = !(await this.isDirty(repo, signal))
      return this.buildOutcome({ repository, repo, branch, remote, steps, unchanged: clean })
    }

    if (action === 'commit' || action === 'sync') {
      // No named paths means the whole tree, which is what `commit` has always
      // done. Named paths are staged first so the generated subject describes
      // exactly the change that lands, and the commit records those paths alone.
      const wanted = normalizePathList(options.files)
      let files
      let paths
      if (wanted.length === 0) {
        files = await this.stageAll(repo, signal)
      } else {
        const changes = await this.readChanges(repo, signal)
        const { selected, unknown } = selectPaths(changes, wanted)
        if (unknown.length > 0) throw new Error(`not changed in this repository: ${unknown.join(', ')}`)
        if (selected.length === 0) throw new Error(`nothing to commit: no named path is changed`)
        await this.stagePaths({ repo, files: selected, signal })
        files = selected
        paths = selected
      }
      const subject = typeof message === 'string' && message.trim().length > 0 ? message.trim() : undefined
      const committed = await runStep('commit', () =>
        this.commitStaged({ repo, files, paths, subject, markers, allowEmpty: allowEmpty === true, agent, signal }),
      )
      // Nothing to publish and no way to publish it: report both honestly rather
      // than failing the whole action after the commit already landed.
      if (action === 'sync' && remoteMissing) {
        noteRemoteMissing('push')
        const clean = !(await this.isDirty(repo, signal))
        return this.buildOutcome({ repository, repo, branch, remote: null, steps, unchanged: clean })
      }
      if (action === 'sync' && committed !== true) {
        return this.buildOutcome({ repository, repo, branch, remote, steps })
      }
    }

    if (action === 'push' || action === 'sync') {
      if (remoteMissing) {
        noteRemoteMissing('push')
        return this.buildOutcome({ repository, repo, branch, remote: null, steps })
      }
      if (action === 'sync' && pullFirst === true) {
        if (!(await runStep('pull', () => this.pull({ repo, remote, branch, signal })))) {
          return this.buildOutcome({ repository, repo, branch, remote, steps })
        }
      }
      if (!(await runStep('push', () => this.push({ repo, remote, branch, signal, force: force === true })))) {
        return this.buildOutcome({ repository, repo, branch, remote, steps })
      }
    }

    const clean = !(await this.isDirty(repo, signal))
    return this.buildOutcome({ repository, repo, branch, remote, steps, unchanged: clean })
  }

  /**
   * Create a repository here if there is none, connect it to a remote, commit
   * everything, and push — the one action that finishes "empty folder" and
   * "local repository with no remote" alike.
   *
   * It is reached two ways, deliberately: `/github init <url>` extends the
   * action a session already knows, and `/github setup <url>` is the same thing
   * under a shorter name. A session started before an action existed cannot see
   * it — the Host's command module is pinned when the process starts — so
   * riding an existing action keeps the flow working across a plugin update.
   *
   * GitHub repository creation needs credentials and an API route this plugin
   * does not have, so the remote must already exist; its owner is expected to
   * have created it. Everything after that is one call.
   */
  async initAndPublish(options) {
    const { url, branch: requestedBranch, message, markers, dir, agent, signal } = options
    if (typeof url !== 'string' || url.trim().length === 0) {
      throw new Error('a remote URL is required: pass the GitHub repository to publish to')
    }
    const parsed = parseRepoRef(url.trim())
    const steps = []

    // Resolve and check the directory before anything spawns git. Handing git a
    // directory that does not exist surfaces as a bare `spawn git ENOENT`, which
    // names neither the directory nor the problem — and the check below runs git
    // before `init` would get the chance to refuse.
    const cwd = sessionCwd(agent)
    if (cwd === undefined) {
      throw new Error('this call has no session workspace; open a workspace directory first')
    }
    const repoDirectory = resolveDirectory(path.resolve(cwd), dir)
    if (!fs.existsSync(repoDirectory)) {
      throw new Error(
        `${repoDirectory} does not exist; create the directory before publishing from it`,
      )
    }

    // Create the repository here when the folder has none. An existing
    // repository is adopted instead, which is what makes this one action cover
    // both entry points. `dir` names the directory that becomes the repository
    // root, which is what decides whether the remote holds these files or a
    // folder containing them.
    const existingRoot = await this.repositoryRootOrUndefined(agent, signal, dir)
    if (existingRoot === undefined) {
      const created = await this.init({ dir, agent, signal })
      steps.push(...created.steps)
    }

    const repo = await this.locate(agent, dir)

    // Record or correct `origin`. A repository adopted from `git init` has none;
    // one adopted after a change of URL has a stale one.
    const existing = await repo.runIn(['remote', 'get-url', this.config.remote], signal)
    const remoteRun = succeeded(existing)
      ? await repo.runIn(['remote', 'set-url', this.config.remote, parsed.url], signal)
      : await repo.runIn(['remote', 'add', this.config.remote, parsed.url], signal)
    if (!succeeded(remoteRun)) {
      throw new Error(
        `git remote ${succeeded(existing) ? 'set-url' : 'add'} failed: ${tidy(remoteRun.stderr) || `exit code ${remoteRun.exitCode}`}`,
      )
    }
    steps.push(
      step('remote', 'completed', {
        detail: `${this.config.remote} → ${parsed.webUrl}`,
        output: describeRun(remoteRun),
      }),
    )

    const requestedName =
      typeof requestedBranch === 'string' && requestedBranch.trim().length > 0 ? requestedBranch.trim() : undefined
    if (requestedName !== undefined) {
      const rename = await repo.runIn(['branch', '-M', requestedName], signal)
      if (succeeded(rename)) steps.push(step('branch', 'completed', { detail: requestedName }))
    }

    const files = await this.stageAll(repo, signal)
    const subject = typeof message === 'string' && message.trim().length > 0 ? message.trim() : undefined
    try {
      steps.push(await this.commitStaged({ repo, files, subject, markers, allowEmpty: false, agent, signal }))
    } catch (error) {
      steps.push(step('commit', 'failed', { detail: error instanceof Error ? error.message : String(error) }))
      return this.buildOutcome({ repository: parsed.webUrl, repo, branch: null, remote: this.config.remote, steps })
    }

    const branch = await currentBranch(this.ctx, {
      git: repo.git,
      cwd: repo.root,
      timeoutMs: PROBE_TIMEOUT_MS,
      signal,
    })
    try {
      steps.push(await this.push({ repo, remote: this.config.remote, branch, signal }))
    } catch (error) {
      steps.push(step('push', 'failed', { detail: error instanceof Error ? error.message : String(error) }))
    }
    const clean = !(await this.isDirty(repo, signal))
    return this.buildOutcome({
      repository: parsed.webUrl,
      repo,
      branch,
      remote: this.config.remote,
      steps,
      unchanged: clean,
    })
  }

  /** The repository root for a session's workspace (or a named subdirectory). */
  async repositoryRootOrUndefined(agent, signal, dir) {
    const cwd = sessionCwd(agent)
    if (cwd === undefined) {
      throw new Error('this call has no session workspace; open a workspace directory first')
    }
    const git = await resolveGit(this.ctx, signal)
    return findRepositoryRoot(this.ctx, {
      git,
      directory: resolveDirectory(path.resolve(cwd), dir),
      timeoutMs: PROBE_TIMEOUT_MS,
      signal,
    })
  }

  /** @deprecated Use {@link initAndPublish}; kept as the shorter alias. */
  async setup(options) {
    return this.initAndPublish(options)
  }

  /**
   * Report how this machine can authenticate, and what an operation here would
   * use.
   *
   * This exists because "it failed to authenticate" is not actionable on its
   * own: the answer depends on what the machine already has — an ssh identity, a
   * credential helper with a cached GitHub account, or a token configured for
   * this plugin — and on nothing else. No secret is ever reported, and the only
   * writes it can cause are the host key `ssh` itself records.
   */
  async authenticate({ agent, dir, signal }) {
    const steps = []
    let git
    try {
      git = await resolveGit(this.ctx, signal)
    } catch (error) {
      steps.push(step('git', 'failed', { detail: error instanceof Error ? error.message : String(error) }))
      return this.buildOutcome({ repository: 'authentication', repo: { root: '', workspace: '' }, steps })
    }

    const ssh = await this.sshCapability()
    steps.push(
      step('ssh', ssh.usable ? 'completed' : 'skipped', {
        detail: ssh.usable
          ? `an ssh identity is available (${ssh.evidence.join('; ')})`
          : 'no ssh identity here: no key in ~/.ssh, no entry in ~/.ssh/config, no agent, no GIT_SSH_COMMAND',
      }),
    )

    // One bounded non-interactive handshake, because a key on disk is not proof
    // that GitHub accepts it. `accept-new` is what a first manual `ssh` does;
    // it is the only file this diagnostic may add to.
    const handshake = await runGit(this.ctx, {
      git: 'ssh',
      cwd: process.cwd(),
      args: [
        '-T',
        '-o',
        'BatchMode=yes',
        '-o',
        'ConnectTimeout=8',
        '-o',
        'StrictHostKeyChecking=accept-new',
        `git@${DEFAULT_HOST}`,
      ],
      timeoutMs: PROBE_TIMEOUT_MS,
      signal,
    })
    const handshakeText = `${tidy(handshake.stdout)}\n${tidy(handshake.stderr)}`
    const as = /Hi ([^!\n]+)!/i.exec(handshakeText) ?? /successfully authenticated as ([^\s.\n]+)/i.exec(handshakeText)
    steps.push(
      step('ssh-handshake', as === null ? 'skipped' : 'completed', {
        detail:
          as === null
            ? `ssh to git@${DEFAULT_HOST} did not authenticate: ${redact(explainLine(handshakeText))}`
            : `ssh authenticates as ${as[1]}`,
      }),
    )

    const helper = await runGit(this.ctx, {
      git,
      cwd: process.cwd(),
      args: ['config', '--get-all', 'credential.helper'],
      timeoutMs: PROBE_TIMEOUT_MS,
      signal,
    })
    const helpers = [
      ...new Set(
        tidy(helper.stdout)
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0),
      ),
    ]
    steps.push(
      step('credential-helper', helpers.length === 0 ? 'skipped' : 'completed', {
        detail:
          helpers.length === 0
            ? 'no credential.helper is configured, so an https remote has nothing to fall back on'
            : `credential.helper: ${helpers.join(', ')} (cached credentials are used through it, without prompting)`,
      }),
    )

    const token = resolveToken(this.config)
    const tokenEnv = String(this.config.tokenEnv ?? '').trim()
    steps.push(
      step('token', typeof token === 'string' && token.length > 0 ? 'completed' : 'skipped', {
        detail:
          typeof token === 'string' && token.length > 0
            ? `a token is configured for this plugin${tokenEnv.length > 0 ? ` (token or ${tokenEnv})` : ''} and is sent as a request header`
            : `no token is configured for this plugin${tokenEnv.length > 0 ? ` (${tokenEnv} is unset)` : ''}`,
      }),
    )

    // What an operation in this workspace would actually try, proven by the
    // cheapest command that needs credentials.
    try {
      const repo = await this.locate(agent, dir)
      const auth = await this.authenticationFor({ repo, remote: this.config.remote, signal })
      const remoteUrl = auth.remoteUrl ?? '(no remote)'
      steps.push(
        step('repository', 'completed', {
          detail: `${auth.host} · remote ${redact(remoteUrl)} · auth: ${this.config.auth}`,
        }),
      )
      if (auth.attempts.length === 0) {
        steps.push(step('methods', 'failed', { detail: `no method is available for auth: ${this.config.auth}` }))
      }
      for (const attempt of auth.attempts) {
        const probe = await repo.runIn([...attempt.prefix, 'ls-remote', '--exit-code', this.config.remote, 'HEAD'], signal)
        steps.push(
          step(`method:${attempt.method}`, succeeded(probe) ? 'completed' : 'skipped', {
            detail: succeeded(probe)
              ? attempt.method === 'system'
                ? 'the remote answered; a public repository would answer without credentials too'
                : 'the remote answered through this method'
              : redact(explainLine(`${tidy(probe.stderr)}\n${tidy(probe.stdout)}`)),
          }),
        )
      }
    } catch (error) {
      steps.push(
        step('repository', 'skipped', {
          detail: `${error instanceof Error ? error.message : String(error)} — the checks above still describe this machine`,
        }),
      )
    }

    return this.buildOutcome({ repository: 'authentication', repo: { root: '', workspace: '' }, steps })
  }

  /**
   * Clone a repository into the workspace.
   *
   * The clone always gets a directory of its own — by default a new
   * subdirectory named after the repository — so the workspace root's existing
   * contents are never in the way and are never written into. Only the target
   * itself must be missing or empty, which is what `dir` chooses.
   *
   * Where `sync` reports a failed step, cloning rejects on failure: there is no
   * partial outcome to act on, and cloning over an existing repository is a
   * mistake worth surfacing as an error.
   */
  async clone(options) {
    const { repo: reference, dir, branch: requestedBranch, depth: requestedDepth, agent, signal } = options
    const parsed = parseRepoRef(reference)
    const cwd = sessionCwd(agent)
    if (cwd === undefined) {
      throw new Error(
        'this call has no session workspace; pass an absolute `repo` directory instead of relying on the default',
      )
    }
    const workspace = path.resolve(cwd)
    const git = await resolveGit(this.ctx, signal)
    const target = resolveCloneTarget(workspace, dir ?? repoDirectoryName(parsed))

    if (hasGitDirectory(target)) {
      throw new Error(`${target} is already a git repository; use github_sync instead of cloning over it`)
    }
    // Only the target has to be empty: it is a directory of its own, so the
    // files beside it are never in the way. Cloning into a folder that already
    // holds files mixes two unrelated trees, and a name collision would block
    // the clone outright — so the escape hatch is another target, not a flag.
    if (fs.existsSync(target) && !isEmptyDirectory(target)) {
      throw new Error(
        `${target} already contains files, so cloning there would mix two trees. Pass \`dir\` to clone into an empty directory instead, or commit the existing files with /github init.`,
      )
    }

    const depth = Number.isInteger(requestedDepth) && requestedDepth > 0 ? requestedDepth : undefined
    const branch = typeof requestedBranch === 'string' && requestedBranch.trim().length > 0 ? requestedBranch.trim() : undefined

    // A clone authenticates like every other command, and it is the one that
    // happens before any remote exists: ssh uses the ssh form of the reference
    // outright, the token rides as a per-command header, and the system
    // credential helper is reached through the plain URL.
    const auth = await this.authenticationFor({
      repo: { token: resolveToken(this.config) },
      parsed,
      signal,
    })
    const tried = []
    // Recorded before the first attempt so a failed clone's leftovers can be
    // removed: the directory is ours to clean only when we created it.
    const targetExisted = fs.existsSync(target)
    let cloneRun
    let chosen
    for (const attempt of auth.attempts) {
      const argv = [...attempt.prefix, 'clone']
      if (depth !== undefined) argv.push('--depth', String(depth))
      if (branch !== undefined) argv.push('--branch', branch)
      argv.push(attempt.url ?? parsed.url, target)
      cloneRun = await runGit(this.ctx, { git, cwd: workspace, args: argv, timeoutMs: this.timeoutMs, signal })
      if (succeeded(cloneRun)) {
        chosen = attempt
        break
      }
      const text = `${tidy(cloneRun.stderr)}\n${tidy(cloneRun.stdout)}`
      tried.push(`${attempt.method}: ${redact(explainLine(text))}`)
      if (!isAuthFailure(text)) break
      if (!targetExisted && fs.existsSync(target)) {
        try {
          fs.rmSync(target, { recursive: true, force: true })
        } catch {
          // Leaving it in place only means the next attempt reports the
          // directory, which is still an actionable message.
        }
      }
    }
    if (cloneRun === undefined || !succeeded(cloneRun)) {
      const detail = cloneRun === undefined
        ? `no authentication method is available for auth: ${this.config.auth}`
        : failureText({ run: cloneRun, tried })
      throw new Error(`git clone failed: ${detail}`)
    }

    const steps = [
      step('clone', 'completed', {
        ...(chosen === undefined ? {} : { detail: `authenticated over ${chosen.method}` }),
        output: describeRun(cloneRun),
      }),
    ]
    const inside = (commandArgs, innerSignal) =>
      runGit(this.ctx, { git, cwd: target, args: commandArgs, timeoutMs: this.timeoutMs, signal: innerSignal })
    const branchNow = await currentBranch(this.ctx, {
      git,
      cwd: target,
      timeoutMs: PROBE_TIMEOUT_MS,
      signal,
    })
    const identity = await readGitConfig(this.ctx, {
      git,
      cwd: target,
      key: 'user.name',
      timeoutMs: PROBE_TIMEOUT_MS,
      signal,
    })
    if (identity === undefined) {
      steps.push(
        step('identity', 'note', {
          detail: `no user.name is configured; commits will use "${this.config.gitUserName} <${this.config.gitUserEmail}>". Set gitUserName/gitUserEmail in the plugin config to change this.`,
        }),
      )
    }
    const head = await inside(['log', '-1', '--pretty=%h %s'], signal)
    if (succeeded(head)) steps.push(step('head', 'completed', { output: tidy(head.stdout) }))

    return {
      ok: true,
      repository: parsed.webUrl,
      root: target,
      workspace,
      branch: branchNow ?? null,
      remote: this.config.remote,
      unchanged: false,
      steps,
    }
  }

  /** Render one outcome as the plain text both the model and the human read. */
  static render(value) {
    return renderOutcome(value)
  }
}

/**
 * The branch list as text: what is checked out, what each branch tracks, and how
 * far it has drifted.
 */
export function renderBranches(branches) {
  if (branches.length === 0) return '(no local branches yet)'
  return branches
    .map((entry) => {
      const marks = [entry.current ? '*' : ' ']
      const track =
        entry.upstream === null
          ? 'no upstream'
          : entry.gone
            ? `${entry.upstream} (gone)`
            : `${entry.upstream}${entry.ahead > 0 ? ` ↑${entry.ahead}` : ''}${entry.behind > 0 ? ` ↓${entry.behind}` : ''}`
      return `${marks[0]} ${entry.name} ${entry.sha} — ${track}${entry.when.length === 0 ? '' : ` · ${entry.when}`}`
    })
    .join('\n')
}

/**
 * Render one outcome as the plain text both the model and the human read.
 *
 * A standalone function so the command path never depends on a class instance.
 */
export function renderOutcome(value) {
  const lines = [`${value.repository}${value.branch === null ? '' : ` (branch ${value.branch})`}`, `root: ${value.root}`]
  for (const entry of value.steps) {
    let head = `- ${entry.step}: ${entry.status}`
    if (entry.detail !== undefined) head += ` — ${entry.detail}`
    if (entry.subject !== undefined) head += ` — "${entry.subject}" (${entry.source})`
    lines.push(head)
    if (entry.output !== undefined) {
      lines.push(
        String(entry.output)
          .split('\n')
          .map((line) => `    ${line}`)
          .join('\n'),
      )
    }
  }
  if (value.unchanged === true) lines.push('working tree clean')
  return lines.join('\n')
}
