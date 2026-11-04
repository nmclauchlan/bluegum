import { useEffect, useMemo, useRef, useState } from 'react'
import type { RepoStatus, StatusFile } from '@shared/types'
import type { Actions } from '../actions'
import type { MenuItem } from './ContextMenu'
import { FileList, FileViewToggle } from './FileList'
import { canEdit, type FileViewRequest } from './FileViewer'
import { copyToClipboard, errorMessage, revealInFolder, revealLabel } from '../util'
import { Icon } from './Icon'
import { focusItem, listKeys, useRovingFocus } from '../keynav'

type Area = 'staged' | 'unstaged'
type Move = 'stage' | 'unstage'

const SUMMARY_LIMIT = 72

function siblingRow(row: HTMLElement, dir: 1 | -1): HTMLElement | undefined {
  for (let el = dir > 0 ? row.nextElementSibling : row.previousElementSibling; el; el = dir > 0 ? el.nextElementSibling : el.previousElementSibling) {
    if (el instanceof HTMLElement && el.matches('.file-item')) return el
  }
}
const FAILED: Record<string, string> = { commit: 'Commit failed', stage: 'Staging failed', unstage: 'Unstaging failed', discard: 'Discarding failed', abort: 'Abort failed', continue: 'Continuing failed' }

const byPath = (a: StatusFile, b: StatusFile): number => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)

function mark(pending: ReadonlyMap<string, Move>, paths: string[], kind: Move): ReadonlyMap<string, Move> {
  const next = new Map(pending)
  for (const p of paths) next.set(p, kind)
  return next
}

function unmark(pending: ReadonlyMap<string, Move>, paths: string[], kind: Move): ReadonlyMap<string, Move> {
  const next = new Map(pending)
  for (const p of paths) if (next.get(p) === kind) next.delete(p)
  return next
}

function withPending(status: RepoStatus, pending: ReadonlyMap<string, Move>): { staged: StatusFile[]; unstaged: StatusFile[] } {
  if (!pending.size) return { staged: status.staged, unstaged: status.unstaged }
  const conflicted = new Set(status.conflicted)
  const moving = (f: StatusFile, kind: Move): boolean => pending.get(f.path) === kind && !conflicted.has(f.path)
  const staged = status.staged.filter((f) => !moving(f, 'unstage'))
  const unstaged = status.unstaged.filter((f) => !moving(f, 'stage'))
  const has = (list: StatusFile[], path: string): boolean => list.some((f) => f.path === path)
  for (const f of status.unstaged) if (moving(f, 'stage') && !has(staged, f.path)) staged.push({ ...f, status: f.status === '?' ? 'A' : f.status })
  for (const f of status.staged) if (moving(f, 'unstage') && !has(unstaged, f.path)) unstaged.push({ ...f, status: f.status === 'A' ? '?' : f.status })
  return { staged: staged.sort(byPath), unstaged: unstaged.sort(byPath) }
}

