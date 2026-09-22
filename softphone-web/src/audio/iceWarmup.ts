import { countCandidates, mergeCandidatesIntoSdp } from '@/audio/sdpSanitize'
import { appLog } from '@/logging/logCapture'

const ICE_BUFFER_KEY = '_callspireIceBuffer'
const OFFER_GATE_KEY = '_callspireOfferGate'
const SIP_CANDIDATE_LINES_KEY = '_callspireSipCandidateLines'

export type IceCandidateBuffer = {
  lines: string[]
  sipLines: string[]
  hasSrflx: boolean
  hasRelay: boolean
  ended: boolean
}

interface RTCIceCandidateStats extends RTCStats {
  candidate?: string
  candidateType?: string
  foundation?: string
  protocol?: string
  priority?: number
  address?: string
  ip?: string
  port?: number
  sdpMid?: string
  sdpMLineIndex?: number
}

function parseCandidateFields(line: string): {
  proto: string
  ip: string
  port: number
  typ: string
} | null {
  const cand = line.replace(/^a=/i, '')
  const m = cand.match(
    /^candidate:\S+\s+\d+\s+(\S+)\s+\S+\s+(\S+)\s+(\d+)\s+typ\s+(\S+)/i,
  )
  if (!m) return null
  return { proto: m[1].toLowerCase(), ip: m[2], port: Number(m[3]), typ: m[4].toLowerCase() }
}

/** RTP needs UDP with a real port — skip Chrome TCP / 0.0.0.0:9 placeholders. */
export function isUsableCandidateLine(line: string): boolean {
  const f = parseCandidateFields(line)
  if (!f) return false
  if (f.proto !== 'udp') return false
  if (!f.port || f.port === 9) return false
  if (f.ip === '0.0.0.0' || f.ip === '::') return false
  return true
}

function dedupeLines(lines: string[]): string[] {
  const out: string[] = []
  for (const line of lines) {
    if (line && !out.includes(line)) out.push(line)
  }
  return out
}

export function startIceCandidateBuffer(
  pc: RTCPeerConnection,
  logLabel = 'ice',
): IceCandidateBuffer {
  const buffer: IceCandidateBuffer = {
    lines: [],
    sipLines: [],
    hasSrflx: false,
    hasRelay: false,
    ended: false,
  }
  pc.addEventListener('icecandidate', (ev: RTCPeerConnectionIceEvent) => {
    const raw = ev.candidate?.candidate
    if (!raw) {
      buffer.ended = true
      appLog('info', `[call] ${logLabel} gathering ended`, {
        buffered: buffer.lines.length,
        gathering: pc.iceGatheringState,
      })
      return
    }
    appLog('info', `[call] ${logLabel} icecandidate`, raw.slice(0, 120))
    const line = raw.startsWith('a=') ? raw : `a=${raw}`
    if (!isUsableCandidateLine(line)) return
    if (!buffer.lines.includes(line)) buffer.lines.push(line)
    if (raw.includes('srflx')) buffer.hasSrflx = true
    if (raw.includes('relay')) buffer.hasRelay = true
  })
  pc.addEventListener('icecandidateerror', (ev: Event) => {
    const e = ev as RTCPeerConnectionIceErrorEvent
    appLog('warn', `[call] ${logLabel} icecandidateerror`, {
      url: e.url,
      code: e.errorCode,
      text: e.errorText,
    })
  })
  return buffer
}

export function attachCallIceBuffer(
  pc: RTCPeerConnection,
  logLabel = 'call-pc',
): IceCandidateBuffer {
  const tagged = pc as RTCPeerConnection & { [ICE_BUFFER_KEY]?: IceCandidateBuffer }
  if (tagged[ICE_BUFFER_KEY]) return tagged[ICE_BUFFER_KEY]
  const buffer = startIceCandidateBuffer(pc, logLabel)
  tagged[ICE_BUFFER_KEY] = buffer
  return buffer
}

