/** PBX Originate state — mirrors desktop OriginateCoordinator.cs */

export type OriginateSessionLike = {
  id?: string
  remote_identity?: { uri?: { user?: string } }
  request?: { getHeader?: (name: string) => string }
}

export type OriginatePending = {
  destination: string
  callerId: string
  originateId: string | null
}

let pending: OriginatePending | null = null
let acceptedSessionId: string | null = null
let timeoutHandle: ReturnType<typeof setTimeout> | null = null

export function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, '')
}

export function phonesLooselyMatch(a: string, b: string): boolean {
  const da = normalizePhoneDigits(a)
  const db = normalizePhoneDigits(b)
  if (!da || !db) return false
  if (da === db) return true
  if (da.length >= 10 && db.length >= 10) return da.slice(-10) === db.slice(-10)
  return da.endsWith(db) || db.endsWith(da)
}

export function beginOriginatePending(
  destination: string,
  callerId: string,
  onTimeout: () => void,
): void {
  clearOriginateTimeout()
  acceptedSessionId = null
  pending = { destination, callerId, originateId: null }
  timeoutHandle = setTimeout(onTimeout, 20_000)
}

export function setOriginateId(originateId: string | null | undefined): void {
  if (!pending || !originateId) return
  pending = { ...pending, originateId }
}

export function getOriginatePending(): OriginatePending | null {
  return pending
}

export function isOriginatePending(): boolean {
  return pending != null && !acceptedSessionId
}

export function acceptOriginateSession(sessionId: string): void {
  acceptedSessionId = sessionId
  clearOriginatePending()
}

export function clearOriginatePending(): void {
  pending = null
  clearOriginateTimeout()
}

export function clearOriginateState(): void {
  pending = null
  acceptedSessionId = null
  clearOriginateTimeout()
}

function clearOriginateTimeout(): void {
  if (timeoutHandle) {
    clearTimeout(timeoutHandle)
    timeoutHandle = null
  }
}

export function getOriginateHeader(session: OriginateSessionLike): string | null {
  try {
    return session.request?.getHeader?.('X-Callspire-Originate') ?? null
  } catch {
    return null
  }
}

export function isOwnOutboundCallerId(caller: string, allowedCallerIds: string[]): boolean {
  if (!caller?.trim() || !allowedCallerIds.length) return false
  return allowedCallerIds.some((id) => phonesLooselyMatch(caller, id))
}

export function isForeignOriginateCallback(
  session: OriginateSessionLike,
  allowedCallerIds: string[],
): boolean {
  if (isOriginatePending()) return false
  if (getOriginateHeader(session)) return true
  const caller = session.remote_identity?.uri?.user ?? ''
  return isOwnOutboundCallerId(caller, allowedCallerIds)
}

export function isOriginateCallback(
  session: OriginateSessionLike,
  state: OriginatePending,
): boolean {
  if (acceptedSessionId && session.id === acceptedSessionId) return true
  if (acceptedSessionId) return false

  const hdr = getOriginateHeader(session)
  if (hdr && state.originateId && hdr === state.originateId) return true

  const caller = session.remote_identity?.uri?.user ?? ''
  if (phonesLooselyMatch(caller, state.callerId)) return true
  if (phonesLooselyMatch(caller, state.destination)) return true

  return false
}
