# dsh-github-sync

Adds GitHub synchronization to a DSH workspace. It contributes one shared
operation engine with three entry points:

| Surface | Entry point |
|---|---|
| Agent tools | `github_clone` and `github_sync` |
| Human command | `/github status\|pull\|commit\|push\|sync\|clone <repo>\|init [url]` |
| Composer UI | a **GitHub** button in the composer tool row that shows the branch and offers these actions |

All three drive the same engine, so a button press, a slash command, and a model
tool call perform one identical operation.

## Composer button

The Client half renders a compact control at the left of the composer tool row.

The workspace is probed through `/github status --json` **the first time a
session's menu is opened**, and the answer is cached per session. That timing is
the resolution of a real trade-off: the probe is a genuine command, so the Host
logs a `command/run`/`command/done` pair and the probe becomes a visible row in
that session's conversation. Probing eagerly would add a row to every session
the user merely opens, and probing on every menu open would add one per open.
One probe per session keeps the state fresh when a session's menu is first used,
shows what is already known when switching back, and costs one row per session
rather than per interaction.

The cached value is refreshed explicitly by **Refresh status** and by every
action that changes the repository, so how you reach the menu is what decides
how current its answer is.

**No probe outcome can block the menu.** The background check keeps its own
progress state, separate from the state a user action sets, and only the latter
disables anything. So while the check is in flight the repository actions are
already offered and clickable beneath a *Checking this workspace…* note, and a
probe that never answers degrades the menu to "unverified" rather than freezing
it. The clone and init entries stay withheld until the workspace is known,
because offering them for a workspace that may already be a repository is the
worse guess.

The check is attempted **once per session**, gated by its own record rather than
by the cached answer — a probe that hangs caches nothing, so a cache-only gate
would re-attempt it on every render. Only an explicit retry or a completed action
asks for another attempt.

The probe is otherwise bounded and total:

- **The Remote command namespace must be injected by name.** A Remote namespace
  is a Cordis context of its own, so declaring only `remote` makes every
  `remote.commands` read throw `cannot get property "remote.commands" without
  inject`. That throw reached the probe's error handling and was rendered as the
  generic "unavailable" report — so the check never ran and the menu concluded
  there was no repository. The Client half now declares
  `inject: ['slots', 'remote', 'remote.commands', 'locale']`, and every read goes
  through one guarded accessor so an unreachable namespace degrades to the
  existing "not reachable" report rather than an internal error.
- **The command listing has its own short budget** (1.5s), separate from the
  8s probe budget. The listing only decides whether to fail early with "this
  session does not offer `/github` yet"; it is not the answer, so a listing that
  never settles must not consume the probe's budget and hide what the command
  would have said.
- **The whole probe is raced against one 8-second timeout, not just the invoke.**
  The timeout path releases the state itself instead of relying on the abandoned
  call's cleanup, which may never run.
- The timeout also aborts the Remote call, forwarding the `AbortSignal` the
  descriptor declares for cancellation instead of abandoning the request.
- Before invoking anything, the control asks the Host whether the session offers
  the `/github` command. That listing is a cheap read with no session record, and
  it turns the likeliest cause of a hanging call — a session started before the
  plugin was installed — into an immediate answer that names the remedy.
- A call that resolves with no readable text is reported as a failure.
- A **success whose payload is not the expected JSON still counts as a found
  repository** — the reply proves the command ran, and whether a repository
  exists is the decision this probe drives. It carries no branch, so the button
  keeps its neutral label rather than inventing one.
- Any failure shows the reason together with a **Check again** action.

**With a repository** the button shows the branch name and its sync state, so
being out of step with the remote is visible without opening anything:

| Button | Meaning |
|---|---|
| `main` (green) | Branch present, in sync, nothing to publish |
| `main ↑2` (brand) | Two commits are waiting to be pushed |
| `main ↓1` (amber) | The remote is one commit ahead |
| `main ↑2 ↓1` (amber) | The branch has diverged; both ends need a decision |
| `main ↑1` (amber) | Diverged counts still show, but uncommitted work outranks them in colour |

An uncommitted working tree is amber as well, and the tooltip spells the whole
state out: `main · uncommitted changes · 2 to push · 1 to pull`. A repository
whose upstream counts are unknown — no remote, or no upstream branch — shows the
branch with no arrows rather than a made-up zero.

The menu offers:

- **Refresh status** — working tree and upstream state
- **Pull** — fetch and integrate the remote branch
- **Commit & push** — stage everything, commit with a generated subject, push
- **Push only** — publish the current branch

The state is read when a session first appears, so switching to another workspace
immediately shows that workspace's sync state rather than the previous one's.