export function getCallIceBuffer(pc: RTCPeerConnection | null | undefined): IceCandidateBuffer | null {
  if (!pc) return null
  return (pc as RTCPeerConnection & { [ICE_BUFFER_KEY]?: IceCandidateBuffer })[ICE_BUFFER_KEY] ?? null
}

function lineFromStatsCandidate(c: RTCIceCandidateStats): string | null {
  if (c.candidate) {
    const line = c.candidate.startsWith('a=') ? c.candidate : `a=${c.candidate}`
    if (isUsableCandidateLine(line)) return line
  }
  const foundation = c.foundation ?? c.id?.replace(/[^0-9a-zA-Z]/g, '').slice(0, 10)
  const ip = c.address ?? c.ip
  const port = c.port
  if (!foundation || !ip || !port) return null
  if (ip === '0.0.0.0' || ip === '::' || port === 9) return null
  const typ = (c.candidateType ?? 'host').toLowerCase()
  const rawProto = (c.protocol ?? 'udp').toLowerCase()
  // Chrome 149 may label host UDP as tcp in stats while address/port are valid.
  const proto = rawProto === 'tcp' && typ === 'host' ? 'udp' : rawProto
  if (proto !== 'udp') return null
  const priority = c.priority ?? 2130706431
  const line = `a=candidate:${foundation} 1 UDP ${priority} ${ip} ${port} typ ${typ}`
  return isUsableCandidateLine(line) ? line : null
}

function candidateLinesFromSdp(sdp: string): string[] {
  return sdp
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^a=candidate:/i.test(l) && isUsableCandidateLine(l))
}

async function localCandidateLinesFromStats(pc: RTCPeerConnection): Promise<string[]> {
  const lines: string[] = []
  try {
    const stats = await pc.getStats()
    stats.forEach((r) => {
      if (r.type !== 'local-candidate' && r.type !== 'candidate') return
      const line = lineFromStatsCandidate(r as RTCIceCandidateStats)
      if (line && !lines.includes(line)) lines.push(line)
    })
  } catch {
    /* ignore */
  }
  return lines
}

async function logLocalCandidateStatsDiag(pc: RTCPeerConnection): Promise<void> {
  try {
    const rows: Array<Record<string, unknown>> = []
    const stats = await pc.getStats()
    stats.forEach((r) => {
      if (r.type !== 'local-candidate' && r.type !== 'candidate') return
      const c = r as RTCIceCandidateStats
      rows.push({
        protocol: c.protocol,
        type: c.candidateType,
        address: c.address ?? c.ip,
        port: c.port,
        candidate: c.candidate?.slice(0, 96),
      })
    })
    appLog('warn', '[call] local-candidate stats diag', { count: rows.length, rows: rows.slice(0, 10) })
  } catch {
    /* ignore */
  }
}

function rememberSipCandidateLines(pc: RTCPeerConnection, buffer: IceCandidateBuffer, lines: string[]) {
  const merged = dedupeLines([...buffer.sipLines, ...lines.filter(isUsableCandidateLine)])
  buffer.sipLines = merged
  for (const line of merged) {
    if (line.includes('srflx')) buffer.hasSrflx = true
    if (line.includes('relay')) buffer.hasRelay = true
  }
  ;(pc as RTCPeerConnection & { [SIP_CANDIDATE_LINES_KEY]?: string[] })[SIP_CANDIDATE_LINES_KEY] =
    merged
}

export function getSipCandidateLines(
  pc: RTCPeerConnection | null | undefined,
  buffer: IceCandidateBuffer | null | undefined,
): string[] {
  const tagged = pc as (RTCPeerConnection & { [SIP_CANDIDATE_LINES_KEY]?: string[] }) | null
  return dedupeLines([
    ...(buffer?.sipLines ?? []),
    ...(buffer?.lines ?? []),
    ...(tagged?.[SIP_CANDIDATE_LINES_KEY] ?? []),
  ]).filter(isUsableCandidateLine)
}

