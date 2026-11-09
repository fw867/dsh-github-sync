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
      'state.upstreamGone': 'upstream gone',
      'changes.title': 'Changes',
      'changes.summary': '{total} changed · {staged} staged',
      'changes.truncated': 'showing the first {shown}; more paths changed',
      'changes.diff': 'Diff',
      'changes.includeDir': 'Include every change under {path} in the next commit',
      'changes.expand': 'Expand {path}',
      'changes.collapse': 'Collapse {path}',
      'diff.unknownPath': 'changed file',
      'diff.noText': 'No line-by-line comparison is available for this file.',
      'diff.tabTitle': 'Diff: {path}',
      'diff.chip': 'Diff',
      'diff.noPath': 'This tab has no file to compare.',
      'diff.viewLabel': 'Diff layout',
      'diff.view.unified': 'Unified',
      'diff.view.split': 'Split',
      'changes.diffLabel': 'Show the diff of {path}',
      'changes.noneSelected': 'Nothing is selected, so there is nothing to commit. Tick at least one path.',
      'changes.selected': '{count} of {total} selected for the next commit',
      'changes.all': 'all {total} selected',
      'changes.include': 'Include {path} in the next commit',
      'changes.unrepresentable': 'A path containing a double quote cannot be named on the /github line; commit it from the tool or a terminal.',
      'changes.hidden': '{count} change(s) are not listed: a file git does not track yet, or a path .gitignore excludes. `git add` the file if it belongs in the next commit.',
      'changes.clean': 'Nothing tracked has changed.',
      'commit.options': 'Commit message',
      'commit.placeholder': 'Commit message — the first line becomes the subject',
      'commit.ai': 'Write the message with AI',
      'commit.aiBusy': 'Writing a message…',
      'commit.aiEmpty': 'The model returned no message; type one instead.',
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
      'branches.gone': '(gone)',
      'branches.switchLabel': 'Switch to {name}',
      'branches.create': 'Create',
      'branches.newLabel': 'New branch name',
      'branches.newPlaceholder': 'feature/name',
      'branches.newOption': '+ New branch…',
      'branches.truncated': 'showing the {shown} most recent; /github branches lists every one',
      'branches.remoteTitle': 'On the remote',
      'branches.default': 'default',
      'branches.remoteTruncated': 'showing the {shown} most recent remote branches',
      'branches.upstreamGone': 'The tracked branch {upstream} is gone on the remote.',
      'branches.upstreamGoneDefault': 'The tracked branch {upstream} is gone; the remote default is now {name}.',
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
      'state.upstreamGone': '上游已删除',
      'changes.title': '改动',
      'changes.summary': '共 {total} 项改动 · 已暂存 {staged}',
      'changes.truncated': '只显示前 {shown} 项，还有更多改动',
      'changes.diff': '差异',
      'changes.includeDir': '把 {path} 下的所有改动纳入下次提交',
      'changes.expand': '展开 {path}',
      'changes.collapse': '收起 {path}',
      'diff.unknownPath': '改动的文件',
      'diff.noText': '该文件没有可逐行对比的内容。',
      'diff.tabTitle': '差异：{path}',
      'diff.chip': '差异',
      'diff.noPath': '这个标签页没有可对比的文件。',
      'diff.viewLabel': '差异布局',
      'diff.view.unified': '统一',
      'diff.view.split': '分栏',
      'changes.diffLabel': '查看 {path} 的差异',
      'changes.noneSelected': '没有选中任何文件，无法提交。请至少勾选一项。',
      'changes.selected': '已选中 {count}/{total} 项，将进入下次提交',
      'changes.all': '已全选 {total} 项',
      'changes.include': '把 {path} 纳入下次提交',
      'changes.unrepresentable': '路径里含双引号，无法写在 /github 命令行上；请用工具或终端提交它。',
      'changes.hidden': '另有 {count} 个改动未列出：尚未被 git 跟踪的文件，或已被 .gitignore 排除的路径。要让它进入本次提交，请先 `git add` 它。',
      'changes.clean': '已跟踪的文件没有改动。',
      'commit.options': '提交信息',
      'commit.placeholder': '提交信息（首行即标题）',
      'commit.ai': '用 AI 生成提交信息',
      'commit.aiBusy': '正在生成提交信息…',
      'commit.aiEmpty': '模型没有返回信息，请手动填写。',
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
      'branches.gone': '（已删除）',
      'branches.switchLabel': '切换到 {name}',
      'branches.create': '新建',
      'branches.newLabel': '新分支名',
      'branches.newPlaceholder': 'feature/name',
      'branches.newOption': '＋ 新建分支…',
      'branches.truncated': '只显示最近 {shown} 个；/github branches 可列出全部',
      'branches.remoteTitle': '远程分支',
      'branches.default': '默认',
      'branches.remoteTruncated': '只显示最近 {shown} 个远程分支',
      'branches.upstreamGone': '跟踪的 {upstream} 在远程已不存在。',
      'branches.upstreamGoneDefault': '跟踪的 {upstream} 在远程已不存在；远程默认分支现在是 {name}。',
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
        // The tree and the patch's row model: pure, and the units worth
        // asserting on — the list's shape and a rewritten line's pairing are
        // exactly the parts a screenshot cannot check.
        statusOfCode,
        buildChangeTree,
        flattenChangeTree,
        inlineSegments,
        pairModifiedRows,
        splitHunkRows,
        preparePatch,
        ChangesTree,
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
    const BUILD = 'r56'

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
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '4px 8px 6px',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 11,
        lineHeight: '16px',
      },
      headTitle: { color: 'var(--dsw-alias-label-primary)', fontSize: 12 },
      /** The build · revision stamp, kept to the space it needs. */
      headState: { flex: '0 0 auto', color: 'var(--dsw-alias-label-tertiary)', fontSize: 10 },
      /** The branch row: a label, one select, and the new-branch control. */
      branchRow: { display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px 4px' },
      branchLabel: { flex: '0 0 auto', color: 'var(--dsw-alias-label-secondary)', fontSize: 11 },
      select: {
        flex: '1 1 auto',
        minWidth: 0,
        height: 24,
        padding: '0 4px',
        boxSizing: 'border-box',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        borderRadius: 6,
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 12,
      },
      /** The message box and its AI button, side by side. */
      commitField: { display: 'flex', alignItems: 'stretch', gap: 6, padding: '2px 8px 6px' },
      commitInput: {
        flex: '1 1 auto',
        minWidth: 0,
        minHeight: 44,
        padding: '6px 8px',
        boxSizing: 'border-box',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        borderRadius: 8,
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        fontFamily: 'inherit',
        fontSize: 12,
        lineHeight: '17px',
        resize: 'vertical',
      },
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
      /** The one chip that carries the commit itself. */
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
      // A patch ends with its last line's newline, so the split leaves one empty
      // trailing field — not a line of the patch.
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
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
        // A CRLF file leaves its carriage return inside the line content; it is
        // invisible in the patch and would render as a trailing blank cell.
        const body = (line.startsWith(DIFF_INDENT) ? line.slice(DIFF_INDENT.length) : line).replace(/\r$/, '')
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
     * How two versions of one line differ, as runs a reader can see.
     *
     * The pair of a rewritten line is the one place a word-level comparison is
     * worth its cost: the common prefix and suffix are trimmed, and what stays
     * in the middle is what actually changed. Character-level trimming is
     * enough — a token diff would need a tokenizer per language, and the point
     * here is to make the change visible, not to name it.
     *
     * @param oldText - the removed line, without its sign.
     * @param newText - the added line, without its sign.
     * @returns `{ old, new }`, each a run list of `{ text, changed }`.
     */
    function inlineSegments(oldText, newText) {
      const before = String(oldText ?? '')
      const after = String(newText ?? '')
      const limit = Math.min(before.length, after.length)
      let prefix = 0
      while (prefix < limit && before[prefix] === after[prefix]) prefix += 1
      let suffix = 0
      while (suffix < limit - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) {
        suffix += 1
      }
      const runs = (text) => {
        const head = text.slice(0, prefix)
        const body = text.slice(prefix, text.length - suffix)
        const tail = text.slice(text.length - suffix)
        const out = []
        if (head.length > 0) out.push({ text: head, changed: false })
        if (body.length > 0) out.push({ text: body, changed: true })
        if (tail.length > 0) out.push({ text: tail, changed: false })
        return out
      }
      return { old: runs(before), new: runs(after) }
    }

    /**
     * Pair the removed lines of a hunk with the added ones that replace them.
     *
     * Git reports a rewritten line as a removal followed by an addition, and
     * rendering those as two unrelated rows is what makes a one-word edit look
     * like a one-line replacement. A deletion run immediately followed by an
     * addition run is therefore paired index by index, up to the shorter of the
     * two, and only the paired rows carry the intra-line runs — an unpaired
     * removal is a deletion, not a rewrite, and must not claim to be one.
     *
     * @param rows - one hunk's parsed rows.
     * @returns the same rows, paired ones carrying `inline` run lists.
     */
    function pairModifiedRows(rows) {
      const out = rows.map((row) => ({ ...row }))
      let index = 0
      while (index < out.length) {
        if (out[index].kind !== 'del') {
          index += 1
          continue
        }
        const firstDel = index
        while (index < out.length && out[index].kind === 'del') index += 1
        const firstAdd = index
        while (index < out.length && out[index].kind === 'add') index += 1
        const removed = out.slice(firstDel, firstAdd)
        const added = out.slice(firstAdd, index)
        const pairs = Math.min(removed.length, added.length)
        for (let offset = 0; offset < pairs; offset += 1) {
          const segments = inlineSegments(removed[offset].text, added[offset].text)
          removed[offset].inline = segments.old
          added[offset].inline = segments.new
        }
      }
      return out
    }

    /**
     * Fold two aligned versions of one hunk into the side-by-side model.
     *
     * A context row is the same row on both sides. A rewritten pair is one row
     * with a left and a right half. What has no counterpart — a pure deletion or
     * a pure addition — keeps one half empty, which is what makes the missing
     * side visible rather than invented.
     *
     * @param rows - one hunk's paired rows.
     * @returns rows of `{ left?, right?, note? }`.
     */
    function splitHunkRows(rows) {
      const out = []
      let index = 0
      while (index < rows.length) {
        const row = rows[index]
        if (row.kind === 'ctx') {
          out.push({ left: row, right: row })
          index += 1
          continue
        }
        if (row.kind === 'note') {
          out.push({ note: row })
          index += 1
          continue
        }
        const removed = []
        const added = []
        while (index < rows.length && rows[index].kind === 'del') {
          removed.push(rows[index])
          index += 1
        }
        while (index < rows.length && rows[index].kind === 'add') {
          added.push(rows[index])
          index += 1
        }
        // A row that is neither a deletion nor an addition ends the run; without
        // this guard an unknown kind would loop here forever.
        if (removed.length === 0 && added.length === 0) {
          out.push({ left: row })
          index += 1
          continue
        }
        const pairs = Math.min(removed.length, added.length)
        for (let offset = 0; offset < pairs; offset += 1) {
          out.push({ left: removed[offset], right: added[offset] })
        }
        for (let offset = pairs; offset < removed.length; offset += 1) out.push({ left: removed[offset] })
        for (let offset = pairs; offset < added.length; offset += 1) out.push({ right: added[offset] })
      }
      return out
    }

    /**
     * The patch as the renderer needs it: each hunk's rows paired once.
     *
     * Parsing is cheap and pairing is not free, so it happens here rather than
     * inside a row renderer — once per patch, not once per row.
     *
     * @param patch - a parsed patch.
     * @returns the patch with `hunks[].rows` paired, or null.
     */
    function preparePatch(patch) {
      if (patch === null || patch === undefined) return null
      return {
        ...patch,
        hunks: patch.hunks.map((hunk) => ({ header: hunk.header, rows: pairModifiedRows(hunk.rows) })),
      }
    }

    /** The runs of a paired row as text and highlight spans. */
    function inlineChildren(row, changedClass) {
      if (!Array.isArray(row.inline)) return row.text
      return row.inline.map((run, index) =>
        run.changed === true
          ? React.createElement('span', { key: `run-${index}`, className: changedClass }, run.text)
          : run.text,
      )
    }

    /**
     * One file's patch, as a block: where it is, how much changed, and the hunks.
     *
     * Both callers share the engine's outcome text, so the patch is parsed here
     * rather than fetched again — the command has already run by the time this
     * renders. The layout is a choice the reader makes: the unified view matches
     * a terminal's `git diff`, and the split view puts a rewritten line's two
     * versions side by side so the change is one row rather than two.
     *
     * @param patch - `parseUnifiedDiff`'s answer.
     * @param t - the bound translate function.
     * @param fill - true inside a tab, where the pane scrolls the whole patch
     *   rather than a bounded box inside a bounded menu.
     * @param initialMode - the layout to open in; a reader's toggle wins after.
     */
    /**
     * The last layout a reader picked, shared by every diff surface.
     *
     * A patch opened from the list and a patch opened from the tab use the same
     * renderer, and a reader who chose split once expects the next file to open
     * the same way. Keeping it module-level rather than per instance is what
     * makes that hold across two tabs that are mounted at different times.
     */
    let preferredDiffLayout = 'unified'

    function DiffView({ patch, t, fill, initialMode }) {
      // A diff tab can be the only surface this plugin has mounted — restored on
      // its own, with the repository panel never opened — so the sheet is ensured
      // here too, not only by the list.
      ensureStyles()
      const [mode, setMode] = React.useState(
        initialMode === 'split' || initialMode === 'unified' ? initialMode : preferredDiffLayout,
      )
      const chooseMode = (next) => {
        preferredDiffLayout = next
        setMode(next)
      }
      const prepared = preparePatch(patch)
      const head = React.createElement(
        'div',
        { className: 'gsy-diffhead' },
        React.createElement('span', { className: 'gsy-diffpath', title: patch.path ?? '' }, patch.path ?? t('diff.unknownPath')),
        React.createElement(
          'span',
          { className: 'gsy-diffstat' },
          React.createElement('span', { className: 'gsy-stat-add' }, `+${patch.additions}`),
          ' ',
          React.createElement('span', { className: 'gsy-stat-del' }, `−${patch.deletions}`),
        ),
        patch.binary === true || (prepared !== null && prepared.hunks.length === 0)
          ? null
          : React.createElement(
              'span',
              { className: 'gsy-seg', role: 'group', 'aria-label': t('diff.viewLabel') },
              React.createElement(
                'button',
                {
                  type: 'button',
                  'aria-pressed': mode === 'unified',
                  title: t('diff.view.unified'),
                  onClick: () => chooseMode('unified'),
                },
                t('diff.view.unified'),
              ),
              React.createElement(
                'button',
                {
                  type: 'button',
                  'aria-pressed': mode === 'split',
                  title: t('diff.view.split'),
                  onClick: () => chooseMode('split'),
                },
                t('diff.view.split'),
              ),
            ),
      )
      if (patch.binary === true || prepared.hunks.length === 0) {
        return React.createElement(
          'div',
          { className: 'gsy-diffbox' },
          head,
          React.createElement('div', { className: 'gsy-diffnote' }, t('diff.noText')),
        )
      }

      const body = []
      prepared.hunks.forEach((hunk, hunkIndex) => {
        body.push(React.createElement('div', { key: `h${hunkIndex}`, className: 'gsy-hunk' }, hunk.header))
        if (mode === 'split') {
          splitHunkRows(hunk.rows).forEach((row, rowIndex) => {
            const key = `h${hunkIndex}r${rowIndex}`
            if (row.note !== undefined) {
              body.push(
                React.createElement(
                  'div',
                  { key, className: 'gsy-drow gsy-note' },
                  React.createElement('span', { className: 'gsy-text' }, row.note.text),
                ),
              )
              return
            }
            const half = (side) => {
              const source = row[side]
              if (source === undefined) {
                return React.createElement('span', { className: 'gsy-half gsy-empty' })
              }
              // A context row is the same line on both sides: no sign, no tint.
              // The tone follows the row's own kind, never the half it sits in —
              // otherwise every left half would claim to be a deletion.
              const kind = source.kind === 'del' ? 'gsy-del' : source.kind === 'add' ? 'gsy-add' : ''
              const sign = source.kind === 'del' ? '-' : source.kind === 'add' ? '+' : ' '
              return React.createElement(
                'span',
                { className: `gsy-half ${kind}`.trim() },
                React.createElement(
                  'span',
                  { className: 'gsy-gutter' },
                  side === 'left'
                    ? source.oldNo === null
                      ? ''
                      : String(source.oldNo)
                    : source.newNo === null
                      ? ''
                      : String(source.newNo),
                ),
                React.createElement('span', { className: 'gsy-sign' }, sign),
                React.createElement(
                  'span',
                  { className: 'gsy-text' },
                  inlineChildren(source, source.kind === 'del' ? 'gsy-inline-del' : 'gsy-inline-add'),
                ),
              )
            }
            body.push(
              React.createElement(
                'div',
                { key, className: 'gsy-drow gsy-split' },
                half('left'),
                half('right'),
              ),
            )
          })
          return
        }
        hunk.rows.forEach((row, rowIndex) => {
          const tone = row.kind === 'add' ? 'gsy-add' : row.kind === 'del' ? 'gsy-del' : row.kind === 'note' ? 'gsy-note' : ''
          body.push(
            React.createElement(
              'div',
              { key: `h${hunkIndex}r${rowIndex}`, className: `gsy-drow ${tone}`.trim() },
              React.createElement('span', { className: 'gsy-gutter' }, row.oldNo === null ? '' : String(row.oldNo)),
              React.createElement('span', { className: 'gsy-gutter' }, row.newNo === null ? '' : String(row.newNo)),
              React.createElement('span', { className: 'gsy-sign' }, row.sign),
              React.createElement(
                'span',
                { className: 'gsy-text' },
                inlineChildren(row, row.kind === 'add' ? 'gsy-inline-add' : 'gsy-inline-del'),
              ),
            ),
          )
        })
      })
      return React.createElement(
        'div',
        { className: 'gsy-diffbox' },
        head,
        React.createElement('div', { className: fill === true ? 'gsy-diffbody gsy-fill' : 'gsy-diffbody' }, ...body),
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
     * The Host route a patch is read from, when the Host half registered one.
     *
     * A relative path resolved against the page's own base: a GUI under a
     * reverse-proxy directory prefix then keeps that prefix, and the launch token
     * in the page's query is dropped — the request is authenticated by the
     * browser cookie the connection service issues, the same way every other
     * plugin route is.
     */
    const DIFF_ROUTE = 'github-sync/diff'
    const MESSAGE_ROUTE = 'github-sync/message'

    /** What the route last said about itself: unknown, ready, or missing. */
    let diffRouteState = 'unknown'

    /** Patches already read, so a hover can pay for the click. */
    const diffCache = new Map()
    const DIFF_CACHE_MS = 8000
    /** Reads in flight, so a row hovered twice asks once. */
    const diffInflight = new Set()

    /** The route's URL, or null on a page with no base to resolve against. */
    function hostRouteUrl(route) {
      if (typeof document === 'undefined' || typeof document.baseURI !== 'string' || document.baseURI.length === 0) {
        return null
      }
      try {
        const base = new URL(document.baseURI)
        base.search = ''
        base.hash = ''
        if (!base.pathname.endsWith('/')) base.pathname += '/'
        return new URL(route, base).href
      } catch {
        return null
      }
    }

    const diffKey = (sessionId, path) => `${sessionId}\u0000${path}`

    /** One fresh cached patch, or undefined when it is absent or stale. */
    function cachedDiff(sessionId, path) {
      const entry = diffCache.get(diffKey(sessionId, path))
      if (entry === undefined) return undefined
      if (Date.now() - entry.at > DIFF_CACHE_MS) {
        diffCache.delete(diffKey(sessionId, path))
        return undefined
      }
      return entry.text
    }

    /** Keep a patch for the next click on the same row. */
    function rememberDiff(sessionId, path, text) {
      diffCache.set(diffKey(sessionId, path), { at: Date.now(), text })
      // A tree with hundreds of rows must not grow this without bound.
      if (diffCache.size > 64) {
        const oldest = [...diffCache.entries()].sort((left, right) => left[1].at - right[1].at)[0]
        if (oldest !== undefined) diffCache.delete(oldest[0])
      }
    }

    /**
     * Ask the Host for one path's patch over its own route.
     *
     * Resolves to the text, or undefined when this deployment has no route (an
     * older Host, or a composition without a web server) or the route answered an
     * error — the caller then falls back to the command bridge, which is the one
     * that can explain itself.
     */
    async function requestHostDiff({ sessionId, path, dir }) {
      if (diffRouteState === 'missing' || sessionId === undefined || typeof fetch !== 'function') return undefined
      const url = hostRouteUrl(DIFF_ROUTE)
      if (url === null) return undefined
      let response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId, path, ...(dir === null || dir === undefined ? {} : { dir }) }),
        })
      } catch {
        // A transport failure is not proof the route is missing (a reload, a
        // proxy hiccup); the command bridge still answers, and the next paint
        // tries again.
        return undefined
      }
      if (response.status === 404 || response.status === 405) {
        diffRouteState = 'missing'
        return undefined
      }
      if (response.ok !== true) return undefined
      const body = await response.json().catch(() => undefined)
      if (body?.ok !== true || typeof body.text !== 'string') return undefined
      diffRouteState = 'ready'
      return body.text
    }

    /**
     * Ask the Host for a suggested commit message over its own route.
     *
     * The same fence and the same fallback rule as the patch route: undefined when
     * this deployment has no route, so the caller can use the command bridge.
     * Resolves to `{ subject, body? }`.
     */
    async function requestHostMessage({ sessionId, dir, files }) {
      if (diffRouteState === 'missing' || sessionId === undefined || typeof fetch !== 'function') return undefined
      const url = hostRouteUrl(MESSAGE_ROUTE)
      if (url === null) return undefined
      let response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            ...(dir === null || dir === undefined ? {} : { dir }),
            ...(Array.isArray(files) && files.length > 0 ? { files } : {}),
          }),
        })
      } catch {
        return undefined
      }
      if (response.status === 404 || response.status === 405) {
        diffRouteState = 'missing'
        return undefined
      }
      if (response.ok !== true) return undefined
      const body = await response.json().catch(() => undefined)
      if (body?.ok !== true || typeof body.message?.subject !== 'string') return undefined
      diffRouteState = 'ready'
      return body.message
    }

    /** Read one row's patch before it is clicked; a hover is free to fail. */
    async function prefetchDiff(sessionId, path) {
      if (sessionId === undefined || diffRouteState === 'missing') return
      if (cachedDiff(sessionId, path) !== undefined) return
      const key = diffKey(sessionId, path)
      if (diffInflight.has(key)) return
      diffInflight.add(key)
      try {
        const text = await requestHostDiff({ sessionId, path, dir: targetChoice.get(sessionId) ?? null })
        if (text !== undefined) rememberDiff(sessionId, path, text)
      } finally {
        diffInflight.delete(key)
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
        // Marked before the first await, so a re-render during it does not ask
        // for the same patch twice.
        setAsked(true)
        let cancelled = false
        const show = async () => {
          // A hovered row has already paid for its patch.
          const warm = cachedDiff(sessionId, path)
          if (warm !== undefined) {
            setFailed(false)
            setOutput(warm)
            return
          }
          // The Host route is the fast path: no session command, no command row,
          // and no wait for the session's turn — a click is a read, not an
          // operation. A deployment without the route falls through to the
          // command bridge, which is the same request a person could type.
          const direct = await requestHostDiff({ sessionId, path, dir: targetChoice.get(sessionId) ?? null })
          if (cancelled) return
          if (direct !== undefined) {
            rememberDiff(sessionId, path, direct)
            setFailed(false)
            setOutput(direct)
            return
          }
          const commands = commandsOf(remoteRef.current)
          if (commands?.execute === undefined) {
            setFailed(true)
            setOutput(t('error.unavailable'))
            return
          }
          // The path travels as `--dir`-free text on the command line, so it is
          // quoted: a path with a space is otherwise two arguments.
          const choice = targetChoice.get(sessionId) ?? null
          const line = `/github diff --file "${path}"${choice === null ? '' : ` --dir "${choice}"`}`
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
            rememberDiff(sessionId, path, text)
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
      // The tab's own column scrolls, so the patch is allowed to take the height
      // it needs instead of scrolling inside a box inside a scroller.
      return React.createElement(
        'div',
        { style: S.pane, 'data-github-sync': '' },
        React.createElement(DiffView, { patch, t, fill: true }),
      )
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
     * The change list's and the patch's own stylesheet.
     *
     * Inline styles carry the panel's ordinary chrome, but a tree needs states
     * inline styles cannot express: hover, focus-visible, a rotated disclosure,
     * an indeterminate checkbox. One scoped sheet is cheaper than a hover flag
     * per row and keeps the two surfaces — popup and pane — identical, because
     * they render the same class names. Every colour is a DSH alias token, so
     * the list follows the active theme and skin.
     */
    const STYLE_ID = 'dsh-github-sync-styles'
    const STYLES = `
.gsy-tree { display: flex; flex-direction: column; margin: 2px 0 4px; }
.gsy-row { display: flex; align-items: center; gap: 6px; min-height: 24px; padding: 0 4px; border-radius: 5px; box-sizing: border-box; }
.gsy-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.gsy-guides { flex: 0 0 auto; align-self: stretch; background-image: repeating-linear-gradient(to right, transparent 0 17px, var(--dsw-alias-border-l1) 17px 18px); }
.gsy-check { flex: 0 0 auto; width: 13px; height: 13px; margin: 0; accent-color: var(--dsw-alias-brand-primary); cursor: pointer; }
.gsy-check:disabled { cursor: default; opacity: 0.5; }
.gsy-main { display: flex; align-items: center; gap: 6px; flex: 1 1 auto; min-width: 0; padding: 2px 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.gsy-main:focus-visible, .gsy-hint:focus-visible { outline: 2px solid var(--dsw-alias-interactive-bg-hover-accent); outline-offset: -1px; border-radius: 4px; }
.gsy-chevron { flex: 0 0 auto; width: 12px; height: 12px; color: var(--dsw-alias-label-tertiary); transition: transform 120ms ease; }
.gsy-chevron[data-open='true'] { transform: rotate(90deg); }
.gsy-folder { flex: 0 0 auto; width: 13px; height: 13px; color: var(--dsw-alias-label-tertiary); }
.gsy-dirname { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.gsy-count { flex: 0 0 auto; min-width: 16px; height: 16px; padding: 0 5px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-tertiary); font-size: 10px; line-height: 16px; text-align: center; font-variant-numeric: tabular-nums; }
.gsy-badge { flex: 0 0 auto; width: 14px; text-align: center; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10px; line-height: 16px; font-weight: 700; }
.gsy-name { flex: 0 1 auto; min-width: 40px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--dsw-alias-label-primary); }
.gsy-from { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; color: var(--dsw-alias-label-tertiary); }
.gsy-hint { flex: 0 0 auto; padding: 0 5px; border: 0; border-radius: 4px; background: transparent; color: var(--dsw-alias-label-secondary); font-size: 10px; line-height: 16px; cursor: pointer; opacity: 0; transition: opacity 120ms ease; }
.gsy-row:hover .gsy-hint, .gsy-row:focus-within .gsy-hint { opacity: 1; }
.gsy-hint:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
@media (hover: none) { .gsy-hint { opacity: 1; } }
.gsy-head-actions { display: inline-flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.gsy-iconbtn { display: inline-flex; align-items: center; justify-content: center; min-width: 32px; height: 27px; padding: 0 7px; box-sizing: border-box; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; text-decoration: none; }
.gsy-iconbtn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.gsy-iconbtn:disabled { opacity: 0.4; cursor: default; background: transparent; }
.gsy-iconbtn svg { width: 14px; height: 14px; }
.gsy-iconbtn:focus-visible, .gsy-ai:focus-visible { outline: 2px solid var(--dsw-alias-interactive-bg-hover-accent); outline-offset: -1px; }
.gsy-commit-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 2px 8px 4px; }
.gsy-ai { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 28px; padding: 0; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; background: transparent; color: var(--dsw-alias-brand-primary); cursor: pointer; }
.gsy-ai:hover { background: var(--dsw-alias-interactive-bg-hover); }
.gsy-ai:disabled { opacity: 0.45; cursor: default; background: transparent; }
.gsy-check-row { display: inline-flex; align-items: center; gap: 6px; padding: 2px 4px; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; cursor: pointer; }
.gsy-check-row .gsy-check { width: 13px; height: 13px; }
.gsy-diffbox { display: flex; flex-direction: column; margin: 4px 0 0; border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 8px; overflow: hidden; background: var(--dsw-alias-bg-base); }
.gsy-diffhead { display: flex; align-items: center; gap: 6px; padding: 4px 8px; background: var(--dsw-alias-bg-layer-2); border-bottom: 0.5px solid var(--dsw-alias-border-l1); font-size: 11px; line-height: 16px; }
.gsy-diffpath { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.gsy-diffstat { flex: 0 0 auto; white-space: nowrap; font-variant-numeric: tabular-nums; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.gsy-stat-add { color: var(--dsw-alias-state-success-primary); }
.gsy-stat-del { color: var(--dsw-alias-state-error-primary); }
.gsy-seg { display: inline-flex; flex: 0 0 auto; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 5px; overflow: hidden; }
.gsy-seg button { border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font-size: 10px; line-height: 16px; padding: 0 6px; cursor: pointer; }
.gsy-seg button[aria-pressed='true'] { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.gsy-diffbody { overflow: auto; padding: 2px 0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; line-height: 16px; max-height: min(46vh, 420px); }
.gsy-diffbody.gsy-fill { max-height: none; }
.gsy-drow { display: flex; align-items: flex-start; min-height: 16px; }
.gsy-split .gsy-gutter { width: 2.4em; padding-right: 4px; font-size: 9px; }
.gsy-split .gsy-text { padding-right: 6px; }
.gsy-gutter { flex: 0 0 auto; width: 3em; padding-right: 6px; text-align: right; color: var(--dsw-alias-label-tertiary); font-size: 10px; line-height: 16px; user-select: none; font-variant-numeric: tabular-nums; }
.gsy-sign { flex: 0 0 auto; width: 1em; text-align: center; user-select: none; line-height: 16px; }
.gsy-text { flex: 1 1 auto; min-width: 0; padding-right: 8px; white-space: pre-wrap; word-break: break-word; }
.gsy-add { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 8%, transparent); }
.gsy-del { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent); }
.gsy-add .gsy-text, .gsy-add .gsy-sign { color: var(--dsw-alias-state-success-primary); }
.gsy-del .gsy-text, .gsy-del .gsy-sign { color: var(--dsw-alias-state-error-primary); }
.gsy-note .gsy-text { color: var(--dsw-alias-label-tertiary); font-style: italic; }
.gsy-hunk { padding: 2px 8px; color: var(--dsw-alias-label-tertiary); background: var(--dsw-alias-bg-layer-1); white-space: pre-wrap; word-break: break-all; }
.gsy-diffnote { padding: 6px 8px; color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 16px; }
.gsy-inline-add { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 26%, transparent); border-radius: 3px; }
.gsy-inline-del { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 26%, transparent); border-radius: 3px; }
.gsy-split { display: flex; width: 100%; }
.gsy-half { flex: 1 1 50%; min-width: 0; display: flex; }
.gsy-half + .gsy-half { border-left: 0.5px solid var(--dsw-alias-border-l1); }
.gsy-half.gsy-empty { background: var(--dsw-alias-bg-layer-1); opacity: 0.5; }
`

    /** Install the sheet once; a second panel must not duplicate it. */
    function ensureStyles() {
      if (typeof document === 'undefined' || document === null || document.head === undefined) return
      if (document.getElementById(STYLE_ID) !== null) return
      const element = document.createElement('style')
      element.id = STYLE_ID
      element.textContent = STYLES
      document.head.appendChild(element)
    }

    /** Two-letter codes that mean a conflict is waiting to be resolved. */
    const CONFLICT_CODES = ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']

    /** The letter a status code shows, and the tone its badge takes. */
    const STATUS_TONE = {
      M: 'modified',
      T: 'modified',
      A: 'added',
      D: 'deleted',
      R: 'renamed',
      C: 'copied',
      U: 'conflict',
    }

    /** Each tone's colour, drawn from the shared alias tokens. */
    const TONE_COLOR = {
      modified: 'var(--dsw-alias-state-warn-primary)',
      added: 'var(--dsw-alias-state-success-primary)',
      untracked: 'var(--dsw-alias-state-success-primary)',
      deleted: 'var(--dsw-alias-state-error-primary)',
      conflict: 'var(--dsw-alias-state-error-primary)',
      renamed: 'var(--dsw-alias-state-business-primary)',
      copied: 'var(--dsw-alias-state-business-primary)',
    }

    /**
     * What git's two letters mean for one row: a badge and a tone.
     *
     * `??` is untracked, and reads as an addition — it is a file the next commit
     * would add. A conflict is its own tone because "M" would understate it. A
     * clean pair (`  `) and an ignored one (`!!`) are not rows at all.
     *
     * @param code - the probe's two-letter code.
     * @returns `{ letter, tone, staged, untracked, conflicted }`, or null.
     */
    function statusOfCode(code) {
      const xy = typeof code === 'string' ? code : ''
      if (xy.length < 2) return { letter: 'M', tone: 'modified', staged: false, untracked: false, conflicted: false }
      if (xy === '??') return { letter: 'U', tone: 'untracked', staged: false, untracked: true, conflicted: false }
      if (xy === '!!' || xy === '  ') return null
      const conflicted = CONFLICT_CODES.includes(xy)
      const letter = [xy[0], xy[1]].find((value) => value !== ' ' && value !== '?') ?? 'M'
      return {
        letter,
        tone: conflicted ? 'conflict' : (STATUS_TONE[letter] ?? 'modified'),
        staged: xy[0] !== ' ' && xy[0] !== '?',
        untracked: false,
        conflicted,
      }
    }

    /** A path split into its segments, Windows separators normalized. */
    function changeSegments(path) {
      return String(path ?? '')
        .replace(/\\/g, '/')
        .split('/')
        .filter((segment) => segment !== '' && segment !== '.')
    }

    /**
     * Compare two names with a pinned collation, then by code point.
     *
     * `localeCompare(other)` alone follows the runtime's locale, so the same
     * list could order differently on two machines. Pinning `'en'` with base
     * sensitivity makes case and accent variants compare equal, and the code
     * point tiebreak then gives a total order that does not move between runs.
     */
    function compareChangeNames(left, right) {
      const collated = left.localeCompare(right, 'en', { sensitivity: 'base' })
      if (collated !== 0) return collated
      return left === right ? 0 : left < right ? -1 : 1
    }

    /** The number of changed files under a finished child list. */
    function countTreeFiles(nodes) {
      let count = 0
      for (const node of nodes) count += node.kind === 'dir' ? node.count : 1
      return count
    }

    /** Finish a draft's children: directories first, then its own files. */
    function finishChangeChildren(draft) {
      const nodes = []
      for (const child of draft.dirs.values()) nodes.push(finishChangeDir(child))
      nodes.push(...draft.files)
      nodes.sort((left, right) =>
        left.kind !== right.kind ? (left.kind === 'dir' ? -1 : 1) : compareChangeNames(left.name, right.name),
      )
      return nodes
    }

    /** Materialize one draft directory, compressing its single-child chain. */
    function finishChangeDir(draft) {
      let name = draft.name
      let current = draft
      // A directory with no file of its own and exactly one subdirectory is not
      // worth a row of its own: the chain reads as one label, `a/b/c`. The
      // compression stops where the path branches or a file sits at this level,
      // so a row always stands for a place where something actually changed.
      while (current.files.length === 0 && current.dirs.size === 1) {
        const only = [...current.dirs.values()][0]
        name = `${name}/${only.name}`
        current = only
      }
      const children = finishChangeChildren(current)
      return { kind: 'dir', name, path: current.path, children, count: countTreeFiles(children) }
    }

    /**
     * Fold a flat change list into the directory tree the panel draws.
     *
     * @param entries - `{ path, code, from? }` rows from the probe.
     * @returns the tree's roots, in render order.
     */
    function buildChangeTree(entries) {
      const root = { dirs: new Map(), files: [] }
      const seen = new Set()
      for (const entry of entries ?? []) {
        const status = statusOfCode(entry?.code)
        if (status === null || typeof entry?.path !== 'string') continue
        const segments = changeSegments(entry.path)
        if (segments.length === 0) continue
        const key = segments.join('/')
        if (seen.has(key)) continue
        seen.add(key)
        let at = root
        let prefix = ''
        for (let index = 0; index < segments.length - 1; index += 1) {
          prefix = prefix === '' ? segments[index] : `${prefix}/${segments[index]}`
          let next = at.dirs.get(segments[index])
          if (next === undefined) {
            next = { name: segments[index], path: prefix, dirs: new Map(), files: [] }
            at.dirs.set(segments[index], next)
          }
          at = next
        }
        at.files.push({
          kind: 'file',
          name: segments[segments.length - 1],
          // git's own spelling is kept for the path — every command that acts on
          // the row quotes this string — while only the tree rows split it.
          path: entry.path,
          code: entry.code,
          status,
          ...(typeof entry.from === 'string' && entry.from.length > 0 ? { from: entry.from } : {}),
        })
      }
      return finishChangeChildren(root)
    }

    /** The file paths under one node, depth first. */
    function treeFilePaths(node) {
      if (node.kind === 'file') return [node.path]
      const paths = []
      const walk = (nodes) => {
        for (const child of nodes) {
          if (child.kind === 'file') paths.push(child.path)
          else walk(child.children)
        }
      }
      walk(node.children)
      return paths
    }

    /** The rows to draw: a collapsed directory hides its subtree. */
    function flattenChangeTree(nodes, collapsed, depth = 0, out = []) {
      for (const node of nodes) {
        out.push({ node, depth })
        if (node.kind === 'dir' && collapsed.has(node.path) !== true) {
          flattenChangeTree(node.children, collapsed, depth + 1, out)
        }
      }
      return out
    }

    /** The disclosure chevron. */
    function ChevronIcon() {
      return React.createElement(
        'svg',
        { className: 'gsy-chevron', viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        React.createElement('path', { d: 'M6 3.5 10.5 8 6 12.5' }),
      )
    }

    /** The folder row's artwork. */
    function FolderIcon() {
      return React.createElement(
        'svg',
        { className: 'gsy-folder', viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round', 'aria-hidden': true },
        React.createElement('path', { d: 'M1.8 4.2h4l1.4 1.4h6.9v6.2H1.8z' }),
      )
    }

    /**
     * The workspace's changes, folded into a tree.
     *
     * The list keeps the contract the old flat list had — a ticked path is one
     * the next commit records — and adds the shape a big change has: a refactor
     * touching `src/client/changes/*` reads as one directory row instead of a
     * wall of near-identical paths. Clicking a file opens its patch; clicking a
     * directory's tick narrows the commit to that subtree.
     */
    function ChangesTree(props) {
      ensureStyles()
      const t = props.t
      const disabled = props.disabled === true
      const excluded = props.excluded ?? new Set()
      const collapsed = props.collapsed ?? new Set()
      const rows = flattenChangeTree(buildChangeTree(props.entries ?? []), collapsed)

      const openDiff = (path) => {
        if (disabled) return
        props.onOpenDiff?.(path)
      }

      const rowChildren = []

      for (const { node, depth } of rows) {
        const indent = { paddingLeft: 4 }
        // One guide per ancestor level, so a deep file still shows where it sits
        // even when the directory rows above it have scrolled out of view.
        const guides =
          depth === 0
            ? null
            : React.createElement('span', { className: 'gsy-guides', style: { width: depth * 18 } })
        if (node.kind === 'dir') {
          const open = collapsed.has(node.path) !== true
          const paths = treeFilePaths(node)
          const included = paths.filter((path) => !excluded.has(path)).length
          const all = paths.length > 0 && included === paths.length
          rowChildren.push(
            React.createElement(
              'div',
              { key: `dir-${node.path}`, className: 'gsy-row', style: indent },
              guides,
              React.createElement('input', {
                type: 'checkbox',
                className: 'gsy-check',
                checked: all,
                disabled,
                'aria-label': t('changes.includeDir', { path: node.path }),
                ref: (element) => {
                  if (element !== null) element.indeterminate = included > 0 && !all
                },
                onChange: () => props.onTogglePaths?.(paths, !all),
              }),
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'gsy-main',
                  'aria-expanded': open,
                  title: open ? t('changes.collapse', { path: node.path }) : t('changes.expand', { path: node.path }),
                  onClick: () => props.onToggleDir?.(node.path),
                },
                React.createElement('span', { 'data-open': open ? 'true' : 'false' }, React.createElement(ChevronIcon)),
                React.createElement(FolderIcon),
                React.createElement('span', { className: 'gsy-dirname' }, node.name),
                React.createElement('span', { className: 'gsy-count' }, String(node.count)),
              ),
            ),
          )
          continue
        }

        const status = node.status
        const selectable = !node.path.includes('"')
        const included = !excluded.has(node.path)
        rowChildren.push(
          React.createElement(
            'div',
            {
              key: `file-${node.path}`,
              className: 'gsy-row',
              style: indent,
              // A hover is the moment the click is decided; reading the patch
              // here is what makes the click itself instant.
              onMouseEnter: () => props.onPrefetchDiff?.(node.path),
            },
            guides,
            React.createElement('input', {
              type: 'checkbox',
              className: 'gsy-check',
              checked: included,
              disabled: disabled || !selectable,
              title: selectable ? undefined : t('changes.unrepresentable'),
              'aria-label': t('changes.include', { path: node.path }),
              onChange: () => props.onTogglePath?.(node.path),
            }),
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'gsy-main',
                title: `${node.path} — ${changeWords(node.code, t)}`,
                onClick: () => openDiff(node.path),
              },
              React.createElement('span', { className: 'gsy-badge', style: { color: TONE_COLOR[status.tone] } }, status.letter),
              React.createElement('span', { className: 'gsy-name' }, node.name),
              node.from === undefined ? null : React.createElement('span', { className: 'gsy-from' }, `← ${node.from}`),
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'gsy-hint',
                disabled,
                title: t('changes.diffLabel', { path: node.path }),
                onClick: () => openDiff(node.path),
              },
              t('changes.diff'),
            ),
          ),
        )
      }

      return React.createElement('div', { className: 'gsy-tree' }, ...rowChildren)
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
      // A tracked upstream that the remote deleted is not "in sync": the counts
      // simply stopped being reported, which is why it is stated separately. It
      // is how a default branch renamed on the remote shows up in an old clone.
      const upstreamGone = probe.upstreamGone === true
      const marks = []
      marks.push(dirty ? t('state.dirty') : t('state.clean'))
      if (ahead > 0) marks.push(t('state.ahead', { count: ahead }))
      if (behind > 0) marks.push(t('state.behind', { count: behind }))
      if (upstreamGone) marks.push(t('state.upstreamGone'))
      const where = targetLabel(probe, t)
      if (where !== null) marks.push(where)

      // Out of sync with the remote is the thing worth seeing without opening
      // the menu, so the counts ride the label itself. Both ends are shown at
      // once for a diverged branch, because that is the state that needs a
      // decision rather than a single action.
      const arrow = `${ahead > 0 ? ` ↑${ahead}` : ''}${behind > 0 ? ` ↓${behind}` : ''}`
      const tone = dirty || upstreamGone || behind > 0
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
      // The message suggestion is the button's read, not a transcript event: the
      // answer lands in the message box, and a row above the composer would only
      // repeat it as JSON.
      if (/^\s*message\b/.test(args)) return null
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
      // Which directory rows are folded shut. Kept apart from the probe so a
      // refresh — the file list being re-read while it is browsed — never
      // reopens a subtree the reader closed on purpose.
      const [collapsedDirs, setCollapsedDirs] = React.useState(() => new Set())
      const [branchName, setBranchName] = React.useState('')
      // Whether the branch row is asking for a new name rather than listing.
      const [branchCreating, setBranchCreating] = React.useState(false)
      // The message the next commit records. It is typed or generated; the commit
      // controls appear only once there is something to say.
      const [message, setMessage] = React.useState('')
      const [generating, setGenerating] = React.useState(false)
      const [presetMarkers, setPresetMarkers] = React.useState(() => new Set())
      const [otherMarkers, setOtherMarkers] = React.useState('')

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
        // A command may change the tree, so a patch read before it is no longer
        // what the row would show. A probe is a read, and keeps them.
        if (options?.probe !== true) diffCache.clear()
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
       * @param options.fetch - ask the Host to fetch first; only the explicit
       *   Refresh uses it, because it is the one probe that calls the network.
       * @param options.background - a probe nobody asked for: no state line.
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
        // `--fetch` only on an explicit refresh: the pane's Refresh button is a
        // person asking what the remote holds now, which is also the one way a
        // default branch renamed in the last minute reaches this clone. The
        // scheduled and mount probes stay local, because they are not questions
        // about the remote.
        const probeLine = `/github status --json${scope}${slim ? ' --slim' : ''}${options?.fetch === true ? ' --fetch' : ''}`
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
              // The branch context is full-answer data too: a slim badge check
              // knows nothing about a gone upstream or a remote-only branch, and
              // overwriting those with "absent" is what would make the rename
              // note disappear the next time a session is mounted.
              ...(previous.remoteDefault === undefined ? {} : { remoteDefault: previous.remoteDefault }),
              ...(previous.remoteBranches === undefined ? {} : { remoteBranches: previous.remoteBranches }),
              ...(previous.remoteBranchesTruncated === undefined ? {} : { remoteBranchesTruncated: previous.remoteBranchesTruncated }),
              ...(previous.upstreamGone === undefined ? {} : { upstreamGone: previous.upstreamGone }),
              ...(previous.upstream === undefined ? {} : { upstream: previous.upstream }),
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
      }, [open, surface])

      // The diff the menu handed over, if this pane was opened for one. The
      // request is cleared before the patch is read, so a re-render — or the pane
      // being remounted — cannot issue the same diff twice. The Host route is
      // asked first: a click is a read, and only a deployment without the route
      // waits for the command bridge.
      React.useEffect(() => {
        if (surface !== 'pane' || sessionId === undefined) return undefined
        const path = pendingDiff.get(sessionId)
        if (path === undefined) return undefined
        pendingDiff.delete(sessionId)
        let cancelled = false
        const show = async () => {
          try {
            const text = await loadDiff(path)
            if (cancelled) return
            if (text !== undefined) {
              setFailed(false)
              setOutput(text)
              return
            }
            await run(`/github diff --file "${path}"${dirSuffix(sessionId)}`)
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
          // Escape backs out of the new-branch field before it closes the menu.
          if (branchCreating) {
            setBranchCreating(false)
            setBranchName('')
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
      }, [open, branchCreating])

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

      /** Tick or untick every path under one directory row. */
      const togglePaths = (paths, include) => {
        setExcluded((current) => {
          const next = new Set(current)
          for (const path of paths) {
            if (include) next.delete(path)
            else next.add(path)
          }
          return next
        })
      }

      /** Fold or unfold one directory row. */
      const toggleDir = (path) => {
        setCollapsedDirs((current) => {
          const next = new Set(current)
          if (next.has(path)) next.delete(path)
          else next.add(path)
          return next
        })
      }

      /**
       * One path's patch, read the fast way when the Host offers it.
       *
       * @returns the patch text, or undefined when the route is unavailable and
       *   the caller should fall back to the command bridge.
       */
      const loadDiff = async (path) => {
        const warm = cachedDiff(sessionId, path)
        if (warm !== undefined) return warm
        const direct = await requestHostDiff({
          sessionId,
          path,
          dir: targetChoice.get(sessionId) ?? null,
        })
        if (direct !== undefined) rememberDiff(sessionId, path, direct)
        return direct
      }

      /**
       * Show one path's patch, at the highest capability the deployment has.
       *
       * A patch is a document: it is compared against another patch, kept open
       * while the change list is read, and closed when it is done with. So it
       * gets a tab of its own, and the change list stays where it was. Without
       * the dock's tab registry the patch renders in the panel — over the Host
       * route when there is one, so a click never waits for a session command —
       * and a deployment with neither still has the command bridge.
       */
      const openDiffFor = (path) => {
        if (openDiffTab !== null && sessionId !== undefined) {
          openDiffTab(sessionId, path)
          return
        }
        if (openSidebar !== null) {
          // The pane may not have been up yet; hand it the path and let its own
          // effect read the patch, so the click is one request either way.
          pendingDiff.set(sessionId, path)
          openSidebar()
          return
        }
        void loadDiff(path).then((text) => {
          if (text !== undefined) {
            setFailed(false)
            setOutput(text)
            return
          }
          void run(`/github diff --file "${path}"${dirSuffix(sessionId)}`).then(() => refresh())
        })
      }

      // What the next commit records besides the paths: the message written in
      // the box, and the CI markers. A double quote becomes a single one because
      // the message travels on the `/github` line, which is parsed by quoting; a
      // generated subject is one line, because the box is one line.
      const markers = [...presetMarkers, ...otherMarkers.split(',')]
        .map((marker) => marker.trim())
        .filter((marker) => marker.length > 0)
      const messageText = message.replace(/"/g, "'").trim()
      // The command line is one line: a body's newlines travel as `\n` and are
      // restored by the parser, so a generated paragraph reaches git intact.
      const messageArgument = messageText.replace(/\n/g, '\\n')
      const commitSuffix = `${messageText.length === 0 ? '' : ` --message "${messageArgument}"`}${markers
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

      /** The markers a chip row and a free-text field together name. */
      const markerListOf = (presets, others) =>
        [...presets, ...String(others ?? '').split(',')]
          .map((marker) => marker.trim())
          .filter((marker) => marker.length > 0)

      /** How a marker list reads on the subject line: `[skip ci] [release]`. */
      const markerText = (list) => list.map((marker) => `[${marker}]`).join(' ')

      /**
       * The message with `list` appended after its title line.
       *
       * The markers live where they are recorded — after the subject, before the
       * body — so the box shows exactly the message the commit will carry. A
       * message with a body keeps that body below, untouched.
       */
      const withMarkers = (text, list) => {
        const suffix = markerText(list)
        if (suffix.length === 0) return text
        const breakAt = text.indexOf('\n')
        const title = breakAt === -1 ? text : text.slice(0, breakAt)
        const rest = breakAt === -1 ? '' : text.slice(breakAt)
        return `${title.replace(/\s+$/, '')} ${suffix}${rest}`
      }

      /** The same message with an earlier marker suffix taken back off. */
      const withoutMarkers = (text, list) => {
        const suffix = markerText(list)
        if (suffix.length === 0) return text
        const breakAt = text.indexOf('\n')
        const title = breakAt === -1 ? text : text.slice(0, breakAt)
        const rest = breakAt === -1 ? '' : text.slice(breakAt)
        const tail = ` ${suffix}`
        return title.endsWith(tail) ? `${title.slice(0, -tail.length)}${rest}` : text
      }

      /**
       * Swap the markers a message carries for the newly chosen set.
       *
       * Ticking a chip edits the message itself, so what the box shows is what the
       * commit records — there is no second, invisible list to reconcile at the
       * click. The custom field is the same rule, applied on every keystroke.
       */
      const changeMarkers = (nextPresets, nextOthers) => {
        const previous = markerListOf(presetMarkers, otherMarkers)
        const next = markerListOf(nextPresets, nextOthers)
        setPresetMarkers(nextPresets)
        setOtherMarkers(nextOthers)
        setMessage((current) => withMarkers(withoutMarkers(current, previous), next))
      }

      /** Tick or untick one preset marker. */
      const toggleMarker = (marker) => {
        const next = new Set(presetMarkers)
        if (next.has(marker)) next.delete(marker)
        else next.add(marker)
        changeMarkers(next, otherMarkers)
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

      /**
       * Ask the Host for a message and put it in the box.
       *
       * The Host route is tried first: it answers from the same engine without a
       * session command, so the click is not serialized with the conversation's
       * work and leaves no row behind. A deployment without the route falls back
       * to `/github message`, which answers the same `{ subject, body? }`.
       */
      const generateMessage = async () => {
        if (disabled || generating) return
        setGenerating(true)
        try {
          const dir = targetChoice.get(sessionId) ?? null
          const files = selected.map((entry) => entry[0])
          let suggestion = await requestHostMessage({ sessionId, dir, files })
          if (suggestion === undefined) {
            const result = await run(`/github message${dirSuffix(sessionId)}${fileSuffix}`, { quiet: true })
            const answer = typeof result?.text === 'string' ? result.text.trim() : ''
            try {
              suggestion = answer.length === 0 ? undefined : JSON.parse(answer)
            } catch {
              suggestion = undefined
            }
            if (suggestion === undefined) {
              setFailed(true)
              setOutput(result?.failure ?? t('commit.aiEmpty'))
              return
            }
          }
          const subject = typeof suggestion?.subject === 'string' ? suggestion.subject.trim() : ''
          if (subject.length === 0) {
            setFailed(true)
            setOutput(t('commit.aiEmpty'))
            return
          }
          const body = typeof suggestion?.body === 'string' ? suggestion.body.trim() : ''
          const filled = body.length === 0 ? subject : `${subject}\n\n${body}`
          // Whatever is ticked stays on the title of the new message.
          setMessage(withMarkers(filled, markerListOf(presetMarkers, otherMarkers)))
          setFailed(false)
        } finally {
          setGenerating(false)
        }
      }

      const aiButton = React.createElement(
        'button',
        {
          key: 'commit-ai',
          type: 'button',
          className: 'gsy-ai',
          disabled: disabled || generating,
          title: generating ? t('commit.aiBusy') : t('commit.ai'),
          'aria-label': generating ? t('commit.aiBusy') : t('commit.ai'),
          onClick: () => void generateMessage(),
        },
        React.createElement(
          'svg',
          { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
          React.createElement('path', { d: 'M8 1.6l1.5 4.2 4.2 1.5-4.2 1.5L8 13l-1.5-4.2L2.3 7.3l4.2-1.5z' }),
          React.createElement('path', { d: 'M13 11.2l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6z' }),
        ),
      )

      // The message box appears only where a commit can be made, and the commit
      // controls appear only once it holds something to say.
      const commitBox = [
        React.createElement(
          'div',
          { key: 'commit-box', style: S.commitField },
          React.createElement('textarea', {
            key: 'commit-message',
            style: S.commitInput,
            value: message,
            rows: 2,
            spellCheck: false,
            placeholder: t('commit.placeholder'),
            'aria-label': t('commit.placeholder'),
            disabled,
            onChange: (event) => {
              const value = event.target.value
              setMessage(value)
              // No message, no markers: the chips describe a title that is not
              // there, so they go away with it.
              if (value.trim().length === 0) {
                setPresetMarkers(new Set())
                setOtherMarkers('')
              }
            },
          }),
          aiButton,
        ),
      ]

      // The markers a pipeline reads. They stay beside the message that carries
      // them, and the panel states what will be appended before the click.
      const markerControls = [
        React.createElement('div', { key: 'commit-markers-label', style: S.hint }, t('commit.markers')),
        React.createElement(
          'div',
          { key: 'commit-markers', style: S.chips },
          ...markerChips(['skip ci', 'release', 'Pre-release', 'test']),
          React.createElement('input', {
            key: 'other-markers',
            style: S.markerInput,
            value: otherMarkers,
            spellCheck: false,
            // The rule lives where the field is: a marker is appended to the
            // subject line, and the input says so instead of a line under it.
            placeholder: t('commit.markerHint'),
            'aria-label': t('commit.otherMarkers'),
            disabled,
            onChange: (event) => changeMarkers(presetMarkers, event.target.value),
          }),
        ),
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
                    // Clear takes the markers back out of the message too — the
                    // box is the record, so it must not keep what was cleared.
                    changeMarkers(new Set(), '')
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
              React.createElement(ChangesTree, {
                key: 'changes-tree',
                entries: named.map((entry) => ({ path: entry[0], code: entry[1], from: entry[2] })),
                t,
                disabled,
                excluded,
                collapsed: collapsedDirs,
                onTogglePath: togglePath,
                onTogglePaths: togglePaths,
                onToggleDir: toggleDir,
                onOpenDiff: openDiffFor,
                onPrefetchDiff: (path) => {
                  void prefetchDiff(sessionId, path)
                },
              }),
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
      // A branch that exists only on the remote is switchable, and invisible
      // otherwise. That is exactly the shape a default branch renamed on GitHub
      // leaves behind: the clone still has the old name locally, and the new one
      // exists only as a remote-tracking branch until someone switches to it.
      const remoteList = Array.isArray(probe?.remoteBranches)
        ? probe.remoteBranches.filter((entry) => typeof entry?.name === 'string' && entry.name.length > 0)
        : []
      const remoteDefault =
        typeof probe?.remoteDefault === 'string' && probe.remoteDefault.length > 0 ? probe.remoteDefault : null
      const upstreamGone = probe?.upstreamGone === true
      const upstreamName =
        typeof probe?.upstream === 'string' && probe.upstream.length > 0 ? probe.upstream : null
      // A local branch whose upstream was deleted reads as "no drift" unless it is
      // said out loud. Naming both ends is what makes a renamed default branch
      // visible before anyone pushes and recreates the old name.
      const goneNote =
        upstreamGone && upstreamName !== null
          ? React.createElement(
              'div',
              { key: 'branches-gone', style: S.hint },
              remoteDefault === null
                ? t('branches.upstreamGone', { upstream: upstreamName })
                : t('branches.upstreamGoneDefault', { upstream: upstreamName, name: remoteDefault }),
            )
          : null

      /** Create the branch named in the field and switch to it. */
      const createBranch = () => {
        const name = branchName.trim()
        if (name.length === 0) return
        void run(`/github switch --create "${name}"${dirSuffix(sessionId)}`).then(() => {
          setBranchName('')
          setBranchCreating(false)
          void refresh()
        })
      }

      const NEW_BRANCH = '__new_branch__'
      const currentBranchName = branchList.find((entry) => entry.current === true)?.name ?? null

      // The branch row: one select for switching, and a control that turns the
      // row into a name field. A list of radio buttons was what the panel used to
      // draw; a select is the shape a control that changes the whole panel below
      // it should have, and it stays one line wide in a narrow column.
      const branchSelector =
        branchList.length === 0 && remoteList.length === 0
          ? null
          : [
              React.createElement(
                'div',
                { key: 'branch-row', style: S.branchRow },
                React.createElement('span', { key: 'branch-label', style: S.branchLabel }, t('branches.title')),
                React.createElement(
                  'select',
                  {
                    key: 'branch-select',
                    style: S.select,
                    value: branchCreating ? NEW_BRANCH : (currentBranchName ?? ''),
                    disabled: disabled || branchList.length === 0,
                    'aria-label': t('branches.title'),
                    onChange: (event) => {
                      const value = event.target.value
                      if (value === NEW_BRANCH) {
                        setBranchCreating(true)
                        return
                      }
                      setBranchCreating(false)
                      if (value.length === 0) return
                      void run(`/github switch "${value}"${dirSuffix(sessionId)}`).then(() => refresh())
                    },
                  },
                  ...branchList.map((entry) =>
                    React.createElement(
                      'option',
                      { key: `branch-${entry.name}`, value: entry.name },
                      `${entry.name}${entry.ahead > 0 ? ` ↑${entry.ahead}` : ''}${
                        entry.behind > 0 ? ` ↓${entry.behind}` : ''
                      }${entry.gone === true ? ` ${t('branches.gone')}` : ''}`,
                    ),
                  ),
                  // A branch only the remote has is still switchable: choosing it
                  // creates the local branch that tracks it, which is what follows
                  // a rename on the remote.
                  ...remoteList.map((entry) =>
                    React.createElement(
                      'option',
                      { key: `branch-remote-${entry.name}`, value: entry.name },
                      `${entry.name}${entry.default === true ? ` · ${t('branches.default')}` : ''}`,
                    ),
                  ),
                  React.createElement('option', { key: NEW_BRANCH, value: NEW_BRANCH }, t('branches.newOption')),
                ),
                React.createElement(
                  'button',
                  {
                    key: 'branch-create-toggle',
                    type: 'button',
                    className: 'gsy-iconbtn',
                    disabled,
                    title: t('branches.create'),
                    'aria-label': t('branches.create'),
                    onClick: () => {
                      setBranchCreating((current) => !current)
                      setBranchName('')
                    },
                  },
                  React.createElement(
                    'svg',
                    { viewBox: '0 0 16 16', width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', 'aria-hidden': true },
                    React.createElement('path', { d: 'M8 3.5v9M3.5 8h9' }),
                  ),
                ),
              ),
              ...(goneNote === null ? [] : [goneNote]),
              ...(branchCreating
                ? [
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
                  ]
                : []),
              ...(probe?.branchesTruncated === true
                ? [React.createElement('div', { key: 'branches-more', style: S.hint }, t('branches.truncated', { shown: branchList.length }))]
                : []),
              ...(probe?.remoteBranchesTruncated === true
                ? [React.createElement('div', { key: 'branches-remote-more', style: S.hint }, t('branches.remoteTruncated', { shown: remoteList.length }))]
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
              disabled: disabled || url.trim().length === 0,
              style: style(S.action, disabled || url.trim().length === 0 ? S.itemDisabled : undefined),
              onClick: () => submitUrl(command),
            },
            label,
          ),
        )

      // A commit needs something to say. The message is typed or generated, and
      // the controls that record it appear only once it holds a line — so a click
      // on "commit" is never a click that first has to decide what to write.
      const commitReady = messageText.length > 0 && !nothingSelected

      /** Record the selected paths, and publish them when there is a remote. */
      const commitNow = () => {
        if (!commitReady || disabled) return
        // A recorded selection belongs to the commit that used it: the next change
        // to the same path starts included again.
        setExcluded(new Set())
        // Without a remote there is nothing to publish to, so the same click
        // records a local commit instead of failing on a push.
        const action = remoteMissing ? 'commit' : 'sync'
        const suffix = `${dirSuffix(sessionId)}${fileSuffix}${commitSuffix}${remoteMissing ? '' : integrateSuffix}`
        void run(`/github ${action}${suffix}`).then((result) => {
          // The message belongs to the commit that just happened; keeping it would
          // hand the next commit a title written for the previous one. A failed
          // run keeps it, so the click can be retried unchanged.
          if (result?.failure == null) {
            setMessage('')
            setPresetMarkers(new Set())
            setOtherMarkers('')
          }
          void refresh()
        })
      }

      // The checkbox for what Commit & push does with a moved upstream. It sits
      // beside the commit button, and appears with it: the choice only exists
      // once there is a commit to make.
      const integrateToggle =
        remoteMissing
          ? null
          : React.createElement(
              'label',
              { key: 'integrate', className: 'gsy-check-row', title: t('integrate.hint') },
              React.createElement('input', {
                type: 'checkbox',
                className: 'gsy-check',
                checked: integrateOn === true,
                disabled,
                'aria-label': t('action.integrate'),
                onChange: () => toggleIntegrate(),
              }),
              React.createElement('span', null, t('action.integrate')),
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

      // A jump out of the panel to the project's page, as the title bar's own
      // control. It stays an anchor rather than a button: `target="_blank"` is
      // what carries the click to the browser, and the desktop shell turns exactly
      // that into its own external open.
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
                className: 'gsy-iconbtn',
                title: webUrl,
                'aria-label': t('action.openWeb'),
                onClick: () => {
                  // After the click's own default action, so removing the menu
                  // cannot be what cancels the navigation it just started.
                  if (surface === 'menu') setTimeout(() => setOpen(false), 0)
                },
              },
              React.createElement(
                'svg',
                { viewBox: '0 0 16 16', width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
                React.createElement('path', { d: 'M6 3.5h6.5V10' }),
                React.createElement('path', { d: 'M12.5 3.5 6.8 9.2' }),
                React.createElement('path', { d: 'M11 9.6v2.9H3.5V5h2.9' }),
              ),
            )

      // The title bar's actions: pull, the project page, and a refresh — in that
      // order, with refresh last, because it is the control reached for after
      // reading what the others reported.
      const pullButton = isRepo
        ? React.createElement(
            'button',
            {
              key: 'header-pull',
              type: 'button',
              className: 'gsy-iconbtn',
              disabled: disabled || remoteMissing,
              title: t('action.pull'),
              'aria-label': t('action.pull'),
              onClick: () => {
                void run(`/github pull${dirSuffix(sessionId)}`).then(() => refresh())
              },
            },
            React.createElement(
              'svg',
              { viewBox: '0 0 16 16', width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
              React.createElement('path', { d: 'M8 2.5v7.2' }),
              React.createElement('path', { d: 'M5 7l3 3 3-3' }),
              React.createElement('path', { d: 'M3 12.5h10' }),
            ),
          )
        : null

      const refreshButton = React.createElement(
        'button',
        {
          key: 'header-refresh',
          type: 'button',
          className: 'gsy-iconbtn',
          disabled,
          title: t('action.refresh'),
          'aria-label': t('action.refresh'),
          onClick: () => {
            probeFresh.delete(sessionId)
            void refresh(sessionId, true, { fetch: true })
          },
        },
        React.createElement(
          'svg',
          { viewBox: '0 0 16 16', width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
          React.createElement('path', { d: 'M13 8a5 5 0 1 1-1.6-3.7' }),
          React.createElement('path', { d: 'M13 2.8v2.9H10' }),
        ),
      )

      const headActions = React.createElement(
        'span',
        { key: 'head-actions', className: 'gsy-head-actions' },
        pullButton,
        openWebItem,
        refreshButton,
      )

      // The commit controls: the checkbox for how a moved upstream is handled, and
      // the button that records and publishes what the box says. Both appear only
      // once the box holds a message — the same rule the button follows, so the
      // panel never offers a decision that cannot be carried out. The checkbox
      // comes first: it modifies the click beside it, and is read before it.
      const commitActions = commitReady
        ? [
            React.createElement(
              'div',
              { key: 'commit-actions', className: 'gsy-commit-actions' },
              integrateToggle,
              React.createElement(
                'button',
                {
                  type: 'button',
                  disabled,
                  style: style(S.chipConfirm, disabled ? { opacity: 0.4, cursor: 'default' } : undefined),
                  onClick: commitNow,
                },
                narrowing
                  ? `${t(remoteMissing ? 'action.commit' : 'action.sync')} · ${selected.length}`
                  : t(remoteMissing ? 'action.commit' : 'action.sync'),
              ),
            ),
          ]
        : []

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
            { key: 'head-state', style: S.headState },
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
          // Pull, the project page, and a refresh — the three reads that do not
          // depend on the change list, so they live in the title bar.
          probeError === null ? headActions : null,
        ),
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
        // The branch the panel below describes. It comes before the list because
        // it is what the list is a reading of, and it is one select rather than a
        // stack of rows.
        probeError === null && isRepo ? branchSelector : null,
        // The message box, its markers, and the controls that appear once the box
        // holds something to say. Offered only where a commit can be made.
        probeError === null && isRepo && named.length > 0 ? commitBox : null,
        // The markers describe a title: without one there is nothing to append to,
        // so the chips and their field appear only once the box holds a message.
        probeError === null && isRepo && named.length > 0 && messageText.length > 0 ? markerControls : null,
        probeError === null && isRepo && named.length > 0 ? commitActions : null,
        probeError === null && isRepo && commitReady ? integrateBehind : null,
        // The change list last: what is about to be committed, and the only thing
        // under the controls that act on it.
        probeError === null && isRepo ? changesPanel : null,
        probeError === null && isRepo ? hiddenNote : null,
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
