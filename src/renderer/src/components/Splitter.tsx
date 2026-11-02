import { useCallback } from 'react'

export function Splitter({
  direction,
  value,
  onChange,
  invert,
  onReset,
  className = '',
  label
}: {
  direction: 'vertical' | 'horizontal'
  value: number
  onChange: (value: number) => void
  invert?: boolean
  onReset?: () => void
  className?: string
  label?: string
}): React.JSX.Element {
  const start = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const origin = direction === 'vertical' ? e.clientX : e.clientY
      const base = value
      document.body.style.cursor = direction === 'vertical' ? 'col-resize' : 'row-resize'
      document.body.classList.add('resizing')
      const move = (ev: MouseEvent): void => {
        const delta = (direction === 'vertical' ? ev.clientX : ev.clientY) - origin
        onChange(base + (invert ? -delta : delta))
      }
      const up = (): void => {
        document.body.style.cursor = ''
        document.body.classList.remove('resizing')
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
      }
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
    },
    [direction, value, onChange, invert]
  )
  const onKeyDown = (e: React.KeyboardEvent): void => {
    const [less, more] = direction === 'vertical' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown']
    const step = e.shiftKey ? 80 : 16
    if (e.key === less || e.key === more) {
      e.preventDefault()
      e.stopPropagation()
      const delta = (e.key === more ? step : -step) * (invert ? -1 : 1)
      onChange(value + delta)
    } else if (e.key === 'Enter' && onReset) {
      e.preventDefault()
      onReset()
    }
  }
  return (
    <div
      className={`splitter ${direction} ${className}`.trim()}
      role="separator"
      aria-orientation={direction}
      aria-label={label}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      onMouseDown={start}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    />
  )
}
