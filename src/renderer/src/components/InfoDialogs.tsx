import { useEffect, useState } from 'react'
import { BrandIcon } from './BrandIcon'

function useEscape(onClose: () => void): void {
  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
}

export function AboutDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [v, setV] = useState<{ app: string; electron: string; chrome: string; node: string; platform: string } | null>(null)
  useEffect(() => {
    window.native?.versions().then(setV).catch(() => undefined)
  }, [])
  useEscape(onClose)
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog about-dialog" role="dialog" aria-label="About Blue Gum" onMouseDown={(e) => e.stopPropagation()}>
        <div className="about-brand">
          <BrandIcon size={64} />
          <div>
            <h3>Blue Gum</h3>
            <p className="muted">A clearer view of every branch.</p>
          </div>
        </div>
        <table className="about-table">
          <tbody>
            <tr><td>Version</td><td>{v?.app ?? '…'}</td></tr>
            <tr><td>Electron</td><td>{v?.electron ?? '…'}</td></tr>
            <tr><td>Chromium</td><td>{v?.chrome ?? '…'}</td></tr>
            <tr><td>Node</td><td>{v?.node ?? '…'}</td></tr>
            <tr><td>Platform</td><td>{v?.platform ?? '…'}</td></tr>
          </tbody>
        </table>
        <div className="buttons">
          <button onClick={() => window.open('https://github.com/nmclauchlan/arbor')}>GitHub</button>
          <button className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

const SHORTCUTS: [string, [string, string][]][] = [
  [
    'Anywhere',
    [
      ['Ctrl+Shift+P', 'Command palette: run any action, check out or merge a branch'],
      ['Ctrl+P', 'Go to a repository'],
      ['Ctrl+T', 'Repository Management'],
      ['Ctrl+O', 'Open a repository'],
      ['Ctrl+W', 'Close the current tab'],
      ['Ctrl+Tab / Ctrl+Shift+Tab', 'Next / previous tab'],
      ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo the last git action'],
      ['Ctrl+B', 'Filter branches'],
      ['Ctrl+F', 'Search commits'],
      ['Ctrl+, ', 'Settings'],
      ['Ctrl+= / Ctrl+- / Ctrl+0', 'Zoom in / out / reset'],
      ['F11', 'Full screen'],
      ['Esc', 'Back to the graph, close menus and dialogs']
    ]
  ],
  [
    'Moving around',
    [
      ['F6 / Shift+F6', 'Next / previous area: tabs, toolbar, branches, graph, details, status bar'],
      ['Tab / Shift+Tab', 'Next / previous control'],
      ['F10 or Alt', 'Menu bar; Alt+F, Alt+E, Alt+V or Alt+H opens that menu'],
      ['Shift+F10 or Menu key', 'Actions for the focused item, or the selected commit'],
      ['↑ / ↓, Home / End', 'Move through lists, menus and the graph'],
      ['← / →', 'Collapse / expand sections and folders; move between tabs'],
      ['Enter', 'Open the focused item; from the graph, go to its changed files'],
      ['← / → on a divider', 'Resize the panel; Shift for bigger steps'],
      ['J / K, Page Up / Page Down', 'Move through the commit graph'],
      ['Home / End', 'Jump to the newest / oldest loaded commit']
    ]
  ],
  [
    'Changes',
    [
      ['Space', 'Stage or unstage the focused or open file and move to the next one'],
      ['Delete', 'Discard changes to the focused file'],
      ['↑ / ↓ then Space in a diff', 'Select lines to stage, unstage or discard; Shift extends the selection'],
      ['Enter', 'From the commit summary, move to the description'],
      ['Ctrl+Enter', 'Commit'],
      ['Ctrl+S', 'Save the file being edited']
    ]
  ],
  [
    'Tabs',
    [
      ['Delete', 'Close the focused tab'],
      ['Ctrl+Shift+← / →', 'Move the focused tab']
    ]
  ]
]

export function ShortcutsDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  useEscape(onClose)
  const mac = window.native?.platform === 'darwin'
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog shortcuts-dialog" role="dialog" aria-label="Keyboard shortcuts" onMouseDown={(e) => e.stopPropagation()}>
        <h3>Keyboard shortcuts</h3>
        <div className="shortcuts-scroll" tabIndex={0}>
          <table className="about-table">
            {SHORTCUTS.map(([section, keys]) => (
              <tbody key={section}>
                <tr>
                  <th colSpan={2}>{section}</th>
                </tr>
                {keys.map(([k, d]) => (
                  <tr key={k + d}>
                    <td><kbd>{mac ? k.replace(/Ctrl\+/g, '⌘') : k}</kbd></td>
                    <td>{d}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
        <div className="buttons">
          <button className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
