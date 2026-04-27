import express from 'express'
import session from 'express-session'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function env(name, fallback) {
  const v = process.env[name]
  return v == null || v === '' ? fallback : v
}

const PORT = Number(env('PORT', '5179'))
const HOST = env('HOST', '0.0.0.0')
const SESSION_SECRET = env('SESSION_SECRET', '')
// Must match the Set-Cookie name on login and what the browser sends to /api/*. Also set
// in env on the server (do not rely on defaults if you ever used another name or SECRET).
const SESSION_NAME = env('SESSION_NAME', 'callspire_softphone_sid')
const TRUST_PROXY = env('TRUST_PROXY', 'false') === 'true'
/** true | false | 'auto' — auto uses X-Forwarded-Proto when TRUST_PROXY + session proxy option are on */
const SESSION_SECURE_RAW = (process.env.SESSION_SECURE || '').trim().toLowerCase()
const SESSION_COOKIE_SECURE =
  SESSION_SECURE_RAW === 'true'
    ? true
    : SESSION_SECURE_RAW === 'false'
      ? false
      : TRUST_PROXY
        ? 'auto'
        : false

const SOFTPHONE_BASE = '/softphone'
const API_BASE = '/api'

/** Base URL of Callspire PBX Gateway (Python service on/near MikoPBX). Legacy env: CDR_PROXY_BASE_URL */
const PBX_GATEWAY_BASE_URL = env(
  'PBX_GATEWAY_BASE_URL',
  env('CDR_PROXY_BASE_URL', 'http://127.0.0.1:8005'),
)
/** Shared secret for login endpoints when gateway requires X-Callspire-Service-Token. Legacy: CDR_PROXY_SERVICE_TOKEN */
const PBX_GATEWAY_SERVICE_TOKEN = env(
  'PBX_GATEWAY_SERVICE_TOKEN',
  env('CDR_PROXY_SERVICE_TOKEN', ''),
)

/** MikoPBX WebRTC: WSS endpoint (see PBX WebRTC settings), e.g. wss://127.0.0.1:8089/ws */
const WEBRTC_SIP_WS_URL = env('WEBRTC_SIP_WS_URL', '')
/** Host part for sip:user@HOST — usually PBX IP or domain (no port). */
const WEBRTC_SIP_HOST = env('WEBRTC_SIP_HOST', '')
/** Optional: comma-separated TURN URLs (turn: or turns:) */
const WEBRTC_TURN_URLS = env('WEBRTC_TURN_URLS', '')
const WEBRTC_TURN_USERNAME = env('WEBRTC_TURN_USERNAME', '')
const WEBRTC_TURN_PASSWORD = env('WEBRTC_TURN_PASSWORD', '')

if (!SESSION_SECRET) {
  // eslint-disable-next-line no-console
  console.warn('[softphone-bff] SESSION_SECRET is not set. Set it in production.')
}
if (process.env.NODE_ENV === 'production' && (SESSION_SECRET === 'dev-secret-change-me' || !SESSION_SECRET)) {
  // eslint-disable-next-line no-console
  console.warn(
    '[softphone-bff] Using default or empty SESSION_SECRET in production — existing cookies will be invalid after changes; set a strong stable secret.',
  )
}
if (TRUST_PROXY) {
  // eslint-disable-next-line no-console
  console.log('[softphone-bff] trust proxy on (X-Forwarded-Proto for HTTPS).')
} else {
  // eslint-disable-next-line no-console
  console.warn('[softphone-bff] TRUST_PROXY is off. Behind nginx, set TRUST_PROXY=true (see README).')
}
if (TRUST_PROXY && SESSION_COOKIE_SECURE === false) {
  // eslint-disable-next-line no-console
  console.warn(
    '[softphone-bff] TRUST_PROXY is on but session cookie is not Secure. Set SESSION_SECURE=true or omit it to use "auto" with X-Forwarded-Proto.',
  )
} else if (SESSION_COOKIE_SECURE === true) {
  // eslint-disable-next-line no-console
  console.log('[softphone-bff] session cookie: Secure (fixed)')
} else if (SESSION_COOKIE_SECURE === 'auto') {
  // eslint-disable-next-line no-console
  console.log('[softphone-bff] session cookie: Secure=auto (from X-Forwarded-Proto when behind HTTPS proxy)')
}

const app = express()
app.disable('x-powered-by')
if (TRUST_PROXY) app.set('trust proxy', 1)

