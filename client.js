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
     * Whether a workspace may be checked as soon as a session appears.
     *
     * This is a deployment-wide Host setting the Client cannot read, so it
     * arrives with a probe's answer and is remembered for every session created
     * afterwards. `undefined` behaves as the default `true`: the first check of
     * a fresh client is what teaches it the setting.
     */
    let eagerAllowed = true

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
    const BUILD = 'r15'

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
        width: 320,
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
        maxHeight: 168,
        boxSizing: 'border-box',
        margin: '4px 0 0',
        padding: '6px 8px',
        overflow: 'auto',
        borderTop: '0.5px solid var(--dsw-alias-border-l1)',
        color: 'var(--dsw-alias-label-secondary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 11,
        lineHeight: '16px',
        whiteSpace: 'pre',
      },
      outputError: { color: 'var(--dsw-alias-state-error-primary)' },
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
      const [open, setOpen] = React.useState(false)
      const [busy, setBusy] = React.useState(null)
      // Separate from `busy` on purpose. Only a user action sets this, and only
      // this disables the menu. The background workspace check must never take
      // the controls away, however it ends.
      const [actionBusy, setActionBusy] = React.useState(null)
      const [output, setOutput] = React.useState(null)
      const [failed, setFailed] = React.useState(false)
      const [url, setUrl] = React.useState('')
      const [probeError, setProbeError] = React.useState(null)

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
       * logs a `command/run`/`command/done` pair, so each probe is a visible
       * row in that session's conversation. The per-session cache is what keeps
       * that cost to one row per session instead of one row per menu open.
       *
       * The call is bounded and total. A Remote call that never settles would
       * otherwise leave `busy` set forever — and since a busy probe is what the
       * menu reports as "checking", the failure the timeout recorded would stay
       * hidden behind it. So the timeout path clears `busy` itself rather than
       * relying on the abandoned call's own cleanup.
       *
       * @param targetSession - the session to probe.
       * @param announceFailure - whether to record a failure for the menu to show.
       */
      const refresh = async (targetSession, announceFailure) => {
        const address = targetSession ?? sessionId
        if (address === undefined) return
        const controller = new AbortController()
        const expired = new Promise((resolve) => {
          controller.signal.addEventListener('abort', () => resolve(PROBE_TIMEOUT), { once: true })
        })
        const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
        try {
          const outcome = await Promise.race([
            probeOnce(address, announceFailure, controller.signal),
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
          if (announceFailure === true) {
            setProbeError(t('error.probeFailed', { reason: t('error.probeTimeout') }))
          }
        } finally {
          clearTimeout(timer)
        }
      }

      /**
       * One attempt at reading the workspace: check that the command exists,
       * then run it and interpret the answer.
       *
       * @param address - the session to address.
       * @param announceFailure - whether to record a failure for the menu to show.
       * @param signal - cancellation forwarded to the Remote call.
       */
      const probeOnce = async (address, announceFailure, signal) => {
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
        const probeLine =
          choice === undefined ? '/github status --json' : `/github status --json --dir "${choice}"`
        const outcome = await run(probeLine, { quiet: true, probe: true, signal }, address)
        if (outcome.text === undefined) {
          probeCache.delete(address)
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
          // The answer carries the deployment's eager-check preference; remember
          // it so sessions created later follow it.
          if (typeof parsed?.statusOnMount === 'boolean') {
            eagerAllowed = parsed.statusOnMount
          }
          setProbeError(null)
        } catch {
          // Not our JSON. A successful `/github` reply in any form still proves
          // a repository is present, which is the decision this probe drives.
          // The neutral label keeps it from claiming a branch it never learned.
          probeCache.set(address, { state: 'repo', branch: null, dirty: false, ahead: null, behind: null })
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
      React.useEffect(() => {
        if (sessionId === undefined || !eagerAllowed) return undefined
        if (probeCache.has(sessionId) || probeAttempted.has(sessionId)) return undefined
        probeAttempted.add(sessionId)
        let cancelled = false
        const probeWorkspace = async () => {
          try {
            await refresh(sessionId, true)
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

      // With eager checks disabled, the first open is what pays for the answer.
      React.useEffect(() => {
        if (!open || sessionId === undefined || eagerAllowed) return undefined
        if (probeCache.has(sessionId) || probeAttempted.has(sessionId)) return undefined
        probeAttempted.add(sessionId)
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
      }, [open, sessionId])

      // Re-render after a probe writes to the cache.
      React.useEffect(() => {
        if (!open) return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [open])

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
        void run(`${command} ${url.trim()}${dirSuffix(sessionId)}`).then(() => {
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

      const repoMenu = (remoteMissing ? CONNECT_ACTIONS : REPO_ACTIONS).map((action) =>
        React.createElement(
          'button',
          {
            key: action.id,
            type: 'button',
            role: 'menuitem',
            disabled,
            style: style(S.item, disabled ? S.itemDisabled : undefined),
            onClick: () => {
              void run(`/github ${action.id}${dirSuffix(sessionId)}`).then(() => refresh())
            },
          },
          t(action.key),
        ),
      )

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

      return React.createElement(
        'div',
        { style: S.wrap },
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
          ? React.createElement(
              'div',
              { role: 'menu', style: S.menu },
              React.createElement(
                'div',
                { style: S.head },
                React.createElement('span', { style: S.headTitle }, t('title')),
                React.createElement(
                  'span',
                  null,
                  actionBusy === null ? BUILD : t('menu.running', { action: actionBusy.replace('/github ', '') }),
                ),
              ),
              busy === null
                ? React.createElement(
                    'div',
                    { style: S.hint },
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
                        // once-per-session gate as well as the recorded failure.
                        probeAttempted.delete(sessionId)
                        setProbeError(null)
                        void refresh(sessionId, true)
                      },
                    },
                    t('action.retry'),
                  ),
              // The repository actions are offered while the check is still in
              // flight as well, so a probe that never answers degrades the menu
              // to "unverified" rather than freezing it. Without an answer the
              // clone and init entries are withheld, because offering them for a
              // workspace that may already be a repository is the worse guess.
              probeError === null && (probe === null || isRepo) ? repoMenu : null,
              probeError === null && remoteMissing ? connectMenu : null,
              probe !== null && !isRepo ? emptyMenu : null,
              // Offered last, because it changes what everything above acts on.
              probeError === null ? targetMenu : null,
              output === null
                ? null
                : React.createElement('pre', { style: style(S.output, failed ? S.outputError : undefined) }, output),
            )
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
              inject: () => ({ remote: ctx.remote }),
            },
            GithubSyncButton,
          ),
        )
      },
    }
  },
})