### Why a check leaves a row, and how to stop it

There is exactly **one** channel from the Client half to the Host: the Remote
command namespace. `commands.execute` appends a `command/run` / `command/done`
pair to the session before and after the handler runs, unconditionally — the
registry has no unlogged entry point, and a bespoke Remote namespace would need a
Typert-generated descriptor plus a contribution to the api-remotes assembly, both
of which are produced at build time from packages this workspace bundle does not
have.

So every check is a visible row in that session's conversation. Two knobs decide
what that costs:

| Setting | Behaviour |
|---|---|
| `statusOnMount: true` (default) | The workspace is checked when a session appears, so the sync badge is live without opening anything. One row per session. |
| `statusOnMount: false` | The check waits for the control to be opened. A session whose control is never opened stays clean. |

The preference lives in Host config, which the Client cannot read, so it arrives
with a check's answer and applies to the sessions created after that. The first
check of a freshly loaded page is therefore always eager — it is what teaches the
Client the setting.

### Keeping the counts honest

The ahead/behind counts describe the remote as of the last fetch, so they can
understate a remote that moved on. Setting `fetchOnStatus: true` makes the check
fetch first. That is safe to automate because **a fetch touches only
remote-tracking refs** — never the working tree, the index, or local branches,
which the tests assert. Merging what it finds is not safe to automate and stays
the explicit **Pull** action.

A fetch that fails does not fail the check: the answer is returned with
`stale: true`, which the control treats as "the counts may be out of date"
rather than as an error.

**Without a repository** — no `.git` in the workspace or any parent directory —
pull and push would have nothing to act on, so the menu says *No repository in
this workspace*. It then offers:

- **Clone from GitHub** — enter `owner/repo`, a URL, or a local path
- **Create an empty repository here** — `/github init`, creating `.git` and
  staging the current files so the first `/github commit` is one step away

A workspace that already holds files is **no obstacle to cloning**. The clone
gets a directory of its own — by default a new subdirectory named after the
repository — so the existing files are never written into and never conflict
with it; where the folder is known to be non-empty, the menu states that the
clone lands beside them. The rule that survives is about the *target*: a target
that exists and holds files is refused, with its path, and `dir` is the way to
clone somewhere else.

`github_clone` enforces that target rule on its own, so the guard does not depend
on the menu.

### Which directory becomes the repository

Git's root is the directory it is initialized in, and every committed path is
relative to that directory. That decides what the remote ends up holding:

| Initialized in | Remote root contains |
|---|---|
| the workspace | `<subfolder>/…` — a folder containing your project |
| the workspace's `my-plugin` subfolder | `…` — the project itself |

So a workspace whose project lives in a subfolder needs its repository created in
**that subfolder**, not at the workspace root. `-C` / `--dir` names it:

```
/github init --dir my-plugin
/github init https://github.com/me/repo.git --dir my-plugin
/github setup https://github.com/me/repo.git -C my-plugin
/github clone owner/repo --dir my-plugin
```

The tool form is `github_sync` with `dir`. Without it the repository is created at
the workspace root, which is correct when the workspace *is* the project.

For `clone`, `dir` is the directory the repository is downloaded **into**. Without
it the clone gets a new subdirectory named after the repository, so a workspace
that already holds files needs no special handling — the clone lands beside them.

A directory that does not exist is refused with its path, before any git command
runs: handing git a missing directory produces only a bare `spawn git ENOENT`
that names neither the directory nor the problem.

### Pointing the control at a subdirectory

`findRepositoryRoot` walks **upward**, so a repository that lives *below* the
workspace root is invisible to an unqualified check. The check therefore reports
what it can see:

- `subdirectories` — immediate subdirectories that are repositories themselves
- `subdirectory` — which one this answer is about, absent for the workspace root

The control renders those as a target list. Choosing one re-reads that
repository, and from then on **every action in that session carries
`--dir <name>`** — the badge, Pull, Commit, Push and the URL actions all agree on
one repository. The choice is kept per session, so browsing a second workspace
never silently redirects a later commit, and *The workspace itself* (offered once
a choice has been made) goes back.

The same selection can be made without the control:

```
/github status --json --dir my-plugin
/github commit --dir my-plugin
/github pull -C my-plugin
```

`--dir` applies to every action, not only `init` and `setup`. An explicit `--dir`
overrides the configured `subdirectory`, which overrides the workspace root:

```yaml
- id: github-sync
  name: 'dsh-github-sync'
  config:
    subdirectory: my-plugin   # the repository this workspace is about
```

