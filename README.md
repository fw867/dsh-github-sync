# dsh-github-sync

Adds GitHub synchronization to a DSH workspace. It contributes one shared
operation engine with three entry points:

| Surface | Entry point |
|---|---|
| Agent tools | `github_clone` and `github_sync` |
| Human command | `/github status\|changes\|diff\|stage\|unstage\|commit\|amend\|undo\|branches\|switch\|delete-branch\|pull\|push\|sync\|clone <repo>\|init [url]\|setup <url>\|auth` |
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

**The menu dismisses itself when it should.** Escape, a press anywhere outside the
control, keyboard focus moving out of it, and the window losing focus all close
it; the listeners are registered only while it is open, and released when it
closes. A press inside the control — its own button or any of its items — does
not, because that press *is* the interaction. A popup that survives a click
elsewhere is covering the thing the person just clicked.

### Why a check leaves a row, and how to stop it

There is exactly **one** channel from the Client half to the Host: the Remote
command namespace. `commands.execute` appends a `command/run` / `command/done`
pair to the session before and after the handler runs, unconditionally.

**Nothing a plugin can do removes that row.** The evidence, from this DSH
version's own source: `execute` appends both events before any definition is
consulted; the only recording switch a command definition may declare is
`recordInput: false`, which hides the *arguments* and nothing else; the namespace's
Remote surface is `list` and `execute`, with no silent variant; `CommandSourceMap`
declares one source kind (`user`); and the row is rendered by the Chat target's own
event Definitions, which a plugin cannot suppress. So the row is a given, and the
plugin's only lever is its **size and frequency** — which is what everything below
is about.

