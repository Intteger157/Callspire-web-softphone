/** Shared / public computer login — sessionStorage + device-trust marker. */

const FLAG_KEY = 'callspire-public-computer'
const BROWSER_SESSION_KEY = 'callspire-browser-session'
const TRUST_KEY = 'callspire-device-trust'
const SHARED_COOKIE = 'callspire-shared'
const LAST_EMAIL_KEY = 'callspire-last-email'

export type DeviceTrust = 'persistent' | 'shared-session'

export function setPublicComputerMode(enabled: boolean): void {
  try {
    if (enabled) sessionStorage.setItem(FLAG_KEY, '1')
    else sessionStorage.removeItem(FLAG_KEY)
  } catch { /* ignore */ }
}

export function isPublicComputerMode(): boolean {
  try {
    return sessionStorage.getItem(FLAG_KEY) === '1'
  } catch {
    return false
  }
}

export function getDeviceTrust(): DeviceTrust | null {
  try {
    const v = localStorage.getItem(TRUST_KEY)
    if (v === 'persistent' || v === 'shared-session') return v
    return null
  } catch {
    return null
  }
}

export function setPersistentDeviceTrust(): void {
  try {
    localStorage.setItem(TRUST_KEY, 'persistent')
    clearSharedBrowserCookie()
  } catch { /* ignore */ }
}

export function setSharedSessionDeviceTrust(): void {
  try {
    localStorage.setItem(TRUST_KEY, 'shared-session')
    setSharedBrowserCookie()
  } catch { /* ignore */ }
}

export function clearDeviceTrust(): void {
  try {
    localStorage.removeItem(TRUST_KEY)
    clearSharedBrowserCookie()
  } catch { /* ignore */ }
}

/** Session cookie (no Max-Age) — cleared when the browser fully exits. */
function setSharedBrowserCookie(): void {
  const base = `${SHARED_COOKIE}=1; path=/; SameSite=Lax`
  document.cookie = base
}

function clearSharedBrowserCookie(): void {
  document.cookie = `${SHARED_COOKIE}=; path=/; Max-Age=0; SameSite=Lax`
}

export function hasSharedBrowserCookie(): boolean {
  return document.cookie.split(';').some((part) => part.trim().startsWith(`${SHARED_COOKIE}=1`))
}

/** First page load in this browser session (sessionStorage was empty). */
export function markBrowserSession(): boolean {
  try {
    if (sessionStorage.getItem(BROWSER_SESSION_KEY)) return false
    sessionStorage.setItem(BROWSER_SESSION_KEY, '1')
    return true
  } catch {
    return true
  }
}

export function readRememberedEmail(): string {
  if (isPublicComputerMode() || getDeviceTrust() === 'shared-session') return ''
  try {
    return localStorage.getItem(LAST_EMAIL_KEY) ?? ''
  } catch {
    return ''
  }
}

export function rememberEmail(email: string, publicComputer: boolean): void {
  try {
    if (publicComputer) {
      localStorage.removeItem(LAST_EMAIL_KEY)
      return
    }
    const trimmed = email.trim().toLowerCase()
    if (trimmed) localStorage.setItem(LAST_EMAIL_KEY, trimmed)
  } catch { /* ignore */ }
}

export function clearPublicComputerClientData(): void {
  try {
    sessionStorage.removeItem(FLAG_KEY)
    sessionStorage.removeItem(BROWSER_SESSION_KEY)
    clearDeviceTrust()
  } catch { /* ignore */ }
}

/** True when a restored cookie should be rejected on a fresh browser session. */
export function shouldRejectRestoredSession(): boolean {
  const trust = getDeviceTrust()
  if (trust === 'shared-session') return true
  if (trust === 'persistent') return false
  return !hasSharedBrowserCookie()
}