**With a repository but no remote** — what `/github init` produces — publishing
cannot succeed, so the menu drops both push entries and offers what still works:
*Refresh status* and *Commit locally*, plus a **Connect & push** field. That last
one runs `/github init <url>`, which records `origin`, commits everything with a
generated subject, and pushes — the whole path from a bare local repository to a
published one in a single action. The URL's repository must already exist on
GitHub: creating one needs credentials and an API route this plugin does not
have. The check reports the remote as `null` when there is none, and only a
*known* absence narrows the menu — an unanswered check keeps every action.

`/github setup <url>` is the same thing under a shorter name. Both names route to
one implementation on purpose: a session started before an action existed cannot
see that action, because the Host's command module is pinned when the process
starts and a plugin reload does not replace it. Riding `init` — an action every
session already knows — keeps the connect-and-push flow working across a plugin
update, where a brand-new action name would answer `unknown action`.

`github_clone` never targets the workspace root unless asked to: the default
target is a subdirectory named after the repository, which is why a folder full
of files beside it is fine. The rule it does enforce is about the target itself —
one that exists and is non-empty is refused, naming the conflict and pointing at
`dir` as the way to clone somewhere else.

Every action runs the matching `/github` action through the Remote command
namespace. The Host logs the command lifecycle, so the outcome is durable in the
session *and* shown in the menu. A failed action reports the reason instead of
closing silently.

## A repository without a remote

A local-only repository is a normal state, not an error. The Host reports it
rather than failing:

- `commit` works and commits locally.
- `pull`, `push`, and `sync` record the blocked step as `skipped` with the reason
  and return a successful outcome, so a commit that already landed is not
  reported as a failure.
- `/github setup <url>` is the action that finishes the job.

## Reading a subprocess result

`ctx.subprocess` may hand over a live `stdout`/`stderr` stream, implement only
the documented collect-mode readers (`handle.collected.stdout.readFrom`), or
provide both. The git runner reads **both** and prefers whichever returned
bytes.

Reading only the stream is a silent failure with a collect-only provider: the
stream is absent, so the runner reports no output while git actually exited `0`
with the answer on the collected reader. That is exactly how a workspace with a
working `.git` came to be reported as having no repository — `git rev-parse
--show-toplevel` succeeded, its answer was never read, and the empty read was
indistinguishable from "git printed nothing".

To diagnose this class of problem from the running application, set
`DSH_GITHUB_SYNC_DIAGNOSTICS` to a file path before launching DSH: every git call
then appends its argv, cwd, exit code, stream lengths, whether a stream and
collected readers were present, duration, and timeout flag. With no such
variable there is no file, no I/O, and no behaviour change.

## Languages

The control's copy is registered with the Client locale service under the
`github-sync` namespace, so it follows the active UI language automatically: the
button tooltip, menu title, every action label, the input placeholder, the state
words, and the error text. English and Simplified Chinese dictionaries are
included; any other locale falls back to English, which the service guarantees
as the terminal of every fallback chain.

Switching the UI language re-renders the menu in the new language without a
reload — the slot declares its `locale` namespace, so the `t` it receives is
bound to the active locale and the registration's `label` is a thunk.

`locale/en.json` and `locale/zh.json` are the plugin manifest's display text
(the Plugin Manager card and the Settings inventory), which the Host reads
without activating the plugin and therefore cannot translate through the Client
service. The agent tools and the `/github` command description are Host-side
text with no locale service available to them, so they stay English.

## Configuration

Every field is optional. Set them on the `github-sync` row in the profile's
`cordis.patch.yml`; omitted fields keep the defaults below.

```yaml
- id: github-sync
  name: 'dsh-github-sync'
  config:
    token: ''                 # GitHub PAT for HTTPS push/pull; prefer tokenEnv
    tokenEnv: GITHUB_TOKEN    # environment variable read when token is empty
    injectToken: true         # send the token as a per-command HTTP header
    gitUserName: DSH Agent    # used only where the repo configures no user.name
    gitUserEmail: dsh-agent@localhost
    remote: origin
    branch: ''                # branch to check out after a fresh clone
    generateCommitMessage: true
    commitLanguage: auto      # auto follows the local language; zh/en force one
    commitProvider: ''        # provider route for message generation
    commitModel: ''           # model id for message generation
    commitDiffBytes: 12000    # diff context sent to the model
    pullRebase: true          # pull --rebase --autostash
    fetchOnStatus: false      # fetch before reporting ahead/behind counts
    statusOnMount: true       # check when a session appears, or only when opened
    subdirectory: ''          # repository below the workspace root, when there is one
    timeoutMs: 600000
```

`token` and `tokenEnv` are read from the plugin config, then `process.env`. The
token is never written into `.git/config`: it is passed as
`http.<host>/.extraHeader`, so `git remote -v` and a later push of repository
metadata cannot leak it.

