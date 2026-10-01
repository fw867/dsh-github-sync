/**
 * Runtime configuration for the GitHub sync plugin.
 *
 * The plugin declares no Config schema, so the row's `config` in
 * `cordis.patch.yml` is passed through as written and merged onto these
 * defaults here. Every field is optional, and an omitted row `config` yields
 * exactly this object.
 */

/** The complete default configuration, also the field reference for users. */
export const DEFAULT_CONFIG = {
  /** GitHub personal access token used to authenticate HTTPS clone/pull/push. */
  token: '',
  /** Environment variable read for the token when `token` is empty. */
  tokenEnv: 'GITHUB_TOKEN',
  /** Send the token as a per-command HTTP header instead of writing it into the remote. */
  injectToken: true,

  /** `user.name` supplied to git only where the repository configures none. */
  gitUserName: 'DSH Agent',
  /** `user.email` supplied to git only where the repository configures none. */
  gitUserEmail: 'dsh-agent@localhost',

  /** Default remote name for clone, pull, and push. */
  remote: 'origin',
  /** Branch to check out after a fresh clone. Empty keeps the remote default. */
  branch: '',

  /** Ask the model for a commit subject before pushing when the tree is dirty. */
  generateCommitMessage: true,
  /** Provider route for message generation; empty uses the caller's model, then the default model. */
  commitProvider: '',
  /** Model id for message generation; empty uses the caller's model, then the default model. */
  commitModel: '',
  /** Maximum characters of diff context sent to the model. */
  commitDiffBytes: 12000,

  /** Pull with `--rebase --autostash`; `false` uses a plain merge pull. */
  pullRebase: true,
  /**
   * Fetch before reporting status, so the ahead/behind counts describe the
   * remote as it is now rather than as it was at the last fetch.
   *
   * A fetch only updates remote-tracking refs: it never touches the working
   * tree, the index, or local branches, which is what makes it safe to do
   * automatically. Merging the result is not, and stays a deliberate action.
   */
  fetchOnStatus: false,
  /**
   * Read the workspace state as soon as a session appears, rather than waiting
   * for the control to be opened.
   *
   * The client reaches the Host through the command registry, and every command
   * the Host runs is appended to that session's log as a `command/run` /
   * `command/done` pair — that is the only channel available, so an eager check
   * costs one visible row per session. Setting this to `false` keeps the log
   * clean and shows the sync state from the moment the control is opened.
   */
  statusOnMount: true,
  /**
   * A subdirectory of the workspace that holds the repository, when the
   * workspace root is not itself the repository.
   *
   * `findRepositoryRoot` walks upward, so a repository below the workspace root
   * is never found without this. It selects which repository the control reports
   * and which repository every action operates on. Empty means the workspace
   * itself. `/github add-dir <name>` and the control's target list set it.
   */
  subdirectory: '',
  /** Per-command timeout in milliseconds. */
  timeoutMs: 600000,
}

/** Field name to accepted type, used to reject mis-typed patch entries. */
const FIELD_TYPES = {
  token: 'string',
  tokenEnv: 'string',
  injectToken: 'boolean',
  gitUserName: 'string',
  gitUserEmail: 'string',
  remote: 'string',
  branch: 'string',
  generateCommitMessage: 'boolean',
  commitProvider: 'string',
  commitModel: 'string',
  commitDiffBytes: 'number',
  pullRebase: 'boolean',
  fetchOnStatus: 'boolean',
  statusOnMount: 'boolean',
  subdirectory: 'string',
  timeoutMs: 'number',
}

/**
 * Merge the row's config onto the defaults.
 *
 * @param raw - the value the Loader passed as the plugin's config, if any.
 * @returns a complete configuration object.
 * @throws when a supplied field has the wrong type, so a typo in the patch
 *   layer fails at activation instead of silently changing behavior mid-push.
 */
export function resolveConfig(raw) {
  const config = { ...DEFAULT_CONFIG }
  if (raw === undefined || raw === null) return config
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('github-sync config must be an object')
  }
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue
    const expected = FIELD_TYPES[key]
    if (expected === undefined) {
      throw new TypeError(`github-sync config has no field "${key}"`)
    }
    if (typeof value !== expected) {
      throw new TypeError(`github-sync config field "${key}" must be a ${expected}, got ${typeof value}`)
    }
    config[key] = value
  }
  return config
}
