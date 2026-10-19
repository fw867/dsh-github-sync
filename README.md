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
- **Commit & push** — stage everything, commit with a generated subject,
  integrate the upstream, push
- **Push only** — publish the current branch

### Nothing is published on top of a moved upstream

Publishing always integrates nothing silently. Two settings decide how much it
does for you:

| `integrateBeforePush` | On a diverged branch, `sync` / **Commit & push** |
|---|---|
| `false` — **the default** | Records the local commit, then refuses to push — exactly like **Push only** below |
| `true` | Records the local commit, replays it onto the upstream, and pushes; if the replay conflicts, aborts and cancels |

**The local commit is recorded first either way**, so the work is safe whatever
happens next. What the setting changes is whether the branch is replayed onto the
upstream for you.

It is off by default because replaying rewrites the parent of local commits: that
is invisible while they are unpublished, and disruptive once they are not. Turn it
on when this workspace publishes straight after committing and you would rather
integrate than be told to:

```yaml
- id: github-sync
  name: 'dsh-github-sync'
  config:
    integrateBeforePush: true
```

With it on, a replay that conflicts is **aborted** — the repository returns to
exactly the state it was in, the local commit intact, no half-merged files, no
rebase left in progress — and the push does not happen:

```
integrate: failed — replaying this branch onto the upstream conflicts.
Waiting upstream: 7c41fcb feat: shared.txt from colleague.
the rebase was aborted, so nothing was changed.
Resolve the conflict — merge or rebase by hand, or `/github pull` —
then run the action again. Nothing was pushed.
```

Aborting is what makes integrating safe to enable at all: the one outcome that
must never happen is a workspace left mid-rebase for a person to dig out of.

A push that would not fast-forward is refused, naming the commits in the way and
both counts:

```
push cancelled: <repo> has diverged from its upstream — 1 local commit(s) to
publish and 1 upstream commit(s) to integrate.
Waiting upstream: b007b8c feat: b.txt.
Merge or rebase first (`/github pull`), then push again.
To overwrite the upstream instead, pass --force.
```

`--force` is the one way past it, and it is always `--force-with-lease` — never a
bare `--force` — so a colleague's push still cannot be discarded silently.

The state is read when a session first appears, so switching to another workspace
immediately shows that workspace's sync state rather than the previous one's.

**The menu keeps its own size.** It opens upward from a button near the bottom of
the window, so it is bounded by the viewport (`min(72vh, 100vh - 96px)`) and
scrolls inside that bound; the action result inside it has a smaller ceiling of
its own. Without that, a long diff or a long log pushed the top of the menu off
the screen and the remainder could not be reached. The result also belongs to the
interaction that produced it: **closing the menu clears it**, so reopening shows
the panel rather than the previous visit's output.

**The menu dismisses itself when it should.** Escape, a press anywhere outside the
control, keyboard focus moving out of it, and the window losing focus all close
it; the listeners are registered only while it is open, and released when it
closes. A press inside the control — its own button or any of its items — does
not, because that press *is* the interaction. A popup that survives a click
elsewhere is covering the thing the person just clicked.

### Choosing the message, and the markers CI reads

Every commit-shaped action in the menu — **Commit & push** for a repository with a
remote, **Commit locally** for one without — **asks before it records**. Clicking
one opens a step under the buttons:

```
Commit & push · 3 path(s) will be recorded
Commit message   [AI generated] [Write my own]
CI markers       [skip ci] [release] [others…]
                 [Confirm & push] [Cancel]
```

The message and the markers belong to that decision, so they appear when the
decision is being made instead of sitting in the panel the whole time — a panel
that always shows a form for something nobody asked for reads as if it were already
doing it. The step names the action and counts what will be recorded, the action's
own button stays highlighted while it waits, and the blue button is the click that
runs the command. Its word follows the action it will run: **Confirm & push** when
the command publishes, **Record commit** for a local commit, where "push" would be
a lie. Everything that backs out works the way a person expects: **Cancel**,
clicking the action again, `Escape` (which leaves the step first and closes the menu
only on a second press), and closing the menu — an unconfirmed step never survives
to the next open.

The two choices the step carries:

| Choice | What it does |
|---|---|
| **AI generated** (default) | The message is generated from the staged changes, as described under [Commit messages](#commit-messages). |
| **Write my own** | A field for the message: the first line is the subject, later lines become the body. **Record it** is disabled while it is empty, with the reason. A `"` is written as `'`, because the message travels on the `/github` line and that line is parsed by quoting. |
| **CI markers** | `[skip ci]` and `[release]` as chips, plus a field for others (`hotfix, deploy`). A ticked chip fills and shows a `✓`, and the line under it states what the next commit will carry — `No marker will be added.` or `Will add: [release]` — with a **Clear** control once anything is set. |

The **Connect & push** row (`/github init <url>`, which commits and pushes as well)
uses whatever the last step left selected, and defaults to the generated message
with no markers.

**The marker selection outlives one commit.** It is component state, so it survives
commits within a session and is reset by a page reload — which is why the panel
states what the next commit will carry rather than leaving it to be discovered in
the message afterwards. **Clear** empties both the chips and the free-text field in
one go.

**The marker control is the only thing that decides what a commit carries.** The
model is asked for a Conventional Commits subject and a body and is never asked for
a marker, and the engine composes the selection onto line one after generation. A
subject that arrives already carrying a marker is therefore stripped before the
selection is applied — which matters because the prompt quotes the repository's
recent subject lines as examples to follow, so a model shown a `[release]` will
happily write one:

| Model wrote | Selected | Recorded |
|---|---|---|
| `feat: x [release]` | *(nothing)* | `feat: x` |
| `feat: x [release]` | `[skip ci]` | `feat: x [skip ci]` |
| `feat: x [release]` | `[release]` | `feat: x [release]` |
| `fix: handle [TAG] and [other]` | *(nothing)* | `fix: handle [TAG] and [other]` |

Only a marker the plugin knows — the chips, plus whatever is selected — is removed,
and only from the end of the line. `[TAG]` in prose is left alone, because syntax
cannot tell a marker from a bracketed word and a wrong guess would edit the message.

## Tests

```
pnpm test        # or: node test/run.mjs
```

Two files, both self-contained:

| File | What it pins |
|---|---|
| `test/commit-markers.mjs` | The strip, against real git: the marker control decides, prose brackets survive, a selected marker is never doubled |
| `test/markers.mjs` | The menu control: nothing selected appends nothing, a ticked chip appends once, **Clear** empties both fields, and the panel's own "Will add:" line matches the command that is issued |

They load the shipped `client.js` and read its dictionaries, so a renamed key or a
changed default fails here rather than in the browser. The client publishes its
internals only when a test declares itself one (`globalThis.__DSH_TEST__ = true`,
set before the bundle loads); a shipped page exposes nothing.


Markers are appended to the **subject line, right after the title**:

```
feat(ui): keep the menu inside the viewport [skip ci]
```

Line one is the part every surface keeps — the conversation header, `git log
--oneline`, a squash dialog, a tool that reads only the summary — so a marker
there survives all of them, where a trailing paragraph can be dropped by any of
them. The engine cleans what it is given: brackets are optional (`[skip ci]` and
`skip ci` are the same request), whitespace is collapsed, at most five markers
survive, and anything that is not plain words is dropped rather than committed.
Applying the same markers twice is idempotent, so amending a commit that already
carries them does not write `[skip ci] [skip ci]`.

On the other two surfaces the same two things are parameters:

```
/github commit --message "feat(ui): keep the menu inside the viewport" --marker "skip ci"
/github sync --marker release --marker "skip ci"
/github init https://github.com/me/repo.git --marker hotfix
```

`github_sync` takes `message` and `markers` the same way — those surfaces ask by
being given the values, which is what a caller already does.

### The same panel in the right sidebar

The composer button is a popup because a popup is the right shape for two clicks in
the middle of writing a message. It is the wrong shape for reading: it opens upward
from a button near the bottom of the window, so it is bounded, it scrolls, and its
height competes with everything else on screen.

So the menu carries **Open in the sidebar**, which opens a `github-sync` tab in
DSH's right sidebar — the dock that Files, Terminal, and the browser already live
in. There the panel is a column: full height, no dismissal, its own **Refresh**, and
room for a diff or a log to be read rather than scrolled through a letterbox.

It is **the same control**, not a second implementation: one component, two
containers. `surface: 'menu'` renders the button and the popup; `surface: 'pane'`
renders the panel as a column of the page. The probe, the change list, the message
options, the CI markers, the branch list, and the actions are one body of code, so a
rule added for one surface is present in the other by construction. What differs is
only what a popup needs and a pane does not: dismissal listeners, the height bound,
clearing the last result when it closes (a pane stays open, so its result stays
until the next action), and the sidebar item itself — a pane that offered to open a
pane would be nonsense.

The tab is registered the way DSH's own sidebar features register theirs:

| Piece | What it is |
|---|---|
| `ctx.get('sidebarRight')`, `ctx.get('sidebarRightTabs')` | The dock's two services, looked up through `ctx.get` and **never** read as properties. Cordis answers a read of an undeclared service with `cannot get property "sidebarRight" without inject`, and a plugin that throws while activating takes its fiber down with it — which is how an optional extra stops the client from booting. `ctx.get` returns `undefined` instead, and then there is simply no tab to add. |
| `ctx.sidebarRightTabs.register({ id, kind, priority: 'extension', title })` | The tab type. `id` is the implementation's identity — the package name — and is also the key the body and chip are registered under. A `kind` carries at most one `extension` beside the builtin one. |
| `ctx.slots.register({ name: 'sidebar.right.pane.tab', key: id, locale, inject }, Body)` | The pane body. It receives the session's standard props, which is how it knows which workspace to check. |
| `ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: id }, Chip)` | The tab chip. |
| `ctx.sidebarRight.openTab(kind)` | How the menu gets there — the dock's own controller, and the reason the panel expands when it opens. |

The whole registration is wrapped, and the menu item is offered only **after** the
tab registered: opening a kind nobody registered is an error on the dock's side, and
an item that can only fail is worse than no item. A refused registration costs one
menu entry and a warning, never the boot. Four states are asserted — a dock that is
present, one that is absent, one that refuses, and a context that throws on any read
of an undeclared service.

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

### What a check costs, per surface

Every workspace check is a `/github status --json` command, and the Host appends
every command to the session log — that is the only Client-to-Host channel, so a
check is a visible row in the conversation. The cost is therefore measurable:

| Surface | Rows |
|---|---|
| Composer button mounts | 1 slim (`--slim`: branch and drift, no lists) |
| The menu is opened | 1 full, unless a full answer is under 1.2 s old |
| The sidebar pane is shown | 1 full, then reused while fresh |
| The window regains focus | 1 full, at most once per 20 s |

**So removing the composer button does not make the rows disappear** — the pane
still checks once when it is shown. What it removes is the *per-session* check that
happens whether or not anything is opened. A sidebar-only deployment pays its one
row when the tab is opened, and nothing while it is closed.

Two behaviours exist because the alternative was a panel that lost its content:

- A full request that arrives while a slim check is in flight is **queued**, not
  dropped. The slim answer has no change or branch list and the effect that asked
  is not going to ask again, so dropping it left the panel empty until something
  else refreshed it.
- A slim answer never replaces a full one in the cache. It is a smaller answer to
  the same question; letting it overwrite the lists emptied them.

### Staying open

The sidebar tab registers with `keepMounted`, so switching to another tab and back
does not rebuild it — the action result, the ticked markers and a half-entered
commit survive. The composer popup is a popup and still closes on an outside press
or Escape, but it no longer closes when another application takes focus: a
notification or a taskbar click used to make it vanish while it was being used.

### Coming along to the next session

Every session's right sidebar starts **collapsed** — that is the product's rule, not
this plugin's — so a panel left open in one conversation is simply gone in the next.
For a control whose whole point is a permanent column that reads as "it closed
itself". *Open with the session* (on by default, and remembered in the browser)
expands the panel when you switch to a session that is a repository.

It stays narrow on purpose:

| Situation | What happens |
|---|---|
| Repository session, column collapsed | The panel opens |
| Repository session, column expanded | Left alone — it may be showing another plugin's tab |
| Workspace is not a repository | Left alone — there is nothing to show |
| The preference is off | Never opens |

Whether a session is a repository comes from the workspace check, so a deployment
that sets `statusOnMount: false` and never opens the panel manually will not see it
open: the plugin does not spend a logged command purely to decide whether to expand
a column. The default (`true`) means the mount check answers before the first
switch.

The call is also retried once: a session's store is minted as that session renders,
so an expansion requested in the same commit can arrive before the store exists.

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

### The list is the commit's contract

The change list shows **what git reports**: a modification, a deletion, a rename, a
conflict, and **a file git does not track yet**. It does not show:

| Not listed | Why, and what happens to it |
|---|---|
| A path `.gitignore` matches | Git does not offer it either, so nothing has to withhold it. The one case git *does* keep reporting is a file committed **before** the pattern was added: it is in the index, so git shows its modifications because a commit would include it. `changesScope: 'tracked'` treats `.gitignore` as the last word there and excludes it via a pathspec exclusion. |
| Anything already ignored and untracked | Git never reports these without `--ignored`, and the plugin never asks for them. |

`changesScope` decides which of git's answers the list uses:

| Value | Lists | Stages |
|---|---|---|
| `all` — **the default** | Everything git reports, a new file included | `git add -A`, so the commit records exactly what was listed |
| `tracked` | Only changes to files git already has | `git add --update`, plus a pathspec exclusion per ignored tracked path |

A new file has to be **listed to be selectable**: under `tracked` there was no way
to bring one into a commit from the control at all, only with `git add` by hand.
`all` is therefore the default, and the list and the commit agree in both modes —
the button records what it showed, never more.

That also means `all` will commit **whatever is untracked and not ignored** in the
workspace. When a workspace fills with build output or scratch files, choose
`tracked` (`changesScope: tracked`), or add them to `.gitignore` — which both modes
respect.

What the list leaves out is still **disclosed as a count** (`{count} change(s) are
not listed: …`), because a repository whose only change is a new file must not look
untouched: the badge stays dirty and the menu says why the list is empty. Both
modes are checked against a real repository: an ignored file never appears in
either, a new file is listed and committed under `all` but withheld and left
untracked under `tracked`, a rename stays one entry carrying its original path, and
a commit records the listed paths and nothing else.

The workspace check reports the change list along with the branch, so the menu
needs no second command to draw it. Each path carries its git status code and a
plain description of it (`staged added`, `modified, not staged`, `untracked`), and
the menu shows them with a checkbox and a **Diff** button:

- **Ticked is the default.** Unticking a path narrows the next
  **Commit locally** / **Commit & push**, whose label counts what will go in.
  Untick everything and the buttons are disabled with the reason, rather than
  sending a commit that can only do nothing.
- **Diff** asks for one path's patch, and opens it as **a tab of its own** in the
  right sidebar. A patch is a document: it is compared against another patch, kept
  open while the change list is read, and closed when it is done with. So it does
  not take over the repository panel — the change list stays where it was, and each
  file gets its own tab titled `Diff: <path>`, so two files are two tabs.

  It is opened through a **resource address** (`dsh-resource://github-diff/<session>/<path>`,
  the path URI-encoded) rather than a plain page tab, because an address is what
  makes the chip able to name the file and what keeps two files in two tabs.

  Where a patch lands follows the capabilities the deployment has:

  | The deployment | Clicking **Diff** |
  |---|---|
  | Has the dock's tab registry | Opens a tab of its own (above) |
  | Has the dock but no tab registry | Opens the repository panel and shows the patch there |
  | Has no dock | Runs the diff and renders it in the menu |

  It shows the change against `HEAD` — what committing that path as it stands
  would record — and falls back to the index in a repository with no commit yet.

### Rendering a patch

The patch is not printed verbatim. `git diff` output is parsed into rows and drawn
as a comparison, because the raw text buries the change in metadata:

| Rendered | Dropped |
|---|---|
| Two line-number gutters, old and new | `diff --git`, `index`, file modes, rename/copy headers |
| A `+` / `−` / space sign in its own column | `--- a/…` and `+++ b/…` |
| Added lines on the success colour, removed on the error colour | The engine's own `<path> (branch …)` and `- diff: …` wrapper |
| The hunk header, on its own row | |

A file whose patch carries no lines — a binary — is still **named**, with a note
that there is nothing to compare, rather than dumping git's binary notice. Nothing
is invented for it.

The parser is deliberately conservative: text that is not a patch is rendered
verbatim, because reading a log or an error as structure would be making it up.
That is also what keeps one code path honest — the change list, the branch list,
and a commit's own log all travel as the same outcome text.

#### The test seam

The module-level maps the two mounted instances communicate through, and the two
pure functions the patch rendering is built from, live in the client bundle's
factory closure: nothing outside can seed or observe them, and the bundle's only
contract is a `load` call.

Tests need them, and only tests should be able to. So they are published under
`globalThis.__githubSyncInternals` **only** when the page has declared itself a
test run:

```js
globalThis.__DSH_TEST__ = true   // set before the bundle loads
```

A shipped page sets nothing and therefore exposes nothing. The guard is an
identity test, `globalThis.__DSH_TEST__ === true`, so a `"true"` string, a `1`, or
any other truthy value does not open it. The client adds exactly one global, and
only behind that flag.

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
    changesScope: all         # all: git's view, untracked files included
    subdirectory: ''          # repository below the workspace root, when there is one
    integrateBeforePush: false # replay local commits onto the upstream before pushing
    timeoutMs: 600000
```

`token` and `tokenEnv` are read from the plugin config, then `process.env`. The
token is never written into `.git/config`: it is passed as
`http.<host>/.extraHeader`, so `git remote -v` and a later push of repository
metadata cannot leak it. See [Authentication](#authentication) for the order it
competes in and for what the machine may already offer.

A wrong-typed or unknown field fails activation with a clear message rather than
silently changing behaviour mid-push — including an enumeration such as
`changesScope`, which accepts only `tracked` or `all`.

## Commit messages

`commit` and `sync` stage what the change list showed, then produce a
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
| `markers` | CI markers appended to the subject line after the title: `["skip ci"]` writes `feat: x [skip ci]`, `["release", "skip ci"]` writes both in that order. Plain words only, at most five, brackets optional. For `commit`, `sync`, `amend`, `init`, and `setup`. |
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