A wrong-typed or unknown field fails activation with a clear message rather than
silently changing behaviour mid-push.

## Commit titles

`commit` and `sync` stage every change, then produce a
[Conventional Commits](https://www.conventionalcommits.org/) subject that says
what changed, in the language the workspace runs in:

1. The model named by `commitProvider`/`commitModel`, else the deployment's
   default model, is asked for one subject line using the staged diff, the
   diffstat, and the recent subjects. It is told to name the module, behaviour,
   command, or file that actually changed — never how many files changed — and
   to write the summary in the resolved language.
2. If generation is disabled, unavailable, or returns nothing, a deterministic
   synthesis builds the subject from the change set, so a push is never blocked
   by the generator. It reads `git diff --cached --name-status` and the staged
   patch, and names the change in this order:
   - the declarations the patch adds or removes (`feat(commit): add
     resolveSubjectLanguage`),
   - the documentation section an added heading opens (`docs: update the
     "Commit titles" section`),
   - otherwise the files it touches (`chore(config): update lib/config.js and
     package.json`), naming at most three and summarizing the rest.

   "`chore: update 6 files`" is deliberately not reachable: the file count is
   the one fact a diffstat already gives and the one fact that says nothing
   about the change.

The subject language is `commitLanguage` when it names one, and otherwise the
local language: `LC_ALL`/`LC_MESSAGES`/`LANG`, then the runtime's resolved
locale — on Windows, the user's regional setting, so a `zh-CN` machine gets
Chinese subjects without any configuration. `zh` and `en` force one. The
**type token stays English** in both, so `feat`/`fix`/`docs` still parse in a
changelog; only the summary is localized.

Pass `--message "<subject>"` (command) or `message` (tool) to use a subject
verbatim instead. When the deterministic path is used, the commit step reports
why — a missing model route, an aborted stream, or a model that returned no
text — so a changed message style is never unexplained.

## Tool reference

### `github_clone`

| Argument | Meaning |
|---|---|
| `repo` (required) | `owner/repo`, `https://…`, `git@…:owner/repo`, `host/owner/repo`, or an absolute local path. |
| `dir` | Target directory, relative to the workspace or absolute. Defaults to a new subdirectory named after the repository, so the clone never lands in the workspace root. |
| `branch` | Branch or tag to check out instead of the remote default. |
| `depth` | Create a shallow clone of this many commits. |

### `github_sync`

| Argument | Meaning |
|---|---|
| `action` (required) | `status`, `pull`, `commit`, `push`, or `sync`. |
| `repo` | Repository directory; defaults to the session workspace. |
| `remote` | Remote name; defaults to the plugin config. |
| `message` | Commit subject used verbatim instead of generating one. |
| `pull` | For `sync`, pull with rebase before pushing. A failed pull stops the sync before the push. |
| `allowEmpty` | Allow a commit when nothing changed. |

## Error behaviour

A failed step is reported in the outcome with `status: failed` and a reason, and
steps after it are skipped, so a broken pull can never be followed by a push.
A non-zero git exit that the caller can act on (nothing to commit, no upstream
branch) is a reported result rather than an exception. Cloning rejects instead
of returning a partial outcome, because there is nothing to act on and cloning
over an existing repository is worth surfacing loudly.

## Install state

The bundle is installed in the `desktop` profile as a **GitHub dependency**, not
as a link to a checkout. The profile's `package.json`
(`~/.dsh/profiles/<profile>/package.json`) reads:

```json
{
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-github-sync"]
    }
  },
  "dependencies": {
    "dsh-github-sync": "github:fw867/dsh-github-sync"
  }
}
```

pnpm (`nodeLinker: hoisted`) materializes that reference as a **real copy** under
the profile's `node_modules`, with no `.git` and no reparse point back to any
working tree. Editing a checkout therefore changes nothing that DSH loads: the
copy is only replaced when the dependency is installed again — for the Plugin
Manager, an update of the plugin row.

So the round trip for a change is:

1. commit and push it to `github.com/fw867/dsh-github-sync`;
2. update the plugin in the Plugin Manager (which re-runs the profile install);
3. restart DSH for a Host-half change, and reload the page for a Client-half one.

A `link:` (or `file:`) dependency pointed at the checkout replaces steps 1–2 for
local development: the profile then reads the working tree directly, and only the
Host module cache still needs the restart. It is a development arrangement, so it
does not belong in this repository's documented install.

The Host pins the plugin module in its ESM cache, so a Host-half change always
needs the restart; the Client half is served as a revisioned bundle and is picked
up when its artifact changes.