app.use(morgan('combined'))
app.use(helmet({ contentSecurityPolicy: false }))
app.use(compression())
app.use(express.json({ limit: '200kb' }))

app.use(
  session({
    name: SESSION_NAME,
    secret: SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    proxy: TRUST_PROXY,
    cookie: {
      httpOnly: true,
      secure: SESSION_COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  }),
)

function requireAuth(req, res, next) {
  if (!req.session?.proxyJwt || !req.session?.me) {
    return res.status(401).json({ message: 'Not authenticated' })
  }
  next()
}

async function proxyFetch(req, proxyPath, init = {}) {
  const url = new URL(proxyPath, PBX_GATEWAY_BASE_URL)
  const headers = new Headers(init.headers || {})

  if (req.session?.proxyJwt) {
    headers.set('Authorization', `Bearer ${req.session.proxyJwt}`)
  }

  if (PBX_GATEWAY_SERVICE_TOKEN) {
    headers.set('X-Callspire-Service-Token', PBX_GATEWAY_SERVICE_TOKEN)
  }

  const res = await fetch(url, { ...init, headers })
  const ct = res.headers.get('content-type') || ''
  const body = ct.includes('application/json') ? await res.json().catch(() => ({})) : await res.text()
  if (!res.ok) {
    const msg = typeof body === 'string' ? body : body?.detail || body?.message || res.statusText
    const err = new Error(msg)
    err.status = res.status
    err.details = body
    throw err
  }
  return body
}

// ----------------- Auth API (used by softphone-web) -----------------

app.post(`${API_BASE}/auth/login`, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  if (!email || !password) return res.status(400).json({ message: 'email and password are required' })

  try {
    const r = await proxyFetch(req, '/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: email, password }),
    })

    if (!r?.token) return res.status(502).json({ message: 'Proxy login did not return token' })

    // New session id on login (mitigates fixation) and clear any stale signed cookie state.
    req.session.regenerate((regenErr) => {
      if (regenErr) {
        // eslint-disable-next-line no-console
        console.error('[softphone-bff] session.regenerate failed:', regenErr)
        return res.status(500).json({ message: 'Session error' })
      }
      req.session.proxyJwt = r.token
      req.session.me = {
        email,
        extension: r.extension || '',
        must_change_password: Boolean(r.must_change_password),
      }
      return res.json({ ok: true, me: req.session.me })
    })
  } catch (e) {
    return res.status(e.status || 401).json({ message: e.message || 'Login failed' })
  }
})

app.post(`${API_BASE}/auth/logout`, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(SESSION_NAME, { path: '/' })
    res.json({ ok: true })
  })
})

app.get(`${API_BASE}/me`, (req, res) => {
  if (!req.session?.proxyJwt || !req.session?.me) {
    return res.status(401).json({ message: 'Not authenticated' })
  }
  res.json(req.session.me)
})

app.post(`${API_BASE}/me/change-password`, requireAuth, async (req, res) => {
  const current_password = String(req.body?.current_password || '')
  const new_password = String(req.body?.new_password || '')
  if (!current_password || !new_password) return res.status(400).json({ message: 'current_password and new_password are required' })

  try {
    const r = await proxyFetch(req, '/api/v1/me/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password, new_password }),
    })
    // refresh must_change_password locally
    req.session.me.must_change_password = false
    res.json(r)
  } catch (e) {
    res.status(e.status || 502).json({ message: e.message || 'Change password failed' })
  }
})

// Softphone preferences (audio devices, AEC/NS/AGC, ringtone). Proxied 1:1
// to the Python service which does the whitelisting.
app.get(`${API_BASE}/me/preferences`, requireAuth, async (req, res) => {
  try {
    const r = await proxyFetch(req, '/api/v1/me/preferences', { method: 'GET' })
    res.json(r)
  } catch (e) {
    res.status(e.status || 502).json({ message: e.message || 'Failed to load preferences' })
  }
})

