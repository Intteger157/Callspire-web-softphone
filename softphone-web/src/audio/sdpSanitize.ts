/**
 * Patch Asterisk/MikoPBX SDP before setRemoteDescription.
 * - recvonly / odd fmt cleanup on answers
 * - inject ICE when Asterisk omits ice-ufrag/ice-pwd (internal WebRTC only)
 */

export function extractIceLines(sdp: string): string[] {
  return sdp.split(/\r?\n/).filter(
    (line) =>
      /^a=ice-ufrag:/i.test(line) ||
      /^a=ice-pwd:/i.test(line) ||
      /^a=candidate:/i.test(line) ||
      /^a=end-of-candidates/i.test(line) ||
      /^a=ice-options:/i.test(line),
  )
}

export function hasIceCredentials(sdp: string): boolean {
  return /^a=ice-ufrag:/im.test(sdp) && /^a=ice-pwd:/im.test(sdp)
}

export function countCandidates(sdp: string): number {
  return (sdp.match(/^a=candidate:/gim) ?? []).length
}

/** Count candidate types (host / srflx / relay) in SDP for session-log diagnostics. */
export function summarizeCandidateTypes(sdp: string): Record<string, number> {
  const types: Record<string, number> = {}
  for (const line of sdp.split(/\r?\n/)) {
    if (!/^a=candidate:/i.test(line)) continue
    const m = line.match(/\btyp (\w+)/i)
    const typ = m?.[1]?.toLowerCase() ?? 'unknown'
    types[typ] = (types[typ] ?? 0) + 1
  }
  return types
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p))
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return false
  if (parts[0] === 10) return true
  if (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) return true
  if (parts[0] === 192 && parts[1] === 168) return true
  if (parts[0] === 127) return true
  if (parts[0] === 0) return true
  return false
}

/** Public IP from audio c= line (Miko/Asterisk often put public IP here but private IPs in candidates). */
export function connectionIpFromSdp(sdp: string): string | null {
  const lines = sdp.split(/\r?\n/)
  let inAudio = false
  for (const line of lines) {
    if (/^m=audio/i.test(line)) {
      inAudio = true
      continue
    }
    if (inAudio && /^m=/i.test(line)) break
    if (inAudio) {
      const m = line.match(/^c=IN IP4 (\S+)/i)
      if (m?.[1]) return m[1]
    }
  }
  return sdp.match(/^c=IN IP4 (\S+)/im)?.[1] ?? null
}

/**
 * Asterisk/Miko often advertises private host ICE while c= has the reachable public IP.
 * Browser relay-only cannot pair with 10.x/192.168.x — rewrite host candidate addresses.
 */
export function rewritePrivateHostCandidates(sdp: string): {
  sdp: string
  rewritten: number
  publicIp: string | null
} {
  const publicIp = connectionIpFromSdp(sdp)
  if (!publicIp || isPrivateIpv4(publicIp)) {
    return { sdp, rewritten: 0, publicIp }
  }

  let rewritten = 0
  const out = sdp
    .split(/\r?\n/)
    .map((line) => {
      if (!/^a=candidate:/i.test(line) || !/\btyp host\b/i.test(line)) return line
      return line.replace(
        /^((?:a=)?candidate:\S+\s+\d+\s+\S+\s+\d+\s+)(\d{1,3}(?:\.\d{1,3}){3})(\s+\d+\s+typ\s+host\b)/i,
        (full, prefix: string, ip: string, suffix: string) => {
          if (!isPrivateIpv4(ip) || ip === publicIp) return full
          rewritten++
          return `${prefix}${publicIp}${suffix}`
        },
      )
    })
    .join('\r\n')

  return { sdp: out, rewritten, publicIp }
}

function insertIceBlock(sdp: string, iceLines: string[]): string {
  if (!iceLines.length) return sdp
  const block = iceLines.join('\r\n')
  if (/^a=fingerprint:/im.test(sdp)) {
    return sdp.replace(/^(a=fingerprint:[^\r\n]+)/im, `$1\r\n${block}`)
  }
  if (/^(m=audio[^\r\n]+)/im.test(sdp)) {
    return sdp.replace(/^(m=audio[^\r\n]+)/im, `$1\r\n${block}`)
  }
  return `${sdp}\r\n${block}`
}

function randomIceToken(len: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  let s = ''
  for (let i = 0; i < len; i++) s += chars[bytes[i]! % chars.length]
  return s
}

/** Last-resort ICE for internal WebRTC bridge when Asterisk sends none. */
export function synthesizeIceLines(sdp: string): string[] {
  const ip = sdp.match(/^c=IN IP4 (\S+)/im)?.[1] ?? '0.0.0.0'
  const port = sdp.match(/^m=audio (\d+)/im)?.[1] ?? '9'
  return [
    `a=ice-ufrag:${randomIceToken(8)}`,
    `a=ice-pwd:${randomIceToken(24)}`,
    `a=candidate:1 1 UDP 2130706431 ${ip} ${port} typ host`,
    `a=end-of-candidates`,
  ]
}

