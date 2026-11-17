import { useCallback, useEffect, useState } from 'react'
import { useIsPresent } from 'motion/react'
import { Overlay } from './Overlay'
import type { CredentialSource, HostAccount, PullMode } from '@shared/types'
import { hostName } from '../util'
import { setFileView, useFileView } from '../fileView'
import { PULL_LABELS, SETTINGS_DEFAULTS, SETTINGS_LIMITS, setSettings, useSettings } from '../settings'
import { setTheme, THEMES, useTheme } from '../themes'
import { errorMessage } from '../util'
import { UpdateNotice } from './UpdateNotice'
import { Icon } from './Icon'

const VIA: Record<CredentialSource, string> = {
  token: 'personal access token',
  git: 'Git credential helper',
  gh: 'GitHub CLI',
  az: 'Azure CLI'
}

function Accounts({ onConnect }: { onConnect: () => void }): React.JSX.Element {
  const [accounts, setAccounts] = useState<HostAccount[]>([])

  const reload = useCallback(() => {
    window.host.accounts().then(setAccounts).catch(() => undefined)
  }, [])
  useEffect(() => {
    reload()
    window.addEventListener('bluegum:accounts-changed', reload)
    return () => window.removeEventListener('bluegum:accounts-changed', reload)
  }, [reload])

  return (
    <section className="settings-section">
      <h4>Accounts</h4>
      {accounts.length === 0 && <div className="empty">No hosting accounts connected</div>}
      {accounts.map((a) => (
        <div key={a.kind + a.baseUrl} className="settings-row account-row">
          <span>
            {hostName(a.kind)}
            <small>
              {a.baseUrl} · {a.user} · {VIA[a.source]}
              {a.source === 'token' && !a.encrypted ? ' (stored without OS encryption)' : ''}
            </small>
          </span>
          <button
            className="danger"
            onClick={() =>
              window.host.removeAccount(a.kind, a.baseUrl).then(() => {
                reload()
                window.dispatchEvent(new Event('bluegum:accounts-changed'))
              })
            }
          >
            Remove
          </button>
        </div>
      ))}
      <div className="settings-row">
        <button className="primary" onClick={onConnect}>
          Connect an account…
        </button>
      </div>
    </section>
  )
}

