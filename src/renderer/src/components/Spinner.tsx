export function Spinner({ label }: { label?: string }): React.JSX.Element {
  return <span className="spinner" role={label ? 'status' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />
}

const WIDTHS = [72, 54, 88, 40, 66, 80, 48, 60]

export function Skeleton({ lines = 4, code = false }: { lines?: number; code?: boolean }): React.JSX.Element {
  return (
    <div className={`skeleton${code ? ' code' : ''}`} role="status" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} style={{ width: `${WIDTHS[i % WIDTHS.length]}%` }} />
      ))}
    </div>
  )
}

export function Loading({ label = 'Loading…', className = 'center' }: { label?: string; className?: string }): React.JSX.Element {
  return (
    <div className={`${className} loading`} role="status">
      <Spinner />
      <span>{label}</span>
    </div>
  )
}
