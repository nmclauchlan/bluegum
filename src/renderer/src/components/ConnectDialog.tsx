import { useEffect, useState } from 'react'
import { useIsPresent } from 'motion/react'
import type { ExternalSource, HostAccount, HostKind, SignInOptions } from '@shared/types'
import { errorMessage, hostName } from '../util'
import { Overlay } from './Overlay'
import { Spinner } from './Spinner'

export interface ConnectRequest {
  kind?: HostKind
  baseUrl?: string
}

const KINDS: HostKind[] = ['github', 'azure', 'gitlab']
const LOOKUP_DELAY_MS = 400

const DEFAULT_ADDRESS: Record<HostKind, string> = { github: 'https://github.com', gitlab: 'https://gitlab.com', azure: '' }

const TOKEN_HINT: Record<HostKind, string> = {
  github: 'The repo and read:org scopes are already ticked on that page.',
  gitlab: 'The api scope is already ticked on that page.',
  azure: 'Give it Code (Read & write) and Build (Read) access.'
}

function baseUrlFor(kind: HostKind, address: string): string | null {
  const value = address.trim().replace(/\/+$/, '')
  if (kind === 'azure') {
    if (/^[\w.-]+$/.test(value)) return `https://dev.azure.com/${value}`
    return /^https:\/\/dev\.azure\.com\/[^/\s]+$|^https:\/\/[^./\s]+\.visualstudio\.com$/i.test(value) ? value : null
  }
  return /^https:\/\/[^/\s]+$/i.test(value) ? value : null
}

export function tokenPage(kind: HostKind, baseUrl: string): string {
  if (kind === 'github') return `${baseUrl}/settings/tokens/new?scopes=repo,read:org&description=Blue%20Gum`
  if (kind === 'gitlab') return `${baseUrl}/-/user_settings/personal_access_tokens?name=Blue%20Gum&scopes=api`
  return `${baseUrl}/_usersSettings/tokens`
}

function sourceName(source: ExternalSource, gcm: boolean): string {
  if (source === 'gh') return 'the GitHub CLI'
  if (source === 'az') return 'the Azure CLI'
  return gcm ? 'Git Credential Manager' : 'your Git credential helper'
}

