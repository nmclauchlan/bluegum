import { expect, test } from '@playwright/test'
import { commit, git, initRepo, launch, tempDir, view, write } from './helpers'

test('staged files slide in, new commits glow, jumps pulse the commit, and panels slide', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'a.txt', 'a\n', 'Initial')
  git(repo, 'branch', 'release')
  commit(repo, 'b.txt', 'b\n', 'Second')
  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    write(repo, 'notes.md', 'notes\n')
    await expect(v.locator('.commit-row.wip')).toContainText('1 uncommitted')
    await v.locator('.commit-row.wip').click()
    const row = v.locator('.panel .file-item', { hasText: 'notes.md' })
    await row.hover()
    await row.getByRole('button', { name: 'Stage' }).click()
    await expect(v.locator('[data-area="staged"] .file-item', { hasText: 'notes.md' })).toHaveClass(/entering/)

    await v.getByRole('textbox', { name: 'Commit summary' }).fill('Add notes')
    await v.getByRole('textbox', { name: 'Commit summary' }).press('Control+Enter')
    const added = v.locator('.commit-row', { hasText: 'Add notes' })
    await expect(added).toHaveClass(/fresh/)
    await expect(added).not.toHaveClass(/fresh/, { timeout: 5000 })
    await expect(v.locator('.commit-row', { hasText: 'Second' })).not.toHaveClass(/fresh/)

    await v.locator('.sidebar .ref-item', { hasText: 'release' }).click()
    await expect(v.locator('.commit-row', { hasText: 'Initial' })).toHaveClass(/landed/)

    await v.getByRole('button', { name: 'Hide the branch panel' }).click()
    await expect(v).toHaveClass(/panels-moving/)
    await expect(v).not.toHaveClass(/panels-moving/)
    await expect(v.locator('.sidebar')).toBeHidden()
  } finally {
    await close()
  }
})
