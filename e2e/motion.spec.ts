import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'child_process'
import { join } from 'path'
import { commit, git, initRepo, launch, repoWithRemote, tempDir, view, write } from './helpers'

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

test('a new theme spreads out from where it was picked, and appears instantly with reduced motion', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'a.txt', 'a\n', 'Initial')
  const { page, close } = await launch(repo)
  try {
    await page.evaluate(() => {
      const w = window as unknown as { reveals: number }
      const start = document.startViewTransition.bind(document)
      w.reveals = 0
      document.startViewTransition = ((update: () => void) => {
        w.reveals++
        return start(update)
      }) as typeof document.startViewTransition
    })
    const html = page.locator('html')
    const reveals = (): Promise<number> => page.evaluate(() => (window as unknown as { reveals: number }).reveals)
    const pick = async (name: string): Promise<void> => {
      await page.getByRole('menuitem', { name: 'View' }).click()
      await page.locator('.menubar-entry', { hasText: 'Theme…' }).click()
      await page.locator('.context-menu-root:not([data-closing]) > .context-menu > .item', { hasText: name }).click()
    }

    await pick('Dracula')
    await expect(html).toHaveAttribute('data-theme', 'dracula')
    await expect(html).not.toHaveClass(/theme-switching/)
    expect(await reveals()).toBe(1)

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await pick('Nord')
    await expect(html).toHaveAttribute('data-theme', 'nord')
    expect(await reveals()).toBe(1)
  } finally {
    await close()
  }
})

test('dialogs fade out when they close and hand focus back to what opened them', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'a.txt', 'a\n', 'Initial')
  write(repo, 'a.txt', 'changed\n')
  const { page, close } = await launch(repo)
  try {
    await page.evaluate(() => {
      const w = window as unknown as { closing: string[] }
      w.closing = []
      new MutationObserver((records) => {
        for (const r of records) {
          const el = r.target as HTMLElement
          if (el.matches('.overlay[data-closing]')) w.closing.push(el.querySelector('.dialog')?.classList[1] ?? 'dialog')
        }
      }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-closing'] })
    })
    const closing = (): Promise<string[]> => page.evaluate(() => (window as unknown as { closing: string[] }).closing)

    await page.keyboard.press('Control+,')
    await expect(page.locator('.settings-dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.overlay')).toHaveCount(0)

    const stash = view(page).locator('.toolbar').getByRole('button', { name: /Stash/ })
    await stash.click()
    await expect(page.getByRole('dialog', { name: 'Stash changes' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.overlay')).toHaveCount(0)
    await expect(stash).toBeFocused()

    expect(await closing()).toEqual(['settings-dialog', 'stash-dialog'])
  } finally {
    await close()
  }
})

async function watch(page: Page, selector: string): Promise<() => Promise<string[]>> {
  await page.evaluate((sel) => {
    const w = window as unknown as { seen?: Record<string, string[]> }
    w.seen ??= {}
    const out: string[] = (w.seen[sel] = [])
    const note = (el: Element): void => {
      out.push(`${el.getAttribute('class')}|${el.textContent?.trim() ?? ''}`)
    }
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes' && r.target instanceof Element && r.target.matches(sel)) note(r.target)
        for (const n of r.addedNodes) {
          if (!(n instanceof Element)) continue
          if (n.matches(sel)) note(n)
          n.querySelectorAll(sel).forEach(note)
        }
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
  }, selector)
  return () => page.evaluate((sel) => (window as unknown as { seen: Record<string, string[]> }).seen[sel], selector)
}

const refresh = (page: Page): Promise<void> => page.evaluate(() => window.dispatchEvent(new Event('focus')))

test('removed commits fade out while the rows below slide up, and an amended commit pulses in place', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'a.txt', 'a\n', 'First')
  commit(repo, 'b.txt', 'b\n', 'Second')
  commit(repo, 'c.txt', 'c\n', 'Third')
  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    const rows = v.locator('.commit-row')
    await expect(rows).toHaveCount(3)
    const seen = await watch(page, '.commit-row')

    git(repo, 'reset', '-q', '--hard', 'HEAD~1')
    await refresh(page)
    await expect(rows).toHaveCount(2)
    await expect(rows.first()).toContainText('Second')
    const changes = await seen()
    expect(changes.some((s) => /\bgone\b/.test(s) && s.includes('Third'))).toBe(true)
    expect(changes.some((s) => /\bshifting\b/.test(s) && s.includes('Second'))).toBe(true)

    git(repo, 'commit', '-q', '--amend', '-m', 'Second, reworded')
    await refresh(page)
    await expect(rows.first()).toContainText('Second, reworded')
    expect((await seen()).some((s) => /\brewritten\b/.test(s) && s.includes('Second, reworded'))).toBe(true)
    await expect(rows).toHaveCount(2)

    write(repo, 'b.txt', 'b and more\n')
    git(repo, 'add', 'b.txt')
    await refresh(page)
    await expect(v.locator('.commit-row.wip')).toBeVisible()
    git(repo, 'commit', '-q', '--amend', '-m', 'Second, with more')
    await refresh(page)
    await expect(v.locator('.commit-row.wip')).toHaveCount(0)
    await expect(rows.first()).toContainText('Second, with more')
    expect((await seen()).some((s) => /\brewritten\b/.test(s) && s.includes('Second, with more'))).toBe(true)
  } finally {
    await close()
  }
})

