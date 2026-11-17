import { expect, test } from '@playwright/test'
import { commit, git, launch, repoWithRemote, tempDir, view } from './helpers'

const current = (repo: string): string => git(repo, 'branch', '--show-current').trim()
const localBranches = (repo: string): string[] => git(repo, 'branch', '--format=%(refname:short)').trim().split('\n')

test('pulling a branch that was squash-merged and deleted on the remote offers to switch to main and delete it', async () => {
  const { repo, other } = repoWithRemote(tempDir())
  git(repo, 'checkout', '-q', '-b', 'feature/export')
  commit(repo, 'export.txt', 'export\n', 'Add the export')
  commit(repo, 'export.txt', 'export\nwith totals\n', 'Add totals to the export')
  git(repo, 'push', '-q', '-u', 'origin', 'feature/export')
  git(other, 'fetch', '-q')
  git(other, 'merge', '-q', '--squash', 'origin/feature/export')
  git(other, 'commit', '-q', '-m', 'Staff list export (#42)')
  git(other, 'push', '-q', 'origin', 'main')
  git(other, 'push', '-q', 'origin', '--delete', 'feature/export')
  const { page, close } = await launch(repo)
  try {
    await page.evaluate(() => localStorage.setItem('bluegum.settings', JSON.stringify({ backgroundFetch: 0 })))
    await page.reload()
    const v = view(page)
    await expect(v.locator('.statusbar .sync-upstream')).toHaveText('→ origin/feature/export')

    await v.getByRole('button', { name: /^Pull\d*$/ }).click()
    const dialog = page.getByRole('alertdialog', { name: 'origin/feature/export no longer exists' })
    await expect(dialog).toContainText('Everything on feature/export is already in main')
    await expect(page.locator('.toast')).toHaveCount(0)
    const retire = dialog.getByRole('button', { name: 'Switch to main and delete feature/export' })
    await expect(retire).toBeFocused()
    await retire.click()

    await expect(page.locator('.toast')).toContainText('Switched to main and deleted feature/export')
    expect(current(repo)).toBe('main')
    expect(localBranches(repo)).toEqual(['main'])
    expect(git(repo, 'log', '-1', '--format=%s', 'main').trim()).toBe('Staff list export (#42)')
    await expect(v.locator('.statusbar .sync-branch')).toHaveText('main')
  } finally {
    await close()
  }
})

test('a deleted upstream with unmerged work can be pushed back or untracked from the status bar', async () => {
  const { repo, other } = repoWithRemote(tempDir())
  git(repo, 'checkout', '-q', '-b', 'feature/wip')
  commit(repo, 'wip.txt', 'wip\n', 'Work in progress')
  git(repo, 'push', '-q', '-u', 'origin', 'feature/wip')
  git(other, 'push', '-q', 'origin', '--delete', 'feature/wip')
  const { page, close } = await launch(repo)
  try {
    await page.evaluate(() => localStorage.setItem('bluegum.settings', JSON.stringify({ backgroundFetch: 0 })))
    await page.reload()
    const v = view(page)
    const bar = v.locator('.statusbar')
    const dialog = page.getByRole('alertdialog', { name: 'origin/feature/wip no longer exists' })

    await v.locator('.toolbar').getByRole('button', { name: /^Fetch/ }).click()
    await bar.getByRole('button', { name: 'origin/feature/wip deleted' }).click()
    await expect(dialog).toContainText("feature/wip has commits that aren't in main")
    await expect(dialog.getByRole('button', { name: /Switch to main/ })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Push feature/wip to origin again' }).click()
    await expect(page.locator('.toast')).toContainText('Pushed feature/wip to origin/feature/wip')
    expect(git(repo, 'ls-remote', '--heads', 'origin', 'feature/wip')).toContain('refs/heads/feature/wip')
    await expect(bar.locator('.sync-upstream')).toHaveText('→ origin/feature/wip')

    git(other, 'push', '-q', 'origin', '--delete', 'feature/wip')
    await v.locator('.toolbar').getByRole('button', { name: /^Fetch/ }).click()
    await v.getByRole('button', { name: /^Pull\d*$/ }).click()
    await dialog.getByRole('button', { name: 'Keep feature/wip local and stop tracking it' }).click()
    await expect(bar.locator('.sync-note')).toHaveText('not published')
    expect(git(repo, 'for-each-ref', '--format=%(upstream:short)', 'refs/heads/feature/wip').trim()).toBe('')
  } finally {
    await close()
  }
})
