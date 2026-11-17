import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, useIsPresent } from 'motion/react'
import { Overlay } from './Overlay'

type DialogState = { id: number } & (
  | { kind: 'prompt'; title: string; label: string; value: string; resolve: (v: string | null) => void }
  | { kind: 'confirm'; title: string; message: string; danger: boolean; resolve: (ok: boolean) => void }
  | { kind: 'choose'; title: string; message: string; options: Choice[]; resolve: (id: string | null) => void }
)

export interface Choice {
  id: string
  label: string
  primary?: boolean
}

let nextId = 0

export interface Dialogs {
  prompt(title: string, label: string, defaultValue?: string): Promise<string | null>
  confirm(title: string, message: string, danger?: boolean): Promise<boolean>
  choose(title: string, message: string, options: Choice[]): Promise<string | null>
  element: React.JSX.Element
}

export function useDialogs(): Dialogs {
  const [state, setState] = useState<DialogState | null>(null)

  const prompt = useCallback(
    (title: string, label: string, defaultValue = '') =>
      new Promise<string | null>((resolve) => setState({ id: ++nextId, kind: 'prompt', title, label, value: defaultValue, resolve })),
    []
  )
  const confirm = useCallback(
    (title: string, message: string, danger = false) =>
      new Promise<boolean>((resolve) => setState({ id: ++nextId, kind: 'confirm', title, message, danger, resolve })),
    []
  )
  const choose = useCallback(
    (title: string, message: string, options: Choice[]) =>
      new Promise<string | null>((resolve) => setState({ id: ++nextId, kind: 'choose', title, message, options, resolve })),
    []
  )

  const close = (): void => setState(null)

  const element = <AnimatePresence mode="wait">{state && <DialogView key={state.id} state={state} close={close} setState={setState} />}</AnimatePresence>
  return { prompt, confirm, choose, element }
}

function DialogView({
  state,
  close,
  setState
}: {
  state: DialogState
  close: () => void
  setState: (s: DialogState) => void
}): React.JSX.Element {
  const cancel = (): void => {
    if (state.kind === 'confirm') state.resolve(false)
    else state.resolve(null)
    close()
  }
  const ok = (): void => {
    if (state.kind === 'prompt') {
      if (!state.value.trim()) return
      state.resolve(state.value.trim())
    } else if (state.kind === 'confirm') state.resolve(true)
    else return
    close()
  }

  const present = useIsPresent()
  useEffect(() => {
    if (!present) return
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') cancel()
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) ok()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  return (
    <Overlay onDismiss={cancel}>
      <div
        className={state.kind === 'choose' ? 'dialog choose-dialog' : 'dialog'}
        role={state.kind === 'prompt' ? 'dialog' : 'alertdialog'}
        aria-label={state.title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3>{state.title}</h3>
        {state.kind === 'prompt' ? (
          <>
            <p>{state.label}</p>
            <input
              autoFocus
              value={state.value}
              onChange={(e) => setState({ ...state, value: e.target.value })}
            />
          </>
        ) : (
          <p>{state.message}</p>
        )}
        {state.kind === 'choose' && (
          <div className="choices">
            {state.options.map((o) => (
              <button
                key={o.id}
                className={o.primary ? 'primary' : undefined}
                autoFocus={o.primary}
                onClick={() => {
                  state.resolve(o.id)
                  close()
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
        <div className="buttons">
          <button onClick={cancel}>Cancel</button>
          {state.kind !== 'choose' && (
            <button className={state.kind === 'confirm' && state.danger ? 'danger' : 'primary'} autoFocus={state.kind === 'confirm'} onClick={ok}>
              OK
            </button>
          )}
        </div>
      </div>
    </Overlay>
  )
}
