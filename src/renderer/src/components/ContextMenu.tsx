import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './Icon'

const LayerContext = createContext<HTMLElement | null>(null)

export interface MenuItem {
  label?: string
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
  separator?: boolean
  items?: MenuItem[]
  hint?: string
  checked?: boolean
  icon?: IconName
}

export interface MenuState {
  x: number
  y: number
  items: MenuItem[]
  above?: boolean
}

function compact(items: MenuItem[]): MenuItem[] {
  const out: MenuItem[] = []
  for (const item of items) {
    if (item.separator && (!out.length || out[out.length - 1].separator)) continue
    if (item.items && !item.items.length) continue
    out.push(item)
  }
  while (out.length && out[out.length - 1].separator) out.pop()
  return out
}

function MenuList({
  items,
  onClose,
  nested,
  autoFocus,
  onBack
}: {
  items: MenuItem[]
  onClose: () => void
  nested?: boolean
  autoFocus?: boolean
  onBack?: () => void
}): React.JSX.Element {
  const [openSub, setOpenSub] = useState<{ index: number; focus: boolean } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const menu = useRef<HTMLDivElement>(null)
  const list = compact(items)
  const ticks = list.some((i) => i.checked !== undefined)
  const icons = !ticks && list.some((i) => i.icon)

  const enabled = (): HTMLElement[] => [...(menu.current?.querySelectorAll<HTMLElement>(':scope > [role^="menuitem"]:not([aria-disabled])') ?? [])]

  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => {
    if (!autoFocus) return
    const id = requestAnimationFrame(() => enabled()[0]?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hover = (i: number, hasSub: boolean): void => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpenSub(hasSub ? { index: i, focus: false } : null), hasSub ? 80 : 150)
  }

  const activate = (item: MenuItem, i: number, focus: boolean): void => {
    if (item.disabled) return
    if (item.items) {
      window.clearTimeout(timer.current)
      setOpenSub({ index: i, focus })
      return
    }
    onClose()
    item.onClick?.()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    e.stopPropagation()
    const items = enabled()
    const at = items.indexOf(document.activeElement as HTMLElement)
    const index = at === -1 ? -1 : Number(items[at].dataset.index)
    const move = (to: number): void => {
      e.preventDefault()
      items[(to + items.length) % items.length]?.focus({ preventScroll: true })
    }
    if (e.key === 'ArrowDown') move(at + 1)
    else if (e.key === 'ArrowUp') move(at === -1 ? -1 : at - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(-1)
    else if (e.key === 'Enter' || e.key === ' ' || (e.key === 'ArrowRight' && list[index]?.items)) {
      e.preventDefault()
      if (index !== -1) activate(list[index], index, true)
    } else if (e.key === 'ArrowLeft' || e.key === 'Escape') {
      e.preventDefault()
      if (nested) onBack?.()
      else if (e.key === 'Escape') onClose()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      onClose()
    } else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const ch = e.key.toLowerCase()
      const order = [...items.slice(at + 1), ...items.slice(0, at + 1)]
      const match = order.find((el) => (el.querySelector('.label')?.textContent ?? '').trim().toLowerCase().startsWith(ch))
      if (match) move(items.indexOf(match))
    }
  }

  return (
    <div ref={menu} className={`context-menu${nested ? ' nested' : ''}`} role="menu" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
      {list.map((item, i) =>
        item.separator ? (
          <div key={i} className="sep" role="separator" />
        ) : (
          <div
            key={i}
            data-index={i}
            tabIndex={-1}
            role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={item.checked}
            aria-haspopup={item.items ? 'menu' : undefined}
            aria-expanded={item.items ? openSub?.index === i : undefined}
            aria-disabled={item.disabled || undefined}
            className={`item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}${item.items ? ' has-sub' : ''}${openSub?.index === i ? ' sub-open' : ''}`}
            onMouseEnter={(e) => {
              if (!item.disabled) e.currentTarget.focus({ preventScroll: true })
              hover(i, !!item.items)
            }}
            onClick={() => activate(item, i, false)}
          >
            {ticks && (
              <span className="check" aria-hidden="true">
                {item.checked && <Icon name="check" size={13} />}
              </span>
            )}
            {icons && <span className="menu-icon">{item.icon && <Icon name={item.icon} size={14} />}</span>}
            <span className="label">{item.label}</span>
            {item.hint && <span className="hint">{item.hint}</span>}
            {item.items && (
              <span className="chev">
                <Icon name="chevronRight" size={12} />
              </span>
            )}
            {item.items && openSub?.index === i && (
              <Submenu
                items={item.items}
                onClose={onClose}
                index={i}
                autoFocus={openSub.focus}
                onBack={() => {
                  setOpenSub(null)
                  menu.current?.querySelector<HTMLElement>(`:scope > [data-index="${i}"]`)?.focus({ preventScroll: true })
                }}
              />
            )}
          </div>
        )
      )}
    </div>
  )
}

function Submenu({
  items,
  onClose,
  index,
  autoFocus,
  onBack
}: {
  items: MenuItem[]
  onClose: () => void
  index: number
  autoFocus: boolean
  onBack: () => void
}): React.JSX.Element | null {
  const layer = useContext(LayerContext)
  const anchor = useRef<HTMLSpanElement>(null)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const item = anchor.current?.parentElement
    const menu = ref.current?.firstElementChild as HTMLElement | null
    if (!item || !menu) return
    const r = item.getBoundingClientRect()
    const w = menu.offsetWidth
    const h = menu.offsetHeight
    let left = r.right - 2
    if (left + w > window.innerWidth - 4) left = Math.max(4, r.left - w + 2)
    let top = r.top - 5
    if (top + h > window.innerHeight - 4) top = Math.max(4, window.innerHeight - 4 - h)
    setPos({ left, top })
  }, [index])

  return (
    <span ref={anchor} className="submenu-anchor-point">
      {layer &&
        createPortal(
          <div
            ref={ref}
            className="submenu-layer"
            style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <MenuList items={items} onClose={onClose} nested autoFocus={autoFocus} onBack={onBack} />
          </div>,
          layer
        )}
    </span>
  )
}

export function ContextMenu({ menu, onClose }: { menu: MenuState | null; onClose: () => void }): React.JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [layer, setLayer] = useState<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    if (!menu || !ref.current) return
    const el = ref.current.firstElementChild as HTMLElement | null
    const rect = (el ?? ref.current).getBoundingClientRect()
    const x = Math.max(4, Math.min(menu.x, window.innerWidth - rect.width - 4))
    const y = Math.max(4, Math.min(menu.above ? menu.y - rect.height - 4 : menu.y, window.innerHeight - rect.height - 4))
    setPos({ x, y })
  }, [menu])

  useLayoutEffect(() => {
    if (!menu) return
    const returnTo = document.activeElement as HTMLElement | null
    return () => {
      const now = document.activeElement
      if (returnTo?.isConnected && (!now || now === document.body || !now.isConnected || now.closest('.context-menu-root, .context-menu-layer'))) returnTo.focus({ preventScroll: true })
    }
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const close = (): void => onClose()
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', key)
    }
  }, [menu, onClose])

  if (!menu) return null
  return (
    <>
      <div ref={ref} className="context-menu-root" style={{ left: pos.x, top: pos.y }}>
        <LayerContext.Provider value={layer}>
          <MenuList key={`${menu.x},${menu.y}`} items={menu.items} onClose={onClose} autoFocus />
        </LayerContext.Provider>
      </div>
      <div ref={setLayer} className="context-menu-layer" onMouseDown={(e) => e.stopPropagation()} />
    </>
  )
}
