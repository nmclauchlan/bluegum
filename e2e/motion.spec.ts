import { expect, test } from '@playwright/test'
import { execFileSync } from 'child_process'
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
    await expect(v.locator('.graph-node.fresh, .graph circle.fresh-node')).toHaveCount(0)

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

test('a new commit drops in with its graph node and line, and the graph shows it straight away', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'a.txt', 'a\n', 'Initial')
  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    commit(repo, 'b.txt', 'b\n', 'Arrived from the command line')
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(v.locator('.commit-row', { hasText: 'Arrived from the command line' })).toHaveClass(/fresh/)
    await expect(v.locator('.graph-node.fresh, .graph circle.fresh-node')).toHaveCount(1)
    await expect(v.locator('.graph path.fresh-edge')).toHaveCount(1)
    await expect(v.locator('.new-commits')).toHaveCount(0)
  } finally {
    await close()
  }
})

test('commits that arrive while scrolled down keep the view still and show a pill that jumps to them', async () => {
  const repo = initRepo(tempDir())
  const lines: string[] = []
  for (let i = 0; i < 120; i++) {
    const msg = `Old commit ${i}`
    lines.push('commit refs/heads/main', `mark :${i + 1}`, `committer Test <test@example.com> ${1700000000 + i * 60} +0000`, `data ${msg.length}`, msg)
    if (i) lines.push(`from :${i}`)
    lines.push(`M 644 inline f${i % 10}.txt`, `data ${String(i).length + 1}`, `${i}`, '')
  }
  execFileSync('git', ['fast-import', '--quiet'], { cwd: repo, input: lines.join('\n') + '\n' })
  git(repo, 'reset', '--hard', '-q')
  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    const scroller = v.locator('.commit-scroll')
    const topSubject = (): Promise<string | null | undefined> =>
      scroller.evaluate((el) => {
        const i = Math.floor(el.scrollTop / 28)
        const row = [...el.querySelectorAll<HTMLElement>('.commit-row')].find((r) => r.style.top === `${i * 28}px`)
        return row?.querySelector('.subject .text')?.textContent
      })
    await scroller.evaluate((el) => {
      el.scrollTop = 28 * 40
    })
    await expect.poll(topSubject).toBe('Old commit 79')

    commit(repo, 'n1.txt', 'n1\n', 'Arrived first')
    commit(repo, 'n2.txt', 'n2\n', 'Arrived second')
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    const pill = v.locator('.new-commits')
    await expect(pill).toHaveText('2 new commits')
    expect(await topSubject()).toBe('Old commit 79')

    await pill.click()
    await expect(pill).toHaveCount(0)
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBe(0)
    await expect(v.locator('.commit-row', { hasText: 'Arrived second' })).toHaveClass(/fresh/)
  } finally {
    await close()
  }
})
