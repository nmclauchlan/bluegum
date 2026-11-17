import type { HostInfo, PullRequest, RepoInfo, RepoRefs, UndoInfo } from '@shared/types'
import type { Actions } from '../actions'
import { prPrefix } from '../util'
import { pullItems } from '../refMenu'
import { PULL_LABELS, useSettings } from '../settings'
import { setPanelCollapsed, useCollapsedPanels, type PanelName } from '../layout'
import { Icon, type IconName } from './Icon'
import { AnimatePresence, motion } from 'motion/react'
import { Digits, useRolling } from './Rolling'

const BADGE_EXIT = { opacity: 0, scale: 0.4, transition: { duration: 0.18 } }

function PanelIcon({ side, open }: { side: 'left' | 'right'; open: boolean }): React.JSX.Element {
  const x = side === 'left' ? 2.5 : 10
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <rect x={x} y="3" width="3.5" height="10" fill={open ? 'currentColor' : 'none'} stroke="none" opacity={open ? 0.55 : 1} />
      <path d={side === 'left' ? 'M6 2.5v11' : 'M10 2.5v11'} />
    </svg>
  )
}

export function Toolbar({
  repo,
  refs,
  busy,
  busyLabel = null,
  failed = null,
  actions,
  host,
  prs,
  onCreatePr,
  onViewPr,
  onSearch,
  undoInfo,
  done = null
}: {
  repo: RepoInfo
  refs: RepoRefs | null
  busy: boolean
  busyLabel?: string | null
  actions: Actions
  host: HostInfo | null
  prs: PullRequest[]
  onCreatePr: () => void
  onViewPr: (pr: PullRequest) => void
  onSearch: () => void
  undoInfo: UndoInfo
  done?: string | null
  failed?: string | null
}): React.JSX.Element {
  const icon = (name: IconName, label: string): React.JSX.Element =>
    done === label ? <Icon name="check" className="done-tick" /> : <Icon name={name} className={busyLabel === label ? `working-${name}` : undefined} />
  const syncClass = (label: string): string => (failed === label ? 'sync shake' : 'sync')
  const mod = /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+'
  const { pullMode } = useSettings()
  const current = refs?.branches.find((b) => b.current)
  const behind = useRolling(current?.behind ?? 0, current?.name ?? '')
  const ahead = useRolling(current?.ahead ?? 0, current?.name ?? '')
  const currentPr = current ? prs.find((p) => p.sourceBranch === current.name) : undefined
  const collapsed = useCollapsedPanels()
  const toggle = (panel: PanelName, label: string, side: 'left' | 'right'): React.JSX.Element => {
    const open = !collapsed.includes(panel)
    return (
      <button
        className="icon panel-toggle"
        aria-pressed={open}
        aria-label={`${open ? 'Hide' : 'Show'} the ${label}`}
        title={`${open ? 'Hide' : 'Show'} the ${label}`}
        onClick={() => setPanelCollapsed(panel, open)}
      >
        <PanelIcon side={side} open={open} />
      </button>
    )
  }
  return (
    <div className="toolbar">
      {toggle('sidebar', 'branch panel', 'left')}
      <button onClick={actions.openRepo} title="Open another repository">
        <Icon name="folder" />
        {repo.name}
      </button>
      <span className="toolbar-group">
        <button
          disabled={busy || !undoInfo.undo}
          onClick={actions.undo}
          aria-busy={busyLabel === 'Undoing'}
          title={undoInfo.undo ? `Undo ${undoInfo.undo} (${mod}Z)` : 'Nothing to undo'}
          aria-label="Undo"
        >
          <Icon name="undo" />
          Undo
        </button>
        <button
          disabled={busy || !undoInfo.redo}
          onClick={actions.redo}
          aria-busy={busyLabel === 'Redoing'}
          title={undoInfo.redo ? `Redo ${undoInfo.redo} (${mod}Shift+Z)` : 'Nothing to redo'}
          aria-label="Redo"
        >
          <Icon name="redo" />
          Redo
        </button>
      </span>
      <button className={syncClass('Fetching')} disabled={busy} aria-busy={busyLabel === 'Fetching'} onClick={actions.fetch} title="git fetch --all --prune">
        {icon('fetch', 'Fetching')}
        Fetch
      </button>
      <span className="split-button">
        <button className={syncClass('Pulling')} disabled={busy} aria-busy={busyLabel === 'Pulling'} onClick={() => actions.pull()} title={`Pull (${PULL_LABELS[pullMode].toLowerCase()})`}>
          {icon('pull', 'Pulling')}
          Pull
          <AnimatePresence initial={false}>
            {behind.visible && (
              <motion.span key="behind" className="badge" exit={BADGE_EXIT}>
                <Digits n={behind.shown} falling={behind.falling} />
              </motion.span>
            )}
          </AnimatePresence>
        </button>
        <button
          className="split-caret"
          disabled={busy}
          aria-label="Pull options"
          title="Pull with merge, rebase or fast-forward only"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            actions.openMenu({ ...e, clientX: r.left, clientY: r.bottom + 2 }, pullItems(actions))
          }}
        >
          <Icon name="chevronDown" size={12} />
        </button>
      </span>
      <button className={syncClass('Pushing')} disabled={busy} aria-busy={busyLabel === 'Pushing'} onClick={actions.push} title="git push">
        {icon('push', 'Pushing')}
        Push
        <AnimatePresence initial={false}>
          {ahead.visible && (
            <motion.span key="ahead" className="badge" exit={BADGE_EXIT}>
              <Digits n={ahead.shown} falling={ahead.falling} />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      <button disabled={busy} aria-busy={busyLabel === 'Creating branch'} onClick={() => actions.createBranch('HEAD')} title="Create a branch at HEAD">
        <Icon name="branch" />
        Branch
      </button>
      <button disabled={busy} aria-busy={busyLabel === 'Stashing'} onClick={() => actions.stash()} title="Stash your uncommitted changes">
        {icon('stash', 'Stashing')}
        Stash
      </button>
      <button
        disabled={busy || !refs?.stashes.length}
        aria-busy={busyLabel === 'Popping stash'}
        onClick={() => actions.stashPop(0)}
        title="git stash pop"
      >
        {icon('pop', 'Popping stash')}
        Pop
      </button>
      {host && current && (
        currentPr ? (
          <button disabled={busy} onClick={() => onViewPr(currentPr)} title={currentPr.title}>
            <Icon name="pr" />
            {host.kind === 'gitlab' ? 'MR' : 'PR'} {prPrefix(host.kind)}{currentPr.id}
          </button>
        ) : (
          <button disabled={busy || !current.upstream} onClick={onCreatePr} title={current.upstream ? `Create a ${host.kind === 'gitlab' ? 'merge' : 'pull'} request for this branch` : 'Push the branch first'}>
            <Icon name="pr" />
            {host.kind === 'gitlab' ? 'Merge request' : 'Pull request'}
          </button>
        )
      )}
      <button onClick={onSearch} title={`Search commits (${mod}F)`}>
        <Icon name="search" />
        Search
      </button>
      <div className="spacer" />
      {toggle('details', 'commit panel', 'right')}
    </div>
  )
}
