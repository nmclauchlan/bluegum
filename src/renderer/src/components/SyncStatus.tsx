import { useEffect, useState } from 'react'
import type { Branch, RepoRefs } from '@shared/types'
import { formatDate, formatFullDate, shortHash } from '../util'
import { Icon } from './Icon'

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

function Tracking({ branch }: { branch: Branch }): React.JSX.Element {
  if (!branch.upstream) {
    return (
      <span className="sync-note" title={`${branch.name} has no upstream yet. Push it to publish it.`}>
        not published
      </span>
    )
  }
  if (branch.gone) {
    return (
      <span className="sync-note gone" title={`${branch.upstream} no longer exists on the remote`}>
        {branch.upstream} deleted
      </span>
    )
  }
  const ahead = branch.ahead ?? 0
  const behind = branch.behind ?? 0
  return (
    <>
      <span className="sync-upstream">→ {branch.upstream}</span>
      {ahead > 0 && (
        <span className="sync-ahead" title={`${plural(ahead, 'commit')} to push`} aria-label={`${ahead} to push`}>
          <Icon name="push" size={11} />
          {ahead}
        </span>
      )}
      {behind > 0 && (
        <span className="sync-behind" title={`${plural(behind, 'commit')} to pull`} aria-label={`${behind} to pull`}>
          <Icon name="pull" size={11} />
          {behind}
        </span>
      )}
      {!ahead && !behind && (
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
  onFetch
}: {
  refs: RepoRefs
  fetchedAt: number | null
  fetching: boolean
  busy: boolean
  onFetch: () => void
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
        {branch && <Tracking branch={branch} />}
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