async function collectUsableCandidateLines(
  pc: RTCPeerConnection,
  buffer: IceCandidateBuffer,
): Promise<string[]> {
  const sdpLines = candidateLinesFromSdp(pc.localDescription?.sdp ?? '')
  const statsLines = await localCandidateLinesFromStats(pc)
  const merged = dedupeLines([
    ...buffer.lines.filter(isUsableCandidateLine),
    ...sdpLines,
    ...statsLines,
  ])
  if (merged.length) rememberSipCandidateLines(pc, buffer, merged)
  return merged
}

/**
 * Patch SIP INVITE/offer only when the PC SDP has no candidates (Chrome 149 quirk).
 * Firefox/WebView2 populate localDescription via icecandidate — never merge then.
 */
export function buildLocalOfferSdpForSignaling(
  pc: RTCPeerConnection | null | undefined,
  buffer: IceCandidateBuffer | null | undefined,
): string {
  const base = pc?.localDescription?.sdp ?? ''
  if (!base) return ''
  const lines = getSipCandidateLines(pc, buffer)
  if (lines.length) {
    const merged = mergeCandidatesIntoSdp(base, lines)
    if (countCandidates(merged) >= countCandidates(base)) return merged
  }
  return base
}

export async function waitForOfferIce(
  pc: RTCPeerConnection,
  buffer: IceCandidateBuffer,
  timeoutMs = 8000,
  minWaitMs = 3000,
): Promise<{ count: number; reason: string; hasSrflx: boolean }> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const pcSdpCount = countCandidates(pc.localDescription?.sdp ?? '')
    if (pcSdpCount > 0 && buffer.lines.length > 0) {
      return {
        count: buffer.lines.length,
        reason: 'PC SDP + icecandidate events',
        hasSrflx: buffer.hasSrflx,
      }
    }

    const lines = await collectUsableCandidateLines(pc, buffer)
    const elapsed = Date.now() - start

    if (buffer.hasSrflx || buffer.hasRelay) {
      return { count: lines.length, reason: 'srflx/relay found', hasSrflx: buffer.hasSrflx }
    }
    if (lines.length > 0 && buffer.ended && elapsed >= minWaitMs) {
      return { count: lines.length, reason: 'UDP host after gather + min wait', hasSrflx: false }
    }
    await new Promise((r) => setTimeout(r, 80))
  }

  const lines = await collectUsableCandidateLines(pc, buffer)
  return {
    count: lines.length,
    reason: lines.length
      ? `${timeoutMs}ms timeout`
      : `${timeoutMs}ms timeout (no usable UDP in SDP/stats)`,
    hasSrflx: buffer.hasSrflx,
  }
}

function isChromeBrowser(): boolean {
  return /Chrome\//i.test(navigator.userAgent) && !/Edg\//i.test(navigator.userAgent)
}

