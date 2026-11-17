import { useEffect, useState } from 'react'
import type { Branch, RepoRefs } from '@shared/types'
import { formatDate, formatFullDate, shortHash } from '../util'
import { Icon } from './Icon'
import { AnimatePresence, motion } from 'motion/react'
import { Digits, useRolling } from './Rolling'

const COUNT_EXIT = { opacity: 0, scale: 0.4, transition: { duration: 0.18 } }

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

function Tracking({ branch, onGone }: { branch: Branch; onGone?: () => void }): React.JSX.Element {
  const ahead = useRolling(branch.upstream && !branch.gone ? (branch.ahead ?? 0) : 0, branch.name)
  const behind = useRolling(branch.upstream && !branch.gone ? (branch.behind ?? 0) : 0, branch.name)
  if (!branch.upstream) {
    return (
      <span className="sync-note" title={`${branch.name} has no upstream yet. Push it to publish it.`}>
        not published
      </span>
    )
  }
  if (branch.gone) {
    return (
      <button className="statusbar-link sync-note gone" title={`${branch.upstream} no longer exists on the remote. Click for options`} onClick={onGone}>
        {branch.upstream} deleted
      </button>
    )
  }
  return (
    <>
      <span className="sync-upstream">→ {branch.upstream}</span>
      <AnimatePresence initial={false}>
        {ahead.visible && (
          <motion.span key="ahead" className="sync-ahead" title={`${plural(ahead.shown, 'commit')} to push`} aria-label={`${ahead.shown} to push`} exit={COUNT_EXIT}>
            <Icon name="push" size={11} />
            <Digits n={ahead.shown} falling={ahead.falling} />
          </motion.span>
        )}
        {behind.visible && (
          <motion.span key="behind" className="sync-behind" title={`${plural(behind.shown, 'commit')} to pull`} aria-label={`${behind.shown} to pull`} exit={COUNT_EXIT}>
            <Icon name="pull" size={11} />
            <Digits n={behind.shown} falling={behind.falling} />
          </motion.span>
        )}
      </AnimatePresence>
      {!ahead.visible && !behind.visible && (
        <span className="sync-note" title={`Matches ${branch.upstream} as of the last fetch`}>
          up to date
        </span>
      )}
    </>
  )
}

export function SyncStatus({
  refs,
  fetchedAt,
  fetching,
  busy,
  onFetch,
  onGone
}: {
  refs: RepoRefs
  fetchedAt: number | null
  fetching: boolean
  busy: boolean
  onFetch: () => void
  onGone: (branch: string) => void
}): React.JSX.Element {
  const [, setNow] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  const branch = refs.branches.find((b) => b.current)
  return (
    <>
      <span className="sync-status">
        <Icon name="branch" size={12} />
        <span className="sync-branch">{branch ? branch.name : `Detached at ${shortHash(refs.headHash)}`}</span>
        {branch && <Tracking branch={branch} onGone={busy ? undefined : () => onGone(branch.name)} />}
      </span>
      {fetching ? (
        <span className="spin" role="status">
          Fetching in background…
        </span>
      ) : (
        fetchedAt !== null && (
          <button className="statusbar-link fetched-at" disabled={busy} title={`Last fetched ${formatFullDate(fetchedAt)}. Click to fetch now`} onClick={onFetch}>
            Fetched {formatDate(fetchedAt)}
          </button>
        )
      )}
    </>
  )
}
