import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { StatusFile } from '@shared/types'
import { setFileView, useFileView } from '../fileView'
import { Icon } from './Icon'
import { useSlidingIndicator } from '../motion'
import { motion } from 'motion/react'
import { useCollapsedFolders } from '../repoPrefs'

const ARRIVE_MS = 900
const GLIDE = { layout: { duration: 0.24, ease: [0.2, 0.8, 0.2, 1] as const } }
const NONE: ReadonlySet<string> = new Set()

export function FileRow({
  file,
  selected,
  onClick,
  onDoubleClick,
  onContextMenu,
  onKeyDown,
  depth = 0,
  label,
  entering = false,
  layoutId,
  children
}: {
  file: StatusFile
  selected: boolean
  entering?: boolean
  layoutId?: string
  onClick: (e: React.MouseEvent) => void
  onDoubleClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  onKeyDown?: (e: React.KeyboardEvent) => void
  depth?: number
  label?: string
  children?: React.ReactNode
}): React.JSX.Element {
  const full = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path
  const props = {
    className: `file-item${selected ? ' selected' : ''}${entering ? ' entering' : ''}`,
    'data-nav': true,
    'data-path': file.path,
    role: 'treeitem',
    'aria-level': depth + 1,
    'aria-selected': selected,
    style: { paddingLeft: 12 + depth * 14 },
    onClick,
    onDoubleClick,
    onContextMenu,
    onKeyDown,
    title: full
  }
  const content = (
    <>
      <span className={`status-letter ${file.status}`}>{file.status}</span>
      <span className="path"><span>{label ?? full}</span></span>
      {children}
    </>
  )
  if (!layoutId) return <div {...props}>{content}</div>
  return (
    <motion.div {...props} layoutId={layoutId} layout="position" transition={GLIDE}>
      {content}
    </motion.div>
  )
}

export function FileViewToggle(): React.JSX.Element {
  const view = useFileView()
  const indicator = useSlidingIndicator('button.active')
  return (
    <span className="view-toggle" ref={indicator} title="Switch between tree and flat file lists">
      <button className={view === 'tree' ? 'active' : ''} onClick={() => setFileView('tree')}>
        Tree
      </button>
      <button className={view === 'flat' ? 'active' : ''} onClick={() => setFileView('flat')}>
        Flat
      </button>
    </span>
  )
}

interface DirNode {
  name: string
  path: string
  dirs: Map<string, DirNode>
  files: StatusFile[]
}

function buildTree(files: StatusFile[]): DirNode {
  const root: DirNode = { name: '', path: '', dirs: new Map(), files: [] }
  for (const f of files) {
    const parts = f.path.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i]
      let next = node.dirs.get(name)
      if (!next) {
        next = { name, path: node.path ? `${node.path}/${name}` : name, dirs: new Map(), files: [] }
        node.dirs.set(name, next)
      }
      node = next
    }
    node.files.push(f)
  }
  return root
}

function compact(node: DirNode): DirNode {
  let n = node
  while (n.dirs.size === 1 && n.files.length === 0) {
    const [child] = n.dirs.values()
    n = { ...child, name: n.name ? `${n.name}/${child.name}` : child.name }
  }
  return { ...n, dirs: new Map([...n.dirs].map(([k, v]) => [k, compact(v)])) }
}

function collectFiles(node: DirNode): StatusFile[] {
  const out = [...node.files]
  for (const d of node.dirs.values()) out.push(...collectFiles(d))
  return out
}

