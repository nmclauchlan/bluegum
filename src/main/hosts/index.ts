import { simpleGit } from 'simple-git'
import type { BuildFailure, CommitBuild, ExternalSource, HostAccount, HostApi, HostInfo, HostKind, HostRepo, PullRequest, PullRequestDetails } from '@shared/types'
import { gitWithEnv } from '../git'
import { azureOrgUrl, deleteAccount, findAccount, findToken, listAccounts, storeAccount } from './accounts'
import { browserSignIn, externalToken, forgetToken, signInOptions, SOURCE_NAMES } from './signin'
import * as azure from './azure'
import * as github from './github'
import * as gitlab from './gitlab'

interface Adapter {
  cloneUser: string
  listRepos(baseUrl: string, token: string): Promise<HostRepo[]>
  validateToken(baseUrl: string, token: string): Promise<string>
  listPullRequests(info: HostInfo, token: string): Promise<PullRequest[]>
  getPullRequest(info: HostInfo, token: string, id: number): Promise<PullRequestDetails>
  createPullRequest(
    info: HostInfo,
    token: string,
    source: string,
    target: string,
    title: string,
    description: string,
    draft: boolean
  ): Promise<PullRequest>
  listBuilds(info: HostInfo, token: string, shas: string[]): Promise<Record<string, CommitBuild[]>>
  buildFailures(info: HostInfo, token: string, build: CommitBuild): Promise<BuildFailure[]>
}

const adapters: Record<HostKind, Adapter | null> = { azure, github, gitlab }

const detected = new Map<string, HostInfo | null>()

async function remoteUrl(repoPath: string): Promise<string | null> {
  try {
    const g = simpleGit({ baseDir: repoPath })
    const remotes = await g.getRemotes(true)
    const origin = remotes.find((r) => r.name === 'origin') ?? remotes[0]
    return origin?.refs.fetch ?? origin?.refs.push ?? null
  } catch {
    return null
  }
}

