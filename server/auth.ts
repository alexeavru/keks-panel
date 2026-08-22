import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'

export interface AuthUser {
  sub: string
  email: string
  name: string
  exp: number
}

const SESSION_COOKIE = 'keks.sid'
const STATE_COOKIE = 'keks.oauth.state'
const VERIFIER_COOKIE = 'keks.oauth.verifier'
const SESSION_TTL_SEC = 8 * 60 * 60

function env(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback
}

export function dexConfig() {
  const issuer = env('DEX_ISSUER', 'http://127.0.0.1:5556/dex').replace(/\/$/, '')
  return {
    issuer,
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
    scope: 'openid email profile groups',
    state,
    nonce,
    code_challenge: pkce(verifier),
    code_challenge_method: 'S256',
  })
  res.setHeader('Set-Cookie', [
    cookie(STATE_COOKIE, state, 600),
    cookie(VERIFIER_COOKIE, verifier, 600),
  ])
  res.redirect(302, `${cfg.issuer}/auth?${params.toString()}`)
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

  const tokenRes = await fetch(`${cfg.issuer}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const tokenJson = (await tokenRes.json().catch(() => ({}))) as {
    access_token?: string
    id_token?: string
    error?: string
    error_description?: string
  }
  if (!tokenRes.ok || !tokenJson.access_token) {
    const msg = tokenJson.error_description || tokenJson.error || 'token_exchange_failed'
    res.redirect(302, `${cfg.frontendOrigin}/login?error=${encodeURIComponent(msg)}`)
    return
  }

  const infoRes = await fetch(`${cfg.issuer}/userinfo`, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
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
  }

  res.setHeader('Set-Cookie', [
    cookie(SESSION_COOKIE, sign(JSON.stringify(user), cfg.sessionSecret), SESSION_TTL_SEC),
    clearCookie(STATE_COOKIE),
    clearCookie(VERIFIER_COOKIE),
  ])
  res.redirect(302, `${cfg.frontendOrigin}/connect`)
  } catch {
    res.redirect(302, `${cfg.frontendOrigin}/login?error=callback_failed`)
  }
}

export function logout(_req: Request, res: Response) {
  res.setHeader('Set-Cookie', [clearCookie(SESSION_COOKIE)])
  res.json({ ok: true })
}

export function me(req: Request, res: Response) {
  const user = readUser(req)
  if (!user) {
    res.status(401).json({ error: 'Требуется вход через Dex' })
    return
  }
  res.json({ user: { sub: user.sub, email: user.email, name: user.name } })
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = readUser(req)
  if (!user) {
    res.status(401).json({ error: 'Требуется вход через Dex' })
    return
  }
  next()
}