function sortedDirs(node: DirNode): DirNode[] {
  return [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function sortedFiles(node: DirNode): StatusFile[] {
  return [...node.files].sort((a, b) => a.path.localeCompare(b.path))
}

export function FileList({
  files,
  selectedPath,
  onSelect,
  onDoubleClick,
  onContextMenu,
  onKeyDown,
  actions,
  resetKey,
  layoutIdFor
}: {
  files: StatusFile[]
  selectedPath: string | null
  onSelect: (f: StatusFile) => void
  onDoubleClick?: (f: StatusFile) => void
  onContextMenu?: (e: React.MouseEvent, files: StatusFile[], folder: string | null) => void
  onKeyDown?: (e: React.KeyboardEvent, f: StatusFile) => void
  actions?: (f: StatusFile) => React.ReactNode
  resetKey?: string
  layoutIdFor?: (f: StatusFile) => string | undefined
}): React.JSX.Element {
  const view = useFileView()
  const known = useRef<{ key?: string; paths: Set<string> } | null>(null)
  const [arrived, setArrived] = useState(NONE)
  const entering = (path: string): boolean => arrived.has(path)
  useLayoutEffect(() => {
    const paths = new Set(files.map((f) => f.path))
    const before = known.current
    known.current = { key: resetKey, paths }
    if (!before || before.key !== resetKey) return
    const added = [...paths].filter((p) => !before.paths.has(p))
    if (added.length) setArrived(new Set(added))
  }, [files, resetKey])
  useEffect(() => {
    if (!arrived.size) return
    const t = setTimeout(() => setArrived(NONE), ARRIVE_MS)
    return () => clearTimeout(t)
  }, [arrived])
  const [collapsed, toggle] = useCollapsedFolders()
  const tree = useMemo(() => {
    if (view !== 'tree') return null
    const root = buildTree(files)
    return { ...root, dirs: new Map([...root.dirs].map(([k, v]) => [k, compact(v)])) }
  }, [files, view])

  if (view === 'flat' || !tree) {
    return (
      <>
        {files.map((f) => (
          <FileRow
            key={f.path}
            file={f}
            selected={selectedPath === f.path}
            entering={entering(f.path)}
            layoutId={layoutIdFor?.(f)}
            onClick={(e) => e.detail < 2 && onSelect(f)}
            onDoubleClick={onDoubleClick ? () => onDoubleClick(f) : undefined}
            onContextMenu={onContextMenu ? (e) => onContextMenu(e, [f], null) : undefined}
            onKeyDown={onKeyDown ? (e) => onKeyDown(e, f) : undefined}
          >
            {actions?.(f)}
          </FileRow>
        ))}
      </>
    )
  }

  const renderDir = (node: DirNode, depth: number): React.ReactNode => {
    const rows: React.ReactNode[] = []
    for (const dir of sortedDirs(node)) {
      const open = !collapsed.has(dir.path)
      rows.push(
        <div
          key={'d:' + dir.path}
          className="dir-item"
          data-nav
          role="treeitem"
          aria-level={depth + 1}
          aria-expanded={open}
          style={{ paddingLeft: 12 + depth * 14 }}
          onClick={() => toggle(dir.path)}
          onContextMenu={onContextMenu ? (e) => onContextMenu(e, collectFiles(dir), dir.path) : undefined}
          title={dir.path}
        >
          <span className="chevron">
            <Icon name="chevronRight" size={12} className={`disclosure${open ? ' open' : ''}`} />
          </span>
          <span className="folder">
            <Icon name="folder" size={14} />
          </span>
          <span className="name">{dir.name}</span>
        </div>
      )
      if (open) rows.push(renderDir(dir, depth + 1))
    }
    for (const f of sortedFiles(node)) {
      const name = f.path.slice(f.path.lastIndexOf('/') + 1)
      rows.push(
        <FileRow
          key={f.path}
          file={f}
          depth={depth}
          label={f.oldPath ? `${f.oldPath.slice(f.oldPath.lastIndexOf('/') + 1)} → ${name}` : name}
          selected={selectedPath === f.path}
          entering={entering(f.path)}
          layoutId={layoutIdFor?.(f)}
          onClick={(e) => e.detail < 2 && onSelect(f)}
          onDoubleClick={onDoubleClick ? () => onDoubleClick(f) : undefined}
          onContextMenu={onContextMenu ? (e) => onContextMenu(e, [f], null) : undefined}
          onKeyDown={onKeyDown ? (e) => onKeyDown(e, f) : undefined}
        >
          {actions?.(f)}
        </FileRow>
      )
    }
    return rows
  }

  return <>{renderDir(tree, 0)}</>
}