| Lever | What it does |
|---|---|
| `statusOnMount: true` (default) | The workspace is checked when a session appears, so the sync badge is live without opening anything. One row per session. |
| `statusOnMount: false` | The check waits for the control to be opened. A session whose control is never opened stays clean — this is the one switch that removes a row outright. |
| `status --json --slim` | The mount check asks for the badge's fields only: no change list, no branch list. Measured at **210 bytes** on a 21-file tree, and it does not grow with the change count. |
| The answer carries pairs, not prose | A change is `[path, code]` and the counts are `[total, staged]`. The words a person reads are built where they are rendered, in the active language, and no field the control never reads is sent at all (`root`, `entries`, `fetchOnStatus`, and a branch's `upstream` were all dead weight). On the same 21-file tree the full answer is **762 bytes** where the old shape was 1953. |
| **Opening the menu re-reads the panel data** | That is the one moment a person is looking at the list, so a stale list is worse than the row it costs. Only a reopen within 1.2s reuses the answer already in hand, so a double-click does not probe twice. |
| **Returning to the window refreshes quietly** | Files change while the window is not looking — an editor outside DSH, a build, a `git switch` in a terminal. A `focus` on the window refreshes when the last answer is older than 20s, and announces no failure: a background check must never replace the menu with an error nobody asked for. |
| Read-only actions mostly do not re-check | `changes`, `status`, and `auth` cannot alter what the probe reports, so they do not trigger one. `diff` does refresh afterwards, because that click is the person asking to see the current state. |

Those two moments are the whole refresh policy. A timer was rejected on purpose:
it would spend a logged row every time it fired whether or not anything had
changed. DSH's own `workspaceFiles.changes` stream was considered too, and it
watches **one directory's direct entries** — an edit inside a subdirectory does
not notify it — so it would have added a client dependency for partial coverage of
the case the open-and-focus refreshes already cover exactly.

The preference lives in Host config, which the Client cannot read, so it arrives
with a check's answer, applies to the sessions created after that, and is
remembered in the browser's local storage. That last part matters for
`statusOnMount: false`: without it, every page reload would pay one mount check
before the first answer taught the Client the setting again — the exact row the
setting exists to avoid. A browser that refuses storage simply pays that one
check.

The probe payload carries only what a caller cannot work out for itself: each
change is a `[path, code]` pair, the counts are `[total, staged]`, and the words a
person reads (`staged added`, `modified`) are built where they are rendered, in the
active language. Fields nothing reads are not sent at all. On a 21-file tree that
is 762 bytes where the earlier shape was 1953, and the mount answer stays at 210
whatever the tree holds.

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

## Reviewing changes, and committing only some of them

`commit` records the whole tree by default — but "everything" is a decision, not
a default, so the plugin also answers *what* is about to be committed and lets a
caller narrow it.

The workspace check reports the change list along with the branch, so the menu
needs no second command to draw it. Each path carries its git status code and a
plain description of it (`staged added`, `modified, not staged`, `untracked`),
and the menu shows them with a checkbox and a **Diff** button:

- **Ticked is the default.** Unticking a path narrows the next
  **Commit locally** / **Commit & push**, whose label counts what will go in.
  Untick everything and the buttons are disabled with the reason, rather than
  sending a commit that can only do nothing.
- **Diff** asks for one path's patch. It shows the change against `HEAD` — what
  committing that path as it stands would record — and falls back to the index in
  a repository with no commit yet.

The same shape is on both other surfaces:

```
/github changes                      what changed, and on which side of the index
/github diff --file "lib/engine.js"  that path's patch
/github diff --stat                  the diffstat for everything
/github diff --staged                what is staged, not the whole change
/github stage --file "lib/a.js" --file "lib/b.js"
/github unstage --file "lib/a.js"
/github commit --file "lib/a.js"     commit that path, and only it
```

`github_sync` takes the same paths as `files`, plus `staged` and `stat` for
`diff`.

**A narrowed commit really is narrowed.** `files` stages the named paths and then
commits them with `git commit --only -- <paths>`, which records exactly those
paths and leaves every other staged change staged. That matters more than it
sounds: it is the difference between "commit this file" and "commit this file,
plus whatever else I had staged for later".

The subject is generated from the narrowed scope too, so a commit of one path
gets a subject about that path rather than about everything else that was dirty.

A named path that did not change is refused **by name** instead of being silently
dropped — a typo in a path otherwise looks like a commit that did nothing. And a
named path whose change was undone in the working tree is reported as
`commit: skipped — nothing to commit in 1 selected path`, not as a failure: the
request was satisfied, there was simply nothing to record.

`unstage` prefers `git restore --staged`, falls back to `git reset HEAD --` for
git before 2.23, and to `git rm --cached` in a repository whose first commit does
not exist yet.

## Branches, amending, and undoing

The daily loop needs three things beyond commit and push: another branch, a
corrected last commit, and a way back from one that should not have happened.

```
/github branches                        what is here, and what each one tracks
/github switch feature/one              move to an existing branch
/github switch feature/one --create --from main
/github delete-branch old-topic         refuses an unmerged branch
/github delete-branch old-topic --force the same, said on purpose
/github amend --keep --file "lib/a.js"  fold a file into the last commit
/github amend -m "fix(engine): …"        rewrite only the message
/github undo                            uncommit, keeping the changes staged
/github push --force                    --force-with-lease, never a bare --force
```

`branches` is one `for-each-ref` and reports each local branch with its upstream,
how far it has drifted (`↑2 ↓1`), whether the upstream is gone, and its relative
date. The menu renders the same list: the checked-out branch is marked `●` and
not clickable, another branch is one click away, and a field creates a new one —
creation is offered there because it cannot lose anything. **Deleting is
deliberately not** a menu button: it is the one branch action that can drop
commits, so it takes a name and, for an unmerged branch, an explicit `--force`.

Switching uses `git switch` and falls back to `git checkout` on git before 2.23.
A switch a dirty working tree would overwrite fails with git's reason **and** a
sentence saying the tree has uncommitted changes, because "error: Your local
changes would be overwritten" does not tell you what to do about it.

`amend` has three shapes and they are all explicit:

| Invocation | What it does |
|---|---|
| `amend --file <paths>` | Stages those paths and folds them into the last commit, `--only` them. |
| `amend -m "<subject>"` | Rewrites the message only. |
| `amend` | Generates a new subject from the staged changes. |

Amending with **nothing** staged and no subject is reported as
`amend: skipped — nothing is staged`, not performed: the rewrite would change
nothing but the commit's identity, and silently rewriting history that way is the
kind of thing a person should have asked for. After an amend the step says the
branch now differs from its upstream, because publishing it will need force.

`undo` is `git reset --soft HEAD~1`: the commit is gone and **every change it
held is staged again**, so committing re-creates it. A hard reset is not offered
at all — it is the version that loses work, and a wrong click must not be able to
reach it. Undoing the first commit is refused with the reason.

`push --force` adds `--force-with-lease` and nothing else. The lease is what ties
the overwrite to the remote state this clone last saw: if a colleague pushed in
the meantime, the force **fails** instead of discarding their work. A bare
`--force` is never sent, and `delete-branch` does not touch the remote branch at
all — deleting one there stays an explicit act on GitHub.

## Authentication

A private repository has to prove who is asking, and the plugin does not invent
an identity: it uses what the machine already has, in the order `auth` names.

| Order | Method | What it uses |
|---|---|---|
| 1 | `ssh` | The system's own ssh identity: a key in `~/.ssh`, an entry in `~/.ssh/config`, `GIT_SSH_COMMAND`, `SSH_AUTH_SOCK`, or identities held by ssh-agent. |
| 2 | `token` | This plugin's `token`/`tokenEnv`, sent as a per-command HTTP header. |
| 3 | `system` | The system credential helper — Git Credential Manager and the GitHub account it has cached — reached through the plain remote URL. |

`auth: auto` (the default) tries them in that order and **stops at the first
success**. A named method (`auth: ssh`, `auth: token`, `auth: system`) uses only
that one, for a deployment that wants the method it has verified.

A failed attempt falls through to the next one **only when the failure is an
authentication failure**: a rejected push, a diverged branch, or a declined hook
is reported as it is, because a second identity must never be given the chance to
succeed where the first was told no.

**ssh needs nothing per repository.** For a clone, the ssh form of the reference
is used outright (`git@github.com:owner/repo.git`). For a repository whose
`origin` is https, the rewrite is passed per command —
`-c url.git@<host>:.insteadOf=https://<host>/` — so `.git/config` is left exactly
as you left it, and the next fetch is https again.

**The token never reaches a file.** It rides as
`http.https://<host>/.extraHeader`, for clone, fetch, pull, and push alike, so
`git remote -v`, `.git/config`, and a later push of repository metadata cannot
leak it. The host comes from the remote, so a GitHub Enterprise host or a mirror
is authenticated too.

**Prompts are disabled, credentials that already exist are not.** The Host has no
terminal to answer a prompt, so `GIT_TERMINAL_PROMPT=0` makes git fail with
`terminal prompts disabled` instead of blocking. An askpass helper you configured
is kept, and so is the credential helper: `GCM_INTERACTIVE=never` only stops the
helper from launching a browser flow on its own. When nothing works, the failure
names every method tried and what each one said.

Run `/github auth` (or the `auth` action of `github_sync`) to see the whole
picture before blaming a repository: it reports the ssh identity found here, one
bounded non-interactive `ssh -T` handshake, the credential helpers configured,
whether a token is set, the remote in use, and a live `git ls-remote` per method
— which is the cheapest command that proves credentials work. It never prints a
secret; the one thing it may write is the host key a first `ssh` records.

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
    commitMaxTokens: 900     # one generated message, reasoning included
    commitLanguage: auto      # auto follows the local language; zh/en force one
    commitProvider: ''        # provider route for message generation
    commitModel: ''           # model id for message generation
    commitDiffBytes: 12000    # diff context sent to the model
    pullRebase: true          # pull --rebase --autostash
    auth: auto                # auto: ssh, then token, then the system helper
    fetchOnStatus: false      # fetch before reporting ahead/behind counts
    statusOnMount: true       # check when a session appears, or only when opened
    subdirectory: ''          # repository below the workspace root, when there is one
    timeoutMs: 600000
```

`token` and `tokenEnv` are read from the plugin config, then `process.env`. The
token is never written into `.git/config`: it is passed as
`http.<host>/.extraHeader`, so `git remote -v` and a later push of repository
metadata cannot leak it. See [Authentication](#authentication) for the order it
competes in and for what the machine may already offer.

A wrong-typed or unknown field fails activation with a clear message rather than
silently changing behaviour mid-push.

## Commit messages

`commit` and `sync` stage every change, then produce a
[Conventional Commits](https://www.conventionalcommits.org/) **message** — a
subject line and a short body — in the language the workspace runs in:

1. The model named by `commitProvider`/`commitModel`, else the deployment's
   default model, is asked for the message using the staged diff, the diffstat,
   and the recent subjects. The prompt asks for a subject that names the module,
   behaviour, command, or option that changed — never how many files changed, and
   never just the name of a symbol that was added — followed by two to four
   bullets saying what the change does now and why it matters. Both parts are
   written in the resolved language, with the type token left in English.
2. If generation is disabled, unavailable, or returns nothing, a deterministic
   synthesis builds the **subject** from the change set, so a push is never
   blocked by the generator. It reads `git diff --cached --name-status` and the
   staged patch, and names the change in this order:
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
Chinese messages without any configuration. `zh` and `en` force one. The
**type token stays English** in both, so `feat`/`fix`/`docs` still parse in a
changelog; only the prose is localized.

A generated body is committed as a second `-m`, which is how git joins the
paragraphs, and the commit step shows the message that landed followed by git's
own summary — not an echoed command line carrying a multi-paragraph argument.

Pass `--message "<subject>"` (command) or `message` (tool) to use a message
verbatim instead — that path takes no body, since you wrote it.

### Why the model call is shaped the way it is

Two details of the call are there because of a failure worth recording. The
completion budget (`commitMaxTokens`, 900) covers **reasoning as well as text**:
with the 200 it started at, a thinking model spent the whole budget on
`reasoning-delta` chunks and streamed no `text-delta` at all, so every commit
fell back to the deterministic subject with the note "model returned no text".

The call therefore also carries `purpose: 'session-title'`. That is the adapter's
own signal for "a utility answer, do not reason" — the DeepSeek adapter maps it
to reasoning effort `off`, and DSH's session-title generator calls the model the
same way. The fallback note counts the chunks it saw
(`model returned no text (0 text, 137 reasoning, 0 other chunks)`), so a
reasoning-only answer is distinguishable from a provider that failed.

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
| `action` (required) | `status`, `changes`, `diff`, `stage`, `unstage`, `commit`, `amend`, `undo`, `branches`, `switch`, `delete-branch`, `pull`, `push`, `sync`, `init`, `setup`, or `auth`. |
| `files` | Paths the action acts on. `commit`/`sync`/`amend` record exactly these and leave other staged changes staged; `stage`/`unstage` move them across the index; `diff` shows their patch. Omitted means everything. |
| `name` | Branch name for `switch` and `delete-branch`. |
| `create` / `from` | For `switch`: create the branch, optionally starting at `from`. |
| `force` | For `push`: `--force-with-lease` (never a bare `--force`). For `delete-branch`: delete an unmerged branch. |
| `keepMessage` | For `amend`: keep the existing message instead of generating one. |
| `staged` | For `diff`: show the index rather than every change against `HEAD`. |
| `stat` | For `diff`: show the diffstat instead of the patch. |
| `dir` | Repository directory, relative to the workspace or absolute, for every action; for `init`/`setup` it is the directory that becomes the repository root, and the configured `subdirectory` applies when it is omitted. |
| `repo` | Repository directory; defaults to the session workspace. |
| `url` | For `init`/`setup`: the remote to record and push to. |
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

### Telling the two halves apart

They update by different means, so they can disagree — and a stale Host looks
exactly like a bug in the code that was just written. The control therefore shows
**both**: the menu head reads `r18 · rev10`, its own build marker (replaced by a
page reload) and the Host revision that answered the workspace check (replaced
only by a reload of the Host module). `github_sync`'s `status`/probe payload
carries the same `revision` field for anything else that wants to know.

### Watching the checkout (development)

DSH's HMR reloads plugin source only when an `hmr` entry names the directory to
watch; the base bundle enables it with `root: []`, which keeps configuration
watchers but no source watchers. Watching a linked checkout means naming the
checkout itself, because watched paths follow `realpathSync()` and
`**/node_modules` is ignored by default — naming the junction would watch
nothing:

```yaml
# ~/.dsh/profiles/<profile>/cordis.patch.yml
- id: hmr
  disabled: false
  config:
    root: ["D:/path/to/dsh-github-sync"]
```

The watcher is registered at startup, so this edit itself needs one restart. The
directory's `.git` matches the default `**/.*` ignore, which keeps commits from
triggering reloads. Replacing the installed package — a Plugin Manager update —
still needs a restart, and the browser side keeps its own reload mechanism.
