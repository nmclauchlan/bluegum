import { _electron as electron, expect, test } from '@playwright/test'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { commit, initRepo, launch, MAIN, tempDir } from './helpers'

test('settings saved under the Arbor name carry over, including the theme', async () => {
  const { page, close } = await launch()
  try {
    await page.evaluate(() => {
      localStorage.setItem('arbor.theme', 'arbor-light')
      localStorage.setItem('arbor.settings', JSON.stringify({ pullMode: 'rebase' }))
    })
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'bluegum-light')
    const stored = await page.evaluate(() => ({ ...localStorage }))
    expect(Object.keys(stored).filter((k) => k.startsWith('arbor.'))).toEqual([])
    expect(JSON.parse(stored['bluegum.settings']).pullMode).toBe('rebase')
  } finally {
    await close()
  }
})

test('an Arbor settings folder is adopted on first launch, keeping recent repositories', async () => {
  const appData = tempDir()
  const repo = initRepo(tempDir(), 'legacy-repo')
  commit(repo, 'a.txt', 'a\n', 'Initial')
  mkdirSync(join(appData, 'Arbor Dev'))
  writeFileSync(join(appData, 'Arbor Dev', 'recent.json'), JSON.stringify([{ path: repo, name: 'legacy-repo' }]))

  const app = await electron.launch({
    args: [MAIN, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, BLUEGUM_APP_DATA: appData, NODE_ENV: 'production' } as Record<string, string>
  })
  try {
    const page = await app.firstWindow()
    await expect(page.locator('.repo-manager .repo-row', { hasText: 'legacy-repo' }).first()).toBeVisible()
    expect(existsSync(join(appData, 'Blue Gum Dev', 'recent.json'))).toBe(true)
    expect(existsSync(join(appData, 'Arbor Dev'))).toBe(false)
  } finally {
    await app.close().catch(() => undefined)
    rmSync(appData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
