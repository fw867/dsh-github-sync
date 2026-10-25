window.__ModuleLoader__.load({
  id: 'dsh-github-sync',
  factory(require) {
    const React = require('react')

    /**
     * GitHub sync control for the composer tool row.
     *
     * The workspace is probed through `/github status --json` the first time a
     * session's menu opens and the answer is cached per session, because the
     * probe is a real command that the Host logs into the conversation. With a
     * repository the menu offers status, pull, commit & push, and push; without
     * one it offers clone and init, because pull and push have nothing to act
     * on. Every action runs the Host's `/github` command through the Remote
     * command namespace, so a button press and a model tool call perform one
     * identical operation.
     */

    /** Namespace for this control's copy, registered with the Client locale service. */
    const LOCALE_NAMESPACE = 'github-sync'

    /**
     * The right sidebar tab this plugin adds.
     *
     * `id` is also the key the pane body and its chip title are registered under;
     * `kind` is the page type the navigation controller opens. They are kept
     * **equal** on purpose. The dock dispatches a tab body under `definition.id`,
     * but falls back to `tab.kind` while that definition is not registered — a
     * restored tab is mounted before its plugin's effect runs, and a listener that
     * throws or is re-registered takes the definition away for a moment. With two
     * different strings that fallback looks up a key nobody registered, and the
     * pane shows the dock's "nothing can view this" message. One string makes a
     * restored tab render in every one of those states.
     */
    const SIDEBAR_ID = 'github-sync'
    const SIDEBAR_KIND = SIDEBAR_ID

    /**
     * The second tab this plugin adds: one file's patch, on its own.
     *
     * A patch is a document — it is compared against another patch, kept open while
     * the commit list is read, and closed when it is done with. Showing it inside
     * the repo panel made it share that panel's fate; a tab of its own is the shape
     * the Files and document previews already use for the same reason.
     *
     * It is opened through a **resource address**, not `openTab`: a resource tab is
     * recorded under the address, so two files are two tabs, and `title(address)`
     * is captured when the tab mints — which is how the chip can name the file.
     */
    // Same identity/kind rule as the repository tab: a restored diff tab must
    // find its body even while its type definition is not registered yet.
    const DIFF_ID = 'github-sync-diff'
    const DIFF_KIND = DIFF_ID
    const DIFF_PREFIX = 'dsh-resource://github-diff/'

    /** English copy; the locale service always falls back here. */
    const EN = {
      'title': 'GitHub sync',
      'button.tooltip.repo': '{branch} · {state}',
      'button.tooltip.none': 'No repository in this workspace',
      'action.refresh': 'Refresh status',
      'action.pull': 'Pull',
      'action.commit': 'Commit locally',
      'action.sync': 'Commit & push',
      'action.push': 'Push only',
      'action.integrate': 'Auto-rebase before push',
      'action.openWeb': 'Open project on GitHub',
      'action.clone': 'Clone',
      'action.init': 'Create an empty repository here',
      'action.setup': 'Connect & push',
      'action.retry': 'Check again',
      'action.refresh': 'Refresh',
      'sidebar.open': 'Open in the sidebar',
      'autoOpen.label': 'Open with the session',
      'autoOpen.hint': 'Expand this panel when you switch to a session that is a repository.',
      'sidebar.title': 'GitHub',
      'menu.checking': 'Checking this workspace…',
      'menu.found': 'Repository detected.',
      'menu.empty.hint': 'This workspace has no repository yet. Clone one, or create a new one here.',
      'menu.cloneNote': 'The clone adds a subdirectory named after the repository, so the files already here are left alone.',
      'menu.empty.cloneLabel': 'Clone from GitHub:',
      'menu.empty.initHint': 'Creates .git here and stages the current files.',
      'menu.connect.hint': 'This repository has no remote yet. Where should it live on GitHub?',
      'menu.connect.note': 'Create the repository on GitHub first. This records origin, commits everything, and pushes.',
      'menu.running': 'running {action}…',
      'field.placeholder': 'owner/repo, https URL, or local path',
      'field.cloneLabel': 'Repository to clone',
      'field.remoteLabel': 'GitHub repository to publish to',
      'state.detached': 'detached HEAD',
      'state.clean': 'clean',
      'state.dirty': 'uncommitted changes',
      'state.ahead': '{count} to push',
      'state.behind': '{count} to pull',
      'changes.title': 'Changes',
      'changes.summary': '{total} changed · {staged} staged',
      'changes.truncated': 'showing the first {shown}; more paths changed',
      'changes.diff': 'Diff',
      'diff.unknownPath': 'changed file',
      'diff.noText': 'No line-by-line comparison is available for this file.',
      'diff.tabTitle': 'Diff: {path}',
      'diff.chip': 'Diff',
      'diff.noPath': 'This tab has no file to compare.',
      'changes.diffLabel': 'Show the diff of {path}',
      'changes.noneSelected': 'Nothing is selected, so there is nothing to commit. Tick at least one path.',
      'changes.selected': '{count} of {total} selected for the next commit',
      'changes.all': 'all {total} selected',
      'changes.include': 'Include {path} in the next commit',
      'changes.unrepresentable': 'A path containing a double quote cannot be named on the /github line; commit it from the tool or a terminal.',
      'changes.hidden': '{count} change(s) are not listed: a file git does not track yet, or a path .gitignore excludes. `git add` the file if it belongs in the next commit.',
      'changes.clean': 'Nothing tracked has changed.',
      'commit.options': 'Commit message',
      'commit.mode.ai': 'AI generated',
      'commit.mode.custom': 'Write my own',
      'commit.customPlaceholder': 'First line is the subject; later lines become the body',
      'commit.customNote': 'A double quote is written as a single quote, because the message travels on the /github line.',
      'commit.markers': 'CI markers',
      'commit.markerHint': 'Appended to the subject line, right after the title.',
      'commit.markerNone': 'No marker will be added.',
      'commit.markerWillAdd': 'Will add: {markers}',
      'commit.markerClear': 'Clear',
      'commit.otherMarkers': 'Others',
      'commit.otherPlaceholder': 'comma separated, e.g. hotfix, deploy',
      'commit.needCustom': 'A custom message is selected but empty; type one or switch back to the generated message.',
      'integrate.hint':
        'Commit & push rebases local commits onto the upstream first. A conflict aborts the rebase and pushes nothing.',
      'log.lastCheck': 'Last check',
      'integrate.behind':
        'The remote has {count} new commit(s). With auto-rebase off, Commit & push would be refused — pull first or turn the switch on.',
      'commit.step': '{action} · {count} path(s) will be recorded',
      'commit.confirm': 'Record commit',
      'commit.confirmPush': 'Confirm & push',
      'commit.cancel': 'Cancel',
      'change.modified': 'modified',
      'change.added': 'added',
      'change.deleted': 'deleted',
      'change.renamed': 'renamed',
      'change.copied': 'copied',
      'change.type': 'type changed',
      'change.untracked': 'untracked',
      'change.conflicted': 'conflicted',
      'change.staged': 'staged {what}',
      'branches.title': 'Branches',
      'branches.current': 'the branch in use',
      'branches.switchLabel': 'Switch to {name}',
      'branches.create': 'Create',
      'branches.newLabel': 'New branch name',
      'branches.newPlaceholder': 'feature/name',
      'branches.truncated': 'showing the {shown} most recent; /github branches lists every one',
      'target.subdirectory': 'repository in {name}',
      'menu.target.label': 'Which repository:',
      'menu.target.entry': 'Repository in {name}',
      'menu.target.workspace': 'The workspace itself',
      'note.noWorkspace': 'This session has no workspace directory.',
      'error.unavailable': 'GitHub sync is unavailable: the command namespace is not reachable.',
      'error.commandMissing': 'This session does not offer the /github command yet. Start a new session to pick up the plugin.',
      'error.refused': 'Refused: {command}',
      'error.refusedWith': 'Refused ({code}): {message}',
      'error.completed': '{command} completed',
      'error.probeTimeout': 'the request timed out',
      'error.probeFailed': 'The workspace check failed: {reason}',
      'error.probeUnexpected': 'The workspace check returned an unexpected answer.',
    }

    /** Simplified Chinese copy. */
    const ZH = {
      'title': 'GitHub 同步',
      'button.tooltip.repo': '{branch} · {state}',
      'button.tooltip.none': '当前工作区没有 Git 仓库',
      'action.refresh': '刷新状态',
      'action.pull': '拉取',
      'action.commit': '本地提交',
      'action.sync': '提交并推送',
      'action.push': '仅推送',
      'action.integrate': '推送前自动变基',
      'action.openWeb': '打开 GitHub 项目主页',
      'action.clone': '克隆',
      'action.init': '在此新建仓库',
      'action.setup': '连接并推送',
      'action.retry': '重新检查',
      'action.refresh': '刷新',
      'sidebar.open': '在侧栏打开',
      'autoOpen.label': '打开会话时自动展开',
      'autoOpen.hint': '切换到属于仓库的会话时，自动展开这个面板。',
      'sidebar.title': 'GitHub',
      'menu.checking': '正在检查当前工作区…',
      'menu.found': '已检测到 Git 仓库。',
      'menu.empty.hint': '当前工作区还没有 Git 仓库。可以克隆一个，或在这里新建。',
      'menu.cloneNote': '克隆会新建一个以仓库命名的子文件夹，这里已有的文件不会被改动。',
      'menu.empty.cloneLabel': '从 GitHub 克隆：',
      'menu.empty.initHint': '会创建 .git 并将现有文件加入暂存区。',
      'menu.connect.hint': '这个仓库还没有远端。它应该放在 GitHub 的哪里？',
      'menu.connect.note': '请先在 GitHub 上创建该仓库。这一步会写入 origin、提交全部改动并推送。',
      'menu.running': '正在执行 {action}…',
      'field.placeholder': 'owner/repo、https 地址或本地路径',
      'field.cloneLabel': '要克隆的仓库',
      'field.remoteLabel': '要发布到的 GitHub 仓库',
      'state.detached': '游离 HEAD',
      'state.clean': '干净',
      'state.dirty': '有未提交改动',
      'state.ahead': '{count} 个待推送',
      'state.behind': '{count} 个待拉取',
      'changes.title': '改动',
      'changes.summary': '共 {total} 项改动 · 已暂存 {staged}',
      'changes.truncated': '只显示前 {shown} 项，还有更多改动',
      'changes.diff': '差异',
      'diff.unknownPath': '改动的文件',
      'diff.noText': '该文件没有可逐行对比的内容。',
      'diff.tabTitle': '差异：{path}',
      'diff.chip': '差异',
      'diff.noPath': '这个标签页没有可对比的文件。',
      'changes.diffLabel': '查看 {path} 的差异',
      'changes.noneSelected': '没有选中任何文件，无法提交。请至少勾选一项。',
      'changes.selected': '已选中 {count}/{total} 项，将进入下次提交',
      'changes.all': '已全选 {total} 项',
      'changes.include': '把 {path} 纳入下次提交',
      'changes.unrepresentable': '路径里含双引号，无法写在 /github 命令行上；请用工具或终端提交它。',
      'changes.hidden': '另有 {count} 个改动未列出：尚未被 git 跟踪的文件，或已被 .gitignore 排除的路径。要让它进入本次提交，请先 `git add` 它。',
      'changes.clean': '已跟踪的文件没有改动。',
      'commit.options': '提交信息',
      'commit.mode.ai': 'AI 生成',
      'commit.mode.custom': '自定义',
      'commit.customPlaceholder': '首行是标题，后续行会成为正文',
      'commit.customNote': '双引号会被写成单引号 —— 消息要经由 /github 命令行传递。',
      'commit.markers': 'CI 标识',
      'commit.markerHint': '追加在标题行末尾，紧跟主标题之后。',
      'commit.markerNone': '不会添加任何标识。',
      'commit.markerWillAdd': '将添加：{markers}',
      'commit.markerClear': '清空',
      'commit.otherMarkers': '其它',
      'commit.otherPlaceholder': '逗号分隔，例如 hotfix, deploy',
      'commit.needCustom': '已选择自定义信息但内容为空；请填写，或切回 AI 生成。',
      'integrate.hint': '“提交并推送”会先把本地提交 rebase（变基）到上游。发生冲突时会中止变基，不会推送。',
      'log.lastCheck': '最近检查',
      'integrate.behind':
        '远端有 {count} 个新提交。关闭自动变基时，“提交并推送”会被拒绝；请先拉取，或打开这个开关。',
      'commit.step': '{action} · 将记录 {count} 个路径',
      'commit.confirm': '确认提交',
      'commit.confirmPush': '确认推送',
      'commit.cancel': '取消',
      'change.modified': '已修改',
      'change.added': '新增',
      'change.deleted': '已删除',
      'change.renamed': '已重命名',
      'change.copied': '已复制',
      'change.type': '类型改变',
      'change.untracked': '未跟踪',
      'change.conflicted': '有冲突',
      'change.staged': '已暂存{what}',
      'branches.title': '分支',
      'branches.current': '当前所在分支',
      'branches.switchLabel': '切换到 {name}',
      'branches.create': '新建',
      'branches.newLabel': '新分支名',
      'branches.newPlaceholder': 'feature/name',
      'branches.truncated': '只显示最近 {shown} 个；/github branches 可列出全部',
      'target.subdirectory': '仓库位于 {name}',
      'menu.target.label': '操作哪个仓库：',
      'menu.target.entry': '{name} 中的仓库',
      'menu.target.workspace': '工作区本身',
      'note.noWorkspace': '当前会话没有工作区目录。',
      'error.unavailable': 'GitHub 同步不可用：无法访问命令接口。',
      'error.commandMissing': '当前会话还没有 /github 命令。请新建一个会话以载入插件。',
      'error.refused': '请求被拒绝：{command}',
      'error.refusedWith': '请求被拒绝（{code}）：{message}',
      'error.completed': '{command} 已完成',
      'error.probeTimeout': '请求超时',
      'error.probeFailed': '工作区检查失败：{reason}',
      'error.probeUnexpected': '工作区检查返回了意外的结果。',
    }

    /** Actions offered when the workspace already holds a repository. */
    const REPO_ACTIONS = [
      { id: 'status', key: 'action.refresh' },
      { id: 'pull', key: 'action.pull' },
      { id: 'sync', key: 'action.sync' },
      { id: 'push', key: 'action.push' },
    ]

    /**
     * Actions offered for a repository that has no remote.
     *
     * Publishing cannot succeed without one, so the menu drops both push
     * entries and keeps what a local repository can still do.
     */
    const CONNECT_ACTIONS = [
      { id: 'status', key: 'action.refresh' },
      { id: 'commit', key: 'action.commit' },
    ]

    /**
     * Last known workspace state, per session.
     *
     * A probe is a real `/github` command, and the Host logs every command, so
     * probing eagerly or on every menu open would fill the conversation with
     * probe rows. One entry per session means the state is still read fresh the
     * first time a session's menu opens, and switching sessions shows what is
     * already known instead of paying again. Explicit actions refresh it.
     * `undefined` is never stored: a missing key means "not yet probed", and a
     * stored `null` means the probe failed.
     */
    const probeCache = new Map()

    /**
     * Sessions this control has already probed.
     *
     * The re-probe gate cannot be the cache alone: a probe that never answers
     * writes nothing to the cache, so a cache-only gate would re-probe on every
     * render forever. This set makes "one attempt per session" hold no matter
     * how the attempt ends; only an explicit retry or a completed action asks
     * for another one.
     */
    const probeAttempted = new Set()

    /**
     * Which answer each session's cache holds: `slim` or `full`.
     *
     * Every probe is a logged command row, so the answer that runs on mount asks
     * only for the badge's fields. Opening the menu needs the change list and the
     * branch list, and this map is how the control knows the cached answer does
     * not have them yet.
     */
    const probeShape = new Map()

    /**
     * When each session's full answer arrived, so a quick reopen reuses it.
     *
     * The window is short on purpose. Opening the menu is the only moment a person
     * is looking at the change list, so an answer older than this must be replaced
     * rather than shown: a stale list is worse than the one extra row it costs.
     */
    const probeFresh = new Map()

    /**
     * Sessions with a probe in flight.
     *
     * A probe that never answers writes nothing to either map, so the freshness
     * windows alone would let a second open start a second probe behind the first.
     * This is the in-flight gate; the windows are the reuse gate.
     *
     * It maps a session to the shape being fetched, not just its presence: a full
     * request that arrives during a slim one has to be remembered and replayed,
     * because dropping it leaves the panel with an answer that has no lists.
     */
    const probeInFlight = new Map()

    /** Sessions whose full answer was requested while a slim one was in flight. */
    const probeQueuedFull = new Set()

    /**
     * Components waiting for a probe they did not run.
     *
     * The probe cache is shared by the composer and the sidebar pane, but the
     * component that issued a queued fan-out is the one whose `setBusy` runs. The
     * other instance otherwise never re-renders, so it sits on *Checking this
     * workspace…* with an answer already in the cache. Each waiter is a state
     * poke, run once the cache has the answer.
     */
    const probeWakeups = new Map()

    /** Remember a component that must re-read the cache when this probe lands. */
    const waitForProbe = (address, wake) => {
      const waiting = probeWakeups.get(address) ?? new Set()
      waiting.add(wake)
      probeWakeups.set(address, waiting)
    }

    /** Re-render every component that was waiting on `address`, once. */
    const wakeProbes = (address) => {
      const waiting = probeWakeups.get(address)
      if (waiting === undefined) return
      probeWakeups.delete(address)
      for (const wake of waiting) {
        try {
          wake()
        } catch {
          // A component unmounted between the probe and its wake-up.
        }
      }
    }

    /**
     * Components that must re-read the sidebar availability.
     *
     * The right sidebar's services are optional and can arrive after this plugin
     * activates. Reading `ctx.get` once made the tab and its "Open in sidebar"
     * entry disappear on the runs where the dock won the race. `ctx.inject`
     * registers when they arrive; these listeners re-render the composer and
     * re-run auto-open once they are real.
     */
    const sidebarStateListeners = new Set()

    const notifySidebarState = () => {
      for (const listener of sidebarStateListeners) {
        try {
          listener()
        } catch {
          // A composer that unmounted between registration and notification.
        }
      }
    }

    /** How long a full answer may be reused by a reopen, in milliseconds. */
    const OPEN_REUSE_MS = 1200

    /** How long a badge answer stays fresh enough to skip a focus refresh. */
    const FOCUS_REFRESH_MS = 20000

    /**
     * How often a panel that is on screen re-reads the workspace.
     *
     * The change list is the one thing that goes stale while the window never
     * loses focus — the agent editing files in this very session is the ordinary
     * case — so a visible panel is re-read on this interval instead of waiting for
     * a focus event that never comes. The probe is sidebar-only, and a hidden tab
     * and an in-flight probe both skip a tick.
     */
    const PANEL_REFRESH_MS = 10000

    /** Where the mount-check preference survives a page reload. */
    const STATUS_ON_MOUNT_KEY = 'dsh-github-sync:status-on-mount'

    /** The remembered preference, or `undefined` when this browser has none. */
    const storedEager = () => {
      try {
        const raw = window.localStorage?.getItem(STATUS_ON_MOUNT_KEY)
        if (raw === 'true') return true
        if (raw === 'false') return false
        return undefined
      } catch {
        return undefined
      }
    }

    /** Remember the preference for the next page load. */
    const rememberEager = (value) => {
      try {
        window.localStorage?.setItem(STATUS_ON_MOUNT_KEY, value ? 'true' : 'false')
      } catch {
        // A browser that refuses storage simply pays the first check again.
      }
    }

    /**
     * Where "open the panel with the session" survives a page reload.
     *
     * Every session's sidebar starts collapsed — that is the product's rule, not
     * this plugin's — so a panel that stayed open in one session does not follow
     * you into the next one. For a control whose whole point is a permanent column
     * that is the wrong default, so this one is remembered in the browser: the
     * choice is the person's, and it has to outlast the tab.
     */
    const AUTO_OPEN_KEY = 'dsh-github-sync:auto-open'

    /** Whether switching to a repository session should expand the sidebar. */
    const readAutoOpen = () => {
      try {
        const raw = window.localStorage?.getItem(AUTO_OPEN_KEY)
        return raw === null || raw === undefined ? true : raw === 'true'
      } catch {
        return true
      }
    }

    /** Remember the choice for the next page load. */
    const rememberAutoOpen = (value) => {
      try {
        window.localStorage?.setItem(AUTO_OPEN_KEY, value ? 'true' : 'false')
      } catch {
        // A browser that refuses storage keeps the default for this page only.
      }
    }

    /**
     * Where the "auto-rebase before push" switch survives a page reload.
     *
     * The deployment setting is the default this starts from, delivered with a
     * probe's answer. A click that differs from it is remembered here, and only
     * that click changes the `/github sync` line: the switch and the config can
     * never disagree without the command saying which one applies.
     */
    const INTEGRATE_KEY = 'dsh-github-sync:integrate-before-push'

    /** The remembered override, or `undefined` when the deployment setting applies. */
    const readIntegratePreference = () => {
      try {
        const raw = window.localStorage?.getItem(INTEGRATE_KEY)
        if (raw === 'true') return true
        if (raw === 'false') return false
        return undefined
      } catch {
        return undefined
      }
    }

    /** Remember a click, or forget it when it agrees with the deployment again. */
    const rememberIntegratePreference = (value) => {
      try {
        if (value === undefined) window.localStorage?.removeItem(INTEGRATE_KEY)
        else window.localStorage?.setItem(INTEGRATE_KEY, value ? 'true' : 'false')
      } catch {
        // A browser that refuses storage keeps the switch for this page only.
      }
    }

    /**
     * Whether a workspace may be checked as soon as a session appears.
     *
     * This is a deployment-wide Host setting the Client cannot read, so it
     * arrives with a probe's answer and is remembered for every session created
     * afterwards. `undefined` behaves as the default `true`: the first check of a
     * fresh client is what teaches it the setting.
     *
     * It is remembered in the browser as well, because a reload would otherwise
     * pay one mount check before the first answer teaches it the setting again —
     * and that check is precisely the row a deployment turning the mount check
     * off is trying to avoid.
     */
    let eagerAllowed = storedEager() ?? true

    /**
     * Which workspace subdirectory each session's actions point at.
     *
     * Absent means "whatever the Host is configured to look at", which is the
     * common case. A present entry is a choice made from the control's target
     * list, kept for the rest of the session so the badge and every action agree
     * on one repository.
     */
    const targetChoice = new Map()

    /**
     * A diff the menu asked for, waiting for the sidebar pane to show it.
     *
     * The pane is a second mounted instance of the same component, so it cannot
     * see the menu's `output` state. The menu records the path here and opens the
     * pane; the pane consumes it on mount and runs the diff itself, which is also
     * why the entry is cleared before the command runs — a re-render must not
     * issue it twice.
     */
    const pendingDiff = new Map()

    /**
     * The test seam.
     *
     * The module-level channels above — and the two pure functions the patch
     * rendering is built from — live in this factory's closure, so nothing outside
     * can seed or observe them. Tests need to, and only tests should be able to:
     * the seam is published **only** when the page has declared itself a test run
     * by setting `globalThis.__DSH_TEST__`, so a shipped client exposes nothing.
     *
     * `parseUnifiedDiff` and `DiffView` are here for the same reason as the maps:
     * they are the units worth asserting on, and reaching them any other way would
     * mean exporting them from a bundle whose only contract is a `load` call.
     */
    if (globalThis.__DSH_TEST__ === true) {
      globalThis.__githubSyncInternals = {
        pendingDiff,
        probeCache,
        probeShape,
        probeWakeups,
        targetChoice,
        parseUnifiedDiff,
        DiffView,
      }
    }

    /**
     * How long a probe may take before the menu gives up and offers a retry.
     * Bounded on purpose: a Remote call that never settles would otherwise
     * leave the menu showing "checking" forever with no way out.
     */
    const PROBE_TIMEOUT_MS = 8000

    /** Sentinel meaning "the probe was abandoned", distinct from any answer. */
    const PROBE_TIMEOUT = Symbol('github-sync probe timeout')

    /**
     * How long the command listing may take before the probe stops waiting for
     * it.
     *
     * The listing only decides whether to fail early with "this session does not
     * offer /github yet"; it is not the answer itself. A listing that never
     * settles must not consume the probe's budget and hide what the command
     * would have said, so it is bounded separately and its absence is not
     * treated as an answer.
     */
    const LISTING_TIMEOUT_MS = 1500

    /**
     * Read the Remote command namespace from the injected Remote service.
     *
     * The Remote namespace is a Cordis context of its own, so a nested service
     * resolves by its full name: with only `remote` injected, touching
     * `remote.commands` throws `cannot get property "remote.commands" without
     * inject`. That throw used to escape the probe ahead of its own error
     * handling, which is why the check failed with an internal message instead
     * of an answer. Every read goes through here so an unreachable namespace
     * degrades to the existing "not reachable" report.
     *
     * @param remote - the injected Remote service, if any.
     * @returns the command namespace, or `undefined` when it is unreachable.
     */
    const commandsOf = (remote) => {
      try {
        const commands = remote?.commands
        return typeof commands?.execute === 'function' ? commands : undefined
      } catch {
        return undefined
      }
    }

    /**
     * Resolve to `undefined` when a promise does not settle within `ms`.
     *
     * @param promise - the call to bound.
     * @param ms - the budget in milliseconds.
     */
    const withTimeout = (promise, ms) =>
      new Promise((resolve) => {
        const timer = setTimeout(() => resolve(undefined), ms)
        const settle = (value) => {
          clearTimeout(timer)
          resolve(value)
        }
        Promise.resolve(promise).then(settle, () => settle(undefined))
      })

    /**
     * The command this control drives. The probe asks the Host whether its
     * session offers it before invoking it: a session that predates the command
     * (or lost it) must fail immediately with an explanation rather than wait
     * out the probe timeout for an answer that is never coming.
     */
    const COMMAND_NAME = 'github'

    /**
     * Build marker, shown in the menu. Two long debugging rounds could not
     * establish from the outside whether the page had picked up a new bundle,
     * so the menu states which revision it is running. Remove once the control
     * is settled.
     */
    const BUILD = 'r50'

    const S = {
      wrap: { position: 'relative', display: 'inline-flex' },
      button: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        maxWidth: 220,
        height: 26,
        padding: '0 8px',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        borderRadius: 6,
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 12,
        lineHeight: '18px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      },
      buttonActive: { color: 'var(--dsw-alias-label-primary)' },
      buttonText: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      dot: { width: 6, height: 6, borderRadius: 3, flex: '0 0 auto' },
      menu: {
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        left: 0,
        zIndex: 30,
        width: 'min(560px, calc(100vw - 24px))',
        minWidth: 320,
        // The menu grows upward from a button near the bottom of the window, so it
        // has to be bounded by the viewport and scroll inside that bound. Without
        // this a long diff or a long action result pushed the top of the menu off
        // the screen, and the part that was left could not be scrolled to.
        maxHeight: 'min(72vh, calc(100vh - 96px))',
        overflowY: 'auto',
        overflowX: 'hidden',
        overscrollBehavior: 'contain',
        boxSizing: 'border-box',
        padding: 6,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        border: '0.5px solid var(--dsw-alias-border-l2)',
        borderRadius: 10,
        background: 'var(--dsw-alias-bg-overlay)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
      },
      head: {
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 8,
        padding: '4px 8px 6px',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 11,
        lineHeight: '16px',
      },
      headTitle: { color: 'var(--dsw-alias-label-primary)', fontSize: 12 },
      item: {
        display: 'block',
        width: '100%',
        boxSizing: 'border-box',
        padding: '6px 8px',
        border: 0,
        borderRadius: 6,
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 13,
        lineHeight: '18px',
        textAlign: 'left',
        textDecoration: 'none',
        cursor: 'pointer',
      },
      itemDisabled: { color: 'var(--dsw-alias-state-idle-primary)', cursor: 'default' },
      /** The action whose message is being decided right now. */
      itemPending: { color: 'var(--dsw-alias-brand-primary)', fontWeight: 600 },
      changeRow: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
        padding: '1px 8px',
      },
      changePath: {
        // A path is shown in full. Truncating it to one ellipsised line hid
        // exactly the part that distinguishes two similar files, and the widened
        // menu means most paths fit on one line anyway. Long ones wrap; `break-all`
        // is deliberate, because a path has no spaces to break at.
        flex: '1 1 auto',
        minWidth: 0,
        color: 'var(--dsw-alias-label-primary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 11,
        lineHeight: '16px',
        whiteSpace: 'normal',
        wordBreak: 'break-all',
      },
      changeAction: {
        flex: '0 0 auto',
        height: 20,
        padding: '0 6px',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        borderRadius: 4,
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 11,
        lineHeight: '14px',
        cursor: 'pointer',
      },
      hint: {
        padding: '2px 8px 6px',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 11,
        lineHeight: '16px',
        whiteSpace: 'normal',
      },
      field: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        boxSizing: 'border-box',
        padding: '2px 8px 6px',
      },
      input: {
        flex: '1 1 0%',
        width: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        height: 28,
        padding: '0 8px',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        borderRadius: 6,
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 12,
        lineHeight: '18px',
      },
      action: {
        flex: '0 0 auto',
        height: 28,
        padding: '0 10px',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        borderRadius: 6,
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 12,
        lineHeight: '18px',
        cursor: 'pointer',
      },
      output: {
        // Logs and diffs are wide and long. The menu itself scrolls and is bounded
        // by the viewport, so this panel keeps a smaller ceiling of its own: it
        // shows the answer without pushing everything else out of reach.
        maxHeight: 'min(38vh, 300px)',
        minHeight: 54,
        boxSizing: 'border-box',
        margin: '4px 0 0',
        padding: '6px 8px',
        overflow: 'auto',
        borderTop: '0.5px solid var(--dsw-alias-border-l1)',
        color: 'var(--dsw-alias-label-secondary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 11,
        lineHeight: '16px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflowWrap: 'anywhere',
      },
      outputError: { color: 'var(--dsw-alias-state-error-primary)' },
      /** The one-line row kept for an explicit `/github` command. */
      commandRow: {
        boxSizing: 'border-box',
        padding: 0,
        overflow: 'hidden',
        color: 'var(--dsw-alias-label-secondary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 11,
        lineHeight: '14px',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
      },
      /** Pinned to the bottom of the sidebar pane: the status the probe would
       * formerly print as a JSON row above the composer. */
      logFooter: {
        marginTop: 'auto',
        padding: '6px 8px 2px',
        borderTop: '0.5px solid var(--dsw-alias-border-l1)',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 11,
        lineHeight: '16px',
      },
      chips: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, padding: '2px 8px' },
      chip: {
        flex: '0 0 auto',
        padding: '3px 8px',
        // Longhand, not the `border` shorthand: the selected state recolours the
        // edge and must not change its width. Growing the border by half a pixel
        // shifts the chip and redraws its outline, which reads as a dark frame
        // appearing around it — and that is exactly what it was doing.
        borderStyle: 'solid',
        borderWidth: 1,
        borderColor: 'var(--dsw-alias-border-l2)',
        borderRadius: 999,
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 11,
        lineHeight: '16px',
        cursor: 'pointer',
      },
      /** The line that states which markers the next commit will carry. */
      markerSummary: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        fontSize: 11,
        lineHeight: '16px',
      },
      markerSummaryOn: { flex: '1 1 auto', minWidth: 0, color: 'var(--dsw-alias-brand-primary)', fontWeight: 600 },
      chipOn: {
        // A selected marker has to be unmistakable at a glance: this list is the
        // last thing read before a commit, and an appended marker is invisible in
        // the command that follows. So the chip fills and ticks — colour alone is
        // not enough to read across a row of same-shaped pills, and it is the only
        // cue some people can use. The edge keeps its width and only recolours.
        borderColor: 'var(--dsw-alias-brand-primary)',
        background: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent)',
        color: 'var(--dsw-alias-brand-primary)',
        fontWeight: 600,
      },
      /** The auto-rebase switch reads as "green means protected" when on. */
      chipOnGreen: {
        borderColor: 'var(--dsw-alias-state-success-primary)',
        background: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 18%, transparent)',
        color: 'var(--dsw-alias-state-success-primary)',
        fontWeight: 600,
      },
      /** The one chip that carries the step through: the commit itself. */
      chipConfirm: {
        flex: '0 0 auto',
        padding: '4px 12px',
        border: 0,
        borderRadius: 999,
        // The product's own blue. The theme's `button-primary-fill` alias is a
        // neutral here (near-white in the dark theme), so the palette blue is what
        // makes the one control that carries the action unmistakable.
        background: 'var(--dsw-static-blue-500)',
        color: '#ffffff',
        fontSize: 11,
        lineHeight: '16px',
        fontWeight: 600,
        cursor: 'pointer',
      },
      customMessage: {
        margin: '2px 8px 4px',
        minHeight: 46,
        padding: '6px 8px',
        boxSizing: 'border-box',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        borderRadius: 6,
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        fontFamily: 'inherit',
        fontSize: 12,
        lineHeight: '17px',
        resize: 'vertical',
      },
      markerInput: {
        flex: '1 1 120px',
        minWidth: 100,
        padding: '3px 8px',
        boxSizing: 'border-box',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        borderRadius: 6,
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 11,
        lineHeight: '16px',
      },
      // The sidebar pane is a column of the page rather than a popup: it takes the
      // height it is given and scrolls, so a long diff or log has room that the
      // menu — bounded by a button near the bottom of the window — cannot have.
      pane: {
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        boxSizing: 'border-box',
        height: '100%',
        padding: 8,
        overflowY: 'auto',
        overflowX: 'hidden',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 13,
      },
      // A patch is read, not glanced at, so it is a block of its own rather than
      // the tail of the action log: a header naming the path and counting the
      // change, then the hunks.
      diff: {
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        margin: '4px 0 0',
        border: '0.5px solid var(--dsw-alias-border-l1)',
        borderRadius: 6,
        overflow: 'hidden',
        background: 'var(--dsw-alias-bg-base)',
      },
      diffHead: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        borderBottom: '0.5px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        fontSize: 11,
        lineHeight: '16px',
      },
      diffPath: {
        flex: '1 1 auto',
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: 'var(--dsw-alias-label-primary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
      diffStat: { flex: '0 0 auto', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
      diffBody: {
        // The pane already scrolls; this bounds its own scroll so a long patch
        // cannot push the change list out of reach in the popup.
        maxHeight: 'min(46vh, 420px)',
        overflow: 'auto',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 11,
        lineHeight: '16px',
      },
      diffHunk: {
        padding: '2px 8px',
        color: 'var(--dsw-alias-label-secondary)',
        background: 'var(--dsw-alias-bg-layer-1)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      },
      diffRow: { display: 'flex', alignItems: 'flex-start', whiteSpace: 'pre-wrap', wordBreak: 'break-all' },
      diffGutter: {
        flex: '0 0 auto',
        width: 34,
        padding: '0 6px 0 0',
        textAlign: 'right',
        color: 'var(--dsw-alias-state-idle-primary)',
        userSelect: 'none',
        fontVariantNumeric: 'tabular-nums',
      },
      diffSign: { flex: '0 0 auto', width: 12, textAlign: 'center', userSelect: 'none' },
      diffText: { flex: '1 1 auto', minWidth: 0, paddingRight: 8 },
      diffAdd: { background: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent)' },
      diffDel: { background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent)' },
      diffAddText: { color: 'var(--dsw-alias-state-success-primary)' },
      diffDelText: { color: 'var(--dsw-alias-state-error-primary)' },
      diffNote: { padding: '4px 8px', color: 'var(--dsw-alias-label-secondary)', fontSize: 11, lineHeight: '16px' },
    }

    /** Merge the base control style with a conditional override. */
    const style = (base, extra) => (extra === undefined ? base : { ...base, ...extra })

    /**
     * How deep the engine indents the patch it returns.
     *
     * A diff travels as the body of a `- diff: completed` step, so every line is
     * indented to sit under that bullet. The indent is uniform, which is what
     * makes it removable: the leading space of a context line is *inside* it, so a
     * dedent has to strip a fixed prefix rather than the common one.
     */
    const DIFF_INDENT = '    '

    /**
     * Turn a patch into rows a person can read.
     *
     * The input is what `git diff` printed, wrapped in the engine's outcome text
     * (a `<path> (branch <name>)` header, a `- diff: …` bullet, and the indented
     * patch). Only the patch is of interest: the metadata lines name a revision
     * nobody asked about, and the hunks carry the change.
     *
     * @param raw - the action's output text.
     * @returns `{ path, hunks, additions, deletions, binary }`, or null when the
     *   text holds no patch. Callers render the raw text in that case.
     */
    function parseUnifiedDiff(raw) {
      if (typeof raw !== 'string' || raw.length === 0) return null
      const lines = raw.split('\n')
      let path = null
      let binary = false
      let additions = 0
      let deletions = 0
      const hunks = []
      let hunk = null
      let oldNo = 0
      let newNo = 0
      let sawHeader = false

      for (const line of lines) {
        const body = line.startsWith(DIFF_INDENT) ? line.slice(DIFF_INDENT.length) : line
        if (body.startsWith('diff --git ')) {
          // `diff --git a/<path> b/<path>`: the b-side is the file as it will be.
          sawHeader = true
          const match = /^diff --git a\/(.+) b\/(.+)$/.exec(body)
          if (match !== null) path = match[2]
          continue
        }
        if (/^(index|new file mode|deleted file mode|old mode|new mode|similarity index|rename (from|to)|copy (from|to)) /.test(body)) {
          continue
        }
        if (body === 'Binary files differ' || body.startsWith('Binary files ')) {
          binary = true
          continue
        }
        if (body.startsWith('--- ') || body.startsWith('+++ ')) continue
        if (body.startsWith('@@')) {
          const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(body)
          oldNo = match === null ? 0 : Number(match[1])
          newNo = match === null ? 0 : Number(match[2])
          hunk = { header: body, rows: [] }
          hunks.push(hunk)
          continue
        }
        if (hunk === null) continue
        const sign = body.charAt(0)
        if (sign === '+') {
          hunk.rows.push({ kind: 'add', sign: '+', oldNo: null, newNo, text: body.slice(1) })
          newNo += 1
          additions += 1
        } else if (sign === '-') {
          hunk.rows.push({ kind: 'del', sign: '-', oldNo, newNo: null, text: body.slice(1) })
          oldNo += 1
          deletions += 1
        } else if (sign === ' ' || body.length === 0) {
          hunk.rows.push({ kind: 'ctx', sign: ' ', oldNo, newNo, text: body.slice(1) })
          oldNo += 1
          newNo += 1
        } else if (sign === '\\') {
          // `\ No newline at end of file` annotates the line above it.
          hunk.rows.push({ kind: 'note', sign: '', oldNo: null, newNo: null, text: body.slice(1).trim() })
        }
      }

      if (!sawHeader) return null
      // A binary patch has a header and no hunks, and that is worth naming: the
      // reader should see which file has no lines to compare rather than a
      // verbatim blob of git's output.
      if (hunks.length === 0 && !binary) return null
      return { path, hunks, additions, deletions, binary }
    }

    /**
     * One file's patch, as a block: where it is, how much changed, and the hunks.
     *
     * Both callers share the engine's outcome text, so the patch is parsed here
     * rather than fetched again — the command has already run by the time this
     * renders.
     */
    function DiffView({ patch, t }) {
      const head = React.createElement(
        'div',
        { style: S.diffHead },
        React.createElement('span', { style: S.diffPath, title: patch.path ?? '' }, patch.path ?? t('diff.unknownPath')),
        React.createElement(
          'span',
          { style: S.diffStat },
          React.createElement('span', { style: S.diffAddText }, `+${patch.additions}`),
          ' ',
          React.createElement('span', { style: S.diffDelText }, `−${patch.deletions}`),
        ),
      )
      if (patch.binary === true || patch.hunks.length === 0) {
        return React.createElement(
          'div',
          { style: S.diff },
          head,
          React.createElement('div', { style: S.diffNote }, t('diff.noText')),
        )
      }
      const body = []
      patch.hunks.forEach((hunk, hunkIndex) => {
        body.push(
          React.createElement('div', { key: `h${hunkIndex}`, style: S.diffHunk }, hunk.header),
        )
        hunk.rows.forEach((row, rowIndex) => {
          const background = row.kind === 'add' ? S.diffAdd : row.kind === 'del' ? S.diffDel : undefined
          const signColor = row.kind === 'add' ? S.diffAddText : row.kind === 'del' ? S.diffDelText : undefined
          body.push(
            React.createElement(
              'div',
              { key: `h${hunkIndex}r${rowIndex}`, style: style(S.diffRow, background) },
              React.createElement('span', { style: S.diffGutter }, row.oldNo === null ? '' : String(row.oldNo)),
              React.createElement('span', { style: S.diffGutter }, row.newNo === null ? '' : String(row.newNo)),
              React.createElement('span', { style: style(S.diffSign, signColor) }, row.sign),
              React.createElement('span', { style: S.diffText }, row.text),
            ),
          )
        })
      })
      return React.createElement(
        'div',
        { style: S.diff },
        head,
        React.createElement('div', { style: S.diffBody }, ...body),
      )
    }

    /**
     * The address a file's diff tab is recorded under.
     *
     * The path is encoded, because an address is a URI and a path may hold spaces
     * or `#`. `title()` decodes it again for the chip.
     */
    function diffAddress(sessionId, path) {
      return `${DIFF_PREFIX}${encodeURIComponent(sessionId)}/${encodeURIComponent(path)}`
    }

    /** The title of a diff tab: the file's own name, path and all. */
    function diffTitle(address, t) {
      const path = diffPathOf(address)
      return path === null ? t('sidebar.title') : t('diff.tabTitle', { path })
    }

    /** The path a diff address carries, or null when it is not one. */
    function diffPathOf(address) {
      if (typeof address !== 'string' || !address.startsWith(DIFF_PREFIX)) return null
      const rest = address.slice(DIFF_PREFIX.length)
      const slash = rest.indexOf('/')
      if (slash < 0) return null
      try {
        return decodeURIComponent(rest.slice(slash + 1))
      } catch {
        return rest.slice(slash + 1)
      }
    }

    /**
     * One file's patch, as a sidebar tab.
     *
     * The tab owns its own request: the menu records the address it wants opened,
     * and this runs the diff once and keeps the result for as long as the tab is
     * open. That is what makes a tab a document rather than a view onto the panel —
     * two files can be compared by flicking between two tabs, and neither loses its
     * patch when the menu closes.
     */
    function GithubDiffTab(props) {
      const address = props?.address ?? props?.tab?.address ?? null
      const sessionId = props?.sessionId
      const remote = props?.remote
      const t = props?.t ?? ((key) => key)
      const path = diffPathOf(address)
      // Three states, and they are distinct on purpose: `undefined` means the
      // command has not answered yet, a string is the answer, and with `failed`
      // set that answer is the reason it did not work. A tab that has an answer
      // must render it — never keep claiming to be checking.
      const [output, setOutput] = React.useState(undefined)
      const [failed, setFailed] = React.useState(false)
      const [asked, setAsked] = React.useState(false)
      const remoteRef = React.useRef(remote)
      remoteRef.current = remote

      React.useEffect(() => {
        if (path === null || sessionId === undefined || asked === true) return undefined
        const commands = commandsOf(remoteRef.current)
        if (commands?.execute === undefined) {
          setFailed(true)
          setOutput(t('error.unavailable'))
          return undefined
        }
        // The path travels as `--dir`-free text on the command line, so it is
        // quoted: a path with a space is otherwise two arguments.
        const line = `/github diff --file "${path}"`
        let cancelled = false
        // Marked before the await, so a re-render during the await does not issue
        // the same command a second time.
        setAsked(true)
        const show = async () => {
          try {
            const response = await commands.execute(sessionId, line, [])
            if (cancelled) return
            if (response?.ok !== true) {
              setFailed(true)
              setOutput(t('error.refused', { command: line }))
              return
            }
            const text = resultText(response)
            if (text === undefined) {
              setFailed(true)
              setOutput(t('error.probeUnexpected'))
              return
            }
            setFailed(false)
            setOutput(text)
          } catch (error) {
            if (cancelled) return
            setFailed(true)
            setOutput(error instanceof Error ? error.message : String(error))
          }
        }
        void show()
        return () => {
          cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [address, sessionId])

      // Parsing is attempted on whatever came back. A `diff` command answers with
      // `renderOutcome`'s text, which is a patch for a file and something else for
      // a `--stat` run, so this must not assume: anything the parser does not claim
      // is shown verbatim, and a parser that throws is treated the same way rather
      // than taking the tab down with it.
      let patch = null
      if (failed !== true && typeof output === 'string') {
        try {
          patch = parseUnifiedDiff(output)
        } catch {
          patch = null
        }
      }
      if (path === null) {
        return React.createElement('div', { style: S.pane }, t('diff.noPath'))
      }
      // Only "no answer yet" reads as progress. Once anything has arrived it is
      // rendered, and a failure reports itself rather than waiting for a second
      // attempt that is never coming.
      if (output === undefined) {
        return React.createElement('div', { style: S.pane }, t('menu.checking'))
      }
      if (patch === null) {
        return React.createElement(
          'div',
          { style: S.pane },
          React.createElement('pre', { style: style(S.output, failed ? S.outputError : undefined) }, output),
        )
      }
      return React.createElement('div', { style: S.pane, 'data-github-sync': '' }, React.createElement(DiffView, { patch, t }))
    }

    /** The branch glyph, drawn from the current label colour. */
    function BranchIcon({ size = 14 }) {
      return React.createElement(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          style: { display: 'block', flex: '0 0 auto' },
        },
        React.createElement('circle', { cx: 4.5, cy: 3.5, r: 1.9 }),
        React.createElement('circle', { cx: 4.5, cy: 12.5, r: 1.9 }),
        React.createElement('circle', { cx: 11.5, cy: 6.5, r: 1.9 }),
        React.createElement('path', { d: 'M4.5 5.4v5.2' }),
        React.createElement('path', { d: 'M9.6 7.1c-.7 1.1-1.9 1.7-3.2 1.9' }),
      )
    }

    /** Read the command text out of a Remote result, defensively. */
    function resultText(response) {
      const result = response?.value?.result ?? response?.result
      if (result === undefined || result === null) return undefined
      return typeof result.text === 'string' ? result.text : undefined
    }

    /**
     * What git's two status letters mean, in the reader's language.
     *
     * The probe carries the letters and nothing else — one logged command row is
     * not the place for prose — so the words are built here, where the active
     * locale is known.
     */
    function changeWords(code, t) {
      const letters = String(code ?? '')
      if (letters === '??') return t('change.untracked')
      if (['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(letters)) return t('change.conflicted')
      const word = (letter) =>
        letter === undefined || letter === ' '
          ? undefined
          : t(
              {
                M: 'change.modified',
                A: 'change.added',
                D: 'change.deleted',
                R: 'change.renamed',
                C: 'change.copied',
                T: 'change.type',
              }[letter] ?? 'change.modified',
            )
      const staged = word(letters[0])
      const worktree = word(letters[1])
      const parts = []
      if (staged !== undefined) parts.push(t('change.staged', { what: staged }))
      if (worktree !== undefined) parts.push(worktree)
      return parts.length === 0 ? t('change.modified') : parts.join(' · ')
    }

    /**
     * How the probed repository's location reads in the tooltip.
     *
     * A repository found in a subdirectory is worth naming, because "this
     * workspace is a repository" and "this workspace contains one" lead to
     * different expectations about which files an action will touch.
     *
     * @returns the description, or null when the repository is the workspace.
     */
    function targetLabel(probe, t) {
      const sub = typeof probe?.subdirectory === 'string' && probe.subdirectory.length > 0 ? probe.subdirectory : null
      return sub === null ? null : t('target.subdirectory', { name: sub })
    }

    /**
     * Describe the probed workspace state for the button label and tooltip.
     *
     * @param probe - the cached probe result, or null before the first probe.
     * @param t - the bound translate function for this namespace.
     */
    function describe(probe, t) {
      // Until the workspace has been probed the button claims nothing, so it
      // never shows a branch that the current workspace may not have.
      if (probe === null || probe === undefined) return { label: 'GitHub', tone: null, title: t('title') }
      if (probe.state !== 'repo') {
        const where = targetLabel(probe, t)
        return { label: 'GitHub', tone: null, title: where === null ? t('button.tooltip.none') : where }
      }
      const known = typeof probe.branch === 'string' && probe.branch.length > 0
      const branch = known ? probe.branch : null
      const ahead = typeof probe.ahead === 'number' && probe.ahead > 0 ? probe.ahead : 0
      const behind = typeof probe.behind === 'number' && probe.behind > 0 ? probe.behind : 0
      const dirty = probe.dirty === true
      const marks = []
      marks.push(dirty ? t('state.dirty') : t('state.clean'))
      if (ahead > 0) marks.push(t('state.ahead', { count: ahead }))
      if (behind > 0) marks.push(t('state.behind', { count: behind }))
      const where = targetLabel(probe, t)
      if (where !== null) marks.push(where)

      // Out of sync with the remote is the thing worth seeing without opening
      // the menu, so the counts ride the label itself. Both ends are shown at
      // once for a diverged branch, because that is the state that needs a
      // decision rather than a single action.
      const arrow = `${ahead > 0 ? ` ↑${ahead}` : ''}${behind > 0 ? ` ↓${behind}` : ''}`
      const tone = dirty
        ? 'var(--dsw-alias-state-warn-primary)'
        : behind > 0
          ? 'var(--dsw-alias-state-warn-primary)'
          : ahead > 0
            ? 'var(--dsw-alias-brand-primary)'
            : 'var(--dsw-alias-state-success-primary)'
      return {
        label: `${branch ?? 'GitHub'}${arrow}`,
        tone,
        title: t('button.tooltip.repo', { branch: branch ?? t('title'), state: marks.join(' · ') }),
      }
    }

    /**
     * The chat row for one `/github` command.
     *
     * The status probe is background work. The sidebar shows its answer, and
     * leaving the probe's JSON in the conversation puts a machine-readable row
     * above the composer every time a session or the pane is opened. Those rows
     * are hidden here; an explicit command keeps a compact row with its outcome,
     * so a typed `/github pull` is still readable in the transcript.
     */
    function GithubCommandRow({ node }) {
      // The chat passes the command object itself through `node`; accepting a
      // wrapped `{ data }` too keeps the component harmless to either shape.
      const command = node?.data ?? node
      const args = typeof command?.args === 'string' ? command.args : ''
      // Every status read belongs to the sidebar: the automatic probe and a
      // typed `/github status` alike. The pane states the branch, the change
      // count, and when it last checked; keeping a duplicate line above the
      // composer is the clutter this seat exists to remove.
      if (/^\s*status\b/.test(args)) return null
      const outcome = command?.outcome
      // Everything else stays one line tall. The full answer is still available
      // on hover and in the session log, and UI actions repeat it in the pane's
      // output block; a transcript row is not the place for a second copy.
      const mark = outcome === null ? '…' : outcome?.kind === 'success' ? '✓' : '✗'
      return React.createElement(
        'div',
        { style: S.commandRow, title: typeof outcome?.text === 'string' ? outcome.text : undefined },
        `${mark} /github ${args.trim()}`.trim(),
      )
    }

    /**
     * Button plus action menu.
     *
     * @param props - slot props; `sessionId`, the injected `remote`, and the
     *   locale service's bound `t` are read.
     */
    function GithubSyncButton(props) {
      const sessionId = props.sessionId
      const remote = props.remote
      const t = props.t ?? ((key) => key)
      // Two surfaces, one control. The composer button shows a popup menu; the
      // right sidebar shows a pane. Both render the same panel — the same probe,
      // the same change list, the same actions — so a rule added for one is
      // present in the other by construction, and only the container differs.
      const surface = props.surface === 'pane' ? 'pane' : 'menu'
      const openSidebar = typeof props.openSidebar === 'function' ? props.openSidebar : null
      const openDiffTab = typeof props.openDiffTab === 'function' ? props.openDiffTab : null
      // Whether this session's column is currently showing its panel. Read through
      // a function rather than a value, because it is asked at the moment a session
      // appears and a captured boolean would be the previous session's answer.
      const sidebarExpanded = typeof props.sidebarExpanded === 'function' ? props.sidebarExpanded : null
      const [autoOpen, setAutoOpen] = React.useState(() => readAutoOpen())
      // `undefined` means "follow the deployment setting", which arrives with the
      // probe; a boolean is a click that deliberately differs from it.
      const [integrateChoice, setIntegrateChoice] = React.useState(() => readIntegratePreference())
      // A counter whose only job is to re-render a component that was waiting on a
      // probe issued by another surface. See `waitForProbe` above.
      const [, setProbeRevision] = React.useState(0)
      // `sidebarReady` is injected as a boolean and refreshed by the listener
      // below when a late `sidebarRight`/`sidebarRightTabs` pair arrives.
      const sidebarReady = props.sidebarReady === true
      const [, setSidebarRevision] = React.useState(0)
      const [open, setOpen] = React.useState(false)
      const [busy, setBusy] = React.useState(null)
      // Separate from `busy` on purpose. Only a user action sets this, and only
      // this disables the menu. The background workspace check must never take
      // the controls away, however it ends.
      const [actionBusy, setActionBusy] = React.useState(null)
      // The result of the last action is shown while the menu is open and cleared
      // when it closes: a stale answer from the previous interaction must not be
      // what the next open displays, and it must not decide the menu's height.
      const [output, setOutput] = React.useState(null)
      const [failed, setFailed] = React.useState(false)
      const [url, setUrl] = React.useState('')
      const [probeError, setProbeError] = React.useState(null)
      // Paths the next commit should leave out. Kept as the exclusion set rather
      // than the selection so "everything" stays the default and survives a
      // probe refresh that adds files.
      const [excluded, setExcluded] = React.useState(() => new Set())
      const [branchName, setBranchName] = React.useState('')
      // The message the next commit records, and the markers a pipeline looks for.
      // The default is the generated message with no markers, so the ordinary
      // commit stays one click.
      const [writeOwnMessage, setWriteOwnMessage] = React.useState(false)
      const [customMessage, setCustomMessage] = React.useState('')
      const [presetMarkers, setPresetMarkers] = React.useState(() => new Set())
      const [otherMarkers, setOtherMarkers] = React.useState('')
      // Which commit-shaped action is waiting for its message to be confirmed.
      // The message and the markers belong to *that* decision, so they appear when
      // the decision is being made: a panel that always shows a form for something
      // nobody has asked for reads as if it were already doing it.
      const [pendingAction, setPendingAction] = React.useState(null)

      // A ref mirrors the latest Remote namespace so the probe effect below can
      // depend on the session and the open state alone, without re-firing when
      // the namespace object identity changes.
      const remoteRef = React.useRef(remote)
      remoteRef.current = remote

      // The dock can become available after this control has mounted; wake the
      // composer so its "Open in sidebar" entry and auto-open see the real
      // services instead of the pre-injection absence.
      React.useEffect(() => {
        const listener = () => setSidebarRevision((value) => value + 1)
        sidebarStateListeners.add(listener)
        return () => {
          sidebarStateListeners.delete(listener)
        }
      }, [])

      /**
       * Run one `/github` line through the addressed session and record it.
       *
       * @param command - the complete slash-command line.
       * @param options - `quiet` suppresses the visible output panel; `background`
       *   leaves the state line alone, for a refresh nobody asked for; `signal`
       *   is forwarded as the Remote call's cancellation, so a probe that is
       *   abandoned at the timeout also cancels its transport request.
       * @param targetSession - the session to address; defaults to this one.
       */
      const run = async (command, options, targetSession) => {
        const address = targetSession ?? sessionId
        const commands = commandsOf(remoteRef.current)
        if (address === undefined || commands?.execute === undefined) {
          setFailed(true)
          setOutput(t('error.unavailable'))
          return { text: undefined, failure: t('error.unavailable') }
        }
        let failureText = null
        // A background probe is one nobody asked for: it must not blank the state
        // line for the length of a `git status`, and it re-renders through the
        // probe revision instead of through `busy`.
        if (options?.background !== true) setBusy(command)
        // A probe is background work: it reports progress in the state line but
        // never disables the controls.
        if (options?.probe !== true) setActionBusy(command)
        setFailed(false)
        if (options?.quiet !== true) setOutput(null)
        try {
          const response =
            options?.signal === undefined
              ? await commands.execute(address, command, [])
              : await commands.execute(address, command, [], options.signal)
          if (response?.ok !== true) {
            const failure = response?.error
            failureText =
              failure === undefined
                ? t('error.refused', { command })
                : t('error.refusedWith', { code: failure.code, message: failure.message })
            if (options?.quiet !== true) {
              setFailed(true)
              setOutput(failureText)
            }
            return { text: undefined, failure: failureText }
          }
          const text = resultText(response)
          if (response.value?.result?.kind === 'error') failureText = text ?? t('error.completed', { command })
          if (options?.quiet !== true) {
            if (failureText !== null) setFailed(true)
            setOutput(text ?? t('error.completed', { command }))
          }
          // A resolved call with no readable text is reported as a failure, so
          // the caller can surface it instead of waiting for something that
          // already finished.
          return { text, failure: failureText ?? (text === undefined ? t('error.probeUnexpected') : null) }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (options?.quiet !== true) {
            setFailed(true)
            setOutput(message)
          }
          return { text: undefined, failure: message }
        } finally {
          if (options?.background !== true) setBusy(null)
          if (options?.probe !== true) setActionBusy(null)
        }
      }

      /**
       * Probe one session's workspace and cache the result.
       *
       * This runs `/github status --json`, which is a real command: the Host
       * logs a `command/run`/`command/done` pair, so each probe is a visible row
       * in that session's conversation. Two things keep that cost down: the
       * per-session cache, and asking for the smallest answer that serves the
       * caller — `slim` for the badge on mount, full only when the menu needs the
       * change and branch lists.
       *
       * The call is bounded and total. A Remote call that never settles would
       * otherwise leave `busy` set forever — and since a busy probe is what the
       * menu reports as "checking", the failure the timeout recorded would stay
       * hidden behind it. So the timeout path clears `busy` itself rather than
       * relying on the abandoned call's own cleanup.
       *
       * @param targetSession - the session to probe.
       * @param announceFailure - whether to record a failure for the menu to show.
       * @param options.slim - ask for the badge's fields only.
       */
      const refresh = async (targetSession, announceFailure, options) => {
        const address = targetSession ?? sessionId
        if (address === undefined) return
        const wantFull = options?.slim !== true
        const running = probeInFlight.get(address)
        if (running !== undefined) {
          // A full request that arrives while a slim check runs must not be
          // dropped: the slim answer has no change or branch lists, the effect that
          // asked is not going to ask again, and the panel would sit with an empty
          // list until something else refreshed it. That is the shape of "the menu
          // lost its content". So it is queued and replayed once the address is
          // free — one extra logged command, but only when both really want it.
          if (wantFull) {
            if (running === 'slim') probeQueuedFull.add(address)
            // The queued probe runs in the *other* component's closure. Wake this
            // one after it lands, or it stays on "checking" while the answer sits
            // in the shared cache.
            waitForProbe(address, () => {
              setBusy(null)
              setActionBusy(null)
              if (probeCache.has(address)) setProbeError(null)
              setProbeRevision((value) => value + 1)
            })
          }
          return
        }
        probeInFlight.set(address, wantFull ? 'full' : 'slim')
        const controller = new AbortController()
        const expired = new Promise((resolve) => {
          controller.signal.addEventListener('abort', () => resolve(PROBE_TIMEOUT), { once: true })
        })
        const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
        try {
          const outcome = await Promise.race([
            probeOnce(address, announceFailure, controller.signal, options),
            expired,
          ])
          if (outcome !== PROBE_TIMEOUT) return
          // Abandoned. Two Remote calls lead this probe — the command listing
          // and the probe command — and either can fail to settle (for example
          // with no Host agent yet for the addressed session). Their own cleanup
          // may never run, so the state is released here instead.
          setBusy(null)
          setActionBusy(null)
          probeCache.delete(address)
          probeShape.delete(address)
          if (announceFailure === true) {
            setProbeError(t('error.probeFailed', { reason: t('error.probeTimeout') }))
          }
        } finally {
          clearTimeout(timer)
          probeInFlight.delete(address)
          if (probeQueuedFull.delete(address)) {
            // Quiet: the caller that queued this already reported its own failures.
            void refresh(address, false, {})
          } else {
            // This probe was not followed by a queued one, so it is the answer the
            // waiters are waiting for.
            wakeProbes(address)
          }
        }
      }

      /**
       * One attempt at reading the workspace: check that the command exists,
       * then run it and interpret the answer.
       *
       * @param address - the session to address.
       * @param announceFailure - whether to record a failure for the menu to show.
       * @param signal - cancellation forwarded to the Remote call.
       * @param options.slim - ask for the badge's fields only.
       */
      const probeOnce = async (address, announceFailure, signal, options) => {
        const slim = options?.slim === true
        // Does this session even offer the command? This is a cheap read with no
        // session record, and it turns the likeliest cause of a hanging invoke
        // into a specific answer instead of a timeout. It is bounded and
        // optional: no listing (timed out, or rejected) is not an answer, so the
        // command below still decides the outcome.
        const commands = commandsOf(remoteRef.current)
        if (typeof commands?.list === 'function') {
          const listing = await withTimeout(commands.list(address), LISTING_TIMEOUT_MS)
          if (listing !== undefined) {
            const available =
              listing?.ok === true &&
              Array.isArray(listing.value) &&
              listing.value.some((entry) => entry?.name === COMMAND_NAME)
            if (!available) {
              probeCache.delete(address)
              if (announceFailure === true) setProbeError(t('error.commandMissing'))
              return
            }
          }
        }

        const choice = targetChoice.get(address)
        const scope = choice === undefined ? '' : ` --dir "${choice}"`
        const probeLine = `/github status --json${scope}${slim ? ' --slim' : ''}`
        const outcome = await run(
          probeLine,
          { quiet: true, probe: true, signal, background: options?.background === true },
          address,
        )
        if (outcome.text === undefined) {
          probeCache.delete(address)
          probeShape.delete(address)
          if (announceFailure === true) {
            setProbeError(
              outcome.failure === undefined
                ? t('error.probeUnexpected')
                : t('error.probeFailed', { reason: outcome.failure }),
            )
          }
          return
        }
        try {
          const parsed = JSON.parse(outcome.text)
          // A slim answer carries no lists, so it must not replace a full one: the
          // mount check can land *after* the panel's own probe, and overwriting the
          // change list with `[]` is exactly how the panel's content vanished while
          // it was being read. The rest of the slim answer is newer and worth
          // keeping; only the lists stay with the fuller answer.
          const previous = probeCache.get(address) ?? {}
          if (slim === true && probeShape.get(address) === 'full') {
            probeCache.set(address, {
              ...parsed,
              ...(previous.changes === undefined ? {} : { changes: previous.changes }),
              ...(previous.branches === undefined ? {} : { branches: previous.branches }),
              ...(previous.changesTruncated === undefined ? {} : { changesTruncated: previous.changesTruncated }),
              ...(previous.branchesTruncated === undefined ? {} : { branchesTruncated: previous.branchesTruncated }),
            })
          } else {
            probeCache.set(address, parsed)
            probeShape.set(address, slim ? 'slim' : 'full')
          }
          if (slim !== true) probeFresh.set(address, Date.now())
          // The answer carries the deployment's eager-check preference; remember
          // it for the sessions created afterwards, and for the next page load.
          if (typeof parsed?.statusOnMount === 'boolean') {
            eagerAllowed = parsed.statusOnMount
            rememberEager(parsed.statusOnMount)
          }
          setProbeError(null)
        } catch {
          // Not our JSON. A successful `/github` reply in any form still proves
          // a repository is present, which is the decision this probe drives.
          // The neutral label keeps it from claiming a branch it never learned.
          probeCache.set(address, { state: 'repo', branch: null, dirty: false, ahead: null, behind: null })
          probeShape.set(address, slim ? 'slim' : 'full')
          setProbeError(null)
        }
        // A background probe wrote the cache the panel reads, and changed no state
        // the render observes: bump the revision so the newer answer is drawn.
        if (options?.background === true) setProbeRevision((value) => value + 1)
      }

      // A session is probed the first time its menu opens, and its result is
      // remembered. Opening the menu again reuses that answer instead of paying
      // for another logged command, and switching sessions shows the state
      // already known for the session being switched to. "Refresh status" and
      // every action that changes the repository refresh it explicitly.
      //
      // A session is probed the first time it appears, so switching to another
      // workspace re-checks it immediately and the button carries the new
      // workspace's sync state without the menu being opened first.
      //
      // Every probe is a `/github` command, and the Host appends every command
      // to the session log — that is the only channel from the Client to the
      // Host, so an eager probe costs one visible row per session. The Host
      // reports `statusOnMount: false` when a deployment would rather keep its
      // log clean; then the check happens on first open instead. The preference
      // arrives with the first answer, which is why a session's very first check
      // is always eager and later sessions follow the setting.
      //
      // `probeAttempted` is the gate rather than the cache, so a probe that
      // hangs — which caches nothing — is still attempted only once per session.
      //
      // The mount answer is asked for slim: it runs for every session, and the
      // badge it feeds needs the branch and the drift, not the change list.
      React.useEffect(() => {
        // The pane asks for the full answer on mount, so a slim probe here would be
        // a second logged command for the same panel.
        if (surface === 'pane') return undefined
        if (sessionId === undefined || !eagerAllowed) return undefined
        if (probeCache.has(sessionId) || probeAttempted.has(sessionId)) return undefined
        probeAttempted.add(sessionId)
        let cancelled = false
        const probeWorkspace = async () => {
          try {
            await refresh(sessionId, true, { slim: true })
          } catch (error) {
            // Nothing may leave the menu waiting: a rejection here would leave
            // the busy state set with no further attempt coming.
            setBusy(null)
            setActionBusy(null)
            setProbeError(t('error.probeFailed', { reason: error instanceof Error ? error.message : String(error) }))
          }
          if (cancelled) return
        }
        void probeWorkspace()
        return () => {
          cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [sessionId])

      // The panel's data is read when the panel is being looked at: the menu
      // opened, or the sidebar pane mounted. A slim answer never has the lists, and
      // a full one older than OPEN_REUSE_MS is replaced rather than shown stale.
      // Only a second look within that window reuses: closing and reopening the
      // menu in one breath must not append two probe rows.
      //
      // The pane does not take the eager slim probe below: it is about to ask for
      // the full answer, and paying two logged commands to draw one panel is exactly
      // the kind of noise the sidebar-only setup is trying to avoid.
      const wantsData = open || surface === 'pane'
      React.useEffect(() => {
        if (!wantsData || sessionId === undefined) return undefined
        const shape = probeShape.get(sessionId)
        if (shape === 'full' && Date.now() - (probeFresh.get(sessionId) ?? 0) < OPEN_REUSE_MS) return undefined
        let cancelled = false
        const probeOnOpen = async () => {
          try {
            await refresh(sessionId, true)
          } catch (error) {
            setBusy(null)
            setActionBusy(null)
            setProbeError(t('error.probeFailed', { reason: error instanceof Error ? error.message : String(error) }))
          }
          if (cancelled) return
        }
        void probeOnOpen()
        return () => {
          cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [wantsData, sessionId])

      // Files change while the window is not looking — an editor outside DSH, a
      // build, a `git switch` in a terminal. Coming back to the window is the
      // signal for that, and the refresh is quiet: a failure here must not replace
      // the menu with an error the person did not ask for.
      React.useEffect(() => {
        if (sessionId === undefined) return undefined
        const onFocus = () => {
          if (probeShape.get(sessionId) === undefined) return
          if (Date.now() - (probeFresh.get(sessionId) ?? 0) < FOCUS_REFRESH_MS) return
          void refresh(sessionId, false)
        }
        window.addEventListener('focus', onFocus)
        return () => window.removeEventListener('focus', onFocus)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [sessionId])

      // A panel that is on screen cannot wait for focus: the window keeps it the
      // whole time the agent edits files in this session, and a change list that
      // lags behind the working tree is the one staleness a person notices. So a
      // visible panel — the menu open or the pane mounted — re-reads the workspace
      // on an interval, as a background probe: no state line, no announcement, and
      // no second probe while one is in flight or one landed within the interval.
      //
      // This is the timer the original design rejected, and the reason it was
      // rejected still holds — each tick is a logged command. What changed is the
      // alternative: a sidebar whose list silently stops matching the tree while
      // the person watches it. The cost is bounded to the moments the panel is
      // actually on screen, and a hidden tab skips its ticks.
      React.useEffect(() => {
        if (!wantsData || sessionId === undefined) return undefined
        const tick = () => {
          if (typeof document === 'undefined' || document.visibilityState !== 'visible') return
          if (probeInFlight.has(sessionId)) return
          // Only a workspace that answered as a repository has a list to re-read:
          // polling a directory with no repository would buy the same "no
          // repository" answer every ten seconds.
          if ((probeCache.get(sessionId)?.state ?? null) !== 'repo') return
          if (Date.now() - (probeFresh.get(sessionId) ?? 0) < PANEL_REFRESH_MS) return
          void refresh(sessionId, false, { background: true })
        }
        const timer = setInterval(tick, PANEL_REFRESH_MS)
        // The Node process that loads this bundle in tests must not be kept alive
        // by the interval; a browser timer is a number and has no `unref`.
        timer?.unref?.()
        const onVisible = () => {
          if (document.visibilityState === 'visible') tick()
        }
        document.addEventListener('visibilitychange', onVisible)
        return () => {
          clearInterval(timer)
          document.removeEventListener('visibilitychange', onVisible)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [wantsData, sessionId])


      // The action result belongs to the interaction that produced it. Closing the
      // menu clears it, so the next open starts from the same place every time
      // instead of showing what the previous visit printed. The sidebar pane is
      // not a visit — it stays open — so its result stays until the next action.
      React.useEffect(() => {
        if (surface === 'pane' || open) return
        setOutput(null)
        setFailed(false)
        // A step nobody confirmed does not survive the menu: reopening starts from
        // the same place as the first open.
        setPendingAction(null)
      }, [open, surface])

      // The diff the menu handed over, if this pane was opened for one. The
      // request is cleared before the command runs, so a re-render — or the pane
      // being remounted — cannot issue the same diff twice.
      React.useEffect(() => {
        if (surface !== 'pane' || sessionId === undefined) return undefined
        const path = pendingDiff.get(sessionId)
        if (path === undefined) return undefined
        pendingDiff.delete(sessionId)
        let cancelled = false
        const show = async () => {
          try {
            await run(`/github diff --file "${path}"${dirSuffix(sessionId)}`)
          } catch (error) {
            setFailed(true)
            setOutput(error instanceof Error ? error.message : String(error))
          }
          if (cancelled) return
        }
        void show()
        return () => {
          cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [surface, sessionId])

      // Dismiss the menu on the interactions that mean "I am done here": Escape,
      // a press anywhere outside the control, or focus moving out of it.
      //
      // A focus change to another *application* is not one of those. The window's
      // `blur` fires when a notification, a taskbar click, or DevTools takes focus,
      // and closing on it makes the menu vanish while the person is still using it —
      // which is the one behaviour people notice, and it is avoidable.
      React.useEffect(() => {
        if (!open) return undefined
        const onKey = (event) => {
          if (event.key !== 'Escape') return
          // Escape backs out of the commit step before it closes the menu: the
          // menu was opened for a reason, and the step is what was just entered.
          if (pendingAction !== null) {
            setPendingAction(null)
            return
          }
          setOpen(false)
        }
        // The control marks itself so containment can be asked of the event
        // target alone, without holding a node reference across renders.
        const inside = (target) => {
          try {
            return typeof target?.closest === 'function' && target.closest('[data-github-sync]') !== null
          } catch {
            return false
          }
        }
        const onPointerDown = (event) => {
          if (!inside(event.target)) setOpen(false)
        }
        const onFocusIn = (event) => {
          if (!inside(event.target)) setOpen(false)
        }
        // Capture, because a press handled by something below must still dismiss
        // this first: the menu is drawn over whatever it covers.
        document.addEventListener('keydown', onKey)
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('mousedown', onPointerDown, true)
        document.addEventListener('focusin', onFocusIn)
        return () => {
          document.removeEventListener('keydown', onKey)
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('mousedown', onPointerDown, true)
          document.removeEventListener('focusin', onFocusIn)
        }
      }, [open, pendingAction])

      // Only a user action disables the menu. The background check never does,
      // so its outcome cannot take the controls away.
      const disabled = actionBusy !== null
      const probe =
        sessionId === undefined
          ? { state: 'empty', workspace: null, detail: t('note.noWorkspace') }
          : (probeCache.get(sessionId) ?? null)
      const isRepo = probe?.state === 'repo'
      // Bring the panel with you. Every session's column starts collapsed — that is
      // the product's rule — so a panel left open in one session is simply gone in
      // the next, which for a column reads as "it closed itself". Three conditions
      // keep that from becoming a nuisance:
      //
      // - only a repository session is opened: the panel has nothing to offer in a
      //   workspace that is not one, and taking the sidebar for empty content is
      //   worse than leaving it shut;
      // - only a *collapsed* column is opened: an expanded one may be showing
      //   another plugin's tab, and stealing its focus on every switch is not what
      //   "open with the session" means;
      // - the choice is the person's, and it outlives the page.
      React.useEffect(() => {
        if (surface === 'pane' || !autoOpen) return undefined
        if (sessionId === undefined || probe?.state !== 'repo') return undefined
        if (openSidebar === null || sidebarExpanded === null) return undefined
        let cancelled = false
        let timer = null
        const attempt = (retried) => {
          if (cancelled) return
          try {
            if (sidebarExpanded() === true) return
            openSidebar()
          } catch {
            // The column's store for a session is minted as that session renders, so
            // a call made in the same commit can arrive before it exists. One retry
            // covers that; anything else is left to the person.
            if (!retried) timer = setTimeout(() => attempt(true), 300)
          }
        }
        timer = setTimeout(() => attempt(false), 0)
        return () => {
          cancelled = true
          if (timer !== null) clearTimeout(timer)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [surface, autoOpen, sessionId, probe?.state, sidebarReady])
      // A repository created with `init` has no remote, and offering it "push"
      // is a dead end: the action can only fail. The check reports the remote as
      // `null` when there is none and as a URL when there is one, so only a
      // *known* absence narrows the menu — an unanswered check keeps every
      // action, which is what makes a hanging probe degrade instead of block.
      const remoteMissing = isRepo && probe?.remote === null
      // The page the project lives at. The Host derives it from the configured
      // remote, so a repository whose remote is a local path — or one the Host
      // could not parse — has no item to offer rather than a link that fails.
      const webUrl =
        typeof probe?.web === 'string' && /^https?:\/\//i.test(probe.web) ? probe.web : null
      // The switch starts from the deployment's setting; a click overrides it and
      // is sent with the sync line, so the Host never has to guess which one the
      // person meant.
      const configuredIntegrate = probe?.integrateBeforePush === true
      const integrateOn = integrateChoice === undefined ? configuredIntegrate : integrateChoice
      const integrateSuffix =
        integrateChoice === undefined ? '' : integrateChoice ? ' --integrate' : ' --no-integrate'
      const toggleIntegrate = () => {
        const next = integrateOn !== true
        // Clicking back to the deployment's value forgets the override rather than
        // pinning it: a later config change is then visible again.
        if (next === configuredIntegrate) {
          setIntegrateChoice(undefined)
          rememberIntegratePreference(undefined)
          return
        }
        setIntegrateChoice(next)
        rememberIntegratePreference(next)
      }
      const info = describe(probe, t)
      // The last full check, used by the pane's bottom line. The probe command
      // itself no longer leaves a JSON row in the conversation, so this is where
      // the pane states when it last looked and what it saw.
      const lastCheck = sessionId === undefined ? undefined : probeFresh.get(sessionId)

      // Where this session's actions point. The Host reports which workspace
      // subdirectories are repositories and which one it is currently looking
      // at; choosing another applies to the rest of the session. It is kept per
      // session rather than written to the plugin config, so browsing another
      // workspace never silently changes where a later action commits.
      const targetOf = (session) => targetChoice.get(session) ?? null
      const activeTarget = targetOf(sessionId)
      const candidates = Array.isArray(probe?.subdirectories) ? probe.subdirectories : []
      const currentTarget =
        activeTarget ?? (typeof probe?.subdirectory === 'string' && probe.subdirectory.length > 0 ? probe.subdirectory : null)
      const dirSuffix = (session) => {
        const choice = targetOf(session)
        return choice === null ? '' : ` --dir "${choice}"`
      }

      // The change list the probe reported, and which paths the next commit
      // should leave out. Unchecking is how a person says "not this one", so the
      // default is an empty set that means everything — and the command stays a
      // plain `/github commit`, however many files changed.
      //
      // A change arrives as `[path, code]` — the probe is answered in a logged
      // command row, so it carries pairs rather than objects with named fields.
      //
      // A path containing a double quote cannot be written on the `/github`
      // line at all; it is listed, marked, and simply left out of a narrowed
      // selection rather than being silently mis-quoted.
      const changed = Array.isArray(probe?.changes) ? probe.changes : []
      const counts = Array.isArray(probe?.counts) ? probe.counts : undefined
      const named = changed.filter((entry) => Array.isArray(entry) && typeof entry[0] === 'string' && entry[0].length > 0)
      const selectable = named.filter((entry) => !entry[0].includes('"'))
      const selected = selectable.filter((entry) => !excluded.has(entry[0]))
      const narrowing = excluded.size > 0
      const nothingSelected = narrowing && selected.length === 0
      const fileSuffix = narrowing ? selected.map((entry) => ` --file "${entry[0]}"`).join('') : ''

      /** Tick or untick one path for the next commit. */
      const togglePath = (path) => {
        setExcluded((current) => {
          const next = new Set(current)
          if (next.has(path)) next.delete(path)
          else next.add(path)
          return next
        })
      }

      // What the next commit records besides the paths: a written message when
      // one is asked for, and the CI markers. A double quote becomes a single one
      // because the message travels on the `/github` line, which is parsed by
      // quoting; the menu says so rather than silently dropping the character.
      const markers = [...presetMarkers, ...otherMarkers.split(',')]
        .map((marker) => marker.trim())
        .filter((marker) => marker.length > 0)
      const messageText = customMessage.replace(/"/g, "'").trim()
      const needCustom = writeOwnMessage && messageText.length === 0
      const commitSuffix = `${writeOwnMessage && !needCustom ? ` --message "${messageText}"` : ''}${markers
        .map((marker) => ` --marker "${marker}"`)
        .join('')}`

      // The list is the button's contract: what it leaves out is still reported, so
      // a repository whose only change is a file git does not track yet never looks
      // untouched — and the person can see that a `git add` is what would include
      // it in the next commit.
      const hiddenNote =
        typeof probe?.hidden === 'number' && probe.hidden > 0
          ? React.createElement(
              'div',
              { key: 'changes-hidden', style: S.hint },
              t('changes.hidden', { count: probe.hidden }),
            )
          : null

      /** Tick or untick one preset marker. */
      const toggleMarker = (marker) => {
        setPresetMarkers((current) => {
          const next = new Set(current)
          if (next.has(marker)) next.delete(marker)
          else next.add(marker)
          return next
        })
      }

      const markerChips = (presets) =>
        presets.map((marker) => {
          const on = presetMarkers.has(marker)
          return React.createElement(
            'button',
            {
              key: `marker-${marker}`,
              type: 'button',
              role: 'menuitemcheckbox',
              'aria-checked': on,
              disabled,
              style: style(S.chip, on ? S.chipOn : undefined),
              onClick: () => toggleMarker(marker),
            },
            // The tick is the state, not decoration: it is what distinguishes a
            // selected chip from an unselected one at a glance. The unreserved
            // width keeps a row of chips from shifting as they are ticked.
            on ? `✓ [${marker}]` : `[${marker}]`,
          )
        })

      const commitOptions = [
        React.createElement('div', { key: 'commit-label', style: S.hint }, t('commit.options')),
        React.createElement(
          'div',
          { key: 'commit-mode', style: S.chips },
          React.createElement(
            'button',
            {
              type: 'button',
              role: 'menuitemradio',
              'aria-checked': writeOwnMessage !== true,
              disabled,
              style: style(S.chip, writeOwnMessage !== true ? S.chipOn : undefined),
              onClick: () => setWriteOwnMessage(false),
            },
            t('commit.mode.ai'),
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              role: 'menuitemradio',
              'aria-checked': writeOwnMessage === true,
              disabled,
              style: style(S.chip, writeOwnMessage === true ? S.chipOn : undefined),
              onClick: () => setWriteOwnMessage(true),
            },
            t('commit.mode.custom'),
          ),
        ),
        ...(writeOwnMessage
          ? [
              React.createElement('textarea', {
                key: 'commit-message',
                style: S.customMessage,
                value: customMessage,
                rows: 2,
                spellCheck: false,
                placeholder: t('commit.customPlaceholder'),
                'aria-label': t('commit.options'),
                disabled,
                onChange: (event) => setCustomMessage(event.target.value),
              }),
              React.createElement('div', { key: 'commit-note', style: S.hint }, t('commit.customNote')),
            ]
          : []),
        React.createElement('div', { key: 'commit-markers-label', style: S.hint }, t('commit.markers')),
        React.createElement(
          'div',
          { key: 'commit-markers', style: S.chips },
          ...markerChips(['skip ci', 'release']),
          React.createElement('input', {
            key: 'other-markers',
            style: S.markerInput,
            value: otherMarkers,
            spellCheck: false,
            placeholder: t('commit.otherPlaceholder'),
            'aria-label': t('commit.otherMarkers'),
            disabled,
            onChange: (event) => setOtherMarkers(event.target.value),
          }),
        ),
        React.createElement('div', { key: 'commit-marker-hint', style: S.hint }, t('commit.markerHint')),
        // What will actually be appended, stated in the panel. A marker is
        // invisible once it is on the command line, and this state outlives one
        // commit — it stays until it is changed or the page reloads — so a
        // carried-over selection has to be visible *before* the commit, not
        // discovered in the message afterwards.
        React.createElement(
          'div',
          { key: 'commit-marker-summary', style: S.markerSummary },
          React.createElement(
            'span',
            { style: markers.length === 0 ? S.hint : S.markerSummaryOn },
            markers.length === 0
              ? t('commit.markerNone')
              : t('commit.markerWillAdd', { markers: markers.map((m) => `[${m}]`).join(' ') }),
          ),
          markers.length === 0
            ? null
            : React.createElement(
                'button',
                {
                  key: 'marker-clear',
                  type: 'button',
                  disabled,
                  style: style(S.chip, disabled ? S.itemDisabled : undefined),
                  onClick: () => {
                    setPresetMarkers(new Set())
                    setOtherMarkers('')
                  },
                },
                t('commit.markerClear'),
              ),
        ),
      ]

      const changesPanel =
        named.length === 0
          ? null          : [
              React.createElement(
                'div',
                { key: 'changes-label', style: S.hint },
                typeof counts?.[0] === 'number' && typeof counts?.[1] === 'number'
                  ? `${t('changes.title')} — ${t('changes.summary', { total: counts[0], staged: counts[1] })}`
                  : t('changes.title'),
              ),
              React.createElement(
                'div',
                { key: 'changes-summary', style: S.hint },
                nothingSelected
                  ? t('changes.noneSelected')
                  : narrowing
                    ? t('changes.selected', { count: selected.length, total: named.length })
                    : t('changes.all', { total: named.length }),
              ),
              ...selectable.map((entry) =>
                React.createElement(
                  'div',
                  { key: `change-${entry[0]}`, style: S.changeRow },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: !excluded.has(entry[0]),
                    disabled,
                    'aria-label': t('changes.include', { path: entry[0] }),
                    onChange: () => togglePath(entry[0]),
                  }),
                  React.createElement(
                    'span',
                    { style: S.changePath, title: `${entry[0]} — ${changeWords(entry[1], t)}` },
                    entry[0],
                  ),
                  React.createElement(
                    'button',
                    {
                      type: 'button',
                      disabled,
                      style: style(S.changeAction, disabled ? S.itemDisabled : undefined),
                      title: t('changes.diffLabel', { path: entry[0] }),
                      onClick: () => {
                        // A patch is a document: it is compared against another
                        // patch, kept open while the change list is read, and closed
                        // when it is done with. So it gets a tab of its own, and the
                        // change list stays where it was. Without the dock's tab
                        // registry the pane is the fallback, and without a sidebar at
                        // all the patch renders in the menu — the same answer at
                        // three levels of capability.
                        if (openDiffTab !== null && sessionId !== undefined) {
                          openDiffTab(sessionId, entry[0])
                          return
                        }
                        if (openSidebar !== null) {
                          pendingDiff.set(sessionId, entry[0])
                          openSidebar()
                          return
                        }
                        void run(`/github diff --file "${entry[0]}"${dirSuffix(sessionId)}`).then(() => refresh())
                      },
                    },
                    t('changes.diff'),
                  ),
                ),
              ),
              ...(probe?.changesTruncated === true
                ? [React.createElement('div', { key: 'changes-more', style: S.hint }, t('changes.truncated', { shown: named.length }))]
                : []),
              ...(narrowing && named.length !== selectable.length
                ? [React.createElement('div', { key: 'changes-quote', style: S.hint }, t('changes.unrepresentable'))]
                : []),
            ]

      /**
       * Every local branch the check reported, with the checked-out one marked.
       *
       * Switching is one click; creating one is the name typed below. Deleting is
       * deliberately not offered here: it is the one branch action that can lose
       * commits, so it stays on `/github delete-branch`, where it takes a name
       * and a `--force`.
       */
      const branchList = Array.isArray(probe?.branches)
        ? probe.branches.filter((entry) => typeof entry?.name === 'string' && entry.name.length > 0)
        : []

      /** Create the branch named in the field and switch to it. */
      const createBranch = () => {
        const name = branchName.trim()
        if (name.length === 0) return
        void run(`/github switch --create "${name}"${dirSuffix(sessionId)}`).then(() => {
          setBranchName('')
          void refresh()
        })
      }

      const branchesPanel =
        branchList.length === 0
          ? null
          : [
              React.createElement('div', { key: 'branches-label', style: S.hint }, t('branches.title')),
              ...branchList.map((entry) => {
                const track = `${entry.ahead > 0 ? ` ↑${entry.ahead}` : ''}${entry.behind > 0 ? ` ↓${entry.behind}` : ''}`
                return React.createElement(
                  'button',
                  {
                    key: `branch-${entry.name}`,
                    type: 'button',
                    role: 'menuitemradio',
                    'aria-checked': entry.current === true,
                    disabled: disabled || entry.current === true,
                    title: entry.current === true ? t('branches.current') : t('branches.switchLabel', { name: entry.name }),
                    style: style(S.item, disabled || entry.current === true ? S.itemDisabled : undefined),
                    onClick: () => {
                      void run(`/github switch "${entry.name}"${dirSuffix(sessionId)}`).then(() => refresh())
                    },
                  },
                  `${entry.current === true ? '● ' : '○ '}${entry.name}${track}${entry.gone === true ? ' (gone)' : ''}`,
                )
              }),
              React.createElement(
                'div',
                { key: 'branch-new', style: S.field },
                React.createElement('input', {
                  style: S.input,
                  placeholder: t('branches.newPlaceholder'),
                  value: branchName,
                  spellCheck: false,
                  'aria-label': t('branches.newLabel'),
                  onChange: (event) => setBranchName(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') createBranch()
                  },
                }),
                React.createElement(
                  'button',
                  {
                    type: 'button',
                    disabled: disabled || branchName.trim().length === 0,
                    style: style(S.action, disabled || branchName.trim().length === 0 ? S.itemDisabled : undefined),
                    onClick: () => createBranch(),
                  },
                  t('branches.create'),
                ),
              ),
              ...(probe?.branchesTruncated === true
                ? [React.createElement('div', { key: 'branches-more', style: S.hint }, t('branches.truncated', { shown: branchList.length }))]
                : []),
            ]

      /** Point this session at a directory and re-read the workspace. */
      const chooseTarget = (name) => {
        if (sessionId === undefined) return
        if (name === null) targetChoice.delete(sessionId)
        else targetChoice.set(sessionId, name)
        setOpen(false)
        void refresh(sessionId, true)
      }
      // Offered whenever the workspace holds a repository below its root, plus
      // an entry to go back to the workspace itself.
      const targetMenu = candidates.length === 0
        ? null
        : [
            React.createElement('div', { key: 'target-label', style: S.hint }, t('menu.target.label')),
            ...candidates.map((name) =>
              React.createElement(
                'button',
                {
                  key: `target-${name}`,
                  type: 'button',
                  role: 'menuitemradio',
                  'aria-checked': currentTarget === name,
                  disabled,
                  style: style(S.item, disabled ? S.itemDisabled : undefined),
                  onClick: () => chooseTarget(name),
                },
                `${currentTarget === name ? '● ' : '○ '}${t('menu.target.entry', { name })}`,
              ),
            ),
            ...(currentTarget === null
              ? []
              : [
                  React.createElement(
                    'button',
                    {
                      key: 'target-root',
                      type: 'button',
                      role: 'menuitemradio',
                      'aria-checked': false,
                      disabled,
                      style: style(S.item, disabled ? S.itemDisabled : undefined),
                      onClick: () => chooseTarget(null),
                    },
                    `○ ${t('menu.target.workspace')}`,
                  ),
                ]),
          ]

      /** Run one URL-bearing action and clear the field afterwards. */
      const submitUrl = (command) => {
        if (url.trim().length === 0) return
        // `init <url>` and `setup <url>` commit and push as well, so they carry
        // the same message and markers the commit actions do.
        const extra = command.endsWith('/github init') ? `${commitSuffix}` : ''
        void run(`${command} ${url.trim()}${dirSuffix(sessionId)}${extra}`).then(() => {
          setUrl('')
          void refresh()
        })
      }

      const renderUrlRow = (label, ariaLabel, command) =>
        React.createElement(
          'div',
          { style: S.field },
          React.createElement('input', {
            style: S.input,
            placeholder: t('field.placeholder'),
            value: url,
            spellCheck: false,
            'aria-label': ariaLabel,
            onChange: (event) => setUrl(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') submitUrl(command)
            },
          }),
          React.createElement(
            'button',
            {
              type: 'button',
              disabled: disabled || url.trim().length === 0 || needCustom,
              title: needCustom ? t('commit.needCustom') : undefined,
              style: style(S.action, disabled || url.trim().length === 0 || needCustom ? S.itemDisabled : undefined),
              onClick: () => submitUrl(command),
            },
            label,
          ),
        )

      const repoMenu = (remoteMissing ? CONNECT_ACTIONS : REPO_ACTIONS).map((action) => {
        // Commit and sync are the two actions a narrowed selection changes; the
        // label says how many paths will go in, so the effect of unticking is
        // visible before the click.
        const commitLike = action.id === 'commit' || action.id === 'sync'
        const blocked = commitLike && (nothingSelected || needCustom)
        const label = commitLike && narrowing ? `${t(action.key)} · ${selected.length}` : t(action.key)
        return React.createElement(
          'button',
          {
            key: action.id,
            type: 'button',
            role: 'menuitem',
            disabled: disabled || blocked,
            title: blocked ? t('changes.noneSelected') : undefined,
            style: style(S.item, disabled || blocked ? S.itemDisabled : pendingAction === action.id ? S.itemPending : undefined),
            onClick: () => {
              // A commit-shaped action asks first: the message and the markers are
              // decided here, and the click that says "record this" is the confirm
              // button in that step. Clicking the same action again backs out.
              if (commitLike) {
                setPendingAction((current) => (current === action.id ? null : action.id))
                return
              }
              void run(`/github ${action.id}${dirSuffix(sessionId)}`).then(() => refresh())
            },
          },
          label,
        )
      })

      // The switch for what Commit & push does with a moved upstream. It lives
      // beside the actions rather than inside the commit step so it is visible
      // before the step is entered — the whole point of a switch is to be seen.
      const integrateToggle =
        remoteMissing
          ? null
          : React.createElement(
              'div',
              { key: 'integrate', style: S.markerSummary },
              React.createElement(
                'button',
                {
                  type: 'button',
                  role: 'menuitemcheckbox',
                  'aria-checked': integrateOn,
                  title: t('integrate.hint'),
                  disabled,
                  style: style(S.chip, integrateOn ? S.chipOnGreen : undefined),
                  onClick: toggleIntegrate,
                },
                integrateOn ? `✓ ${t('action.integrate')}` : t('action.integrate'),
              ),
            )

      // The switch is on by default, but if it was turned off while the upstream
      // moved on, say so before the click that would be refused.
      const integrateBehind =
        isRepo &&
        !remoteMissing &&
        typeof probe?.behind === 'number' &&
        probe.behind > 0 &&
        integrateOn !== true
          ? React.createElement(
              'div',
              { key: 'integrate-behind', style: S.hint },
              t('integrate.behind', { count: probe.behind }),
            )
          : null

      // A jump out of the menu to the project's page. An anchor rather than a
      // button: `target="_blank"` is what carries the click to the browser, and
      // the desktop shell turns exactly that into its own external open. The
      // menu closes on the click, so coming back to the window starts fresh.
      const openWebItem =
        webUrl === null
          ? null
          : React.createElement(
              'a',
              {
                key: 'open-web',
                href: webUrl,
                target: '_blank',
                rel: 'noopener noreferrer',
                role: 'menuitem',
                title: webUrl,
                style: S.item,
                onClick: () => {
                  // After the click's own default action, so removing the menu
                  // cannot be what cancels the navigation it just started.
                  if (surface === 'menu') setTimeout(() => setOpen(false), 0)
                },
              },
              t('action.openWeb'),
            )

      // The step a commit-shaped action enters: what will be recorded, the message
      // that records it, the markers a pipeline reads, and the click that does it.
      const pendingLabel = pendingAction === null ? '' : t(pendingAction === 'sync' ? 'action.sync' : 'action.commit')
      const commitStep =
        pendingAction === null
          ? null
          : [
              React.createElement(
                'div',
                { key: 'commit-step', style: S.hint },
                t('commit.step', { action: pendingLabel, count: selected.length }),
              ),
              ...commitOptions,
              React.createElement(
                'div',
                { key: 'commit-step-buttons', style: S.chips },
                React.createElement(
                  'button',
                  {
                    type: 'button',
                    disabled: disabled || needCustom,
                    title: needCustom ? t('commit.needCustom') : undefined,
                    style: style(
                      S.chipConfirm,
                      disabled || needCustom ? { opacity: 0.4, cursor: 'default' } : undefined,
                    ),
                    onClick: () => {
                      const action = pendingAction
                      setPendingAction(null)
                      // A recorded selection belongs to the commit that used it: the
                      // next change to the same path starts included again.
                      setExcluded(new Set())
                      void run(
                        `/github ${action}${dirSuffix(sessionId)}${fileSuffix}${commitSuffix}${
                          action === 'sync' ? integrateSuffix : ''
                        }`,
                      ).then(() => refresh())
                    },
                  },
                  // The click says what it will do: publishing is not the same act as
                  // recording, and the button is the last thing read before either.
                  t(pendingAction === 'sync' ? 'commit.confirmPush' : 'commit.confirm'),
                ),
                React.createElement(
                  'button',
                  { type: 'button', style: S.chip, onClick: () => setPendingAction(null) },
                  t('commit.cancel'),
                ),
              ),
            ]

      // A local repository with no remote needs one, and this is where it gets
      // one: the URL connects `origin`, then commits and pushes in the same
      // action, so the menu never offers a step that can only fail.
      const connectMenu = [
        React.createElement('div', { key: 'connect-hint', style: S.hint }, t('menu.connect.hint')),
        React.createElement(
          'div',
          { key: 'connect', style: { padding: '0 0 4px' } },
          // `/github init <url>` rather than `/github setup`: the URL form of
          // `init` does the whole job, and `init` is an action every session
          // already understands, so this keeps working after a plugin update
          // whose newly added action names the Host has not loaded yet.
          renderUrlRow(t('action.setup'), t('field.remoteLabel'), '/github init'),
        ),
        React.createElement('div', { key: 'connect-note', style: S.hint }, t('menu.connect.note')),
      ]

      // The state line above already explains the situation, so this list only
      // carries the entries that resolve it. Cloning is offered for every
      // workspace without a repository, empty or not: the clone never lands in
      // the workspace root — it gets a directory of its own, by default one
      // named after the repository — so files already there are not in its way.
      // The engine still refuses a target that exists and holds files, and names
      // it, which is the one case an explicit directory resolves.
      const emptyMenu = [
        React.createElement('div', { key: 'clone-label', style: S.hint }, t('menu.empty.cloneLabel')),
        React.createElement(
          'div',
          { key: 'clone', style: { padding: '0 0 4px' } },
          renderUrlRow(t('action.clone'), t('field.cloneLabel'), '/github clone'),
        ),
        // Said only where it answers the question the user is about to ask:
        // a folder that already holds files is exactly that case.
        ...(probe?.empty === false
          ? [React.createElement('div', { key: 'clone-note', style: S.hint }, t('menu.cloneNote'))]
          : []),
        React.createElement(
          'button',
          {
            key: 'init',
            type: 'button',
            role: 'menuitem',
            disabled,
            style: style(S.item, disabled ? S.itemDisabled : undefined),
            onClick: () => {
              void run('/github init').then(() => refresh())
            },
          },
          t('action.init'),
        ),
        React.createElement('div', { key: 'init-hint', style: S.hint }, t('menu.empty.initHint')),
      ]

      // Everything the control shows, in one list. The popup and the sidebar pane
      // are two containers around exactly these children, so a rule added to the
      // panel cannot land in one surface and miss the other.
      const panel = [
        React.createElement(
          'div',
          { key: 'head', style: S.head },
          React.createElement('span', { style: S.headTitle }, t('title')),
          React.createElement(
            'span',
            null,
            actionBusy === null
              ? // Both halves, because they update by different means: a page
                // reload replaces the control (rN) while the Host keeps the
                // module it loaded at startup (revN). Seeing them apart is
                // what makes a stale Host obvious instead of mysterious.
                typeof probe?.revision === 'string' && probe.revision.length > 0
                ? `${BUILD} · ${probe.revision}`
                : BUILD
              : t('menu.running', { action: actionBusy.replace('/github ', '') }),
          ),
          // The pane has room for a refresh control of its own, and asking again
          // is the one thing a persistent panel needs that a menu does not.
          surface === 'pane'
            ? React.createElement(
                'button',
                {
                  key: 'pane-refresh',
                  type: 'button',
                  disabled,
                  style: style(S.chip, disabled ? S.itemDisabled : undefined),
                  onClick: () => {
                    probeFresh.delete(sessionId)
                    void refresh(sessionId, true)
                  },
                },
                t('action.refresh'),
              )
            : null,
        ),
        // The jump to the project page belongs above the state line: it is the
        // first thing to reach for, and it does not depend on the change list.
        probeError === null && isRepo ? openWebItem : null,
        busy === null
          ? React.createElement(
              'div',
              { key: 'state', style: S.hint },
              probeError === null
                ? probe === null
                  ? t('menu.checking')
                  : isRepo
                    ? t('menu.found')
                    : // Naming the directory makes a workspace mismatch
                      // visible instead of looking like a detection bug.
                      typeof probe.workspace === 'string' && probe.workspace.length > 0
                      ? `${probe.detail ?? t('menu.empty.hint')} (${probe.workspace})`
                      : (probe.detail ?? t('menu.empty.hint'))
                : probeError,
            )
          : null,
        probeError === null
          ? null
          : React.createElement(
              'button',
              {
                key: 'probe-retry',
                type: 'button',
                role: 'menuitem',
                disabled,
                style: style(S.item, disabled ? S.itemDisabled : undefined),
                onClick: () => {
                  // An explicit retry is a new attempt, so it clears the
                  // recorded failure and the freshness window with it.
                  probeAttempted.delete(sessionId)
                  probeFresh.delete(sessionId)
                  setProbeError(null)
                  void refresh(sessionId, true)
                },
              },
              t('action.retry'),
            ),
        // The change list sits above the actions it narrows: what is about
        // to be committed is the question the buttons below answer, and the
        // message options are part of the same question.
        probeError === null && isRepo ? changesPanel : null,
        probeError === null && isRepo ? hiddenNote : null,
        // The repository actions are offered while the check is still in
        // flight as well, so a probe that never answers degrades the menu
        // to "unverified" rather than freezing it. Without an answer the
        // clone and init entries are withheld, because offering them for a
        // workspace that may already be a repository is the worse guess.
        probeError === null && (probe === null || isRepo) ? repoMenu : null,
        // Beside the action it modifies, and only where that action exists.
        probeError === null && isRepo ? integrateToggle : null,
        probeError === null ? integrateBehind : null,
        // Directly under the buttons it belongs to, and only while one of them is
        // waiting to be confirmed.
        probeError === null && (probe === null || isRepo) ? commitStep : null,
        probeError === null && isRepo ? branchesPanel : null,
        probeError === null && remoteMissing ? connectMenu : null,
        probe !== null && !isRepo ? emptyMenu : null,
        // Offered last, because it changes what everything above acts on.
        probeError === null ? targetMenu : null,
        // Only the menu offers the pane: the pane is already the pane.
        surface === 'menu' && openSidebar !== null
          ? React.createElement(
              'button',
              {
                key: 'open-sidebar',
                type: 'button',
                role: 'menuitem',
                style: S.item,
                onClick: openSidebar,
              },
              t('sidebar.open'),
            )
          : null,
        // Whether the panel comes along to the next repository session. Offered on
        // both surfaces, because it is a property of the plugin rather than of the
        // interaction, and stated the way the marker chips are: ticked means on.
        openSidebar !== null
          ? React.createElement(
              'div',
              { key: 'auto-open', style: S.markerSummary },
              React.createElement(
                'button',
                {
                  type: 'button',
                  role: 'menuitemcheckbox',
                  'aria-checked': autoOpen,
                  title: t('autoOpen.hint'),
                  style: style(S.chip, autoOpen ? S.chipOn : undefined),
                  onClick: () => {
                    const next = autoOpen !== true
                    setAutoOpen(next)
                    rememberAutoOpen(next)
                  },
                },
                autoOpen ? `✓ ${t('autoOpen.label')}` : t('autoOpen.label'),
              ),
            )
          : null,
        output === null
          ? null
          : (() => {
              // A patch gets the readable treatment; everything else — a log, an
              // error, a branch list — stays verbatim, because rendering it as
              // anything else would be inventing structure that is not there.
              const patch = failed === true ? null : parseUnifiedDiff(output)
              return patch === null
                ? React.createElement(
                    'pre',
                    { key: 'output', style: style(S.output, failed ? S.outputError : undefined) },
                    output,
                  )
                : React.createElement(DiffView, { key: 'diff', patch, t })
            })(),
        // The one line that replaces the probe row the chat no longer shows.
        surface === 'pane' && isRepo && lastCheck !== undefined
          ? React.createElement(
              'div',
              { key: 'log-footer', style: S.logFooter },
              `${t('log.lastCheck')} ${new Date(lastCheck).toLocaleTimeString()} · ${
                typeof probe?.branch === 'string' && probe.branch.length > 0 ? probe.branch : 'GitHub'
              } · ${probe?.dirty === true ? t('state.dirty') : t('state.clean')}`,
            )
          : null,
      ]

      // The sidebar pane: the same panel as a column of the page, with no popup to
      // position, no dismissal, and the height the dock gives it.
      if (surface === 'pane') {
        return React.createElement('div', { style: S.pane, 'data-github-sync': '' }, ...panel)
      }

      return React.createElement(
        'div',
        // `data-github-sync` is the containment boundary the dismiss listeners
        // ask about: a press inside it is the control's own.
        { style: S.wrap, 'data-github-sync': '' },
        React.createElement(
          'button',
          {
            type: 'button',
            'aria-haspopup': 'menu',
            'aria-expanded': open,
            title: info.title,
            disabled,
            style: style(S.button, disabled || open ? S.buttonActive : undefined),
            onClick: () => setOpen((value) => !value),
          },
          React.createElement(BranchIcon),
          info.tone === null ? null : React.createElement('span', { style: style(S.dot, { background: info.tone }) }),
          React.createElement('span', { style: S.buttonText }, info.label),
        ),
        open
          ? React.createElement('div', { role: 'menu', style: S.menu }, ...panel)
          : null,
      )
    }

    return {
      // `remote.commands` is declared beside `remote`: the Remote namespace is a
      // Cordis context of its own, and a nested service resolves by its full
      // name. Declaring only `remote` made every `remote.commands` read throw
      // `cannot get property "remote.commands" without inject`, which is the
      // failure the workspace check reported instead of an answer.
      // The right-sidebar services are required here rather than optional: the
      // composer's "Open in sidebar" entry and auto-open are part of this
      // control, and a `ctx.inject` race left the tab unregistered on some
      // restarts. Declaring them makes activation wait for the dock.
      inject: ['slots', 'remote', 'remote.commands', 'locale', 'sidebarRight', 'sidebarRightTabs'],
      apply(ctx) {
        // Both dictionaries are registered under one namespace; the Client's
        // active locale selects between them, and English is the fallback for
        // any locale this plugin does not translate.
        ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, { en: EN, zh: ZH }))
        // The chat target dispatches each command row to this seat by command
        // name. Owning the `github` row is what lets the automatic status probe
        // stay out of the conversation while an explicit command remains.
        ctx.slots.inject('conversation.chat.commandview', () =>
          ctx.slots.register(
            { name: 'conversation.chat.commandview', key: 'github', locale: LOCALE_NAMESPACE },
            GithubCommandRow,
          ),
        )
        // The right sidebar is optional, and its services can arrive after this
        // plugin activates. `ctx.get` read once made the tab, the "Open in the
        // sidebar" entry, and auto-open disappear whenever the dock lost that race.
        // `ctx.inject` waits for both services and re-runs when they change; the
        // mutable handle lets the already-mounted composer see them through a
        // re-render instead of being stuck with the activation-time answer.
        //
        // The guard is inside each registration rather than around the injection:
        // one refused registration costs a menu entry and a warning, never the
        // composer. `console.warn` is used rather than `ctx.logger`, which is
        // another service this plugin does not declare.
        const guarded = (what, fn) => {
          try {
            return fn()
          } catch (error) {
            console.warn(`github-sync: ${what} failed: ${error instanceof Error ? error.message : String(error)}`)
            return undefined
          }
        }
        let sidebarApi = null
        let diffReady = false
        const openSidebar = () => {
          try {
            sidebarApi?.openTab(SIDEBAR_KIND)
          } catch {
            // A click before the dock answered is a no-op, not a crash.
          }
        }
        // A resource tab *beside* the repo panel rather than in place of it, so the
        // change list stays where it was and each file's patch keeps its own tab.
        const openDiffTab = (session, path) => {
          try {
            sidebarApi?.openResource(diffAddress(session, path))
          } catch {
            // Same as openSidebar: the dock may not have answered yet.
          }
        }
        const sidebarExpanded = () => {
          try {
            return sidebarApi?.isExpanded() === true
          } catch {
            return false
          }
        }
        const injectSidebar = (callback) => {
          if (typeof ctx.inject === 'function') {
            ctx.inject(['sidebarRight', 'sidebarRightTabs'], callback)
            return
          }
          // The test seam and an older client context may not expose `inject`;
          // fall back to a one-shot activation with the same scope shape.
          const sidebar = ctx.get('sidebarRight')
          const sidebarTabs = ctx.get('sidebarRightTabs')
          if (sidebar === undefined || sidebarTabs === undefined) return
          callback({
            sidebarRight: sidebar,
            sidebarRightTabs: sidebarTabs,
            effect: ctx.effect,
            slots: ctx.slots,
          })
        }
        injectSidebar((scope) => {
          const sidebar = scope.sidebarRight
          const sidebarTabs = scope.sidebarRightTabs
          // The right sidebar, extended the way the Files and Terminal features
          // extend it: a tab type, then the body and the chip title registered
          // under the same id. `extension` is the slot a plugin owns; a `kind`
          // carries at most one of those beside the builtin one.
          scope.effect(() =>
            guarded('registering the sidebar tab', () => {
              const dispose = sidebarTabs.register({
                id: SIDEBAR_ID,
                kind: SIDEBAR_KIND,
                priority: 'extension',
                // Retained while another tab is in front: the panel holds the
                // action result, the ticked markers and a half-entered commit, and
                // none of that should be lost by looking at another tab and back.
                keepMounted: true,
                title: () => ctx.locale.bind(LOCALE_NAMESPACE)('sidebar.title'),
              })
              sidebarApi = sidebar
              notifySidebarState()
              return () => {
                dispose()
                if (sidebarApi === sidebar) {
                  sidebarApi = null
                  notifySidebarState()
                }
              }
            }),
          )
          scope.effect(() =>
            guarded('registering the sidebar pane', () =>
              scope.slots.inject('sidebar.right.pane.tab', () =>
                scope.slots.register(
                  {
                    name: 'sidebar.right.pane.tab',
                    key: SIDEBAR_ID,
                    locale: LOCALE_NAMESPACE,
                    inject: () => ({ remote: ctx.remote, surface: 'pane' }),
                  },
                  GithubSyncButton,
                ),
              ),
            ),
          )
          scope.effect(() =>
            guarded('registering the sidebar chip', () =>
              scope.slots.inject('sidebar.right.pane.tab.title', () =>
                scope.slots.register(
                  { name: 'sidebar.right.pane.tab.title', key: SIDEBAR_ID, locale: LOCALE_NAMESPACE },
                  (props) => React.createElement('span', null, props?.t?.('sidebar.title') ?? 'GitHub'),
                ),
              ),
            ),
          )
          // The diff tab is registered before the menu for the same reason the
          // sidebar tab is: an item that opens a kind nobody registered is an error
          // on the dock's side.
          scope.effect(() =>
            guarded('registering the diff tab', () => {
              const dispose = sidebarTabs.register({
                id: DIFF_ID,
                kind: DIFF_KIND,
                priority: 'extension',
                patterns: [`${DIFF_PREFIX}**`],
                // A patch is read against another patch, so switching to the
                // change list and back must not re-run the diff — or lose it.
                keepMounted: true,
                title: (address) =>
                  ctx.locale.bind(LOCALE_NAMESPACE)('diff.tabTitle', { path: diffPathOf(address) ?? '' }),
              })
              diffReady = true
              notifySidebarState()
              return () => {
                dispose()
                diffReady = false
                notifySidebarState()
              }
            }),
          )
          scope.effect(() =>
            guarded('registering the diff pane', () =>
              scope.slots.inject('sidebar.right.pane.tab', () =>
                scope.slots.register(
                  {
                    name: 'sidebar.right.pane.tab',
                    key: DIFF_ID,
                    locale: LOCALE_NAMESPACE,
                    inject: () => ({ remote: ctx.remote }),
                  },
                  GithubDiffTab,
                ),
              ),
            ),
          )
          scope.effect(() =>
            guarded('registering the diff chip', () =>
              scope.slots.inject('sidebar.right.pane.tab.title', () =>
                scope.slots.register(
                  { name: 'sidebar.right.pane.tab.title', key: DIFF_ID, locale: LOCALE_NAMESPACE },
                  (props) => React.createElement('span', null, props?.t?.('diff.chip') ?? 'Diff'),
                ),
              ),
            ),
          )
        })
        ctx.slots.inject('conversation.input.left', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.left',
              id: 'github-sync',
              order: 40,
              label: () => ctx.locale.bind(LOCALE_NAMESPACE)('title'),
              locale: LOCALE_NAMESPACE,
              // The Remote command namespace is not part of the slot's standard
              // props, so it is injected explicitly for the component to call.
              // `surface` is what makes one control render as a popup here and as
              // a pane in the sidebar.
              inject: () => ({
                remote: ctx.remote,
                surface: 'menu',
                // The composer is registered before the dock may be available.
                // The boolean is what re-runs auto-open and reveals the menu entry
                // once `sidebarApi` arrives; the functions are safe while null.
                sidebarReady: sidebarApi !== null,
                ...(sidebarApi !== null
                  ? {
                      openSidebar,
                      // Asked at the moment a session appears, so it is a call and
                      // not a captured value: a boolean would be the previous
                      // session's answer. A deployment without the controller keeps
                      // the menu's own way in.
                      sidebarExpanded,
                    }
                  : {}),
                ...(diffReady ? { openDiffTab } : {}),
              }),
            },
            GithubSyncButton,
          ),
        )
      },
    }
  },
})
