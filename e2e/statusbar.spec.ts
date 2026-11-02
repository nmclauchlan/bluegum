import { expect, test } from '@playwright/test'
import { commit, git, initRepo, launch, repoWithRemote, tempDir, view, write } from './helpers'

test('the status bar shows the branch, its upstream, ahead and behind counts, and when it was last fetched', async () => {
  test.setTimeout(90_000)
  const { repo, other } = repoWithRemote(tempDir())
  commit(repo, 'mine.txt', 'mine\n', 'My local work')
  const { page, close } = await launch(repo)
  try {
    await page.evaluate(() => localStorage.setItem('bluegum.settings', JSON.stringify({ backgroundFetch: 5 })))
    await page.reload()
    const bar = view(page).locator('.statusbar')
    await expect(bar.locator('.sync-branch')).toHaveText('main')
    await expect(bar.locator('.sync-upstream')).toHaveText('→ origin/main')
    await expect(bar.locator('.sync-ahead')).toHaveText('1')
    await expect(bar.locator('.sync-behind')).toHaveCount(0)
    await expect(bar.locator('.fetched-at')).toHaveCount(0)

    commit(other, 'theirs.txt', 'theirs\n', 'Their pushed work')
    git(other, 'push', '-q', 'origin', 'main')
    await expect(bar.locator('.sync-behind')).toHaveText('1', { timeout: 40_000 })
    await expect(bar.locator('.fetched-at')).toHaveText('Fetched just now')

    commit(other, 'more.txt', 'more\n', 'More pushed work')
    git(other, 'push', '-q', 'origin', 'main')
    await bar.locator('.fetched-at').click()
    await expect(bar.locator('.sync-behind')).toHaveText('2')

    git(repo, 'checkout', '-q', '-b', 'local-only')
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(bar.locator('.sync-branch')).toHaveText('local-only')
    await expect(bar.locator('.sync-note')).toHaveText('not published')
  } finally {
    await close()
  }
})

test('the selected file keeps its staging buttons visible, and double-clicking a file stages or unstages it', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'notes.md', 'hello\n', 'Initial')
  const { page, close } = await launch(repo)
  try {
    write(repo, 'notes.md', 'hello\nworld\n')
    write(repo, 'todo.md', 'todo\n')
    const v = view(page)
    await expect(v.locator('.commit-row.wip')).toContainText('2 uncommitted')
    await v.locator('.commit-row.wip').click()
    const unstaged = v.locator('.panel .file-item', { hasText: 'notes.md' })
    await unstaged.click()
    await page.mouse.move(0, 0)
    await expect(unstaged).toHaveClass(/selected/)
    await expect(unstaged.getByRole('button', { name: 'Stage' })).toBeVisible()
    await expect(v.locator('.panel .file-item', { hasText: 'todo.md' }).getByRole('button', { name: 'Stage', includeHidden: true })).toBeHidden()

    await unstaged.dblclick()
    await expect.poll(() => git(repo, 'diff', '--cached', '--name-only').trim()).toBe('notes.md')
    const staged = v.locator('.panel .file-item', { hasText: 'notes.md' })
    await expect(staged.getByRole('button', { name: 'Unstage', includeHidden: true })).toHaveCount(1)
    await staged.dblclick()
    await expect.poll(() => git(repo, 'diff', '--cached', '--name-only').trim()).toBe('')
    await expect(v.locator('.panel .file-item', { hasText: 'notes.md' }).getByRole('button', { name: 'Stage', includeHidden: true })).toHaveCount(1)
  } finally {
    await close()
  }
})
