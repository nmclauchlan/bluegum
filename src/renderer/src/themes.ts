import { useSyncExternalStore } from 'react'

export interface Theme {
  id: string
  name: string
  dark: boolean
  vars: Record<string, string>
}

const KEY = 'arbor.theme'

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// White stays on mid-tone accents; only accents too light for it switch to dark text.
function textOn(background: string, darkText: string): string {
  return 1.05 / (luminance(background) + 0.05) < 2.5 ? darkText : '#fff'
}

function palette(
  dark: boolean,
  bg: [string, string, string, string],
  border: string,
  fg: [string, string, string],
  accent: [string, string],
  colors: { green: string; red: string; yellow: string; purple: string },
  syntax: Record<string, string>
): Record<string, string> {
  return {
    bg: bg[0], 'bg-2': bg[1], 'bg-3': bg[2], 'bg-4': bg[3],
    border,
    fg: fg[0], 'fg-dim': fg[1], 'fg-faint': fg[2],
    accent: accent[0], 'accent-2': accent[1], 'on-accent': textOn(accent[0], dark ? bg[0] : fg[0]),
    green: colors.green, red: colors.red, yellow: colors.yellow, purple: colors.purple,
    'add-bg': dark ? 'rgba(88, 195, 107, 0.14)' : 'rgba(46, 160, 67, 0.15)',
    'del-bg': dark ? 'rgba(232, 83, 74, 0.14)' : 'rgba(207, 34, 46, 0.14)',
    'select-bg': dark ? 'rgba(62, 156, 240, 0.18)' : 'rgba(9, 105, 218, 0.14)',
    ...syntax
  }
}

