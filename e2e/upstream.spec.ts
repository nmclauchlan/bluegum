import { expect, test } from '@playwright/test'
import { commit, git, launch, menuItem, repoWithRemote, tempDir, view } from './helpers'

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
    await v.getByRole('button', { name: /^Pull( ?\d+)?$/ }).click()
    const dialog = page.getByRole('alertdialog', { name: 'origin/feature/export no longer exists' })
    await expect(dialog).toContainText('Everything on feature/export is already in main', { timeout: 20_000 })
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
    await v.getByRole('button', { name: /^Pull( ?\d+)?$/ }).click()
    await dialog.getByRole('button', { name: 'Keep feature/wip local and stop tracking it' }).click()
    await expect(bar.locator('.sync-note')).toHaveText('not published')
    expect(git(repo, 'for-each-ref', '--format=%(upstream:short)', 'refs/heads/feature/wip').trim()).toBe('')
  } finally {
    await close()
  }
})

test('pull all names branches that were merged and deleted on the remote and tidies them up together', async () => {
  test.slow()
  const root = tempDir()
  const alpha = repoWithRemote(root, 'alpha')
  commit(alpha.other, 'remote.txt', 'new\n', 'Remote change for alpha')
  git(alpha.other, 'push', '-q', 'origin', 'main')
  const mergedAndDeleted = (name: string): string => {
    const r = repoWithRemote(root, name)
    git(r.repo, 'checkout', '-q', '-b', 'feature/export')
    commit(r.repo, 'export.txt', 'export\n', 'Add the export')
    git(r.repo, 'push', '-q', '-u', 'origin', 'feature/export')
    git(r.other, 'fetch', '-q')
    git(r.other, 'merge', '-q', '--squash', 'origin/feature/export')
    git(r.other, 'commit', '-q', '-m', 'Staff list export')
    git(r.other, 'push', '-q', 'origin', 'main')
    git(r.other, 'push', '-q', 'origin', '--delete', 'feature/export')
    return r.repo
  }
  const beta = mergedAndDeleted('beta')
  const gamma = mergedAndDeleted('gamma')
  const delta = repoWithRemote(root, 'delta')
  git(delta.repo, 'checkout', '-q', '-b', 'local-work')
  const { page, close } = await launch()
  try {
    const group = { id: 'g1', name: 'Ministers', color: '#3e9cf0' }
    const tabs = { tabs: [alpha.repo, beta, gamma, delta.repo].map((p) => ({ path: p.split('\\').join('/'), group: 'g1' })), groups: [group] }
    await page.evaluate((value) => {
      localStorage.setItem('bluegum.tabs', value)
      localStorage.setItem('bluegum.settings', JSON.stringify({ backgroundFetch: 0 }))
    }, JSON.stringify(tabs))
    await page.reload()
    const chip = page.locator('.tab-group', { hasText: 'Ministers' })
    await expect(chip.locator('.count')).toHaveText('4')
    await chip.click({ button: 'right' })
    await menuItem(page, 'Pull all (4)')

    const toast = page.locator('.toast')
    await expect(toast).toContainText('Pulled Ministers', { timeout: 30_000 })
    await expect(toast).not.toHaveClass(/error/)
    await expect(toast).toContainText('Updated 1: alpha')
    await expect(toast).toContainText('beta (feature/export)')
    await expect(toast).toContainText('gamma (feature/export)')
    await expect(toast).toContainText('Not published yet: delta (local-work)')

    const dialog = page.getByRole('alertdialog', { name: '2 branches were merged and deleted' })
    await expect(dialog).toContainText('beta: feature/export → main')
    await dialog.getByRole('button', { name: 'Switch each to its main branch and delete the merged branches' }).click()
    await expect(page.locator('.toast')).toContainText('Switched 2 repositories to their main branch and deleted the merged branches', { timeout: 20_000 })
    for (const repo of [beta, gamma]) {
      expect(current(repo)).toBe('main')
      expect(localBranches(repo)).toEqual(['main'])
      expect(git(repo, 'log', '-1', '--format=%s').trim()).toBe('Staff list export')
    }
    expect(current(delta.repo)).toBe('local-work')
  } finally {
    await close()
  }
})
