import type { CdrRecord } from '@/api/types'

export function callDirection(r: CdrRecord, extension: string): 'inbound' | 'outbound' {
  return r.src_num === extension ? 'outbound' : 'inbound'
}

export function otherNumber(r: CdrRecord, extension: string): string {
  return callDirection(r, extension) === 'outbound' ? r.dst_num : r.caller_id || r.src_num
}

export function isMissed(r: CdrRecord) {
  return r.disposition !== 'ANSWERED'
}

export function dispLabel(d: string) {
  switch (d) {
    case 'ANSWERED':
      return 'Answered'
    case 'NO ANSWER':
      return 'Missed'
    case 'BUSY':
      return 'Busy'
    case 'FAILED':
      return 'Failed'
    default:
      return d || '–'
  }
}

export function fmtDur(sec: number): string {
  if (!sec || sec <= 0) return '–'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function fmtDate(raw: string): string {
  if (!raw) return '–'
  const d = new Date(raw.replace(' ', 'T'))
  if (isNaN(d.getTime())) return raw
  const now = new Date()
  const hhmm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  ) {
    return hhmm
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + hhmm
  }
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function hasRecording(r: CdrRecord) {
  return !!r.recording && !!r.linkedid
}

export function recordMatchesNumber(r: CdrRecord, extension: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const num = otherNumber(r, extension).toLowerCase()
  const src = (r.src_num ?? '').toLowerCase()
  const dst = (r.dst_num ?? '').toLowerCase()
  const caller = (r.caller_id ?? '').toLowerCase()
  return num.includes(q) || src.includes(q) || dst.includes(q) || caller.includes(q)
}

export function recordMatchesQuery(r: CdrRecord, extension: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const num = otherNumber(r, extension).toLowerCase()
  const src = (r.src_num ?? '').toLowerCase()
  const dst = (r.dst_num ?? '').toLowerCase()
  const caller = (r.caller_id ?? '').toLowerCase()
  const disp = (r.disposition ?? '').toLowerCase()
  return num.includes(q) || src.includes(q) || dst.includes(q) || caller.includes(q) || disp.includes(q)
}
