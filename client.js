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
     * `id` is the implementation's identity in the tab system — it is unique
     * across every registration, and it is also the key the pane body and its chip
     * title are registered under. `kind` is the page type the navigation
     * controller opens. The package name is the natural `id`.
     */
    const SIDEBAR_ID = 'dsh-github-sync'
    const SIDEBAR_KIND = 'github-sync'

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
      'action.clone': 'Clone',
      'action.init': 'Create an empty repository here',
      'action.setup': 'Connect & push',
      'action.retry': 'Check again',
      'action.refresh': 'Refresh',
      'sidebar.open': 'Open in the sidebar',
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
      'commit.markerHint': 'Recorded as a bracketed line at the end of the message, so the subject stays readable.',
      'commit.otherMarkers': 'Others',
      'commit.otherPlaceholder': 'comma separated, e.g. hotfix, deploy',
      'commit.needCustom': 'A custom message is selected but empty; type one or switch back to the generated message.',
      'commit.step': '{action} · {count} path(s) will be recorded',
      'commit.confirm': 'Record it',
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
      'action.clone': '克隆',
      'action.init': '在此新建仓库',
      'action.setup': '连接并推送',
      'action.retry': '重新检查',
      'action.refresh': '刷新',
      'sidebar.open': '在侧栏打开',
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
      'commit.markerHint': '会作为带方括号的一行附在消息末尾，标题保持简短可读。',
      'commit.otherMarkers': '其它',
      'commit.otherPlaceholder': '逗号分隔，例如 hotfix, deploy',
      'commit.needCustom': '已选择自定义信息但内容为空；请填写，或切回 AI 生成。',
      'commit.step': '{action} · 将记录 {count} 个路径',
      'commit.confirm': '确认记录',
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
     */
    const probeInFlight = new Set()

    /** How long a full answer may be reused by a reopen, in milliseconds. */
    const OPEN_REUSE_MS = 1200

    /** How long a badge answer stays fresh enough to skip a focus refresh. */
    const FOCUS_REFRESH_MS = 20000

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
    const BUILD = 'r27'

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
      chips: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, padding: '2px 8px' },
      chip: {
        flex: '0 0 auto',
        padding: '3px 8px',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        borderRadius: 999,
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 11,
        lineHeight: '16px',
        cursor: 'pointer',
      },
      chipOn: {
        borderColor: 'var(--dsw-alias-brand-primary)',
        color: 'var(--dsw-alias-brand-primary)',
        fontWeight: 600,
      },
      /** The one chip that carries the step through: the commit itself. */
      chipPrimary: {
        borderColor: 'var(--dsw-alias-brand-primary)',
        color: 'var(--dsw-alias-brand-primary)',
        background: 'transparent',
        fontWeight: 600,
      },
      chipDisabled: { color: 'var(--dsw-alias-state-idle-primary)', cursor: 'default' },
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
    }

    /** Merge the base control style with a conditional override. */
    const style = (base, extra) => (extra === undefined ? base : { ...base, ...extra })

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

      /**
       * Run one `/github` line through the addressed session and record it.
       *
       * @param command - the complete slash-command line.
       * @param options - `quiet` suppresses the visible output panel; `signal`
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
        setBusy(command)
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
          setBusy(null)
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
        if (probeInFlight.has(address)) return
        probeInFlight.add(address)
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
        const outcome = await run(probeLine, { quiet: true, probe: true, signal }, address)
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
          probeCache.set(address, parsed)
          probeShape.set(address, slim ? 'slim' : 'full')
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
      // signal for that, and it is the only background refresh this control makes:
      // a timer would spend a logged command row every time it fired whether or
      // not anything had changed, and the answer's whole purpose is to be read
      // when someone is looking. The refresh is quiet — a failure here must not
      // replace the menu with an error the person did not ask for.
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

      // Dismiss the menu on the interactions that mean "I am done here": Escape,
      // a press anywhere outside the control, focus moving out of it, or the
      // window losing focus. A popup that survives a click elsewhere covers the
      // thing the person just clicked, which is why this is not optional.
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
        const onWindowBlur = () => setOpen(false)
        // Capture, because a press handled by something below must still dismiss
        // this first: the menu is drawn over whatever it covers.
        document.addEventListener('keydown', onKey)
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('mousedown', onPointerDown, true)
        document.addEventListener('focusin', onFocusIn)
        window.addEventListener('blur', onWindowBlur)
        return () => {
          document.removeEventListener('keydown', onKey)
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('mousedown', onPointerDown, true)
          document.removeEventListener('focusin', onFocusIn)
          window.removeEventListener('blur', onWindowBlur)
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
      // A repository created with `init` has no remote, and offering it "push"
      // is a dead end: the action can only fail. The check reports the remote as
      // `null` when there is none and as a URL when there is one, so only a
      // *known* absence narrows the menu — an unanswered check keeps every
      // action, which is what makes a hanging probe degrade instead of block.
      const remoteMissing = isRepo && probe?.remote === null
      const info = describe(probe, t)

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
        presets.map((marker) =>
          React.createElement(
            'button',
            {
              key: `marker-${marker}`,
              type: 'button',
              role: 'menuitemcheckbox',
              'aria-checked': presetMarkers.has(marker),
              disabled,
              style: style(S.chip, presetMarkers.has(marker) ? S.chipOn : undefined),
              onClick: () => toggleMarker(marker),
            },
            `[${marker}]`,
          ),
        )

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
                    style: style(S.chip, disabled || needCustom ? S.chipDisabled : S.chipPrimary),
                    onClick: () => {
                      const action = pendingAction
                      setPendingAction(null)
                      // A recorded selection belongs to the commit that used it: the
                      // next change to the same path starts included again.
                      setExcluded(new Set())
                      void run(`/github ${action}${dirSuffix(sessionId)}${fileSuffix}${commitSuffix}`).then(() =>
                        refresh(),
                      )
                    },
                  },
                  t('commit.confirm'),
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
        output === null
          ? null
          : React.createElement('pre', { key: 'output', style: style(S.output, failed ? S.outputError : undefined) }, output),
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
      inject: ['slots', 'remote', 'remote.commands', 'locale'],
      apply(ctx) {
        // Both dictionaries are registered under one namespace; the Client's
        // active locale selects between them, and English is the fallback for
        // any locale this plugin does not translate.
        ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, { en: EN, zh: ZH }))
        // The dock's services are looked up through `ctx.get`, never read as
        // properties. Cordis answers a read of an undeclared service with a throw
        // (`cannot get property "sidebarRight" without inject`), and a plugin that
        // throws while activating takes its whole fiber down — which is how an
        // optional extra can stop the client from booting. `ctx.get` returns
        // `undefined` instead: a deployment without the right sidebar simply has no
        // tab to add, and the menu is unaffected either way.
        const sidebar = ctx.get('sidebarRight')
        const sidebarTabs = ctx.get('sidebarRightTabs')
        // The tab is registered before the menu is: the menu offers the way in only
        // once the tab exists, because opening a kind nobody registered is an error
        // on the dock's side, and an item that can only fail is worse than no item.
        //
        // The guard is inside each effect rather than around them: an effect body is
        // the unit the runtime may run later, and a throw from there must not reach
        // the plugin's activation either way. `console.warn` is used rather than
        // `ctx.logger`, which is another service this plugin does not declare.
        const guarded = (what, fn) => {
          try {
            return fn()
          } catch (error) {
            console.warn(`github-sync: ${what} failed: ${error instanceof Error ? error.message : String(error)}`)
            return undefined
          }
        }
        let sidebarReady = false
        if (sidebar !== undefined && sidebarTabs !== undefined) {
          // The right sidebar, extended the way the Files and Terminal features
          // extend it: a tab type, then the body and the chip title registered
          // under the same id. `extension` is the slot a plugin owns; a `kind`
          // carries at most one of those beside the builtin one.
          ctx.effect(() =>
            guarded('registering the sidebar tab', () => {
              const dispose = sidebarTabs.register({
                id: SIDEBAR_ID,
                kind: SIDEBAR_KIND,
                priority: 'extension',
                title: () => ctx.locale.bind(LOCALE_NAMESPACE)('sidebar.title'),
              })
              sidebarReady = true
              return dispose
            }),
          )
          ctx.effect(() =>
            guarded('registering the sidebar pane', () =>
              ctx.slots.inject('sidebar.right.pane.tab', () =>
                ctx.slots.register(
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
          ctx.effect(() =>
            guarded('registering the sidebar chip', () =>
              ctx.slots.inject('sidebar.right.pane.tab.title', () =>
                ctx.slots.register(
                  { name: 'sidebar.right.pane.tab.title', key: SIDEBAR_ID, locale: LOCALE_NAMESPACE },
                  (props) => React.createElement('span', null, props?.t?.('sidebar.title') ?? 'GitHub'),
                ),
              ),
            ),
          )
        }
        const openSidebar = () => sidebar.openTab(SIDEBAR_KIND)
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
              inject: () => ({ remote: ctx.remote, surface: 'menu', ...(sidebarReady ? { openSidebar } : {}) }),
            },
            GithubSyncButton,
          ),
        )
      },
    }
  },
})
