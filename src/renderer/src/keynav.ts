import { useEffect, useMemo } from 'react'

const ITEM = '[data-nav]'
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
const OWN_KEYS = 'input, textarea, select, [contenteditable="true"], .cm-editor'

const visible = (el: HTMLElement): boolean => el.getClientRects().length > 0

export function navItems(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(ITEM)].filter(visible)
}

export function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible)
}

export function ownsKeys(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest(OWN_KEYS)
}

export function focusItem(el: HTMLElement | undefined): void {
  if (!el) return
  if (!el.hasAttribute('tabindex') && el.tabIndex < 0) el.tabIndex = -1
  el.focus()
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

export interface RovingRef<T> {
  (el: T | null): void
  current: T | null
}

export function useRovingFocus<T extends HTMLElement>(): RovingRef<T> {
  return useMemo(() => {
    let stop: (() => void) | null = null
    const ref = ((root: T | null) => {
      stop?.()
      stop = root && attachRoving(root)
      ref.current = root
    }) as RovingRef<T>
    ref.current = null
    return ref
  }, [])
}

function attachRoving(root: HTMLElement): () => void {
  let last: HTMLElement | null = null
  let lastIndex = 0
  const sync = (): void => {
    const items = navItems(root)
    let replacement: HTMLElement | undefined
    if (last && !last.isConnected) {
      replacement = items[Math.min(lastIndex, items.length - 1)]
      last = null
    }
    const current = last && items.includes(last) ? last : (replacement ?? items.find((el) => el.matches('[aria-selected="true"], [aria-current]')) ?? items[0])
    for (const el of root.querySelectorAll<HTMLElement>(ITEM)) el.tabIndex = el === current ? 0 : -1
    if (replacement && (!document.activeElement || document.activeElement === document.body)) replacement.focus({ preventScroll: true })
  }
  const onFocus = (e: FocusEvent): void => {
    const item = (e.target as HTMLElement).closest<HTMLElement>(ITEM)
    if (!item || !root.contains(item)) return
    last = item
    lastIndex = navItems(root).indexOf(item)
    sync()
  }
  const observer = new MutationObserver(sync)
  observer.observe(root, { childList: true, subtree: true, attributeFilter: ['hidden', 'class'] })
  root.addEventListener('focusin', onFocus)
  sync()
  return () => {
    observer.disconnect()
    root.removeEventListener('focusin', onFocus)
  }
}

export function listKeys(e: React.KeyboardEvent<HTMLElement>, orientation: 'vertical' | 'horizontal' = 'vertical'): boolean {
  if (e.altKey || e.ctrlKey || e.metaKey || ownsKeys(e.target)) return false
  const items = navItems(e.currentTarget)
  const at = items.indexOf(document.activeElement as HTMLElement)
  if (at === -1) return false
  const [back, forward] = orientation === 'vertical' ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight']
  const current = items[at]

  let next: number | null = null
  if (e.key === forward) next = at + 1
  else if (e.key === back) next = at - 1
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = items.length - 1
  else if (e.key === 'PageDown') next = at + 10
  else if (e.key === 'PageUp') next = at - 10
  else if (orientation === 'vertical' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    const expanded = current.getAttribute('aria-expanded')
    const level = Number(current.getAttribute('aria-level') ?? 0)
    if (e.key === 'ArrowRight' && expanded === 'false') current.click()
    else if (e.key === 'ArrowRight' && expanded === 'true') next = at + 1
    else if (e.key === 'ArrowLeft' && expanded === 'true') current.click()
    else if (e.key === 'ArrowLeft' && level > 1) {
      for (let i = at - 1; i >= 0; i--) {
        if (Number(items[i].getAttribute('aria-level') ?? 0) < level) {
          next = i
          break
        }
      }
    }
    if (next === null) {
      e.preventDefault()
      return true
    }
  } else if (e.key.length === 1 && /\S/.test(e.key) && !e.shiftKey) {
    const ch = e.key.toLowerCase()
    const order = [...items.slice(at + 1), ...items.slice(0, at + 1)]
    const match = order.find((el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().toLowerCase().startsWith(ch))
    if (!match) return false
    next = items.indexOf(match)
  } else return false

  e.preventDefault()
  focusItem(items[Math.max(0, Math.min(items.length - 1, next))])
  return true
}

const REGION = '.titlebar, .toolbar, .sidebar, .commit-list, .file-viewer, .compare-view, .panel, .statusbar, .repo-manager, .toast'

function regionEntry(region: HTMLElement): HTMLElement | undefined {
  return region.querySelector<HTMLElement>('[data-entry]') ?? region.querySelector<HTMLElement>(`${ITEM}[tabindex="0"]`) ?? focusables(region)[0] ?? (region.tabIndex >= 0 ? region : undefined)
}

function cycleRegion(back: boolean): void {
  const layer = topLayer()
  const regions = [...(layer ?? document).querySelectorAll<HTMLElement>(REGION)].filter((r) => visible(r) && regionEntry(r))
  if (!regions.length) return
  const at = regions.map((r) => r.contains(document.activeElement)).lastIndexOf(true)
  const next = regions[(at === -1 ? (back ? regions.length - 1 : 0) : at + (back ? regions.length - 1 : 1)) % regions.length]
  focusItem(regionEntry(next))
}

function topLayer(): HTMLElement | null {
  const layers = [...document.querySelectorAll<HTMLElement>('.overlay')].filter(visible)
  return layers[layers.length - 1] ?? null
}

function menuTarget(): HTMLElement | null {
  const active = document.activeElement as HTMLElement | null
  if (!active || active === document.body) return document.querySelector<HTMLElement>('.repo-view:not([hidden]) .commit-row.selected')
  const descendant = active.getAttribute('aria-activedescendant')
  return (descendant && document.getElementById(descendant)) || active
}

export function openContextMenuFor(el: HTMLElement): void {
  const r = el.getBoundingClientRect()
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: Math.round(r.left + Math.min(16, r.width / 2)) || 1, clientY: Math.round(r.bottom) }))
}

