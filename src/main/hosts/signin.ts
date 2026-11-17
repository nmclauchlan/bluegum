import { spawn } from 'child_process'
import type { ExternalSource, HostKind, SignInOption, SignInOptions } from '@shared/types'
import { gitBinary } from '../git'

const AZURE_DEVOPS_RESOURCE = '499b84ac-1321-427f-aa17-267ca6975798'
const QUIET_MS = 20_000
const BROWSER_MS = 5 * 60_000
const CACHE_MS = 10 * 60_000
const EXPIRY_MARGIN_MS = 5 * 60_000
const SAFE_HOST = /^[a-z0-9.-]+(:\d+)?$/i

const SOURCES: Record<HostKind, ExternalSource[]> = { github: ['gh', 'git'], gitlab: ['git'], azure: ['git', 'az'] }

export const SOURCE_NAMES: Record<ExternalSource, string> = { git: 'your Git credential helper', gh: 'the GitHub CLI', az: 'the Azure CLI' }

interface Run {
  code: number
  out: string
}

function run(cmd: string, args: string[], opts: { input?: string; env?: Record<string, string>; timeout: number; shell?: boolean }): Promise<Run> {
  return new Promise((resolve) => {
    let out = ''
    let settled = false
    const finish = (code: number): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, out })
    }
    const env = { ...process.env, ...opts.env }
    const child = opts.shell ? spawn([cmd, ...args].join(' '), { env, shell: true, windowsHide: true }) : spawn(cmd, args, { env, windowsHide: true })
    const timer = setTimeout(() => {
      child.kill()
      finish(-1)
    }, opts.timeout)
    child.stdout?.on('data', (d: Buffer) => (out += d.toString()))
    child.on('error', () => finish(-1))
    child.on('close', (code) => finish(code ?? -1))
    child.stdin?.on('error', () => undefined)
    child.stdin?.end(opts.input ?? '')
  })
}

const viaShell = process.platform === 'win32'

function query(baseUrl: string): string {
  const u = new URL(baseUrl)
  const path = u.pathname.replace(/^\/+|\/+$/g, '')
  return [`protocol=${u.protocol.slice(0, -1)}`, `host=${u.host}`, ...(path ? [`path=${path}`] : [])].join('\n') + '\n'
}

interface Credential {
  username: string
  password: string
}

async function gitCredential(baseUrl: string, interactive: boolean): Promise<Credential | null> {
  const env: Record<string, string> = interactive ? { GIT_TERMINAL_PROMPT: '0' } : { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }
  const res = await run(gitBinary(), ['credential', 'fill'], { input: `${query(baseUrl)}\n`, env, timeout: interactive ? BROWSER_MS : QUIET_MS })
  if (res.code !== 0) return null
  const fields = new Map<string, string>()
  for (const line of res.out.split(/\r?\n/)) {
    const at = line.indexOf('=')
    if (at > 0) fields.set(line.slice(0, at), line.slice(at + 1))
  }
  const password = fields.get('password')
  return password ? { username: fields.get('username') ?? '', password } : null
}

async function approve(baseUrl: string, cred: Credential): Promise<void> {
  await run(gitBinary(), ['credential', 'approve'], { input: `${query(baseUrl)}username=${cred.username}\npassword=${cred.password}\n\n`, timeout: QUIET_MS })
}

async function helperFor(baseUrl: string): Promise<string> {
  const res = await run(gitBinary(), ['config', '--get-urlmatch', 'credential.helper', baseUrl], { timeout: QUIET_MS })
  return res.code === 0 ? res.out.trim() : ''
}

async function ghToken(baseUrl: string): Promise<string | null> {
  const host = new URL(baseUrl).host
  if (!SAFE_HOST.test(host)) return null
  const res = await run('gh', ['auth', 'token', '--hostname', host], { timeout: QUIET_MS, shell: viaShell })
  return (res.code === 0 && res.out.trim()) || null
}

async function azToken(): Promise<{ token: string; until: number } | null> {
  const res = await run('az', ['account', 'get-access-token', '--resource', AZURE_DEVOPS_RESOURCE, '--output', 'json'], { timeout: QUIET_MS * 2, shell: viaShell })
  if (res.code !== 0) return null
  try {
    const out = JSON.parse(res.out) as { accessToken?: string; expires_on?: number; expiresOn?: string }
    if (!out.accessToken) return null
    const expires = out.expires_on ? out.expires_on * 1000 : out.expiresOn ? Date.parse(out.expiresOn) : Date.now() + CACHE_MS
    return { token: out.accessToken, until: expires - EXPIRY_MARGIN_MS }
  } catch {
    return null
  }
}

const cache = new Map<string, { token: string; until: number }>()

export async function externalToken(source: ExternalSource, baseUrl: string, fresh = false): Promise<string | null> {
  const key = `${source}|${baseUrl}`
  const hit = cache.get(key)
  if (!fresh && hit && hit.until > Date.now()) return hit.token
  let token: string | null = null
  let until = Date.now() + CACHE_MS
  if (source === 'git') token = (await gitCredential(baseUrl, false))?.password ?? null
  else if (source === 'gh') token = await ghToken(baseUrl)
  else {
    const az = await azToken()
    if (az) {
      token = az.token
      until = Math.min(until, az.until)
    }
  }
  if (token) cache.set(key, { token, until })
  else cache.delete(key)
  return token
}

export function forgetToken(source: ExternalSource, baseUrl: string): void {
  cache.delete(`${source}|${baseUrl}`)
}

export async function signInOptions(kind: HostKind, baseUrl: string, validate: (token: string) => Promise<string>): Promise<SignInOptions> {
  const helper = helperFor(baseUrl)
  const found = await Promise.all(
    SOURCES[kind].map(async (source): Promise<SignInOption | null> => {
      const token = await externalToken(source, baseUrl, true)
      if (!token) return null
      try {
        return { source, user: await validate(token) }
      } catch {
        forgetToken(source, baseUrl)
        return null
      }
    })
  )
  return { found: found.filter((f): f is SignInOption => !!f), browser: /manager/i.test(await helper) }
}

async function reject(baseUrl: string, cred: Credential): Promise<void> {
  await run(gitBinary(), ['credential', 'reject'], { input: `${query(baseUrl)}username=${cred.username}\npassword=${cred.password}\n\n`, timeout: QUIET_MS })
}

export async function browserSignIn(baseUrl: string, validate: (token: string) => Promise<string>): Promise<string> {
  const saved = await gitCredential(baseUrl, false)
  if (saved) {
    try {
      const user = await validate(saved.password)
      cache.set(`git|${baseUrl}`, { token: saved.password, until: Date.now() + CACHE_MS })
      return user
    } catch {
      await reject(baseUrl, saved)
    }
  }
  const cred = await gitCredential(baseUrl, true)
  if (!cred) throw new Error("The sign-in didn't finish. Try again, or use a personal access token.")
  const user = await validate(cred.password)
  await approve(baseUrl, cred)
  cache.set(`git|${baseUrl}`, { token: cred.password, until: Date.now() + CACHE_MS })
  return user
}
