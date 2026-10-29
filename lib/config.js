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

  /** Ask the model for a commit message before pushing when the tree is dirty. */
  generateCommitMessage: true,
  /**
   * Token budget for one generated commit message.
   *
   * This is the whole completion, reasoning included, so a small value is how a
   * thinking model ends up writing nothing: the budget goes to `reasoning-delta`
   * chunks and no text arrives. The call also carries `purpose: 'session-title'`,
   * which asks the adapter for a utility answer without reasoning; the two
   * together are what make a short, specific message reliable.
   */
  commitMaxTokens: 900,
  /**
   * How many times the model is asked for a message before the deterministic
   * subject takes over.
   *
   * The failures worth retrying — a provider hiccup, a rate limit, a thinking
   * model that spent the whole budget before writing a word — are transient,
   * while the fallback is the one failure that shows up as a worse title rather
   * than as an error. `1` disables retrying; values are clamped to 1–5, and a
   * reasoning-only answer is retried with a larger budget.
   */
  commitAttempts: 3,
  /**
   * Language a generated commit message is written in.
   *
   * `auto` follows the local language: the POSIX locale variables, then the
   * runtime's resolved locale, which on Windows is the user's regional setting.
   * `zh` forces Chinese and `en` forces English. The Conventional Commits type
   * token (`feat`, `fix`, …) stays English in every case, so a generated
   * changelog or a conventional-commit parser keeps working.
   */
  commitLanguage: 'auto',
  /** Provider route for message generation; empty uses the caller's model, then the default model. */
  commitProvider: '',
  /** Model id for message generation; empty uses the caller's model, then the default model. */
  commitModel: '',
  /** Maximum characters of diff context sent to the model. */
  commitDiffBytes: 12000,

  /** Pull with `--rebase --autostash`; `false` uses a plain merge pull. */
  pullRebase: true,
  /**
   * How a private repository authenticates, as an ordered preference.
   *
   * `auto` — the default — tries what the machine already has: the system's ssh
   * identity (`ssh`) when one exists, then this plugin's `token`, then the
   * system credential helper (`system`, i.e. Git Credential Manager and the
   * account it has cached). A named method uses only that one, which is how a
   * deployment pins the method it has verified; `/github auth` reports what is
   * available here and which method an operation would use.
   *
   * The token is sent as a per-command HTTP header for clone, fetch, pull, and
   * push alike, and never reaches `.git/config`. An attempt that fails for a
   * reason other than authentication is reported as it is, never retried under
   * another identity.
   */
  auth: 'auto',
  /**
   * Fetch before reporting status, so the ahead/behind counts describe the
   * remote as it is now rather than as it was at the last fetch.
   *
   * A fetch only updates remote-tracking refs: it never touches the working
   * tree, the index, or local branches, which is what makes it safe to do
   * automatically. Merging the result is not, and stays a deliberate action.
   *
   * The fetch is pruning, and it keeps the remote's `HEAD` current, so a branch
   * deleted or renamed on the remote stops reading as a live upstream and the
   * remote's new default is reported. The pane's Refresh button asks for the same
   * thing one probe at a time, without turning this on.
   */
  fetchOnStatus: false,
  /**
   * Replay the local commits onto the upstream before publishing, in `sync`.
   *
   * On by default: forgetting one `pull` before a commit used to turn every
   * "Commit & push" into a refused push. The commit is recorded first either
   * way, so the work is safe; what this switch changes is whether the branch is
   * replayed onto the upstream so the push can succeed. A replay that conflicts
   * is aborted, the local commit is kept, and nothing is pushed — never a
   * half-finished rebase.
   *
   * Set it to `false` to restore the strict behaviour: a diverged branch is
   * refused with both counts and the commits in the way, and the caller decides
   * whether to pull, merge, or force.
   */
  integrateBeforePush: true,
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
   * Which changes the control lists, and therefore which ones a commit records.
   *
   * `all` — the default — is git's own view: a modification, a deletion, a
   * rename, **and a file git does not track yet**. A new file has to be listed to
   * be selectable: while the list withheld it, there was no way to bring it into
   * a commit from the control at all. `git add -A` records exactly what the list
   * shows, so the two agree.
   *
   * `tracked` withholds untracked files and any tracked path `.gitignore`
   * matches: the list is the button's contract, so staging a new file behind it
   * would record something nobody saw. Choose it when a workspace fills up with
   * build output or scratch files that must never be committed by accident — and
   * note that `git add -A` is what runs, so a pattern that is *not* in
   * `.gitignore` is not protected by this either way.
   *
   * Either way the count the list leaves out is reported, so a repository whose
   * only change is a new file never looks untouched.
   */
  changesScope: 'all',
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
  commitMaxTokens: 'number',
  commitAttempts: 'number',
  commitLanguage: 'string',
  commitProvider: 'string',
  commitModel: 'string',
  commitDiffBytes: 'number',
  pullRebase: 'boolean',
  auth: 'string',
  fetchOnStatus: 'boolean',
  integrateBeforePush: 'boolean',
  statusOnMount: 'boolean',
  changesScope: ['tracked', 'all'],
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
    // A list of accepted values is an enumeration; a string is a `typeof` check.
    if (Array.isArray(expected)) {
      if (!expected.includes(value)) {
        throw new TypeError(
          `github-sync config field "${key}" must be one of ${expected.join(', ')}, got ${JSON.stringify(value)}`,
        )
      }
    } else if (typeof value !== expected) {
      throw new TypeError(`github-sync config field "${key}" must be a ${expected}, got ${typeof value}`)
    }
    config[key] = value
  }
  return config
}
