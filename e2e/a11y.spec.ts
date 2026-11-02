import { expect, test, type Page } from '@playwright/test'
import { commit, git, initRepo, launch, tempDir, view, write } from './helpers'

const focused = (page: Page): Promise<string> => page.evaluate(() => (document.activeElement as HTMLElement | null)?.innerText.trim() ?? '')
const focusedIn = (page: Page, selector: string): Promise<boolean> => page.evaluate((s) => !!document.activeElement?.closest(s), selector)

async function f6To(page: Page, selector: string): Promise<void> {
  await expect(async () => {
    await page.keyboard.press('F6')
    expect(await focusedIn(page, selector)).toBe(true)
  }).toPass({ intervals: [0], timeout: 10_000 })
}

async function arrowTo(page: Page, key: 'ArrowDown' | 'ArrowUp', text: RegExp): Promise<void> {
  await expect(async () => {
    await page.keyboard.press(key)
    expect(await focused(page)).toMatch(text)
  }).toPass({ intervals: [0], timeout: 10_000 })
}

test('branches, context menus, submenus and dialogs work from the keyboard alone', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'a.txt', 'a\n', 'Initial')
  git(repo, 'branch', 'develop')
  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    await expect(v.locator('.commit-row').first()).toBeVisible()

    await f6To(page, '.sidebar [role="tree"]')
    expect(await focused(page)).toMatch(/^main/)
    await page.keyboard.press('ArrowUp')
    expect(await focused(page)).toBe('develop')

    await page.keyboard.press('Shift+F10')
    await expect(page.locator('.context-menu-root .item:focus')).toHaveCount(1)
    await arrowTo(page, 'ArrowDown', /^Checkout$/)
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('.submenu-layer .item:focus')).toHaveText('develop')
    await page.keyboard.press('Escape')
    await expect(page.locator('.submenu-layer')).toHaveCount(0)
    expect(await focused(page)).toBe('Checkout')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await expect(page.locator('.context-menu-root')).toHaveCount(0)
    await expect.poll(() => git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('develop')
    expect(await focused(page)).toMatch(/^develop/)

    await page.keyboard.press('Shift+F10')
    await arrowTo(page, 'ArrowUp', /^Rename develop/)
    await page.keyboard.press('Enter')
    const dialog = page.locator('.dialog')
    await expect(dialog.locator('input')).toBeFocused()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'OK' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(dialog.locator('input')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    expect(await focused(page)).toMatch(/^develop/)

    const splitter = v.locator('.splitter-sidebar')
    const before = Number(await splitter.getAttribute('aria-valuenow'))
    await splitter.focus()
    await page.keyboard.press('ArrowRight')
    await expect(splitter).toHaveAttribute('aria-valuenow', String(before + 16))
  } finally {
    await close()
  }
})

test('stage, unstage, discard and commit with only the keyboard', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'one.txt', 'one\n', 'Initial')
  commit(repo, 'two.txt', 'two\n', 'Second')
  commit(repo, 'three.txt', 'three\n', 'Third')
  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    write(repo, 'one.txt', 'one changed\n')
    write(repo, 'two.txt', 'two changed\n')
    write(repo, 'three.txt', 'three changed\n')
    await expect(v.locator('.commit-row.wip')).toContainText('3 uncommitted')

    await f6To(page, '.commit-scroll')
    await page.keyboard.press('Home')
    await expect(v.locator('.commit-row.selected')).toHaveClass(/wip/)
    await page.keyboard.press('Enter')
    expect(await focused(page)).toBe('M\none.txt')

    await page.keyboard.press('Space')
    await expect.poll(() => git(repo, 'diff', '--cached', '--name-only').trim()).toBe('one.txt')
    expect(await focused(page)).toBe('M\nthree.txt')

    await page.keyboard.press('Delete')
    const confirm = page.getByRole('alertdialog', { name: 'Discard changes' })
    await expect(confirm.getByRole('button', { name: 'OK' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(v.locator('.panel .file-item', { hasText: 'three.txt' })).toHaveCount(0)
    await expect.poll(() => focused(page)).toBe('M\ntwo.txt')

    await page.keyboard.press('Space')
    await expect.poll(() => git(repo, 'diff', '--cached', '--name-only').trim().split('\n')).toEqual(['one.txt', 'two.txt'])
    await expect.poll(() => page.evaluate(() => document.activeElement?.closest('[data-area]')?.getAttribute('data-area'))).toBe('staged')
    expect(await focused(page)).toBe('M\ntwo.txt')
    await page.keyboard.press('Space')
    await expect.poll(() => git(repo, 'diff', '--cached', '--name-only').trim()).toBe('one.txt')

    await expect(async () => {
      await page.keyboard.press('Tab')
      await expect(v.getByRole('textbox', { name: 'Commit summary' })).toBeFocused({ timeout: 200 })
    }).toPass({ intervals: [0], timeout: 10_000 })
    await page.keyboard.type('Commit from the keyboard')
    await page.keyboard.press('Control+Enter')
    await expect.poll(() => git(repo, 'log', '-1', '--format=%s').trim()).toBe('Commit from the keyboard')
    expect(git(repo, 'show', '--name-only', '--format=', 'HEAD').trim()).toBe('one.txt')
  } finally {
    await close()
  }
})

test('the menu bar opens with F10 and Alt shortcuts, and diff lines can be staged by keyboard', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'notes.txt', 'a\nb\nc\n', 'Initial')
  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    await page.keyboard.press('F10')
    await expect(page.getByRole('menuitem', { name: 'File' })).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('.menubar-dropdown .menubar-entry').first()).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.locator('.menubar-dropdown')).toHaveCount(0)
    await page.keyboard.press('Escape')
    expect(await focusedIn(page, '.menubar')).toBe(false)

    await page.keyboard.press('Alt+h')
    await expect(page.locator('.menubar-dropdown')).toHaveAttribute('aria-label', 'Help')
    await arrowTo(page, 'ArrowDown', /Keyboard shortcuts/)
    await page.keyboard.press('Enter')
    const shortcuts = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
    await expect(shortcuts).toContainText('Moving around')
    await page.keyboard.press('Escape')
    await expect(shortcuts).toHaveCount(0)

    write(repo, 'notes.txt', 'A\nb\nC\n')
    await expect(v.locator('.commit-row.wip')).toBeVisible()
    await f6To(page, '.commit-scroll')
    await page.keyboard.press('Home')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await expect(v.locator('.file-viewer .diff')).toBeVisible()
    await f6To(page, '.file-viewer .diff')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Shift+ArrowDown')
    await expect(v.locator('.diff-selection')).toContainText('2 lines selected')
    await page.keyboard.press('Tab')
    await expect(page.locator('.diff-selection button', { hasText: 'Stage lines' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect.poll(() => git(repo, 'diff', '--cached').includes('+A')).toBe(true)
    expect(git(repo, 'diff', '--cached')).not.toContain('+C')
  } finally {
    await close()
  }
})
