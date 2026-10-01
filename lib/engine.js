import fs from 'node:fs'
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
  authConfig,
  resolveToken,
} from './repo.js'
import { gatherCommitContext, generateSubject } from './commit.js'

/** How long a single git command may run before it is cancelled. */
const COMMAND_TIMEOUT_MS = 600000
/** Time allowed for the one-off probe commands such as `git --version`. */
const PROBE_TIMEOUT_MS = 20000
/** Plugin revision, reported in activation diagnostics. */
export const PLUGIN_REVISION = 'rev4'

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
   * Inspect the workspace without requiring a repository.
   *
   * The composer button calls this to decide whether to offer repository
   * actions or the new-repository menu, so it must never throw for the ordinary
   * "no repository yet" state.
   *
   * @returns `{ state: 'repo' | 'empty', workspace, root?, branch?, dirty?, remote?, ahead? }`.
   */
  async probe(agent, requested) {
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
      directory: resolveDirectory(workspace, requested),
      timeoutMs: PROBE_TIMEOUT_MS,
    })
    if (root === undefined) {
      // Whether the folder already holds files decides what can be done here:
      // cloning into a non-empty folder mixes two unrelated trees and can lose
      // work, so the answer is part of the state the caller acts on.
      const listing = readDirectory(workspace)
      return {
        state: 'empty',
        workspace,
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
      const fetched = await runGit(this.ctx, {
        git,
        cwd: root,
        args: ['fetch', '--quiet', this.config.remote],
        timeoutMs: this.timeoutMs,
      })
      if (!succeeded(fetched)) {
        return this.describeRepository({ git, root, workspace, runIn, fetchFailed: true })
      }
    }
    return this.describeRepository({ git, root, workspace, runIn })
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
    const { git, root, workspace, runIn, fetchFailed } = options
    const branch = (await currentBranch(this.ctx, { git, cwd: root, timeoutMs: PROBE_TIMEOUT_MS })) ?? null
    const dirty = tidy((await runIn(['status', '--porcelain'])).stdout).trim().length > 0
    const remoteRun = await runIn(['remote', 'get-url', this.config.remote])
    const remote = succeeded(remoteRun) ? tidy(remoteRun.stdout).trim() || null : null
    const aheadRun = await runIn(['rev-list', '--count', `@{u}..HEAD`])
    const behindRun = await runIn(['rev-list', '--count', `HEAD..@{u}`])
    return {
      state: 'repo',
      workspace,
      root,
      branch,
      dirty,
      remote,
      ahead: succeeded(aheadRun) ? Number(tidy(aheadRun.stdout)) || 0 : null,
      behind: succeeded(behindRun) ? Number(tidy(behindRun.stdout)) || 0 : null,
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
      fetchOnStatus: this.config.fetchOnStatus === true,
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

  async stageAll(repo, signal) {
    const add = await repo.runIn(['add', '-A', '--', '.'], signal)
    if (!succeeded(add)) {
      throw new Error(`git add failed: ${tidy(add.stderr) || `exit code ${add.exitCode}`}`)
    }
    const staged = await repo.runIn(['diff', '--cached', '--name-only'], signal)
    return tidy(staged.stdout)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  }

  /** Commit the staged changes, with an explicit subject or a generated one. */
  async commitStaged({ repo, files, subject, allowEmpty, agent, signal }) {
    if (files.length === 0 && allowEmpty !== true) return step('commit', 'skipped', { detail: 'nothing to commit' })
    const identity = await this.identityOptions(repo.git, repo.root)
    if (subject !== undefined) {
      const commit = await repo.runIn(['commit', '-m', subject, ...identity], signal)
      if (!succeeded(commit)) {
        throw new Error(
          `git commit failed: ${tidy(commit.stderr) || tidy(commit.stdout) || `exit code ${commit.exitCode}`}`,
        )
      }
      return step('commit', 'completed', { subject, source: 'provided', output: describeRun(commit) })
    }

    const context = await gatherCommitContext({ run: (argv, sig) => repo.runIn(argv, sig), config: this.config, signal })
    const generated = await generateSubject({
      ctx: this.ctx,
      agent,
      context,
      fileCount: files.length,
      config: this.config,
      signal,
    })
    const commit = await repo.runIn(['commit', '-m', generated.subject, ...identity], signal)
    if (!succeeded(commit)) {
      throw new Error(
        `git commit failed: ${tidy(commit.stderr) || tidy(commit.stdout) || `exit code ${commit.exitCode}`}`,
      )
    }
    return step('commit', 'completed', {
      subject: generated.subject,
      source: generated.source,
      ...(generated.detail === undefined ? {} : { detail: `user.name came from the plugin; generation note: ${generated.detail}` }),
      output: describeRun(commit),
    })
  }

  async pull({ repo, remote, branch, signal }) {
    const args = ['pull', ...(this.config.pullRebase === true ? ['--rebase', '--autostash'] : []), remote]
    if (branch !== undefined) args.push(branch)
    const pull = await repo.runIn(args, signal)
    if (!succeeded(pull)) {
      throw new Error(
        `git pull failed: ${tidy(pull.stderr) || tidy(pull.stdout) || `exit code ${pull.exitCode}`}. Resolve the reported divergence or conflict, then retry.`,
      )
    }
    return step('pull', 'completed', { output: describeRun(pull) })
  }

  async push({ repo, remote, branch, signal }) {
    const auth = this.config.injectToken === false ? [] : authConfig(this.config, repo.token)
    const hasUpstream = succeeded(
      await repo.runIn(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], signal),
    )
    const args =
      branch === undefined ? ['push', ...auth, remote] : ['push', ...auth, ...(hasUpstream ? [] : ['-u']), remote, branch]
    const push = await repo.runIn(args, signal)
    if (!succeeded(push)) {
      throw new Error(
        `git push failed: ${tidy(push.stderr) || tidy(push.stdout) || `exit code ${push.exitCode}`}. Check the remote URL, the credentials, and whether the branch has diverged from its upstream.`,
      )
    }
    return step('push', 'completed', { output: describeRun(push) })
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
    const { action, repo: requested, remote: requestedRemote, message, pull: pullFirst, allowEmpty, agent, signal } = options
    const repo = await this.locate(agent, requested)
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
      const files = await this.stageAll(repo, signal)
      const subject = typeof message === 'string' && message.trim().length > 0 ? message.trim() : undefined
      const committed = await runStep('commit', () =>
        this.commitStaged({ repo, files, subject, allowEmpty: allowEmpty === true, agent, signal }),
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
      if (!(await runStep('push', () => this.push({ repo, remote, branch, signal })))) {
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
    const { url, branch: requestedBranch, message, dir, agent, signal } = options
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
      steps.push(await this.commitStaged({ repo, files, subject, allowEmpty: false, agent, signal }))
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
   * Clone a repository into the workspace.
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
    // Cloning into a folder that already holds files mixes two unrelated trees,
    // and a conflicting name would be overwritten or block the clone outright.
    // The escape hatch is a genuinely empty target, not a flag that permits it.
    if (fs.existsSync(target) && !isEmptyDirectory(target)) {
      throw new Error(
        `${target} already contains files, so cloning there would mix two trees. Clone into an empty directory by passing \`dir\`, or commit the existing files with /github init instead.`,
      )
    }

    const depth = Number.isInteger(requestedDepth) && requestedDepth > 0 ? requestedDepth : undefined
    const branch = typeof requestedBranch === 'string' && requestedBranch.trim().length > 0 ? requestedBranch.trim() : undefined
    const argv = ['clone']
    if (depth !== undefined) argv.push('--depth', String(depth))
    if (branch !== undefined) argv.push('--branch', branch)
    argv.push(parsed.url, target)

    const cloneRun = await runGit(this.ctx, { git, cwd: workspace, args: argv, timeoutMs: this.timeoutMs, signal })
    if (!succeeded(cloneRun)) {
      throw new Error(
        `git clone failed: ${tidy(cloneRun.stderr) || tidy(cloneRun.stdout) || `exit code ${cloneRun.exitCode}`}`,
      )
    }

    const steps = [step('clone', 'completed', { output: describeRun(cloneRun) })]
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
