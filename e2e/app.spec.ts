import { expect, test } from '@playwright/test'
import { commit, initRepo, launch, tempDir, view } from './helpers'

test('shows the welcome screen when no repository is open', async () => {
  const { page, close } = await launch()
  try {
    await expect(page.locator('.welcome-heading')).toHaveText('Blue Gum')
    await expect(page.getByRole('button', { name: /Open repository/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Clone repository/ })).toBeVisible()
  } finally {
    await close()
  }
})

test('settings open with the keyboard and switch the theme', async () => {
  const { page, close } = await launch()
  try {
    await page.keyboard.press('Control+,')
    const dialog = page.locator('.settings-dialog')
    await expect(dialog).toBeVisible()
    await dialog.locator('select').first().selectOption('dracula')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dracula')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  } finally {
    await close()
  }
})

test('themes are grouped into dark and light, and can be picked from the View menu or the command palette', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'a.txt', 'a\n', 'Initial')
  const { page, close } = await launch(repo)
  try {
    await expect(view(page).locator('.toolbar')).not.toContainText('on main')

    await page.getByRole('menuitem', { name: 'View' }).click()
    await page.locator('.menubar-entry', { hasText: 'Theme…' }).click()
    const menu = page.locator('.context-menu-root > .context-menu')
    const labels = await menu.locator(':scope > .item .label').allInnerTexts()
    expect(labels).toHaveLength(23)
    expect(labels.indexOf('High Contrast Dark')).toBeLessThan(labels.indexOf('Blue Gum Light'))
    await expect(menu.locator(':scope > .sep')).toHaveCount(1)
    await expect(menu.locator(':scope > [aria-checked="true"]')).toHaveText('Blue Gum Dark')
    await menu.locator(':scope > .item', { hasText: 'Tokyo Night' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'tokyo-night')

    await page.keyboard.press('Control+Shift+P')
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await palette.getByRole('combobox').fill('theme latte')
    await expect(palette.getByRole('option').first()).toContainText('Theme: Catppuccin Latte')
    await page.keyboard.press('Enter')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'catppuccin-latte')
  } finally {
    await close()
  }
})
