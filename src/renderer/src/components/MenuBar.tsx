import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

export type MenuEntry =
  | { label: string; shortcut?: string; onSelect: () => void; disabled?: boolean; checked?: boolean }
  | { separator: true }

export interface MenuDef {
  label: string
  items: MenuEntry[]
}

export function MenuBar({ menus }: { menus: MenuDef[] }): React.JSX.Element {
  const [open, setOpen] = useState<{ index: number; focus: 'first' | 'last' | null } | null>(null)
  const ref = useRef<HTMLElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)

  const tops = (): HTMLElement[] => [...(ref.current?.querySelectorAll<HTMLElement>('.menubar-item > button') ?? [])]
  const entries = (): HTMLElement[] => [...(ref.current?.querySelectorAll<HTMLElement>('.menubar-dropdown .menubar-entry:not(:disabled)') ?? [])]

  const enter = (index: number, menu: 'first' | null): void => {
    const active = document.activeElement as HTMLElement | null
    if (!ref.current?.contains(active)) returnTo.current = active
    tops()[index]?.focus()
    setOpen(menu ? { index, focus: menu } : null)
  }

  const leave = (): void => {
    setOpen(null)
    const back = returnTo.current
    returnTo.current = null
    if (!ref.current?.contains(document.activeElement)) return
    if (back?.isConnected && back !== document.body) back.focus()
    else (document.activeElement as HTMLElement).blur()
  }

  useEffect(() => {
    if (!open?.focus) return
    const list = entries()
    list[open.focus === 'first' ? 0 : list.length - 1]?.focus()
  }, [open])

  useEffect(() => {
    let altAlone = false
    const down = (e: KeyboardEvent): void => {
      altAlone = e.key === 'Alt' && !e.ctrlKey && !e.shiftKey && !e.metaKey
      if (e.defaultPrevented || document.querySelector('.overlay')) return
      if (e.key === 'F10' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        if (ref.current?.contains(document.activeElement)) leave()
        else enter(0, null)
      } else if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
        const index = menus.findIndex((m) => m.label[0].toLowerCase() === e.key.toLowerCase())
        if (index === -1) return
        e.preventDefault()
        enter(index, 'first')
      }
    }
    const up = (e: KeyboardEvent): void => {
      if (e.key !== 'Alt' || !altAlone) return
      altAlone = false
      e.preventDefault()
      if (document.querySelector('.overlay')) return
      if (ref.current?.contains(document.activeElement)) leave()
      else enter(0, null)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  })

  useEffect(() => {
    if (open === null) return
    const down = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null)
    }
    const blur = (): void => setOpen(null)
    window.addEventListener('mousedown', down)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('mousedown', down)
      window.removeEventListener('blur', blur)
    }
  }, [open])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const list = tops()
    const at = list.findIndex((b) => b.parentElement?.contains(document.activeElement))
    if (at === -1) return
    const inMenu = entries().includes(document.activeElement as HTMLElement)
    const step = (dir: number): void => {
      const next = (at + dir + list.length) % list.length
      list[next].focus()
      if (open) setOpen({ index: next, focus: 'first' })
    }
    let handled = true
    if (e.key === 'ArrowRight') step(1)
    else if (e.key === 'ArrowLeft') step(-1)
    else if (e.key === 'Escape') {
      if (open) {
        setOpen(null)
        list[at].focus()
      } else leave()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      leave()
    } else if (!inMenu && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) setOpen({ index: at, focus: 'first' })
    else if (!inMenu && e.key === 'ArrowUp') setOpen({ index: at, focus: 'last' })
    else if (inMenu && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End')) {
      const items = entries()
      const i = items.indexOf(document.activeElement as HTMLElement)
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      items[next]?.focus()
    } else handled = false
    if (handled) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  return (
    <nav className="menubar" ref={ref} role="menubar" aria-label="Application menu" onKeyDown={onKeyDown}>
      {menus.map((m, i) => (
        <div key={m.label} className="menubar-item">
          <button
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open?.index === i}
            aria-keyshortcuts={`Alt+${m.label[0]}`}
            tabIndex={-1}
            className={open?.index === i ? 'open' : ''}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen((cur) => (cur?.index === i ? null : { index: i, focus: null }))}
            onMouseEnter={() => setOpen((cur) => (cur === null ? cur : { index: i, focus: null }))}
          >
            <span className="mnemonic">{m.label[0]}</span>
            {m.label.slice(1)}
          </button>
          {open?.index === i && (
            <div className="menubar-dropdown" role="menu" aria-label={m.label}>
              {m.items.map((item, k) =>
                'separator' in item ? (
                  <div key={k} className="sep" role="separator" />
                ) : (
                  <button
                    key={k}
                    role="menuitem"
                    tabIndex={-1}
                    className="menubar-entry"
                    disabled={item.disabled}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={(e) => e.currentTarget.focus({ preventScroll: true })}
                    onClick={() => {
                      leave()
                      item.onSelect()
                    }}
                  >
                    <span className="check">{item.checked && <Icon name="check" size={13} />}</span>
                    <span className="label">{item.label}</span>
                    {item.shortcut && <span className="shortcut">{item.shortcut}</span>}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </nav>
  )
}
