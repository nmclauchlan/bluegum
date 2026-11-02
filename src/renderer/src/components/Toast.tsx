import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { copyToClipboard } from '../util'

export interface ToastState {
  id: number
  kind: 'error' | 'info'
  text: string
  title?: string
}

const LONG = 160

function headline(text: string): string {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const key = (lines.find((l) => /^(fatal|error):/i.test(l)) ?? lines[0] ?? '').replace(/^(fatal|error):\s*/i, '')
  return key.charAt(0).toUpperCase() + key.slice(1)
}

export function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [hovered, setHovered] = useState(false)
  const error = toast.kind === 'error'
  const long = error && (toast.text.trim().includes('\n') || toast.text.length > LONG)

  useEffect(() => {
    if (hovered || long) return
    const t = setTimeout(onClose, error ? 10_000 : 3000)
    return () => clearTimeout(t)
  }, [toast.id, hovered, long, error, onClose])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  if (!error) {
    return (
      <div className="toast info" role="status" onClick={onClose} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        {toast.text}
      </div>
    )
  }

  const copy = (): void => {
    void copyToClipboard(toast.title ? `${toast.title}\n\n${toast.text}` : toast.text).then(() => setCopied(true))
  }

  return (
    <div className="toast error" role="alert" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div className="toast-head">
        <Icon name="warning" size={14} />
        <strong>{toast.title ?? 'Something went wrong'}</strong>
        <button className="icon" title="Dismiss" aria-label="Dismiss" onClick={onClose}>
          <Icon name="close" size={13} />
        </button>
      </div>
      <div className="toast-summary">{headline(toast.text)}</div>
      {long && <pre className={`toast-details${expanded ? ' expanded' : ''}`}>{toast.text.trim()}</pre>}
      <div className="toast-actions">
        {long && <button onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : 'Show full output'}</button>}
        <button onClick={copy}>
          {copied ? <Icon name="check" size={13} /> : <Icon name="copy" size={13} />}
          {copied ? 'Copied' : 'Copy details'}
        </button>
      </div>
    </div>
  )
}
