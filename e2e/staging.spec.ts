import { rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { expect, test } from '@playwright/test'
import { commit, git, initRepo, launch, tempDir, view, write } from './helpers'

test('staging moves a file straight away, and a failed stage puts it back and explains why', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'notes.md', 'notes\n', 'Initial')
  commit(repo, 'todo.md', 'todo\n', 'Second')
  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    write(repo, 'notes.md', 'notes changed\n')
    write(repo, 'todo.md', 'todo changed\n')
    await expect(v.locator('.commit-row.wip')).toContainText('2 uncommitted')
    await v.locator('.commit-row.wip').click()
    const row = (area: string, name: string) => v.locator(`[data-area="${area}"] .file-item`, { hasText: name })

    await row('unstaged', 'notes.md').hover()
    await row('unstaged', 'notes.md').getByRole('button', { name: 'Stage' }).click()
    await expect(row('staged', 'notes.md')).toBeVisible({ timeout: 300 })
    await expect.poll(() => git(repo, 'diff', '--cached', '--name-only').trim()).toBe('notes.md')

    const lock = join(repo, '.git', 'index.lock')
    writeFileSync(lock, '')
    try {
      await row('unstaged', 'todo.md').hover()
      await row('unstaged', 'todo.md').getByRole('button', { name: 'Stage' }).click()
      await expect(page.locator('.toast')).toContainText('Staging failed')
      await expect(row('unstaged', 'todo.md')).toBeVisible()
      await expect(row('staged', 'todo.md')).toHaveCount(0)
    } finally {
      rmSync(lock, { force: true })
    }
    expect(git(repo, 'diff', '--cached', '--name-only').trim()).toBe('notes.md')
  } finally {
    await close()
  }
})