app.put(`${API_BASE}/me/preferences`, requireAuth, async (req, res) => {
  try {
    const r = await proxyFetch(req, '/api/v1/me/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    })
    res.json(r)
  } catch (e) {
    res.status(e.status || 502).json({ message: e.message || 'Failed to save preferences' })
  }
})

app.get(`${API_BASE}/webrtc/config`, requireAuth, async (req, res) => {
  const extSession = String(req.session?.me?.extension || '').trim()
  const iceServers = []
  iceServers.push({ urls: 'stun:stun.l.google.com:19302' })
  iceServers.push({ urls: 'stun:stun1.l.google.com:19302' })
  if (WEBRTC_TURN_URLS) {
    for (const u of WEBRTC_TURN_URLS.split(',').map((s) => s.trim()).filter(Boolean)) {
      const entry = { urls: u }
      if (WEBRTC_TURN_USERNAME) entry.username = WEBRTC_TURN_USERNAME
      if (WEBRTC_TURN_PASSWORD) entry.credential = WEBRTC_TURN_PASSWORD
      iceServers.push(entry)
    }
  }

  let wsUrl = WEBRTC_SIP_WS_URL
  let sipHost = WEBRTC_SIP_HOST
  let extension = extSession
  let sipPassword = ''
  let sipAuthUser = ''
  try {
    const r = await proxyFetch(req, '/api/v1/webrtc/config', { method: 'GET' })
    const w = String(r?.wsUrl || '').trim()
    const h = String(r?.sipHost || '').trim()
    if (w) wsUrl = w
    if (h) sipHost = h
    const ex = String(r?.extension || '').trim()
    if (ex) extension = ex
    const sp = String(r?.sipPassword || '').trim()
    if (sp) sipPassword = sp
    const au = String(r?.sipAuthUser || '').trim()
    if (au) sipAuthUser = au
  } catch (e) {
    // Proxy returns 403 if JWT is admin-only (no softphone WebRTC path). Silent fallback leaves wsUrl empty.
    console.warn('[softphone-bff] proxy /api/v1/webrtc/config failed:', e?.message || e)
  }

  res.json({
    wsUrl,
    sipHost,
    extension,
    iceServers,
    ...(sipPassword ? { sipPassword } : {}),
    ...(sipAuthUser ? { sipAuthUser } : {}),
  })
})

// ----------------- Softphone API (proxied) -----------------

app.get(`${API_BASE}/my-callerids`, requireAuth, async (req, res) => {
  try {
    const r = await proxyFetch(req, '/api/my-callerids', { method: 'GET' })
    res.json(r)
  } catch (e) {
    res.status(e.status || 502).json({ message: e.message || 'Failed' })
  }
})

app.post(`${API_BASE}/originate`, requireAuth, async (req, res) => {
  const destination = String(req.body?.destination || '').trim()
  const callerid = String(req.body?.callerid || '').trim()
  if (!destination || !callerid) return res.status(400).json({ message: 'destination and callerid are required' })
  try {
    const r = await proxyFetch(req, '/api/originate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination, callerid }),
    })
    res.json(r)
  } catch (e) {
    res.status(e.status || 502).json({ message: e.message || 'Originate failed' })
  }
})

app.get(`${API_BASE}/cdr`, requireAuth, async (req, res) => {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(req.query || {})) {
    if (v == null) continue
    if (Array.isArray(v)) {
      for (const item of v) usp.append(k, String(item))
    } else {
      usp.set(k, String(v))
    }
  }
  const q = usp.toString()
  try {
    const r = await proxyFetch(req, `/api/cdr${q ? `?${q}` : ''}`, { method: 'GET' })
    res.json(r)
  } catch (e) {
    res.status(e.status || 502).json({ message: e.message || 'CDR failed' })
  }
})

app.get(`${API_BASE}/health`, (_req, res) => res.json({ ok: true }))

// ----------------- Static UI: /softphone -----------------

// Expect softphone-web to be built to ../softphone-web/dist
const distDir = path.resolve(__dirname, '../../softphone-web/dist')
app.use(SOFTPHONE_BASE, express.static(distDir, { index: false }))

// Express v5 + path-to-regexp is stricter about "*" syntax; use a regexp for SPA fallback.
app.get(new RegExp(`^${SOFTPHONE_BASE}(?:/.*)?$`), (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

app.get('/', (_req, res) => res.redirect(`${SOFTPHONE_BASE}/`))

app.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[softphone-bff] listening on http://${HOST}:${PORT}${SOFTPHONE_BASE}/`)
  // eslint-disable-next-line no-console
  console.log(`[softphone-bff] session cookie: ${SESSION_NAME}`)
  // eslint-disable-next-line no-console
  console.log(`[softphone-bff] PBX gateway: ${PBX_GATEWAY_BASE_URL}`)
})

