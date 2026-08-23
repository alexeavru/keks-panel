import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import https from 'node:https'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Request, Response, NextFunction } from 'express'
import { OidcReauthError, testContext } from './k8s.js'

const defaultDexCa = join(dirname(fileURLToPath(import.meta.url)), '../deploy/tls/ca.crt')

function dexFetch(url: string, init?: RequestInit): Promise<Response> {
  const caFile = env('DEX_CA_FILE', defaultDexCa)
  if (!existsSync(caFile)) return fetch(url, init)

  const ca = readFileSync(caFile)
  const parsed = new URL(url)
  const body =
    init?.body == null
      ? undefined
      : typeof init.body === 'string'
        ? init.body
        : String(init.body)
  const headers: Record<string, string> = {}
  if (init?.headers) {
    const raw = init.headers
    if (raw instanceof Headers) {
      raw.forEach((value, key) => {
        headers[key] = value
      })
    } else if (Array.isArray(raw)) {
      for (const [key, value] of raw) headers[key] = value
    } else {
      for (const [key, value] of Object.entries(raw)) {
        if (typeof value === 'string') headers[key] = value
      }
    }
  }
  if (body && !headers['Content-Length'] && !headers['content-length']) {
    headers['Content-Length'] = String(Buffer.byteLength(body))
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method: init?.method || 'GET',
        headers,
        ca,
        servername: parsed.hostname,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk as Buffer))
        res.on('end', () => {
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode || 500,
              headers: res.headers as HeadersInit,
            }),
          )
        })
      },
    )
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

export type AuthProvider = 'dex' | 'kubeconfig'

export interface AuthUser {
  sub: string
  email: string
  name: string
  exp: number
  provider?: AuthProvider
}

const SESSION_COOKIE = 'keks.sid'
const OIDC_ID_COOKIE = 'keks.oidc.id'
const OIDC_RT_COOKIE = 'keks.oidc.rt'
const STATE_COOKIE = 'keks.oauth.state'
const VERIFIER_COOKIE = 'keks.oauth.verifier'
const SESSION_TTL_SEC = 8 * 60 * 60

function env(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback
}

export function dexConfig() {
  const issuer = env('DEX_ISSUER', 'https://host.docker.internal:5556/dex').replace(/\/$/, '')
  // На macOS host.docker.internal часто нет в DNS; браузер и локальный API ходят на localhost.
  const publicBase = env('DEX_PUBLIC_URL', 'https://localhost:5556/dex').replace(/\/$/, '')
  return {
    issuer,
    publicBase,
    clientId: env('DEX_CLIENT_ID', 'keks-panel'),
    clientSecret: env('DEX_CLIENT_SECRET', 'keks-panel-dev'),
    redirectUri: env('DEX_REDIRECT_URI', 'http://localhost:5173/api/auth/callback'),
    sessionSecret: env('SESSION_SECRET', 'keks-dev-session-secret'),
    frontendOrigin: env('KEKS_PUBLIC_URL', 'http://localhost:5173'),
  }
}

function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    out[key] = decodeURIComponent(value)
  }
  return out
}

function cookie(name: string, value: string, maxAge: number, httpOnly = true): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'SameSite=Lax',
  ]
  if (httpOnly) parts.push('HttpOnly')
  return parts.join('; ')
}

function clearCookie(name: string): string {
  return `${name}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly`
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url')
}

function sign(payload: string, secret: string): string {
  const body = Buffer.from(payload, 'utf8').toString('base64url')
  const sig = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

function unsign(token: string, secret: string): string | null {
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = createHmac('sha256', secret).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    return Buffer.from(body, 'base64url').toString('utf8')
  } catch {
    return null
  }
}

export function readUserFromCookieHeader(cookieHeader?: string | string[]): AuthUser | null {
  const header = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader
  const raw = parseCookies(header)[SESSION_COOKIE]
  if (!raw) return null
  const json = unsign(raw, dexConfig().sessionSecret)
  if (!json) return null
  try {
    const user = JSON.parse(json) as AuthUser
    if (!user?.sub || !user.exp || user.exp * 1000 < Date.now()) return null
    return user
  } catch {
    return null
  }
}

export function readUser(req: Request): AuthUser | null {
  return readUserFromCookieHeader(req.headers.cookie)
}

function appendCookie(res: Response, value: string) {
  const prev = res.getHeader('Set-Cookie')
  const list = !prev ? [] : Array.isArray(prev) ? prev.map(String) : [String(prev)]
  list.push(value)
  res.setHeader('Set-Cookie', list)
}