export function useKeyboardShell(): void {
  useEffect(() => {
    let current: HTMLElement | null = null
    let previous: HTMLElement | null = null
    const returns = new Map<HTMLElement, HTMLElement | null>()

    const onFocusIn = (e: FocusEvent): void => {
      previous = current
      current = e.target as HTMLElement
    }

    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented) return
      const active = document.activeElement as HTMLElement | null
      if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
        const target = menuTarget()
        e.preventDefault()
        if (target && !ownsKeys(target)) openContextMenuFor(target)
        return
      }
      if (e.key === 'F6') {
        e.preventDefault()
        cycleRegion(e.shiftKey)
        return
      }
      if ((e.key === 'Enter' || e.key === ' ') && active && !e.altKey && !e.ctrlKey && !e.metaKey && active.matches(`[role="button"], [role="tab"], [role="option"], ${ITEM}`) && !active.matches('button, a, input, select, textarea')) {
        e.preventDefault()
        active.click()
        return
      }
      if (e.key === 'Tab') {
        const layer = topLayer()
        if (!layer) return
        const list = focusables(layer)
        if (!list.length) return
        const at = list.indexOf(active as HTMLElement)
        const wrap = at === -1 ? (e.shiftKey ? list.length - 1 : 0) : !e.shiftKey && at === list.length - 1 ? 0 : e.shiftKey && at === 0 ? list.length - 1 : null
        if (wrap === null) return
        e.preventDefault()
        list[wrap].focus()
      }
    }

    const layersIn = (node: Node): HTMLElement[] =>
      node instanceof HTMLElement ? (node.matches('.overlay') ? [node] : [...node.querySelectorAll<HTMLElement>('.overlay')]) : []
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        for (const node of r.addedNodes) {
          for (const layer of layersIn(node)) {
            const focusedInside = layer.contains(document.activeElement)
            returns.set(layer, focusedInside ? previous : current)
            if (!focusedInside) (layer.querySelector<HTMLElement>('[autofocus]') ?? focusables(layer)[0])?.focus()
          }
        }
        for (const node of r.removedNodes) {
          for (const layer of layersIn(node)) {
            const back = returns.get(layer)
            returns.delete(layer)
            const lost = !document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected
            if (back?.isConnected && lost) back.focus()
          }
        }
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('focusin', onFocusIn)
    window.addEventListener('keydown', onKey)
    return () => {
      observer.disconnect()
      window.removeEventListener('focusin', onFocusIn)
      window.removeEventListener('keydown', onKey)
    }
  }, [])
}