function selfHosted(kind: HostKind, publicHost: string): string[] {
  return listAccounts()
    .filter((a) => a.kind === kind)
    .map((a) => a.baseUrl.replace(/^https?:\/\//i, ''))
    .filter((h) => h !== publicHost)
}

export function parseRemote(remote: string): HostInfo | null {
  return (
    azure.parseAzureRemote(remote) ??
    github.parseGithubRemote(remote, selfHosted('github', 'github.com')) ??
    gitlab.parseGitlabRemote(remote, selfHosted('gitlab', 'gitlab.com'))
  )
}

export async function detect(repoPath: string): Promise<HostInfo | null> {
  const remote = await remoteUrl(repoPath)
  const info = remote ? parseRemote(remote) : null
  detected.set(repoPath, info)
  return info
}

function adapterFor(kind: HostKind): Adapter {
  const a = adapters[kind]
  if (!a) throw new Error(`${kind} is not supported yet`)
  return a
}

async function tokenOf(kind: HostKind, baseUrl: string, fresh = false): Promise<string | null> {
  const account = findAccount(kind, baseUrl)
  if (!account) return null
  if (account.source === 'token') return findToken(kind, baseUrl)
  return externalToken(account.source, account.baseUrl, fresh)
}

async function tokenFor(kind: HostKind, baseUrl: string, fresh = false): Promise<string> {
  const account = findAccount(kind, baseUrl)
  if (!account) throw new Error(`No account for ${baseUrl}. Connect one from the sidebar or Settings.`)
  const token = await tokenOf(kind, baseUrl, fresh)
  if (token) return token
  if (account.source === 'token') throw new Error(`The token for ${baseUrl} can't be read. Connect the account again in Settings.`)
  throw new Error(`Couldn't get your sign-in for ${baseUrl} from ${SOURCE_NAMES[account.source]}. Connect the account again in Settings.`)
}

const authFailed = (e: unknown): boolean => /\((401|403)\)|interactive sign-in/.test(e instanceof Error ? e.message : String(e))

async function withHost<T>(repoPath: string, fn: (info: HostInfo, token: string, adapter: Adapter) => Promise<T>): Promise<T> {
  const info = detected.get(repoPath) ?? (await detect(repoPath))
  if (!info) throw new Error('This repository is not hosted on a supported service')
  return withToken(info.kind, info.baseUrl, (token) => fn(info, token, adapterFor(info.kind)))
}

async function withToken<T>(kind: HostKind, baseUrl: string, fn: (token: string) => Promise<T>): Promise<T> {
  const token = await tokenFor(kind, baseUrl)
  try {
    return await fn(token)
  } catch (e) {
    const source = findAccount(kind, baseUrl)?.source ?? 'token'
    if (source === 'token' || !authFailed(e)) throw e
    forgetToken(source, normaliseKey(baseUrl))
    const fresh = await tokenOf(kind, baseUrl, true)
    if (!fresh || fresh === token) throw e
    return fn(fresh)
  }
}

const normaliseKey = (baseUrl: string): string => baseUrl.trim().replace(/\/+$/, '').toLowerCase()

function normaliseBaseUrl(kind: HostKind, baseUrl: string): string {
  const url = baseUrl.trim().replace(/\/+$/, '')
  if (kind === 'azure') {
    if (!/^https:\/\/dev\.azure\.com\/[^/]+$|^https:\/\/[^./]+\.visualstudio\.com$/i.test(url)) {
      throw new Error('Enter the organisation URL, for example https://dev.azure.com/my-org')
    }
    return azureOrgUrl(url)
  }
  if (kind === 'github') {
    const u = url || 'https://github.com'
    if (!/^https:\/\/[^/]+$/i.test(u)) throw new Error('Enter the host URL, for example https://github.com or https://github.my-company.com')
    return u
  }
  if (kind === 'gitlab') {
    const u = url || 'https://gitlab.com'
    if (!/^https:\/\/[^/]+$/i.test(u)) throw new Error('Enter the host URL, for example https://gitlab.com or https://gitlab.my-company.com')
    return u
  }
  throw new Error(`${kind} is not supported yet`)
}

function connected(account: HostAccount): HostAccount {
  detected.clear()
  return account
}

export const hostApi: HostApi = {
  detect,
  async listRepos(kind, baseUrl) {
    const repos = await withToken(kind, baseUrl, (token) => adapterFor(kind).listRepos(baseUrl, token))
    return repos.sort((a, b) => b.updatedAt - a.updatedAt)
  },
  async cloneFromHost(kind, baseUrl, url, dest) {
    const env: Record<string, string> = { GIT_TERMINAL_PROMPT: '0' }
    if (/^https?:/i.test(url)) {
      const adapter = adapterFor(kind)
      const token = await tokenFor(kind, baseUrl)
      const basic = Buffer.from(`${adapter.cloneUser}:${token}`).toString('base64')
      env.GIT_CONFIG_COUNT = '1'
      env.GIT_CONFIG_KEY_0 = 'http.extraHeader'
      env.GIT_CONFIG_VALUE_0 = `Authorization: Basic ${basic}`
    }
    const g = gitWithEnv(env)
    const cleanUrl = url.replace(/^(https?:\/\/)[^@/]+@/i, '$1')
    try {
      await g.clone(cleanUrl, dest)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(msg.replace(/Authorization: Basic [A-Za-z0-9+/=]+/g, 'Authorization: Basic ***'))
    }
    return dest
  },
  async accounts() {
    return listAccounts()
  },
  async hasAccount(repoPath) {
    const info = detected.get(repoPath) ?? (await detect(repoPath))
    return !!info && !!findAccount(info.kind, info.baseUrl)
  },
  async addAccount(kind: HostKind, baseUrl: string, token: string): Promise<HostAccount> {
    const url = normaliseBaseUrl(kind, baseUrl)
    const user = await adapterFor(kind).validateToken(url, token.trim())
    return connected(storeAccount(kind, url, user, token.trim()))
  },
  async signInOptions(kind, baseUrl) {
    const url = normaliseBaseUrl(kind, baseUrl)
    return signInOptions(kind, normaliseKey(url), (token) => adapterFor(kind).validateToken(url, token))
  },
  async connectSignIn(kind, baseUrl, source: ExternalSource) {
    const url = normaliseBaseUrl(kind, baseUrl)
    const token = await externalToken(source, normaliseKey(url), true)
    if (!token) throw new Error(`Couldn't get your sign-in for ${url} from ${SOURCE_NAMES[source]}.`)
    const user = await adapterFor(kind).validateToken(url, token)
    return connected(storeAccount(kind, url, user, '', source))
  },
  async browserSignIn(kind, baseUrl) {
    const url = normaliseBaseUrl(kind, baseUrl)
    const user = await browserSignIn(normaliseKey(url), (token) => adapterFor(kind).validateToken(url, token))
    return connected(storeAccount(kind, url, user, '', 'git'))
  },
  async removeAccount(kind, baseUrl) {
    deleteAccount(kind, baseUrl)
    detected.clear()
  },
  async pullRequests(repoPath) {
    return withHost(repoPath, (info, token, adapter) => adapter.listPullRequests(info, token))
  },
  async pullRequest(repoPath, id) {
    return withHost(repoPath, (info, token, adapter) => adapter.getPullRequest(info, token, id))
  },
  async builds(repoPath, shas) {
    const info = detected.get(repoPath) ?? (await detect(repoPath))
    const valid = shas.filter((s) => /^[0-9a-f]{40}$/i.test(s))
    if (!info || !valid.length || !findAccount(info.kind, info.baseUrl)) return {}
    return withHost(repoPath, (i, token, adapter) => adapter.listBuilds(i, token, valid))
  },
  async buildFailures(repoPath, build) {
    return withHost(repoPath, (info, token, adapter) => adapter.buildFailures(info, token, build))
  },
  async createPullRequest(repoPath, source, target, title, description, draft) {
    return withHost(repoPath, (info, token, adapter) => adapter.createPullRequest(info, token, source, target, title, description, draft))
  }
}
