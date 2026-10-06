/** macOS browsers (Chrome & Safari) — originate answer ICE timing / 198.18.x host quirks. */

export function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac OS X|Macintosh/i.test(navigator.userAgent)
}

export function isSafariWebKit(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|FxiOS/i.test(ua)
}

/** Wait for srflx before sending originate callback answer (Mac Chrome + Safari). */
export function preferSrflxForOriginateAnswer(): boolean {
  return isMacOS()
}