export const THEMES: Theme[] = [
  {
    id: 'arbor-dark', name: 'Arbor Dark', dark: true,
    vars: palette(true, ['#1b1d23', '#22252c', '#2a2e37', '#343945'], '#30343d', ['#d7dae0', '#8b909c', '#5d626d'], ['#3e9cf0', '#2f7fc9'],
      { green: '#58c36b', red: '#e8534a', yellow: '#f1a33c', purple: '#b16df5' },
      { 'syn-keyword': '#c678dd', 'syn-string': '#98c379', 'syn-comment': '#6b717d', 'syn-number': '#d19a66', 'syn-type': '#e5c07b', 'syn-function': '#61afef', 'syn-property': '#e06c75', 'syn-tag': '#e06c75', 'syn-operator': '#56b6c2' })
  },
  {
    id: 'midnight', name: 'Midnight', dark: true,
    vars: palette(true, ['#0d1117', '#161b22', '#21262d', '#30363d'], '#30363d', ['#e6edf3', '#8b949e', '#6e7681'], ['#58a6ff', '#388bfd'],
      { green: '#3fb950', red: '#f85149', yellow: '#d29922', purple: '#bc8cff' },
      { 'syn-keyword': '#ff7b72', 'syn-string': '#a5d6ff', 'syn-comment': '#8b949e', 'syn-number': '#79c0ff', 'syn-type': '#ffa657', 'syn-function': '#d2a8ff', 'syn-property': '#79c0ff', 'syn-tag': '#7ee787', 'syn-operator': '#ff7b72' })
  },
  {
    id: 'one-dark', name: 'One Dark', dark: true,
    vars: palette(true, ['#282c34', '#21252b', '#2c313a', '#3e4451'], '#3a3f4b', ['#abb2bf', '#7f848e', '#5c6370'], ['#61afef', '#4d96d6'],
      { green: '#98c379', red: '#e06c75', yellow: '#e5c07b', purple: '#c678dd' },
      { 'syn-keyword': '#c678dd', 'syn-string': '#98c379', 'syn-comment': '#5c6370', 'syn-number': '#d19a66', 'syn-type': '#e5c07b', 'syn-function': '#61afef', 'syn-property': '#e06c75', 'syn-tag': '#e06c75', 'syn-operator': '#56b6c2' })
  },
  {
    id: 'dracula', name: 'Dracula', dark: true,
    vars: palette(true, ['#282a36', '#21222c', '#343746', '#44475a'], '#44475a', ['#f8f8f2', '#a7abbe', '#6272a4'], ['#bd93f9', '#a97ee8'],
      { green: '#50fa7b', red: '#ff5555', yellow: '#f1fa8c', purple: '#ff79c6' },
      { 'syn-keyword': '#ff79c6', 'syn-string': '#f1fa8c', 'syn-comment': '#6272a4', 'syn-number': '#bd93f9', 'syn-type': '#8be9fd', 'syn-function': '#50fa7b', 'syn-property': '#66d9ef', 'syn-tag': '#ff79c6', 'syn-operator': '#ff79c6' })
  },
  {
    id: 'tokyo-night', name: 'Tokyo Night', dark: true,
    vars: palette(true, ['#1a1b26', '#16161e', '#24283b', '#2f3549'], '#292e42', ['#c0caf5', '#8089b3', '#565f89'], ['#7aa2f7', '#5d84d6'],
      { green: '#9ece6a', red: '#f7768e', yellow: '#e0af68', purple: '#bb9af7' },
      { 'syn-keyword': '#bb9af7', 'syn-string': '#9ece6a', 'syn-comment': '#565f89', 'syn-number': '#ff9e64', 'syn-type': '#2ac3de', 'syn-function': '#7aa2f7', 'syn-property': '#73daca', 'syn-tag': '#f7768e', 'syn-operator': '#89ddff' })
  },
  {
    id: 'catppuccin-mocha', name: 'Catppuccin Mocha', dark: true,
    vars: palette(true, ['#1e1e2e', '#181825', '#313244', '#45475a'], '#313244', ['#cdd6f4', '#a6adc8', '#6c7086'], ['#89b4fa', '#74a0e8'],
      { green: '#a6e3a1', red: '#f38ba8', yellow: '#f9e2af', purple: '#cba6f7' },
      { 'syn-keyword': '#cba6f7', 'syn-string': '#a6e3a1', 'syn-comment': '#7f849c', 'syn-number': '#fab387', 'syn-type': '#f9e2af', 'syn-function': '#89b4fa', 'syn-property': '#94e2d5', 'syn-tag': '#f38ba8', 'syn-operator': '#89dceb' })
  },
  {
    id: 'nord', name: 'Nord', dark: true,
    vars: palette(true, ['#2e3440', '#3b4252', '#434c5e', '#4c566a'], '#4c566a', ['#eceff4', '#aab1be', '#7b8494'], ['#88c0d0', '#81a1c1'],
      { green: '#a3be8c', red: '#bf616a', yellow: '#ebcb8b', purple: '#b48ead' },
      { 'syn-keyword': '#81a1c1', 'syn-string': '#a3be8c', 'syn-comment': '#7b8494', 'syn-number': '#b48ead', 'syn-type': '#8fbcbb', 'syn-function': '#88c0d0', 'syn-property': '#d8dee9', 'syn-tag': '#81a1c1', 'syn-operator': '#81a1c1' })
  },
  {
    id: 'solarized-dark', name: 'Solarized Dark', dark: true,
    vars: palette(true, ['#002b36', '#073642', '#0b4552', '#15545f'], '#15545f', ['#eee8d5', '#93a1a1', '#657b83'], ['#268bd2', '#1f78b8'],
      { green: '#859900', red: '#dc322f', yellow: '#b58900', purple: '#6c71c4' },
      { 'syn-keyword': '#859900', 'syn-string': '#2aa198', 'syn-comment': '#657b83', 'syn-number': '#d33682', 'syn-type': '#b58900', 'syn-function': '#268bd2', 'syn-property': '#93a1a1', 'syn-tag': '#268bd2', 'syn-operator': '#859900' })
  },
  {
    id: 'gruvbox', name: 'Gruvbox Dark', dark: true,
    vars: palette(true, ['#282828', '#32302f', '#3c3836', '#504945'], '#504945', ['#ebdbb2', '#a89984', '#7c6f64'], ['#83a598', '#689d6a'],
      { green: '#b8bb26', red: '#fb4934', yellow: '#fabd2f', purple: '#d3869b' },
      { 'syn-keyword': '#fb4934', 'syn-string': '#b8bb26', 'syn-comment': '#928374', 'syn-number': '#d3869b', 'syn-type': '#fabd2f', 'syn-function': '#8ec07c', 'syn-property': '#83a598', 'syn-tag': '#8ec07c', 'syn-operator': '#fe8019' })
  },
  {
    id: 'everforest', name: 'Everforest Dark', dark: true,
    vars: palette(true, ['#2d353b', '#343f44', '#3d484d', '#475258'], '#475258', ['#d3c6aa', '#9da9a0', '#7a8478'], ['#a7c080', '#8fae6a'],
      { green: '#a7c080', red: '#e67e80', yellow: '#dbbc7f', purple: '#d699b6' },
      { 'syn-keyword': '#e67e80', 'syn-string': '#a7c080', 'syn-comment': '#859289', 'syn-number': '#d699b6', 'syn-type': '#dbbc7f', 'syn-function': '#83c092', 'syn-property': '#7fbbb3', 'syn-tag': '#e69875', 'syn-operator': '#e69875' })
  },
  {
    id: 'monokai', name: 'Monokai', dark: true,
    vars: palette(true, ['#272822', '#1e1f1c', '#32332b', '#3e3f37'], '#3e3f37', ['#f8f8f2', '#a6a69c', '#75715e'], ['#66d9ef', '#4fb8d0'],
      { green: '#a6e22e', red: '#f92672', yellow: '#e6db74', purple: '#ae81ff' },
      { 'syn-keyword': '#f92672', 'syn-string': '#e6db74', 'syn-comment': '#75715e', 'syn-number': '#ae81ff', 'syn-type': '#66d9ef', 'syn-function': '#a6e22e', 'syn-property': '#f8f8f2', 'syn-tag': '#f92672', 'syn-operator': '#f92672' })
  },
  {
    id: 'kanagawa', name: 'Kanagawa', dark: true,
    vars: palette(true, ['#1f1f28', '#16161d', '#2a2a37', '#363646'], '#363646', ['#dcd7ba', '#a6a69c', '#727169'], ['#7e9cd8', '#6a87c4'],
      { green: '#98bb6c', red: '#e46876', yellow: '#e6c384', purple: '#957fb8' },
      { 'syn-keyword': '#957fb8', 'syn-string': '#98bb6c', 'syn-comment': '#727169', 'syn-number': '#d27e99', 'syn-type': '#7aa89f', 'syn-function': '#7e9cd8', 'syn-property': '#e6c384', 'syn-tag': '#ff5d62', 'syn-operator': '#c0a36e' })
  },
  {
    id: 'ayu-mirage', name: 'Ayu Mirage', dark: true,
    vars: palette(true, ['#1f2430', '#191e2a', '#272d38', '#33415e'], '#33415e', ['#cbccc6', '#8a9199', '#5c6773'], ['#ffcc66', '#ffb454'],
      { green: '#bae67e', red: '#f28779', yellow: '#ffd580', purple: '#d4bfff' },
      { 'syn-keyword': '#ffa759', 'syn-string': '#bae67e', 'syn-comment': '#5c6773', 'syn-number': '#d4bfff', 'syn-type': '#73d0ff', 'syn-function': '#ffd580', 'syn-property': '#f28779', 'syn-tag': '#5ccfe6', 'syn-operator': '#f29e74' })
  },
  {
    id: 'night-owl', name: 'Night Owl', dark: true,
    vars: palette(true, ['#011627', '#01111d', '#0b2942', '#1d3b53'], '#122d42', ['#d6deeb', '#8aa0b8', '#637777'], ['#82aaff', '#6b8fe0'],
      { green: '#addb67', red: '#ef5350', yellow: '#ecc48d', purple: '#c792ea' },
      { 'syn-keyword': '#c792ea', 'syn-string': '#ecc48d', 'syn-comment': '#637777', 'syn-number': '#f78c6c', 'syn-type': '#ffcb8b', 'syn-function': '#82aaff', 'syn-property': '#7fdbca', 'syn-tag': '#7fdbca', 'syn-operator': '#7fdbca' })
  },
  {
    id: 'rose-pine', name: 'Rosé Pine', dark: true,
    vars: palette(true, ['#191724', '#1f1d2e', '#26233a', '#403d52'], '#403d52', ['#e0def4', '#908caa', '#6e6a86'], ['#c4a7e7', '#9ccfd8'],
      { green: '#31748f', red: '#eb6f92', yellow: '#f6c177', purple: '#c4a7e7' },
      { 'syn-keyword': '#31748f', 'syn-string': '#f6c177', 'syn-comment': '#6e6a86', 'syn-number': '#ebbcba', 'syn-type': '#9ccfd8', 'syn-function': '#ebbcba', 'syn-property': '#c4a7e7', 'syn-tag': '#eb6f92', 'syn-operator': '#908caa' })
  },
  {
    id: 'high-contrast-dark', name: 'High Contrast Dark', dark: true,
    vars: {
      ...palette(true, ['#000000', '#0a0a0a', '#1c1c1c', '#2e2e2e'], '#8a8a8a', ['#ffffff', '#e6e6e6', '#c2c2c2'], ['#4cc2ff', '#7fd4ff'],
        { green: '#5ee05e', red: '#ff6b6b', yellow: '#ffd700', purple: '#d59bff' },
        { 'syn-keyword': '#ff8ce6', 'syn-string': '#8fff8f', 'syn-comment': '#c2c2c2', 'syn-number': '#ffd27f', 'syn-type': '#7fe8ff', 'syn-function': '#ffe066', 'syn-property': '#9cdcfe', 'syn-tag': '#ff9e9e', 'syn-operator': '#ffffff' }),
      'add-bg': 'rgba(94, 224, 94, 0.28)',
      'del-bg': 'rgba(255, 107, 107, 0.28)',
      'select-bg': 'rgba(76, 194, 255, 0.32)'
    }
  },
  {
    id: 'arbor-light', name: 'Arbor Light', dark: false,
    vars: palette(false, ['#ffffff', '#f6f8fa', '#eaeef2', '#d0d7de'], '#d0d7de', ['#1f2328', '#656d76', '#8c959f'], ['#0969da', '#0550ae'],
      { green: '#1a7f37', red: '#cf222e', yellow: '#bf8700', purple: '#8250df' },
      { 'syn-keyword': '#cf222e', 'syn-string': '#0a3069', 'syn-comment': '#6e7781', 'syn-number': '#0550ae', 'syn-type': '#953800', 'syn-function': '#8250df', 'syn-property': '#0550ae', 'syn-tag': '#116329', 'syn-operator': '#cf222e' })
  },
  {
    id: 'one-light', name: 'One Light', dark: false,
    vars: palette(false, ['#fafafa', '#f0f0f1', '#e5e5e6', '#d4d4d6'], '#dbdbdc', ['#383a42', '#696c77', '#a0a1a7'], ['#4078f2', '#2f63d6'],
      { green: '#50a14f', red: '#e45649', yellow: '#c18401', purple: '#a626a4' },
      { 'syn-keyword': '#a626a4', 'syn-string': '#50a14f', 'syn-comment': '#a0a1a7', 'syn-number': '#986801', 'syn-type': '#c18401', 'syn-function': '#4078f2', 'syn-property': '#e45649', 'syn-tag': '#e45649', 'syn-operator': '#0184bc' })
  },
  {
    id: 'solarized-light', name: 'Solarized Light', dark: false,
    vars: palette(false, ['#fdf6e3', '#eee8d5', '#e4ddc8', '#d3ccb7'], '#d3ccb7', ['#073642', '#586e75', '#93a1a1'], ['#268bd2', '#1f78b8'],
      { green: '#859900', red: '#dc322f', yellow: '#b58900', purple: '#6c71c4' },
      { 'syn-keyword': '#859900', 'syn-string': '#2aa198', 'syn-comment': '#93a1a1', 'syn-number': '#d33682', 'syn-type': '#b58900', 'syn-function': '#268bd2', 'syn-property': '#586e75', 'syn-tag': '#268bd2', 'syn-operator': '#859900' })
  },
  {
    id: 'gruvbox-light', name: 'Gruvbox Light', dark: false,
    vars: palette(false, ['#fbf1c7', '#f2e5bc', '#ebdbb2', '#d5c4a1'], '#d5c4a1', ['#3c3836', '#7c6f64', '#928374'], ['#076678', '#0b5a69'],
      { green: '#79740e', red: '#9d0006', yellow: '#b57614', purple: '#8f3f71' },
      { 'syn-keyword': '#9d0006', 'syn-string': '#79740e', 'syn-comment': '#928374', 'syn-number': '#8f3f71', 'syn-type': '#b57614', 'syn-function': '#427b58', 'syn-property': '#076678', 'syn-tag': '#427b58', 'syn-operator': '#af3a03' })
  },
  {
    id: 'catppuccin-latte', name: 'Catppuccin Latte', dark: false,
    vars: palette(false, ['#eff1f5', '#e6e9ef', '#dce0e8', '#ccd0da'], '#ccd0da', ['#4c4f69', '#6c6f85', '#9ca0b0'], ['#1e66f5', '#1757d6'],
      { green: '#40a02b', red: '#d20f39', yellow: '#df8e1d', purple: '#8839ef' },
      { 'syn-keyword': '#8839ef', 'syn-string': '#40a02b', 'syn-comment': '#8c8fa1', 'syn-number': '#fe640b', 'syn-type': '#df8e1d', 'syn-function': '#1e66f5', 'syn-property': '#179299', 'syn-tag': '#d20f39', 'syn-operator': '#04a5e5' })
  },
  {
    id: 'rose-pine-dawn', name: 'Rosé Pine Dawn', dark: false,
    vars: palette(false, ['#faf4ed', '#fffaf3', '#f2e9e1', '#dfdad9'], '#dfdad9', ['#575279', '#797593', '#9893a5'], ['#907aa9', '#286983'],
      { green: '#286983', red: '#b4637a', yellow: '#ea9d34', purple: '#907aa9' },
      { 'syn-keyword': '#286983', 'syn-string': '#ea9d34', 'syn-comment': '#9893a5', 'syn-number': '#d7827e', 'syn-type': '#56949f', 'syn-function': '#d7827e', 'syn-property': '#907aa9', 'syn-tag': '#b4637a', 'syn-operator': '#797593' })
  },
  {
    id: 'high-contrast-light', name: 'High Contrast Light', dark: false,
    vars: {
      ...palette(false, ['#ffffff', '#f4f4f4', '#e6e6e6', '#cfcfcf'], '#3a3a3a', ['#000000', '#1c1c1c', '#3d3d3d'], ['#0047b3', '#003a91'],
        { green: '#006b1f', red: '#b3001b', yellow: '#7a5200', purple: '#6a1fb3' },
        { 'syn-keyword': '#8a0067', 'syn-string': '#005c16', 'syn-comment': '#3d3d3d', 'syn-number': '#7a3d00', 'syn-type': '#00567a', 'syn-function': '#0035a3', 'syn-property': '#5c1f99', 'syn-tag': '#8a001a', 'syn-operator': '#000000' }),
      'add-bg': 'rgba(0, 107, 31, 0.2)',
      'del-bg': 'rgba(179, 0, 27, 0.18)',
      'select-bg': 'rgba(0, 71, 179, 0.2)'
    }
  }
]

function load(): Theme {
  try {
    const id = localStorage.getItem(KEY)
    return THEMES.find((t) => t.id === id) ?? THEMES[0]
  } catch {
    return THEMES[0]
  }
}

let current = load()
const listeners = new Set<() => void>()

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  for (const [k, v] of Object.entries(theme.vars)) root.style.setProperty(`--${k}`, v)
  root.dataset.theme = theme.id
  root.dataset.dark = String(theme.dark)
  root.style.colorScheme = theme.dark ? 'dark' : 'light'
  window.native?.setTitleBar(theme.vars.bg, theme.vars.fg)
}

export function setTheme(id: string): void {
  const theme = THEMES.find((t) => t.id === id)
  if (!theme || theme === current) return
  current = theme
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* storage unavailable */
  }
  applyTheme(theme)
  listeners.forEach((l) => l())
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current
  )
}

export function subscribeTheme(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function currentTheme(): Theme {
  return current
}