export function WorkingTree({
  repoPath,
  status,
  actions,
  viewing,
  onView,
  draft,
  onDraftUsed,
  branch
}: {
  repoPath: string
  status: RepoStatus
  actions: Actions
  viewing: FileViewRequest | null
  onView: (request: FileViewRequest | null) => void
  draft?: string | null
  onDraftUsed?: () => void
  branch?: string | null
}): React.JSX.Element {
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [amendPrefill, setAmendPrefill] = useState<string | null>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const [pending, setPending] = useState<ReadonlyMap<string, Move>>(() => new Map())
  const filesNav = useRovingFocus<HTMLDivElement>()
  const pendingFocus = useRef<{ area: Area; path: string } | null>(null)
  const message = description.trim() ? `${summary.trim()}\n\n${description.trim()}` : summary.trim()
  const setMessage = (text: string): void => {
    const [first = '', ...rest] = text.split('\n')
    setSummary(first.trim())
    setDescription(rest.join('\n').replace(/^\s*\n/, '').trimEnd())
  }
  const [amend, setAmend] = useState(false)
  const [working, setWorking] = useState<string | null>(null)
  const operation = status.operation
  const conflicted = new Set(status.conflicted)
  const { staged: stagedFiles, unstaged: changedFiles } = useMemo(() => withPending(status, pending), [status, pending])
  const conflictFiles = changedFiles.filter((f) => conflicted.has(f.path))
  const unstagedFiles = changedFiles.filter((f) => !conflicted.has(f.path))

  useEffect(() => {
    if (operation?.message && !message) setMessage(operation.message)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operation?.kind])

  useEffect(() => {
    if (!draft) return
    if (!message) setMessage(draft)
    onDraftUsed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  useEffect(() => {
    if (!viewing || viewing.source.kind !== 'worktree') return
    const staged = viewing.source.staged
    const key = (e: KeyboardEvent): void => {
      if (e.key !== ' ' || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target
      if (t instanceof HTMLElement && t.closest('input, textarea, select, button, [contenteditable="true"], .cm-editor')) return
      if (document.querySelector('.overlay, .dialog, .context-menu-root') || conflicted.has(viewing.file.path)) return
      e.preventDefault()
      const list = staged ? stagedFiles : unstagedFiles
      const at = list.findIndex((f) => f.path === viewing.file.path)
      const next = list[at + 1] ?? list[at - 1]
      void (staged ? unstage : stage)([viewing.file.path])
      if (next) view(staged ? 'staged' : 'unstaged', next, 'diff')
      else onView(null)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  useEffect(() => {
    if (!viewing || viewing.source.kind !== 'worktree') return
    const list = viewing.source.staged ? stagedFiles : changedFiles
    if (!list.some((f) => f.path === viewing.file.path)) onView(null)
  }, [stagedFiles, changedFiles, viewing, onView])

  useEffect(() => {
    const want = pendingFocus.current
    if (!want) return
    const row = filesNav.current?.querySelector<HTMLElement>(`[data-area="${want.area}"] [data-path="${CSS.escape(want.path)}"]`)
    if (!row) return
    pendingFocus.current = null
    focusItem(row)
  }, [stagedFiles, changedFiles, filesNav])

  const enqueue = <T,>(task: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(task, task)
    queue.current = next.catch(() => undefined)
    return next
  }

  const run = async (fn: () => Promise<void>, key = 'action', reload: 'all' | 'status' = 'all'): Promise<void> => {
    setWorking(key)
    try {
      await enqueue(fn)
    } catch (e) {
      actions.showError(errorMessage(e), FAILED[key])
    } finally {
      setWorking(null)
      if (reload === 'all') actions.refresh()
      else void actions.refreshStatus()
    }
  }

  const move = (files: string[], kind: Move): Promise<void> => {
    if (!files.length) return Promise.resolve()
    setPending((p) => mark(p, files, kind))
    return enqueue(async () => {
      try {
        await (kind === 'stage' ? window.git.stage(repoPath, files) : window.git.unstage(repoPath, files))
      } catch (e) {
        actions.showError(errorMessage(e), FAILED[kind])
      }
      await actions.refreshStatus()
      setPending((p) => unmark(p, files, kind))
    })
  }
  const stage = (files: string[]): Promise<void> => move(files, 'stage')
  const unstage = (files: string[]): Promise<void> => move(files, 'unstage')
  const discard = async (files: string[]): Promise<boolean> => {
    const ok = await actions.confirm(
      'Discard changes',
      `Discard changes to ${files.length === 1 ? files[0] : `${files.length} files`}? This cannot be undone.`,
      true
    )
    if (ok) await run(() => window.git.discard(repoPath, files), 'discard', 'status')
    return ok
  }

  const commit = async (): Promise<void> => {
    if ((!message && !amend) || working === 'commit') return
    await run(async () => {
      if (stageAllFirst) await window.git.stage(repoPath, unstagedPaths)
      await window.git.commit(repoPath, message, amend)
      setMessage('')
      setAmend(false)
      setAmendPrefill(null)
    }, 'commit')
  }

  const toggleAmend = async (on: boolean): Promise<void> => {
    setAmend(on)
    if (on && !message) {
      const head = await window.git.commitDetails(repoPath, 'HEAD').catch(() => null)
      if (!head) return
      const text = head.body ? `${head.subject}\n\n${head.body}` : head.subject
      setMessage(text)
      setAmendPrefill(text)
    } else if (!on && amendPrefill !== null && message === amendPrefill) {
      setMessage('')
      setAmendPrefill(null)
    }
  }

  const view = (area: Area, file: StatusFile, mode: FileViewRequest['mode']): void => {
    if (mode === 'edit' && !canEdit(file)) mode = 'diff'
    onView({ file, source: { kind: 'worktree', staged: area === 'staged', status: file.status }, mode })
  }

  const toggle = (area: Area, file: StatusFile, mode: 'diff' | 'conflict'): void => {
    const open = viewing?.source.kind === 'worktree' && viewing.source.staged === (area === 'staged') && viewing.file.path === file.path
    if (open) onView(null)
    else view(area, file, mode)
  }

  const rowKeys =
    (area: Area) =>
    (e: React.KeyboardEvent, file: StatusFile): void => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || (e.key !== ' ' && e.key !== 'Delete')) return
      if (e.key === 'Delete' && area !== 'unstaged') return
      e.preventDefault()
      e.stopPropagation()
      const row = e.currentTarget as HTMLElement
      const next = siblingRow(row, 1) ?? siblingRow(row, -1)
      if (e.key === 'Delete') {
        void discard([file.path]).then((ok) => ok && next?.isConnected && focusItem(next))
        return
      }
      if (next) focusItem(next)
      else pendingFocus.current = { area: area === 'staged' ? 'unstaged' : 'staged', path: file.path }
      const list = area === 'staged' ? stagedFiles : unstagedFiles
      if (selectedIn(area) === file.path) {
        const after = list.find((f) => f.path === next?.dataset.path)
        if (after) view(area, after, 'diff')
        else onView(null)
      }
      void (area === 'staged' ? unstage : stage)([file.path])
    }

  const resolveWith = (file: StatusFile, side: 'ours' | 'theirs'): Promise<void> =>
    run(() => window.git.resolveFile(repoPath, file.path, null, side), 'action', 'status')

  const abort = async (): Promise<void> => {
    if (!operation) return
    const ok = await actions.confirm(`Abort ${operation.kind}`, `Abort the ${operation.kind} in progress and restore the previous state?`, true)
    if (ok) await run(() => window.git.abortOperation(repoPath), 'abort')
  }

  const continueOp = async (): Promise<void> => {
    await run(async () => {
      await window.git.continueOperation(repoPath, message)
      setMessage('')
    }, 'continue')
  }

  const fileMenu =
    (area: Area | 'conflict') =>
    (e: React.MouseEvent, files: StatusFile[], folder: string | null): void => {
      e.preventDefault()
      const paths = files.map((f) => f.path)
      const noun = folder ? 'folder' : 'file'
      const items: MenuItem[] = []
      if (area === 'unstaged') {
        items.push({ icon: 'plus', label: `Stage ${noun}`, onClick: () => stage(paths) })
        items.push({ icon: 'undo', label: `Discard changes in ${noun}`, danger: true, onClick: () => discard(paths) })
        items.push({ icon: 'stash', label: `Stash ${noun}…`, onClick: () => actions.stash(paths) })
        if (files.every((f) => f.status === '?')) {
          const file = folder ? null : files[0].path
          const dir = folder ?? (file!.includes('/') ? file!.slice(0, file!.lastIndexOf('/')) : null)
          const ext = file && /\.[^./]+$/.exec(file.slice(file.lastIndexOf('/') + 1))?.[0]
          items.push({ separator: true })
          if (file) items.push({ icon: 'eyeOff', label: 'Ignore file', onClick: () => actions.ignore('file', file) })
          if (ext) items.push({ label: `Ignore all ${ext} files`, onClick: () => actions.ignore('extension', ext) })
          if (dir) items.push({ label: folder ? 'Ignore folder' : `Ignore folder ${dir}/`, onClick: () => actions.ignore('folder', dir) })
        }
      } else if (area === 'staged') {
        items.push({ icon: 'minus', label: `Unstage ${noun}`, onClick: () => unstage(paths) })
        items.push({ icon: 'stash', label: `Stash ${noun}…`, onClick: () => actions.stash(paths) })
      } else {
        const takeAll = (side: 'ours' | 'theirs'): Promise<void> =>
          run(
            async () => {
              for (const p of paths) await window.git.resolveFile(repoPath, p, null, side)
            },
            'action',
            'status'
          )
        items.push({ label: folder ? 'Take ours for folder' : 'Take ours', onClick: () => takeAll('ours') })
        items.push({ label: folder ? 'Take theirs for folder' : 'Take theirs', onClick: () => takeAll('theirs') })
      }
      if (!folder && area !== 'conflict' && canEdit(files[0])) {
        items.push({ separator: true })
        items.push({ icon: 'edit', label: 'Edit', onClick: () => view(area, files[0], 'edit') })
      }
      if (!folder && area !== 'conflict' && files[0].status !== '?') {
        items.push({ separator: true })
        items.push({ label: 'File history', onClick: () => view(area, files[0], 'history') })
        if (canEdit(files[0])) items.push({ label: 'Blame', onClick: () => view(area, files[0], 'blame') })
      }
      items.push({ separator: true })
      items.push({ icon: 'folder', label: revealLabel(), onClick: () => revealInFolder(repoPath, folder ?? files[0].path) })
      items.push({
        icon: 'copy',
        label: 'Copy path',
        onClick: () => {
          const p = folder ?? files[0].path
          void copyToClipboard(p)
          actions.showInfo(`Copied ${p}`)
        }
      })
      actions.openMenu(e, items)
    }

  const opLabel = operation
    ? { merge: 'Merge', 'cherry-pick': 'Cherry-pick', revert: 'Revert', rebase: 'Rebase' }[operation.kind]
    : ''

  const selectedIn = (area: Area): string | null =>
    viewing && viewing.source.kind === 'worktree' && viewing.source.staged === (area === 'staged')
      ? viewing.file.path
      : null

  const unstagedPaths = unstagedFiles.map((f) => f.path)
  const stagedPaths = stagedFiles.map((f) => f.path)
  const stageAllFirst = !amend && !operation && stagedFiles.length === 0 && unstagedFiles.length > 0
  const canCommit = amend || (!!summary.trim() && (stagedFiles.length > 0 || stageAllFirst))
  const files = (n: number): string => `${n} file${n === 1 ? '' : 's'}`
  const onto = branch ? ` to ${branch}` : ''
  const commitLabel = amend
    ? stagedFiles.length
      ? `Amend with ${files(stagedFiles.length)}`
      : 'Amend last commit'
    : stageAllFirst
      ? `Stage all and commit ${files(unstagedFiles.length)}${onto}`
      : stagedFiles.length
        ? `Commit ${files(stagedFiles.length)}${onto}`
        : 'Commit'

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-header-row">
          <h3>Uncommitted changes</h3>
          <FileViewToggle />
        </div>
        <div className="meta">
          {stagedFiles.length} staged · {changedFiles.length} unstaged
          {status.conflicted.length ? ` · ${status.conflicted.length} conflicted` : ''}
        </div>
      </div>
      {operation && (
        <div className={`operation-banner${conflictFiles.length ? ' conflicted' : ''}`}>
          <div className="operation-text">
            <strong>{opLabel} in progress</strong>
            <span className="muted">
              {conflictFiles.length
                ? `${conflictFiles.length} file${conflictFiles.length === 1 ? '' : 's'} with conflicts to resolve`
                : operation.message || 'All conflicts resolved'}
            </span>
          </div>
          <button disabled={!!working} aria-busy={working === 'abort'} onClick={abort}>Abort</button>
          <button className="primary" disabled={!!working || conflictFiles.length > 0} aria-busy={working === 'continue'} onClick={continueOp}>
            {operation.kind === 'merge' ? 'Commit merge' : 'Continue'}
          </button>
        </div>
      )}
      <div className="panel-body" ref={filesNav} role="tree" aria-label="Uncommitted changes" onKeyDown={(e) => listKeys(e)}>
        {conflictFiles.length > 0 && (
          <>
            <div className="file-group-title conflicts">
              <span>Conflicts ({conflictFiles.length})</span>
            </div>
            <div data-area="conflicts">
              <FileList
                files={conflictFiles}
                selectedPath={selectedIn('unstaged')}
                onSelect={(f) => toggle('unstaged', f, 'conflict')}
                onDoubleClick={(f) => view('unstaged', f, 'conflict')}
                onContextMenu={fileMenu('conflict')}
                actions={(f) => (
                  <span className="actions" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                    <button title="Resolve in editor" aria-label="Resolve in editor" onClick={() => view('unstaged', f, 'conflict')}>
                      <Icon name="conflict" size={14} />
                    </button>
                    <button title="Take ours" onClick={() => resolveWith(f, 'ours')}>Ours</button>
                    <button title="Take theirs" onClick={() => resolveWith(f, 'theirs')}>Theirs</button>
                  </span>
                )}
              />
            </div>
          </>
        )}
        <div className="file-group-title">
          <span>Unstaged ({unstagedFiles.length})</span>
          <button disabled={!unstagedFiles.length} onClick={() => stage(unstagedPaths)}>
            Stage all
          </button>
        </div>
        <div data-area="unstaged">
          <FileList
            files={unstagedFiles}
            selectedPath={selectedIn('unstaged')}
            onSelect={(f) => toggle('unstaged', f, 'diff')}
            onDoubleClick={(f) => void stage([f.path])}
            onContextMenu={fileMenu('unstaged')}
            onKeyDown={rowKeys('unstaged')}
            actions={(f) => (
              <span className="actions" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                {canEdit(f) && (
                  <button title="Edit" aria-label="Edit" onClick={() => view('unstaged', f, 'edit')}>
                    <Icon name="edit" size={14} />
                  </button>
                )}
                <button title="Discard" aria-label="Discard" onClick={() => discard([f.path])}>
                  <Icon name="undo" size={14} />
                </button>
                <button title="Stage" aria-label="Stage" onClick={() => stage([f.path])}>
                  <Icon name="plus" size={14} />
                </button>
              </span>
            )}
          />
        </div>
        <div className="file-group-title">
          <span>Staged ({stagedFiles.length})</span>
          <button disabled={!stagedFiles.length} onClick={() => unstage(stagedPaths)}>
            Unstage all
          </button>
        </div>
        <div data-area="staged">
          <FileList
            files={stagedFiles}
            selectedPath={selectedIn('staged')}
            onSelect={(f) => toggle('staged', f, 'diff')}
            onDoubleClick={(f) => void unstage([f.path])}
            onContextMenu={fileMenu('staged')}
            onKeyDown={rowKeys('staged')}
            actions={(f) => (
              <span className="actions" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                {canEdit(f) && (
                  <button title="Edit" aria-label="Edit" onClick={() => view('staged', f, 'edit')}>
                    <Icon name="edit" size={14} />
                  </button>
                )}
                <button title="Unstage" aria-label="Unstage" onClick={() => unstage([f.path])}>
                  <Icon name="minus" size={14} />
                </button>
              </span>
            )}
          />
        </div>
      </div>
      <div className="commit-form">
        <div className="commit-summary">
          <input
            aria-label="Commit summary"
            placeholder="Summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text')
              if (summary || !text.includes('\n')) return
              e.preventDefault()
              setMessage(description ? `${text.trimEnd()}\n\n${description}` : text)
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              if (e.ctrlKey || e.metaKey) void commit()
              else descriptionRef.current?.focus()
            }}
          />
          {summary.length > 0 && (
            <span
              className={`commit-summary-count${summary.length > SUMMARY_LIMIT ? ' over' : ''}`}
              title={`Summaries of ${SUMMARY_LIMIT} characters or fewer read best in logs and pull requests`}
            >
              {SUMMARY_LIMIT - summary.length}
            </span>
          )}
        </div>
        <textarea
          ref={descriptionRef}
          aria-label="Commit description"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void commit()
          }}
        />
        <div className="row">
          <label>
            <input type="checkbox" checked={amend} onChange={(e) => void toggleAmend(e.target.checked)} /> Amend
          </label>
          <div style={{ flex: 1 }} />
          {operation ? (
            <button className="primary" disabled={!!working || conflictFiles.length > 0} aria-busy={working === 'continue'} onClick={continueOp}>
              {operation.kind === 'merge' ? 'Commit merge' : `Continue ${operation.kind}`}
            </button>
          ) : (
            <button className="primary commit-button" disabled={!!working || !canCommit} aria-busy={working === 'commit'} onClick={() => void commit()} title={commitLabel}>
              {commitLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
