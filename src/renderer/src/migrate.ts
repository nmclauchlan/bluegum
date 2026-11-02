const LEGACY = 'arbor.'
const PREFIX = 'bluegum.'
const THEMES: Record<string, string> = { 'arbor-dark': 'bluegum-dark', 'arbor-light': 'bluegum-light' }

try {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(LEGACY)) continue
    const target = PREFIX + key.slice(LEGACY.length)
    const value = localStorage.getItem(key)
    if (value !== null && localStorage.getItem(target) === null) localStorage.setItem(target, THEMES[value] ?? value)
    localStorage.removeItem(key)
  }
} catch {
  /* storage unavailable */
}
