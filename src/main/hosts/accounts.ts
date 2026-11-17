import { app, safeStorage } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { CredentialSource, HostAccount, HostKind } from '@shared/types'

interface StoredAccount extends Omit<HostAccount, 'source'> {
  source?: CredentialSource
  token: string
}

let cache: StoredAccount[] | null = null

function file(): string {
  return join(app.getPath('userData'), 'accounts.json')
}

function load(): StoredAccount[] {
  if (cache) return cache
  try {
    cache = (JSON.parse(readFileSync(file(), 'utf8')) as StoredAccount[]).map((a) => (a.kind === 'azure' ? { ...a, baseUrl: azureOrgUrl(a.baseUrl) } : a))
  } catch {
    cache = []
  }
  return cache!
}

export function azureOrgUrl(url: string): string {
  const legacy = /^https:\/\/([^./]+)\.visualstudio\.com\/?$/i.exec(url.trim())
  return legacy ? `https://dev.azure.com/${legacy[1].toLowerCase()}` : url
}

function save(list: StoredAccount[]): void {
  cache = list
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(file(), JSON.stringify(list, null, 2))
}

function canEncrypt(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function normalise(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '').toLowerCase()
}

const view = ({ kind, baseUrl, user, encrypted, source }: StoredAccount): HostAccount => ({ kind, baseUrl, user, encrypted, source: source ?? 'token' })

export function listAccounts(): HostAccount[] {
  return load().map(view)
}

export function findAccount(kind: HostKind, baseUrl: string): HostAccount | null {
  const acc = load().find((a) => a.kind === kind && a.baseUrl === normalise(baseUrl))
  return acc ? view(acc) : null
}

export function findToken(kind: HostKind, baseUrl: string): string | null {
  const acc = load().find((a) => a.kind === kind && a.baseUrl === normalise(baseUrl))
  if (!acc || (acc.source ?? 'token') !== 'token') return null
  if (!acc.encrypted) return acc.token
  try {
    return safeStorage.decryptString(Buffer.from(acc.token, 'base64'))
  } catch {
    return null
  }
}

export function storeAccount(kind: HostKind, baseUrl: string, user: string, token: string, source: CredentialSource = 'token'): HostAccount {
  const external = source !== 'token'
  const encrypted = external || canEncrypt()
  const stored = external ? '' : encrypted ? safeStorage.encryptString(token).toString('base64') : token
  const url = normalise(baseUrl)
  const list = load().filter((a) => !(a.kind === kind && a.baseUrl === url))
  list.push({ kind, baseUrl: url, user, encrypted, source, token: stored })
  save(list)
  return { kind, baseUrl: url, user, encrypted, source }
}

export function deleteAccount(kind: HostKind, baseUrl: string): void {
  const url = normalise(baseUrl)
  save(load().filter((a) => !(a.kind === kind && a.baseUrl === url)))
}
