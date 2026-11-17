import { createContext, useContext, useState, useSyncExternalStore } from 'react'
import type { GraphFilter } from '@shared/types'

const FOLDERS_KEY = 'bluegum.folders.collapsed'
const FILTERS_KEY = 'bluegum.graphFilters'
const MAX_REPOS = 100
const EMPTY: ReadonlySet<string> = new Set()

export const RepoPathContext = createContext<string | null>(null)

function readMap<T>(key: string): Record<string, T> {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '{}') as unknown
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, T>) : {}
  } catch {
    return {}
  }
}

function writeMap<T>(key: string, map: Record<string, T>, repo: string, value: T | null): Record<string, T> {
  const next = { ...map }
  delete next[repo]
  if (value !== null) next[repo] = value
  const repos = Object.keys(next)
  for (const old of repos.slice(0, Math.max(0, repos.length - MAX_REPOS))) delete next[old]
  try {
    localStorage.setItem(key, JSON.stringify(next))
  } catch {
    /* storage unavailable */
  }
  return next
}

let folders = readMap<string[]>(FOLDERS_KEY)
const folderSets = new Map<string, ReadonlySet<string>>()
const folderListeners = new Set<() => void>()

function collapsedIn(repo: string): ReadonlySet<string> {
  let set = folderSets.get(repo)
  if (!set) {
    set = new Set(Array.isArray(folders[repo]) ? folders[repo] : [])
    folderSets.set(repo, set)
  }
  return set
}

function toggleFolder(repo: string, dir: string): void {
  const next = new Set(collapsedIn(repo))
  if (next.has(dir)) next.delete(dir)
  else next.add(dir)
  folders = writeMap(FOLDERS_KEY, folders, repo, next.size ? [...next] : null)
  folderSets.set(repo, next)
  folderListeners.forEach((l) => l())
}

export function useCollapsedFolders(): [ReadonlySet<string>, (dir: string) => void] {
  const repo = useContext(RepoPathContext)
  const [local, setLocal] = useState<ReadonlySet<string>>(EMPTY)
  const shared = useSyncExternalStore(
    (l) => {
      folderListeners.add(l)
      return () => folderListeners.delete(l)
    },
    () => (repo ? collapsedIn(repo) : EMPTY)
  )
  if (repo) return [shared, (dir) => toggleFolder(repo, dir)]
  return [
    local,
    (dir) =>
      setLocal((s) => {
        const next = new Set(s)
        if (next.has(dir)) next.delete(dir)
        else next.add(dir)
        return next
      })
  ]
}

const refList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((r): r is string => typeof r === 'string' && r.startsWith('refs/')) : [])

export function loadGraphFilter(repo: string): GraphFilter {
  const saved = readMap<GraphFilter>(FILTERS_KEY)[repo]
  const solo = refList(saved?.solo)
  const hide = refList(saved?.hide)
  return { ...(solo.length && { solo }), ...(hide.length && { hide }) }
}

export function saveGraphFilter(repo: string, filter: GraphFilter): void {
  const empty = !filter.solo?.length && !filter.hide?.length
  writeMap(FILTERS_KEY, readMap<GraphFilter>(FILTERS_KEY), repo, empty ? null : filter)
}
