import { expect, test, type Page } from '@playwright/test'
import { commit, git, initRepo, launch, tempDir, view, write } from './helpers'

async function soloBranch(page: Page, name: string): Promise<void> {
  await view(page).locator('.refs-cell > .ref-badge', { hasText: name }).first().click({ button: 'right' })
  const parent = page.locator('.context-menu-root:not([data-closing]) > .context-menu > .item', { has: page.locator('.label', { hasText: /^Filter graph/ }) })
  const item = page.locator('.submenu-layer .item', { hasText: `Show only ${name}` }).first()
  await expect(async () => {
    await parent.first().hover()
    await expect(item).toBeInViewport({ timeout: 1000 })
    await item.click({ timeout: 2000 })
  }).toPass()
}

test('window size, sidebar sections, collapsed folders and branch filters are remembered after a restart', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'src/app.ts', 'a\n', 'First')
  git(repo, 'branch', 'develop')
  commit(repo, 'src/app.ts', 'b\n', 'Main only work')
  git(repo, 'tag', 'v1.0.0')
  write(repo, 'docs/guide.md', 'guide\n')
  write(repo, 'src/app.ts', 'changed\n')
  const profile = tempDir('bluegum-profile-')
  const bounds = { x: 60, y: 50, width: 1100, height: 720 }

  const first = await launch(repo, profile)
  const v1 = view(first.page)
  await first.app.evaluate(({ BrowserWindow }, b) => BrowserWindow.getAllWindows()[0].setBounds(b), bounds)
  const tags1 = v1.locator('.sidebar .section-title', { hasText: 'Tags' })
  await tags1.click()
  await expect(tags1).toHaveAttribute('aria-expanded', 'false')
  await v1.locator('.commit-row.wip').click()
  const docs1 = v1.locator('.panel .dir-item', { hasText: 'docs' })
  await docs1.click()
  await expect(docs1).toHaveAttribute('aria-expanded', 'false')
  await soloBranch(first.page, 'develop')
  await expect(v1.locator('.graph-filter-note')).toContainText('Showing only develop')
  await expect(v1.locator('.commit-row', { hasText: 'Main only work' })).toHaveCount(0)
  await first.app.close()

  const second = await launch(repo, profile)
  try {
    const v2 = view(second.page)
    expect(await second.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())).toEqual(bounds)
    await expect(v2.locator('.sidebar .section-title', { hasText: 'Tags' })).toHaveAttribute('aria-expanded', 'false')
    await expect(v2.locator('.sidebar .section-title', { hasText: 'Local' })).toHaveAttribute('aria-expanded', 'true')
    await expect(v2.locator('.graph-filter-note')).toContainText('Showing only develop')
    await expect(v2.locator('.commit-row', { hasText: 'Main only work' })).toHaveCount(0)
    await v2.locator('.commit-row.wip').click()
    await expect(v2.locator('.panel .dir-item', { hasText: 'docs' })).toHaveAttribute('aria-expanded', 'false')
    await expect(v2.locator('.panel .dir-item', { hasText: 'src' })).toHaveAttribute('aria-expanded', 'true')

    await v2.locator('.graph-filter-note').getByRole('button', { name: 'Show all' }).click()
    await expect(v2.locator('.commit-row', { hasText: 'Main only work' })).toBeVisible()
  } finally {
    await second.close()
  }
})

test('a remembered filter for a branch that was deleted falls back to the whole graph', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'a.txt', 'a\n', 'First')
  git(repo, 'branch', 'gone-soon')
  commit(repo, 'b.txt', 'b\n', 'Second')
  const profile = tempDir('bluegum-profile-')
  const first = await launch(repo, profile)
  await soloBranch(first.page, 'gone-soon')
  await expect(view(first.page).locator('.graph-filter-note')).toContainText('Showing only gone-soon')
  await first.app.close()

  git(repo, 'branch', '-D', 'gone-soon')
  const second = await launch(repo, profile)
  try {
    const v = view(second.page)
    await expect(v.locator('.commit-row', { hasText: 'Second' })).toBeVisible()
    await expect(v.locator('.graph-filter-note')).toHaveCount(0)
  } finally {
    await second.close()
  }
})
