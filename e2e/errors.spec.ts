import { expect, test } from '@playwright/test'
import { commit, git, initRepo, launch, menuItem, tempDir, view, write } from './helpers'

test('long git errors stay on screen with a title, the full output on request and a copy button', async () => {
  test.setTimeout(90_000)
  const repo = initRepo(tempDir())
  commit(repo, 'a.txt', 'a\n', 'Initial')
  git(repo, 'checkout', '-q', '-b', 'feature')
  commit(repo, 'a.txt', 'a from feature\n', 'Change a on feature')
  git(repo, 'checkout', '-q', 'main')
  write(repo, 'a.txt', 'a with local edits\n')
  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    await v.locator('.refs-cell > .ref-badge', { hasText: /^feature$/ }).first().click({ button: 'right' })
    await menuItem(page, 'Merge feature into main')

    const toast = page.getByRole('alert')
    await expect(toast).toContainText('Merging failed')
    await expect(toast.locator('.toast-summary')).toHaveText(/^Your local changes to the following files would be overwritten by merge/)
    const details = toast.locator('.toast-details')
    await expect(details).not.toHaveClass(/expanded/)
    await toast.getByRole('button', { name: 'Show full output' }).click()
    await expect(details).toHaveClass(/expanded/)
    await expect(details).toContainText('Please commit your changes or stash them before you merge')
    await toast.getByRole('button', { name: 'Copy details' }).click()
    await expect(toast.getByRole('button', { name: 'Copied' })).toBeVisible()

    await page.mouse.move(5, 300)
    await page.waitForTimeout(10_500)
    await expect(toast).toBeVisible()
    await toast.getByRole('button', { name: 'Dismiss' }).click()
    await expect(page.locator('.toast')).toHaveCount(0)
  } finally {
    await close()
  }
})