test('checking out a branch glides the HEAD ring, branch badge and sidebar tick to it', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'a.txt', 'a\n', 'First')
  commit(repo, 'b.txt', 'b\n', 'Second')
  git(repo, 'branch', 'feature', 'HEAD~1')
  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    const ring = v.locator('.head-ring')
    await expect(ring).toHaveCount(1)
    const before = await ring.evaluate((el: HTMLElement) => {
      el.dataset.mark = 'kept'
      return el.style.transform
    })
    const ghosts = await watch(page, '.head-ghost')
    const ticks = await watch(page, '.current-tick')

    await v.locator('.sidebar .ref-item[title="feature"]').dblclick()
    await expect(v.locator('.sidebar .ref-item.current')).toHaveAttribute('title', 'feature')
    await expect.poll(() => ring.evaluate((el: HTMLElement) => el.style.transform)).not.toBe(before)
    expect(await ring.evaluate((el: HTMLElement) => el.dataset.mark)).toBe('kept')
    expect(await ring.evaluate((el) => getComputedStyle(el).transitionProperty)).toContain('transform')
    await expect.poll(async () => (await ghosts()).length).toBeGreaterThan(0)
    await expect(v.locator('.commit-row', { hasText: 'First' }).locator('.ref-badge.branch.head')).toHaveText('feature')
    expect((await ticks()).some((s) => s.startsWith('current-tick glide'))).toBe(true)
  } finally {
    await close()
  }
})

test('a push rolls its count down to zero with the arrow nudging, and a failed fetch shakes its button', async () => {
  const { repo } = repoWithRemote(tempDir())
  commit(repo, 'one.txt', '1\n', 'One')
  commit(repo, 'two.txt', '2\n', 'Two')
  commit(repo, 'three.txt', '3\n', 'Three')
  const { page, close } = await launch(repo)
  try {
    await page.evaluate(() => localStorage.setItem('bluegum.settings', JSON.stringify({ backgroundFetch: 0 })))
    await page.reload()
    const toolbar = view(page).locator('.toolbar')
    const push = toolbar.getByRole('button', { name: /^Push( ?\d+)?$/ })
    await expect(push).toHaveText('Push3')
    const digits = await watch(page, '.toolbar .badge > span')
    const working = await watch(page, '.toolbar .working-push')

    await push.click()
    await expect(push.locator('.badge')).toHaveCount(0)
    const counted = (await digits()).map((s) => Number(s.split('|')[1]))
    expect(counted.slice(-1)).toEqual([0])
    expect(counted).toEqual([...counted].sort((a, b) => b - a))
    expect((await working()).length).toBeGreaterThan(0)

    const shakes = await watch(page, '.toolbar button.shake')
    git(repo, 'remote', 'set-url', 'origin', join(tempDir(), 'missing.git'))
    await toolbar.getByRole('button', { name: /^Fetch/ }).click()
    await expect(page.locator('.toast')).toContainText('Fetching failed')
    expect((await shakes()).some((s) => s.includes('Fetch'))).toBe(true)
  } finally {
    await close()
  }
})