export function installLocalSdpIceGate(
  pc: RTCPeerConnection,
  buffer: IceCandidateBuffer,
  gateSdpType: 'offer' | 'answer',
  options: { timeoutMs?: number; minWaitMs?: number; logLabel?: string } = {},
): void {
  const gateKey = gateSdpType === 'offer' ? OFFER_GATE_KEY : '_callspireAnswerGate'
  const tagged = pc as RTCPeerConnection & { [key: string]: boolean | undefined }
  if (tagged[gateKey]) return
  tagged[gateKey] = true

  const timeoutMs = options.timeoutMs ?? (gateSdpType === 'offer' ? 8000 : 3000)
  const minWaitMs = options.minWaitMs ?? 3000
  const logLabel = options.logLabel ?? `${gateSdpType} ICE gate`
  let firstGated = false
  const nativeSetLocal = pc.setLocalDescription.bind(pc)

  pc.setLocalDescription = async (description) => {
    const result = await nativeSetLocal(description)
    const type =
      description && typeof description === 'object' && 'type' in description
        ? (description as RTCSessionDescriptionInit).type
        : undefined
    if (!firstGated && type === gateSdpType) {
      firstGated = true
      const { count, reason, hasSrflx } = await waitForOfferIce(
        pc,
        buffer,
        timeoutMs,
        minWaitMs,
      )
      const pcSdpCandidates = countCandidates(pc.localDescription?.sdp ?? '')
      const sipSdp = buildLocalOfferSdpForSignaling(pc, buffer)
      const sipCandidates = countCandidates(sipSdp)
      appLog('info', `[call] ${logLabel}`, {
        candidates: count,
        pcSdpCandidates,
        sipCandidates,
        reason,
        buffered: buffer.lines.length,
        hasSrflx: hasSrflx || buffer.hasSrflx,
        hasRelay: buffer.hasRelay,
        gathering: pc.iceGatheringState,
      })
      if (pcSdpCandidates === 0 && sipCandidates === 0) {
        await logLocalCandidateStatsDiag(pc)
        appLog('warn', `[call] no usable UDP ICE in ${gateSdpType} — sending anyway`, {
          stunHint: isChromeBrowser()
            ? 'Chrome 149 ICE bug — use Firefox or configure TURN on gateway'
            : 'allow UDP outbound + STUN 19302, or configure TURN on gateway',
        })
      }
    }
    return result
  }
}

export function installOutboundOfferIceGate(
  pc: RTCPeerConnection,
  buffer: IceCandidateBuffer,
  options: { timeoutMs?: number; minWaitMs?: number } = {},
): void {
  installLocalSdpIceGate(pc, buffer, 'offer', {
    timeoutMs: options.timeoutMs ?? 8000,
    minWaitMs: options.minWaitMs ?? 3000,
    logLabel: 'offer ICE gate',
  })
}

export function prepareOutboundCallPc(
  pc: RTCPeerConnection,
  options: { timeoutMs?: number; minWaitMs?: number } = {},
): IceCandidateBuffer {
  const buffer = attachCallIceBuffer(pc, 'outbound-pc')
  installOutboundOfferIceGate(pc, buffer, {
    timeoutMs: options.timeoutMs ?? 8000,
    minWaitMs: options.minWaitMs ?? 3000,
  })
  return buffer
}

export function prepareInboundAnswerPc(
  pc: RTCPeerConnection,
  options: { timeoutMs?: number; minWaitMs?: number } = {},
): IceCandidateBuffer {
  const buffer = attachCallIceBuffer(pc, 'inbound-pc')
  installLocalSdpIceGate(pc, buffer, 'answer', {
    timeoutMs: options.timeoutMs ?? 3000,
    minWaitMs: options.minWaitMs ?? 800,
    logLabel: 'answer ICE gate',
  })
  return buffer
}

let primePc: RTCPeerConnection | null = null
let primeDone = false

/** Prime STUN/ICE while registered so the call PC is more likely to emit srflx (Chrome 149). */
export function primeIceGathering(pcConfig: RTCConfiguration): void {
  if (primeDone || typeof RTCPeerConnection === 'undefined') return
  primeDone = true
  try {
    primePc?.close()
    primePc = new RTCPeerConnection(pcConfig)
    primePc.createDataChannel('callspire-ice-prime')
    void (async () => {
      const pc = primePc
      if (!pc) return
      const offer = await pc.createOffer({ offerToReceiveAudio: true })
      await pc.setLocalDescription(offer)
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 4000)
        pc.onicecandidate = (ev) => {
          if (!ev.candidate) {
            window.clearTimeout(timer)
            resolve()
            return
          }
          const c = ev.candidate.candidate ?? ''
          appLog('info', '[webrtc] ice prime candidate', c.slice(0, 96))
          if (c.includes('srflx') || c.includes('relay')) {
            window.clearTimeout(timer)
            resolve()
          }
        }
      })
      appLog('info', '[webrtc] ice prime finished', { gathering: pc.iceGatheringState })
      pc.close()
      primePc = null
    })()
  } catch (err) {
    appLog('warn', '[webrtc] ice prime failed', err)
  }
}
