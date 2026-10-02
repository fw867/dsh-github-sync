import { PLUGIN_REVISION, GithubSyncEngine } from './engine.js'

export { PLUGIN_REVISION }

/** Property schema accepting a string and/or `null`, which the registry supports. */
function nullableString(description) {
  return { oneOf: [{ type: 'string' }, { type: 'null' }], description }
}

/** One short output text block carrying the whole result. */
function textResult(text) {
  return [{ type: 'text', text }]
}

/** Shared step schema for both tools' output contracts. */
function stepSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      step: { type: 'string' },
      status: { type: 'string' },
      detail: { type: 'string' },
      subject: { type: 'string' },
      source: { type: 'string' },
      output: { type: 'string' },
    },
    required: ['step', 'status'],
  }
}

/** Outcome contract shared by both tools. */
function outcomeSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      ok: { type: 'boolean' },
      repository: { type: 'string' },
      root: { type: 'string' },
      workspace: { type: 'string' },
      branch: nullableString('Current branch, or null on a detached HEAD.'),
      remote: nullableString('Remote name in use, or null when it is not known yet.'),
      unchanged: { type: 'boolean' },
      steps: { type: 'array', items: stepSchema() },
    },
    required: ['ok', 'repository', 'root', 'workspace', 'branch', 'remote', 'unchanged', 'steps'],
  }
}

/**
 * Register the GitHub sync tools.
 *
 * The tools are a thin model-facing adapter over {@link GithubSyncEngine}, which
 * the human `/github` command also drives, so both callers share one behavior.
 *
 * @param ctx - the plugin's Cordis context.
 * @param config - the resolved configuration.
 */
export function registerTools(ctx, config) {
  const engine = new GithubSyncEngine(ctx, config)

  const disposers = [
    ctx.tools.register({
      name: 'github_clone',
      description:
        'Download a repository into the workspace by cloning it. Accepts `owner/repo`, a full https or ssh URL, `host/owner/repo`, or an absolute local path. The clone never lands in the workspace root: it defaults to a new subdirectory named after the repository, so a workspace that already holds files is fine. Pass `dir` to choose that directory (relative to the workspace or absolute). Only the target must be empty or absent — one that already holds files is refused, because cloning there would mix two trees.',
      parameters: {
        type: 'object',
        properties: {
          repo: {
            type: 'string',
            description:
              'Repository to clone: `owner/repo`, `https://…`, `git@…:owner/repo`, `host/owner/repo`, or an absolute local path.',
          },
          dir: {
            type: 'string',
            description:
              'Target directory: relative to the workspace, or absolute. Defaults to a directory named after the repository. Use this to clone beside existing files instead of into them.',
          },
          branch: { type: 'string', description: 'Branch or tag to check out instead of the remote default.' },
          depth: {
            type: 'integer',
            description: 'Create a shallow clone limited to this many commits. Omit for a full clone.',
          },
        },
        required: ['repo'],
      },
      output: {
        schema: outcomeSchema(),
        render: (_args, value) => textResult(GithubSyncEngine.render(value)),
      },
      execute: (args, exec) =>
        engine.clone({
          repo: args.repo,
          dir: args.dir,
          branch: args.branch,
          depth: args.depth,
          agent: exec.agent,
          signal: exec.signal,
        }),
    }),
    ctx.tools.register({
      name: 'github_sync',
      description:
        'Operate the git repository in the workspace: report status, pull from GitHub, commit the pending changes with a Conventional Commits subject generated from the staged changes in the workspace\'s own language, push the current branch, `sync` (stage + commit + push) in one step, `init` a repository when the workspace has none yet, or `setup` a local repository that has no remote. Omit `repo` to use the session workspace. `commit` stages every change, so call it only when the changes are ready to publish.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['status', 'pull', 'commit', 'push', 'sync', 'init', 'setup'],
            description:
              'status: inspect the tree and upstream. pull: fetch and integrate. commit: stage everything and commit. push: publish the current branch. sync: stage, commit, and push. init: create a repository, optionally with `url` as its origin. setup: connect this repository to `url`, commit, and push.',
          },
          url: {
            type: 'string',
            description:
              'For `init`, the remote to record as `origin`; giving one also commits and pushes. For `setup`, the GitHub repository to connect and push to. Accepts the same references as github_clone.',
          },
          dir: {
            type: 'string',
            description:
              'The repository directory, relative to the workspace or absolute, for every action including in `init` and `setup`, where it is the directory that becomes the repository root. Use it when the repository lives in a subdirectory instead of the workspace root. Defaults to the configured subdirectory, then the workspace itself.',
          },
          repo: {
            type: 'string',
            description:
              'Repository directory: relative to the workspace, or absolute. Defaults to the session workspace.',
          },
          remote: { type: 'string', description: 'Remote name. Defaults to the plugin config (origin).' },
          message: {
            type: 'string',
            description:
              'Commit subject to use verbatim instead of generating one. Only meaningful for `commit`, `sync`, and `setup`.',
          },
          pull: {
            type: 'boolean',
            description:
              'For `sync`, pull with rebase before pushing. Defaults to false. A failed pull stops the sync before the push.',
          },
          allowEmpty: { type: 'boolean', description: 'Allow a commit when nothing changed. Defaults to false.' },
        },
        required: ['action'],
      },
      output: {
        schema: outcomeSchema(),
        render: (_args, value) => textResult(GithubSyncEngine.render(value)),
      },
      execute: (args, exec) => {
        if (args.action === 'init') {
          if (typeof args.url === 'string' && args.url.trim().length > 0) {
            return engine.initAndPublish({
              url: args.url,
              message: args.message,
              dir: args.dir,
              agent: exec.agent,
              signal: exec.signal,
            })
          }
          return engine.init({ dir: args.dir, agent: exec.agent, signal: exec.signal })
        }
        if (args.action === 'setup') {
          return engine.initAndPublish({
            url: args.url,
            message: args.message,
            dir: args.dir,
            agent: exec.agent,
            signal: exec.signal,
          })
        }
        return engine.sync({
          action: args.action,
          repo: args.dir ?? args.repo,
          remote: args.remote,
          message: args.message,
          pull: args.pull,
          allowEmpty: args.allowEmpty,
          agent: exec.agent,
          signal: exec.signal,
        })
      },
    }),
  ]

  ctx.effect(() => () => {
    for (const dispose of disposers) dispose()
  })
}
