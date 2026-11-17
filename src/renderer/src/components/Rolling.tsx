import { useEffect, useRef, useState } from 'react'
import { reducedMotion } from '../util'

const STEP_MS = 90
const MAX_STEPS = 6

export interface Rolling {
  shown: number
  falling: boolean
  visible: boolean
}

export function useRolling(value: number, scope: string): Rolling {
  const [state, setState] = useState({ shown: value, falling: false, scope })
  const last = useRef({ value, scope })
  useEffect(() => {
    const from = last.current
    last.current = { value, scope }
    if (from.scope !== scope || value >= from.value || reducedMotion()) {
      setState((s) => (s.shown === value && !s.falling && s.scope === scope ? s : { shown: value, falling: false, scope }))
      return
    }
    const stride = Math.ceil((from.value - value) / MAX_STEPS)
    let shown = from.value
    setState({ shown, falling: true, scope })
    const id = setInterval(() => {
      if (shown === value) {
        clearInterval(id)
        setState({ shown, falling: false, scope })
        return
      }
      shown = Math.max(value, shown - stride)
      setState({ shown, falling: true, scope })
    }, STEP_MS)
    return () => clearInterval(id)
  }, [value, scope])
  const current = state.scope === scope
  const shown = current ? state.shown : value
  const falling = current && state.falling
  return { shown, falling, visible: shown > 0 || falling }
}

export function Digits({ n, falling }: { n: number; falling: boolean }): React.JSX.Element {
  return (
    <span key={n} className={falling ? 'roll-down' : 'roll-up'}>
      {n}
    </span>
  )
}
