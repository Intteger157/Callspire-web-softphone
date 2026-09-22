import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api/client'
import type { KommoCallAttachment, KommoCallAttachmentsResponse } from '@/api/types'
import type { CdrRecord } from '@/api/types'
import { otherNumber } from '@/components/callHistoryFormat'

const MATCH_WINDOW_MS = 3 * 60 * 1000

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '')
}

function phonesMatch(a: string, b: string): boolean {
  const da = normalizePhone(a)
  const db = normalizePhone(b)
  if (!da || !db) return false
  if (da === db) return true
  if (da.length >= 10 && db.length >= 10) {
    return da.slice(-10) === db.slice(-10)
  }
  return da.endsWith(db) || db.endsWith(da)
}

function parseCdrStartMs(start: string): number {
  const m = start.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/)
  if (!m) return NaN
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
  ).getTime()
}

function parseCallTimeMs(iso: string | undefined): number {
  if (!iso) return NaN
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : NaN
}

function attachmentKey(phone: string, callTime: string): string {
  return `${normalizePhone(phone)}|${callTime}`
}

export const useKommoAttachmentsStore = defineStore('kommoAttachments', () => {
  const items = ref<KommoCallAttachment[]>([])

  function upsert(entry: KommoCallAttachment): void {
    const phone = entry.phone?.trim()
    const callTime = entry.call_time?.trim()
    if (!phone || !callTime) return
    const key = attachmentKey(phone, callTime)
    const idx = items.value.findIndex(
      (x) => x.phone && x.call_time && attachmentKey(x.phone, x.call_time) === key,
    )
    if (idx >= 0) items.value[idx] = { ...items.value[idx], ...entry }
    else items.value.unshift(entry)
  }

  function registerFromJob(job: {
    phone: string
    call_time: string
    id: string
    lead_id?: number | null
    contact_id?: number | null
    crm_entity?: 'lead' | 'contact' | null
    status?: string
  }): void {
    if ((job.status || '').toLowerCase() !== 'uploaded') return
    upsert({
      job_id: job.id,
      phone: job.phone,
      call_time: job.call_time,
      lead_id: job.lead_id ?? null,
      contact_id: job.contact_id ?? null,
      crm_entity: job.crm_entity ?? (job.lead_id ? 'lead' : job.contact_id ? 'contact' : null),
      status: 'uploaded',
    })
  }

  async function fetchRecent(hours = 72): Promise<void> {
    try {
      const res = await api.get<KommoCallAttachmentsResponse>(
        `kommo/call-attachments?hours=${hours}`,
      )
      for (const item of res.items || []) upsert(item)
    } catch {
      /* non-fatal — local entries still work */
    }
  }

  function lookupForCdr(record: CdrRecord, extension: string): KommoCallAttachment | null {
    const phone = otherNumber(record, extension)
    if (!phone) return null
    const cdrMs = parseCdrStartMs(record.start)
    let best: KommoCallAttachment | null = null
    let bestDelta = MATCH_WINDOW_MS + 1
    for (const item of items.value) {
      if (!item.phone || !phonesMatch(item.phone, phone)) continue
      const itemMs = parseCallTimeMs(item.call_time)
      if (!Number.isFinite(cdrMs) || !Number.isFinite(itemMs)) {
        if (!best) best = item
        continue
      }
      const delta = Math.abs(cdrMs - itemMs)
      if (delta <= MATCH_WINDOW_MS && delta < bestDelta) {
        best = item
        bestDelta = delta
      }
    }
    return best
  }

  function reset(): void {
    items.value = []
  }

  return {
    items,
    upsert,
    registerFromJob,
    fetchRecent,
    lookupForCdr,
    reset,
  }
})