export function SettingsDialog({ onClose, onConnect }: { onClose: () => void; onConnect: () => void }): React.JSX.Element {
  const settings = useSettings()
  const theme = useTheme()
  const fileView = useFileView()
  const [gitPath, setGitPath] = useState(settings.gitPath)
  const [gitTest, setGitTest] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.native?.version().then(setVersion).catch(() => undefined)
  }, [])

  const present = useIsPresent()
  useEffect(() => {
    if (!present) return
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose, present])

  const applyGitPath = async (): Promise<void> => {
    const trimmed = gitPath.trim()
    setGitTest(null)
    setTesting(true)
    setSettings({ gitPath: trimmed })
    try {
      const v = await window.git.gitVersion()
      setGitTest(v.trim())
    } catch (e) {
      setGitTest(`Error: ${errorMessage(e)}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <Overlay onDismiss={onClose}>
      <div className="dialog settings-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <h3>Settings</h3>
          <span className="muted">Blue Gum {version}</span>
          <button className="icon" onClick={onClose} title="Close (Esc)" aria-label="Close">
            <Icon name="close" />
          </button>
        </div>

        <section className="settings-section">
          <h4>Appearance</h4>
          <label className="settings-row">
            <span>Theme</span>
            <select value={theme.id} onChange={(e) => setTheme(e.target.value)}>
              {[true, false].map((dark) => (
                <optgroup key={String(dark)} label={dark ? 'Dark' : 'Light'}>
                  {THEMES.filter((t) => t.dark === dark).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="settings-row">
            <span>Changed files</span>
            <select value={fileView} onChange={(e) => setFileView(e.target.value === 'flat' ? 'flat' : 'tree')}>
              <option value="tree">Folder tree</option>
              <option value="flat">Flat list</option>
            </select>
          </label>
          <label className="settings-row">
            <span>
              Author avatars in the graph
              <small>Pictures come from Gravatar and GitHub, looked up by a hash of each author's email</small>
            </span>
            <input type="checkbox" checked={settings.showAvatars} onChange={(e) => setSettings({ showAvatars: e.target.checked })} />
          </label>
          <label className="settings-row">
            <span>
              Commit body preview
              <small>Show the start of each commit's description after its subject</small>
            </span>
            <input type="checkbox" checked={settings.showBodyPreview} onChange={(e) => setSettings({ showBodyPreview: e.target.checked })} />
          </label>
        </section>

        <section className="settings-section">
          <h4>Repository</h4>
          <label className="settings-row">
            <span>
              Refresh every
              <small>How often the open repository is checked for changes</small>
            </span>
            <span className="unit">
              <input
                type="number"
                min={SETTINGS_LIMITS.pollInterval.min}
                max={SETTINGS_LIMITS.pollInterval.max}
                value={settings.pollInterval}
                onChange={(e) => setSettings({ pollInterval: Number(e.target.value) })}
              />
              seconds
            </span>
          </label>
          <label className="settings-row">
            <span>
              Check for incoming commits every
              <small>Fetches open repositories in the background; 0 turns it off</small>
            </span>
            <span className="unit">
              <input
                type="number"
                min={0}
                max={120}
                value={settings.backgroundFetch}
                onChange={(e) => setSettings({ backgroundFetch: Number(e.target.value) })}
              />
              minutes
            </span>
          </label>
          <label className="settings-row">
            <span>
              History limit
              <small>Most recent commits loaded into the graph</small>
            </span>
            <span className="unit">
              <input
                type="number"
                min={SETTINGS_LIMITS.logLimit.min}
                max={SETTINGS_LIMITS.logLimit.max}
                step={100}
                value={settings.logLimit}
                onChange={(e) => setSettings({ logLimit: Number(e.target.value) })}
              />
              commits
            </span>
          </label>
        </section>

        <section className="settings-section">
          <h4>Git</h4>
          <label className="settings-row">
            <span>
              Pull with
              <small>How Pull brings in commits when your branch and its upstream have both moved on. Rebase stashes your changes first.</small>
            </span>
            <select value={settings.pullMode} onChange={(e) => setSettings({ pullMode: e.target.value as PullMode })}>
              {(Object.keys(PULL_LABELS) as PullMode[]).map((m) => (
                <option key={m} value={m}>
                  {PULL_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="settings-row column">
            <span>
              Git executable
              <small>Leave empty to use the git on your PATH</small>
            </span>
            <span className="unit grow">
              <input
                value={gitPath}
                placeholder="git"
                spellCheck={false}
                onChange={(e) => setGitPath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void applyGitPath()
                }}
              />
              <button aria-busy={testing} disabled={testing} onClick={() => void applyGitPath()}>Apply &amp; test</button>
            </span>
          </label>
          {gitTest && <div className={`settings-note${gitTest.startsWith('Error') ? ' error' : ''}`}>{gitTest}</div>}
        </section>

        <Accounts onConnect={onConnect} />

        <section className="settings-section">
          <h4>Updates</h4>
          <label className="settings-row">
            <span>
              Check for updates automatically
              <small>On launch and every six hours</small>
            </span>
            <input
              type="checkbox"
              checked={settings.autoUpdate}
              onChange={(e) => setSettings({ autoUpdate: e.target.checked })}
            />
          </label>
          <div className="settings-row">
            <span className="update-slot"><UpdateNotice /></span>
            <button onClick={() => window.updater.check()}>Check now</button>
          </div>
        </section>

        <div className="buttons">
          <button
            onClick={() => {
              setSettings({ pollInterval: SETTINGS_DEFAULTS.pollInterval, logLimit: SETTINGS_DEFAULTS.logLimit, autoUpdate: true, gitPath: '' })
              setGitPath('')
              setGitTest(null)
              setFileView('tree')
              setTheme('bluegum-dark')
            }}
          >
            Reset to defaults
          </button>
          <button className="primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </Overlay>
  )
}