export type SanitizeAnswerOptions = {
  cachedIceLines?: string[]
  /** Reuse the same synthetic ICE block for 183 + 200 OK (avoids stable-state errors). */
  fixedIceLines?: string[]
  allowSyntheticIce?: boolean
}

/** Patch remote SDP (offer or answer) before setRemoteDescription. */
export function sanitizeRemoteSdp(sdp: string, options: SanitizeAnswerOptions = {}): string {
  const cachedIceLines = options.cachedIceLines ?? []
  const allowSyntheticIce = options.allowSyntheticIce ?? true
  const fixedIceLines = options.fixedIceLines ?? []

  if (!sdp) return sdp

  let out = sdp

  out = out.replace(/^a=recvonly$/gm, 'a=sendrecv')
  out = out.replace(/^a=inactive$/gm, 'a=sendrecv')

  out = out.replace(/^a=rtpmap:110 telephone-event\/48000.*\r?\n/gm, '')
  out = out.replace(/^a=fmtp:110 .*(\r?\n|$)/gm, '')
  out = out.replace(/(\nm=audio \d+ \S+ \S+ [^\r\n]*?) 110(\r?\n)/, '$1$2')

  if (!hasIceCredentials(out)) {
    if (fixedIceLines.length) {
      out = insertIceBlock(out, fixedIceLines)
    } else if (cachedIceLines.length) {
      out = insertIceBlock(out, cachedIceLines)
    } else if (allowSyntheticIce) {
      out = insertIceBlock(out, synthesizeIceLines(out))
    }
  }

  out = rewritePrivateHostCandidates(out).sdp

  return out
}

/** @deprecated Use sanitizeRemoteSdp — kept for existing imports. */
export const sanitizeRemoteAnswerSdp = sanitizeRemoteSdp

/** Strip + / spaces; return digits-only body. */
export function normalizeDialDigits(number: string): string {
  let s = number.trim().replace(/[\s()-]/g, '')
  if (s.startsWith('+')) s = s.slice(1)
  if (s.startsWith('00')) s = s.slice(2)
  return s
}

/** True for on-PBX extensions (43253245), false for mobile/PSTN (79776104957). */
export function isLikelyInternalExtension(digits: string, ownExtension?: string): boolean {
  if (!/^\d+$/.test(digits)) return false
  if (/-WS$/i.test(digits)) return true
  if (digits.length > 9) return false
  if (/^[78]\d{9,}$/.test(digits)) return false
  if (ownExtension) {
    const baseLen = ownExtension.replace(/-WS$/i, '').length
    if (digits.length === baseLen) return true
  }
  return digits.length >= 4 && digits.length <= 8
}

/** Append gathered candidate lines into a local offer when the SDP body has none. */
export function appendCandidatesToOffer(sdp: string, candidateLines: string[]): string {
  if (!sdp || !candidateLines.length || countCandidates(sdp) > 0) return sdp
  if (!hasIceCredentials(sdp)) return sdp
  const block = [...candidateLines]
  if (!block.some((l) => /^a=end-of-candidates/i.test(l))) block.push('a=end-of-candidates')
  return insertIceBlock(sdp, block)
}

/**
 * Merge candidate lines into SDP for SIP signaling only.
 * Never call setLocalDescription with the result — that resets ICE to "new".
 */
export function mergeCandidatesIntoSdp(sdp: string, candidateLines: string[]): string {
  if (!sdp || !candidateLines.length || !hasIceCredentials(sdp)) return sdp
  const existing = new Set(
    sdp
      .split(/\r?\n/)
      .filter((l) => /^a=candidate:/i.test(l))
      .map((l) => l.trim()),
  )
  const missing = candidateLines
    .map((l) => (l.startsWith('a=') ? l : `a=${l}`))
    .filter((l) => /^a=candidate:/i.test(l) && !existing.has(l.trim()))
  if (!missing.length) return sdp
  let out = sdp.replace(/^a=end-of-candidates\r?\n/gim, '')
  const block = [...missing]
  if (!block.some((l) => /^a=end-of-candidates/i.test(l))) block.push('a=end-of-candidates')
  return insertIceBlock(out, block)
}
export function dialUserForMikoWebRtc(number: string, ownExtension?: string): string {
  const clean = normalizeDialDigits(number)
  if (!clean || number.includes('@')) return number.trim()
  if (/-WS$/i.test(clean)) return clean
  if (!/^\d+$/.test(clean)) return clean
  if (isLikelyInternalExtension(clean, ownExtension)) return `${clean}-WS`
  return clean
}