interface OidcTokens {
  idToken: string
  refreshToken?: string
}

function jwtExp(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
      exp?: number
    }
    return payload.exp ?? 0
  } catch {
    return 0
  }
}

function jwtKid(token: string): string {
  try {
    const header = JSON.parse(Buffer.from(token.split('.')[0] ?? '', 'base64url').toString('utf8')) as {
      kid?: string
    }
    return header.kid ?? ''
  } catch {
    return ''
  }
}

async function dexSigningKids(): Promise<string[]> {
  const res = await dexFetch(`${dexConfig().publicBase}/keys`)
  const json = (await res.json().catch(() => ({}))) as { keys?: { kid?: string }[] }
  if (!res.ok) return []
  return (json.keys ?? []).map((key) => key.kid).filter((kid): kid is string => Boolean(kid))
}

function readOidcTokensFromHeader(cookieHeader?: string | string[]): OidcTokens | null {
  const header = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader
  const cookies = parseCookies(header)
  const idToken = cookies[OIDC_ID_COOKIE]
  if (!idToken) return null
  return { idToken, refreshToken: cookies[OIDC_RT_COOKIE] || undefined }
}

function setOidcCookies(res: Response, tokens: OidcTokens) {
  appendCookie(res, cookie(OIDC_ID_COOKIE, tokens.idToken, SESSION_TTL_SEC))
  if (tokens.refreshToken) {
    appendCookie(res, cookie(OIDC_RT_COOKIE, tokens.refreshToken, SESSION_TTL_SEC))
  } else {
    appendCookie(res, clearCookie(OIDC_RT_COOKIE))
  }
}

function clearOidcCookies(): string[] {
  return [clearCookie(OIDC_ID_COOKIE), clearCookie(OIDC_RT_COOKIE), clearCookie('keks.oidc')]
}

