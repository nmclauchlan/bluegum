import { expect, test, type ElectronApplication } from '@playwright/test'
import { join } from 'path'
import { writeFileSync } from 'fs'
import { commit, git, initRepo, launch, tempDir, view } from './helpers'

function isolatedGit(helper?: string): Record<string, string> {
  const file = join(tempDir('bluegum-gitconfig-'), 'gitconfig')
  writeFileSync(file, '')
  if (helper) git(tempDir(), 'config', '--file', file, 'credential.helper', helper)
  return { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: file }
}

async function fakeHost(app: ElectronApplication, routes: [string, unknown][]): Promise<void> {
  await app.evaluate((_electron, list) => {
    const g = globalThis as unknown as { seenAuth: string[] }
    g.seenAuth = []
    globalThis.fetch = (async (input: unknown, init?: { headers?: Record<string, string> }) => {
      const url = String(input)
      const auth = init?.headers?.Authorization
      if (auth) g.seenAuth.push(auth)
      for (const [pattern, body] of list) if (url.includes(pattern)) return Response.json(body)
      return Response.json({ message: 'Not found' }, { status: 404 })
    }) as typeof fetch
  }, routes)
}

const seenAuth = (app: ElectronApplication): Promise<string[]> => app.evaluate(() => (globalThis as unknown as { seenAuth: string[] }).seenAuth)

test('a repository with no account connects in one click using the sign-in git already has', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'a.txt', 'a\n', 'First')
  git(repo, 'remote', 'add', 'origin', 'https://github.com/acme/widgets.git')
  const helper = '!f() { test "$1" = get || return 0; echo username=tester; echo password=helper-token; }; f'
  const { app, page, close } = await launch(repo, undefined, isolatedGit(helper))
  try {
    await fakeHost(app, [
      ['/user', { login: 'tester', name: 'Test User' }],
      ['/pulls', []]
    ])
    const v = view(page)
    await v.getByRole('button', { name: 'Connect to GitHub' }).click()
    const dialog = page.getByRole('dialog', { name: 'Connect an account' })
    await expect(dialog.getByRole('radio', { name: 'GitHub' })).toHaveAttribute('aria-checked', 'true')
    const found = dialog.locator('.connect-found', { hasText: 'Test User (tester)' })
    await expect(found).toContainText('from your Git credential helper')
    await found.getByRole('button', { name: 'Use this sign-in' }).click()
    await expect(page.locator('.toast')).toContainText('Connected to GitHub as Test User (tester)')
    await expect(dialog).toHaveCount(0)
    await expect(v.getByRole('button', { name: 'Connect to GitHub' })).toHaveCount(0)
    await expect.poll(async () => (await seenAuth(app)).filter((a) => a === 'Bearer helper-token').length).toBeGreaterThanOrEqual(3)

    await page.keyboard.press('Control+,')
    const settings = page.locator('.settings-dialog')
    await expect(settings.locator('.account-row')).toContainText('https://github.com · Test User (tester) · Git credential helper')
    await settings.getByRole('button', { name: 'Connect an account…' }).click()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(settings).toBeVisible()
  } finally {
    await close()
  }
})

test('without a sign-in on the computer, the token route links to a pre-filled token page', async () => {
  const { app, page, close } = await launch(undefined, undefined, isolatedGit())
  try {
    await fakeHost(app, [['/api/v4/user', { username: 'tester', name: 'Test User' }]])
    await page.getByRole('button', { name: /^Connect GitHub, Azure DevOps or GitLab/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Connect an account' })

    await dialog.getByRole('radio', { name: 'Azure DevOps' }).click()
    await dialog.getByRole('textbox', { name: 'Organisation' }).fill('my-org')
    await expect(dialog.getByRole('link', { name: 'Create a token on Azure DevOps' })).toHaveAttribute('href', 'https://dev.azure.com/my-org/_usersSettings/tokens')

    await dialog.getByRole('radio', { name: 'GitLab' }).click()
    await expect(dialog).toContainText('No sign-in for GitLab found on this computer', { timeout: 20_000 })
    await expect(dialog.getByRole('link', { name: 'Create a token on GitLab' })).toHaveAttribute(
      'href',
      'https://gitlab.com/-/user_settings/personal_access_tokens?name=Blue%20Gum&scopes=api'
    )
    await dialog.getByRole('textbox', { name: 'Personal access token' }).fill('pasted-token')
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click()
    await expect(page.locator('.toast')).toContainText('Connected to GitLab as Test User (tester)')
    expect(await seenAuth(app)).toContain('Bearer pasted-token')
  } finally {
    await close()
  }
})

test('a GitHub CLI sign-in is offered alongside the git one and stays linked to the CLI', async () => {
  const helper = '!f() { test "$1" = get || return 0; echo username=tester; echo password=helper-token; }; f'
  const { app, page, close } = await launch(undefined, undefined, { ...isolatedGit(helper), BLUEGUM_FAKE_GH_TOKEN: 'gh-token' })
  try {
    await fakeHost(app, [['/user', { login: 'tester', name: 'Test User' }]])
    await page.getByRole('button', { name: /^Connect GitHub, Azure DevOps or GitLab/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Connect an account' })
    await dialog.getByRole('radio', { name: 'GitHub' }).click()
    const found = dialog.locator('.connect-found')
    await expect(found).toHaveCount(2, { timeout: 20_000 })
    await expect(found.nth(0)).toContainText('from the GitHub CLI')
    await expect(found.nth(1)).toContainText('from your Git credential helper')
    await found.nth(0).getByRole('button', { name: 'Use this sign-in' }).click()
    await expect(page.locator('.toast')).toContainText('Connected to GitHub as Test User (tester)')
    expect(await seenAuth(app)).toContain('Bearer gh-token')
    await page.keyboard.press('Control+,')
    await expect(page.locator('.settings-dialog .account-row')).toContainText('GitHub CLI')
  } finally {
    await close()
  }
})
