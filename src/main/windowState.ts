import { app, screen, type BrowserWindow, type Rectangle } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface WindowState {
  bounds: Partial<Rectangle> & { width: number; height: number }
  maximized: boolean
}

const DEFAULT_SIZE = { width: 1400, height: 900 }
const MIN_SIZE = { width: 900, height: 600 }
const REACHABLE_PX = 100
const SAVE_DELAY_MS = 400

const file = (): string => join(app.getPath('userData'), 'window-state.json')

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function reachable(b: Rectangle): boolean {
  return screen.getAllDisplays().some(({ workArea: a }) => {
    const overlap = Math.min(b.x + b.width, a.x + a.width) - Math.max(b.x, a.x)
    return overlap >= REACHABLE_PX && b.y >= a.y && b.y <= a.y + a.height - REACHABLE_PX
  })
}

export function loadWindowState(): WindowState {
  try {
    const saved = JSON.parse(readFileSync(file(), 'utf8')) as { x?: unknown; y?: unknown; width?: unknown; height?: unknown; maximized?: unknown }
    const width = num(saved.width) ? Math.max(MIN_SIZE.width, saved.width) : DEFAULT_SIZE.width
    const height = num(saved.height) ? Math.max(MIN_SIZE.height, saved.height) : DEFAULT_SIZE.height
    const maximized = saved.maximized === true
    if (num(saved.x) && num(saved.y) && reachable({ x: saved.x, y: saved.y, width, height })) {
      return { bounds: { x: saved.x, y: saved.y, width, height }, maximized }
    }
    return { bounds: { width, height }, maximized }
  } catch {
    return { bounds: { ...DEFAULT_SIZE }, maximized: false }
  }
}

export function trackWindowState(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | undefined
  const save = (): void => {
    clearTimeout(timer)
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return
    try {
      mkdirSync(app.getPath('userData'), { recursive: true })
      writeFileSync(file(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }))
    } catch {
      /* keep the previous state */
    }
  }
  const soon = (): void => {
    clearTimeout(timer)
    timer = setTimeout(save, SAVE_DELAY_MS)
  }
  win.on('resize', soon)
  win.on('move', soon)
  win.on('maximize', soon)
  win.on('unmaximize', soon)
  win.on('close', save)
}