async function refreshOidc(refreshToken: string): Promise<OidcTokens> {
  const cfg = dexConfig()
  const tokenRes = await dexFetch(`${cfg.publicBase}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }),
  })
  const json = (await tokenRes.json().catch(() => ({}))) as {
    id_token?: string
    refresh_token?: string
    error?: string
    error_description?: string
  }
  if (!tokenRes.ok || !json.id_token) {
    throw new Error(json.error_description || json.error || 'Не удалось обновить OIDC-токен')
  }
  return { idToken: json.id_token, refreshToken: json.refresh_token || refreshToken }
}

export async function ensureOidcToken(req: Request, res: Response): Promise<string> {
  let tokens = readOidcTokensFromHeader(req.headers.cookie)
  if (!tokens?.idToken) {
    throw new OidcReauthError('Нет OIDC-токена. Войдите через Dex')
  }
  const exp = jwtExp(tokens.idToken)
  const now = Math.floor(Date.now() / 1000)
  if (exp - now <= 45) {
    if (!tokens.refreshToken) {
      throw new OidcReauthError()
    }
    try {
      tokens = await refreshOidc(tokens.refreshToken)
      setOidcCookies(res, tokens)
    } catch {
      throw new OidcReauthError()
    }
  }

  const kids = await dexSigningKids().catch(() => [] as string[])
  const kid = jwtKid(tokens.idToken)
  if (kids.length && kid && !kids.includes(kid)) {
    if (!tokens.refreshToken) throw new OidcReauthError()
    try {
      tokens = await refreshOidc(tokens.refreshToken)
      setOidcCookies(res, tokens)
    } catch {
      throw new OidcReauthError()
    }
    const nextKid = jwtKid(tokens.idToken)
    if (kids.length && nextKid && !kids.includes(nextKid)) {
      throw new OidcReauthError()
    }
  }

  return tokens.idToken
}

export function readOidcIdTokenFromCookieHeader(cookieHeader?: string | string[]): string | null {
  return readOidcTokensFromHeader(cookieHeader)?.idToken ?? null
}

function pkce(verifier: string): string {
  return b64url(createHash('sha256').update(verifier).digest())
}

export function startLogin(_req: Request, res: Response) {
  const cfg = dexConfig()
  const state = b64url(randomBytes(24))
  const verifier = b64url(randomBytes(32))
  const nonce = b64url(randomBytes(16))
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: 'openid email profile groups offline_access',
    state,
    nonce,
    code_challenge: pkce(verifier),
    code_challenge_method: 'S256',
  })
  res.setHeader('Set-Cookie', [
    cookie(STATE_COOKIE, state, 600),
    cookie(VERIFIER_COOKIE, verifier, 600),
  ])
  res.redirect(302, `${cfg.publicBase}/auth?${params.toString()}`)
}

export async function handleCallback(req: Request, res: Response) {
  const cfg = dexConfig()
  try {
  const cookies = parseCookies(req.headers.cookie)
  const code = typeof req.query.code === 'string' ? req.query.code : ''
  const state = typeof req.query.state === 'string' ? req.query.state : ''
  const error = typeof req.query.error === 'string' ? req.query.error : ''

  if (error) {
    res.redirect(302, `${cfg.frontendOrigin}/login?error=${encodeURIComponent(error)}`)
    return
  }
  if (!code || !state || state !== cookies[STATE_COOKIE]) {
    res.redirect(302, `${cfg.frontendOrigin}/login?error=invalid_state`)
    return
  }

  const verifier = cookies[VERIFIER_COOKIE]
  if (!verifier) {
    res.redirect(302, `${cfg.frontendOrigin}/login?error=missing_verifier`)
    return
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code_verifier: verifier,
  })

  const tokenRes = await dexFetch(`${cfg.publicBase}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const tokenJson = (await tokenRes.json().catch(() => ({}))) as {
    access_token?: string
    id_token?: string
    refresh_token?: string
    error?: string
    error_description?: string
  }
  if (!tokenRes.ok || !tokenJson.id_token) {
    const msg = tokenJson.error_description || tokenJson.error || 'token_exchange_failed'
    res.redirect(302, `${cfg.frontendOrigin}/login?error=${encodeURIComponent(msg)}`)
    return
  }

  const infoRes = await dexFetch(`${cfg.publicBase}/userinfo`, {
    headers: { Authorization: `Bearer ${tokenJson.access_token || tokenJson.id_token}` },
  })
  const info = (await infoRes.json().catch(() => ({}))) as {
    sub?: string
    email?: string
    name?: string
    preferred_username?: string
  }
  if (!infoRes.ok || !info.sub) {
    res.redirect(302, `${cfg.frontendOrigin}/login?error=userinfo_failed`)
    return
  }

  const user: AuthUser = {
    sub: info.sub,
    email: info.email || '',
    name: info.name || info.preferred_username || info.email || info.sub,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
    provider: 'dex',
  }

  res.setHeader('Set-Cookie', [
    cookie(SESSION_COOKIE, sign(JSON.stringify(user), cfg.sessionSecret), SESSION_TTL_SEC),
    clearCookie(STATE_COOKIE),
    clearCookie(VERIFIER_COOKIE),
    ...clearOidcCookies(),
  ])
  setOidcCookies(res, { idToken: tokenJson.id_token, refreshToken: tokenJson.refresh_token })
  res.redirect(302, `${cfg.frontendOrigin}/cluster`)
  } catch (err) {
    console.error('dex callback failed', err)
    res.redirect(302, `${cfg.frontendOrigin}/login?error=callback_failed`)
  }
}

export function logout(_req: Request, res: Response) {
  res.setHeader('Set-Cookie', [clearCookie(SESSION_COOKIE), ...clearOidcCookies()])
  res.json({ ok: true })
}

export function me(req: Request, res: Response) {
  const user = readUser(req)
  if (!user) {
    res.status(401).json({ error: 'Требуется вход' })
    return
  }
  res.json({
    user: {
      sub: user.sub,
      email: user.email,
      name: user.name,
      provider: user.provider ?? 'dex',
    },
  })
}

export function publicUser(user: AuthUser) {
  return {
    sub: user.sub,
    email: user.email,
    name: user.name,
    provider: user.provider ?? 'dex',
  }
}

export function writeSessionCookie(res: Response, user: AuthUser) {
  res.setHeader('Set-Cookie', [
    cookie(SESSION_COOKIE, sign(JSON.stringify(user), dexConfig().sessionSecret), SESSION_TTL_SEC),
    ...clearOidcCookies(),
  ])
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = readUser(req)
  if (!user) {
    res.status(401).json({ error: 'Требуется вход' })
    return
  }
  next()
}

export async function loginWithKubeconfig(req: Request, res: Response) {
  const context = typeof req.body?.context === 'string' ? req.body.context.trim() : ''
  if (!context) {
    res.status(400).json({ error: 'Укажите context' })
    return
  }
  try {
    const result = await testContext(context)
    const user: AuthUser = {
      sub: `kubeconfig:${result.context}`,
      email: '',
      name: result.context,
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
      provider: 'kubeconfig',
    }
    writeSessionCookie(res, user)
    res.json({
      user: publicUser(user),
      context: result.context,
      server: result.server,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(400).json({ error: message })
  }
}