export function ConnectDialog({
  request,
  onClose,
  onConnected
}: {
  request: ConnectRequest
  onClose: () => void
  onConnected: (account: HostAccount) => void
}): React.JSX.Element {
  const [kind, setKind] = useState<HostKind | null>(request.kind ?? null)
  const [address, setAddress] = useState(request.baseUrl ?? (request.kind ? DEFAULT_ADDRESS[request.kind] : ''))
  const [options, setOptions] = useState<SignInOptions | null>(null)
  const [looking, setLooking] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState('')
  const present = useIsPresent()
  const baseUrl = kind ? baseUrlFor(kind, address) : null

  useEffect(() => {
    if (!present) return
    const key = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      if (!busy) onClose()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose, present, busy])

  useEffect(() => {
    setOptions(null)
    if (!kind || !baseUrl) return
    let cancelled = false
    setLooking(true)
    const timer = setTimeout(() => {
      window.host
        .signInOptions(kind, baseUrl)
        .then((found) => !cancelled && setOptions(found))
        .catch(() => !cancelled && setOptions({ found: [], browser: false }))
        .finally(() => !cancelled && setLooking(false))
    }, LOOKUP_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
      setLooking(false)
    }
  }, [kind, baseUrl])

  const pick = (k: HostKind): void => {
    setKind(k)
    setAddress(request.kind === k && request.baseUrl ? request.baseUrl : DEFAULT_ADDRESS[k])
    setError(null)
  }

  const attempt = async (label: string, connect: () => Promise<HostAccount>): Promise<void> => {
    setBusy(label)
    setError(null)
    try {
      onConnected(await connect())
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const found = options?.found ?? []
  const gcm = options?.browser ?? false
  const browse = gcm && !found.some((o) => o.source === 'git')
  const name = kind ? hostName(kind) : ''

  return (
    <Overlay onDismiss={() => !busy && onClose()}>
      <div className="dialog connect-dialog" role="dialog" aria-label="Connect an account" onMouseDown={(e) => e.stopPropagation()}>
        <h3>Connect an account</h3>
        <p>Blue Gum uses your account to show pull requests and builds, and to list repositories you can clone.</p>
        <div className="connect-hosts" role="radiogroup" aria-label="Service">
          {KINDS.map((k) => (
            <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'selected' : undefined} disabled={!!busy} onClick={() => pick(k)}>
              {hostName(k)}
            </button>
          ))}
        </div>
        {kind && (
          <>
            <label className="connect-field">
              <span>{kind === 'azure' ? 'Organisation' : 'Server'}</span>
              <input
                value={address}
                spellCheck={false}
                disabled={!!busy}
                placeholder={kind === 'azure' ? 'my-org or https://dev.azure.com/my-org' : DEFAULT_ADDRESS[kind]}
                onChange={(e) => setAddress(e.target.value)}
              />
            </label>
            {baseUrl && (
              <>
                <section className="connect-option" aria-label="Sign in">
                  <h4>Sign in</h4>
                  {looking && !options ? (
                    <div className="connect-looking muted">
                      <Spinner /> Looking for sign-ins on this computer…
                    </div>
                  ) : (
                    <>
                      {found.map((o) => (
                        <div key={o.source} className="connect-found">
                          <span>
                            {o.user}
                            <small className="muted">from {sourceName(o.source, gcm)}</small>
                          </span>
                          <button
                            className="primary"
                            disabled={!!busy}
                            aria-busy={busy === o.source}
                            onClick={() => void attempt(o.source, () => window.host.connectSignIn(kind, baseUrl, o.source))}
                          >
                            Use this sign-in
                          </button>
                        </div>
                      ))}
                      {browse && (
                        <div className="connect-found">
                          <span>
                            {found.length ? 'A different account' : `Sign in to ${name}`}
                            <small className="muted">Git Credential Manager opens the sign-in page. Git uses the same sign-in for push and pull.</small>
                          </span>
                          <button
                            className={found.length ? undefined : 'primary'}
                            disabled={!!busy}
                            aria-busy={busy === 'browser'}
                            onClick={() => void attempt('browser', () => window.host.browserSignIn(kind, baseUrl))}
                          >
                            {busy === 'browser' ? 'Waiting for sign-in…' : 'Sign in with browser'}
                          </button>
                        </div>
                      )}
                      {!found.length && !browse && <p className="muted">No sign-in for {name} found on this computer. Use a personal access token instead.</p>}
                    </>
                  )}
                </section>
                <details className="connect-option" open={!!options && !found.length && !browse}>
                  <summary>Use a personal access token</summary>
                  <ol>
                    <li>
                      <a href={tokenPage(kind, baseUrl)} target="_blank" rel="noreferrer">
                        Create a token on {name}
                      </a>
                      . {TOKEN_HINT[kind]}
                    </li>
                    <li>Paste it here.</li>
                  </ol>
                  <div className="connect-token">
                    <input
                      type="password"
                      value={token}
                      placeholder="Personal access token"
                      aria-label="Personal access token"
                      disabled={!!busy}
                      onChange={(e) => setToken(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && token.trim()) void attempt('token', () => window.host.addAccount(kind, baseUrl, token))
                      }}
                    />
                    <button
                      className="primary"
                      disabled={!!busy || !token.trim()}
                      aria-busy={busy === 'token'}
                      onClick={() => void attempt('token', () => window.host.addAccount(kind, baseUrl, token))}
                    >
                      Connect
                    </button>
                  </div>
                </details>
              </>
            )}
          </>
        )}
        {error && <div className="settings-note error">{error}</div>}
        <div className="buttons">
          <button onClick={onClose} disabled={!!busy && busy !== 'browser'}>
            Cancel
          </button>
        </div>
      </div>
    </Overlay>
  )
}
