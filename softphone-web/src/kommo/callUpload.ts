import { api } from '@/api/client'
import type { KommoProcessCallJob, KommoProcessCallRequest } from '@/api/types'
import { appLog } from '@/logging/logCapture'
import { useKommoAttachmentsStore } from '@/stores/kommoAttachments'
import { useKommoStore } from '@/stores/kommo'

export type EndedCallMeta = {
  phone: string
  sessionId?: string
  isIncoming: boolean
  /** When the call was placed or received (ms since epoch). */
  callPlacedAt: number
  /** When media was established (ms), if answered. */
  answeredAt?: number | null
  /** Outbound caller ID used for the call — shown as "Call from …" in Kommo. */
  callFromLabel?: string
}

function toIso(ms: number): string {
  return new Date(ms).toISOString()
}

/**
 * After hangup: submit process-call to PBX Gateway when admin mapped this extension
 * to a Kommo user and gateway Kommo is enabled. Recording is resolved on the server (Miko CDR).
 */
export async function submitEndedCallToKommo(meta: EndedCallMeta): Promise<void> {
  const kommo = useKommoStore()
  if (!kommo.canUploadRecording) {
    appLog('info', '[kommo] skip upload — extension not configured for gateway Kommo')
    return
  }

  const phone = meta.phone.trim()
  if (!phone || phone === 'Unknown') {
    appLog('warn', '[kommo] skip upload — no remote number')
    return
  }

  const endedAt = Date.now()
  const answeredAt = meta.answeredAt ?? null
  const wasAnswered = answeredAt != null && answeredAt > 0
  const durationSeconds = wasAnswered
    ? Math.max(0, Math.floor((endedAt - answeredAt) / 1000))
    : Math.max(0, Math.floor((endedAt - meta.callPlacedAt) / 1000))

  const body: KommoProcessCallRequest = {
    phone,
    call_time: toIso(meta.callPlacedAt),
    call_end_time: toIso(endedAt),
    session_id: meta.sessionId || undefined,
    is_incoming: meta.isIncoming,
    duration_seconds: durationSeconds,
    was_answered: wasAnswered,
    client_recording_enabled: false,
    connection_slot: 'main',
    call_from_label: meta.callFromLabel?.trim() || undefined,
    enable_recording_upload: true,
    answer_time: wasAnswered && answeredAt ? toIso(answeredAt) : undefined,
  }

  try {
    appLog('info', '[kommo] submitting process-call', {
      phone,
      wasAnswered,
      durationSeconds,
    })
    const job = await api.post<KommoProcessCallJob>('kommo/process-call', body)
    appLog('info', '[kommo] process-call queued', { jobId: job.id, status: job.status })
    void pollKommoJobStatus(job.id, meta)
  } catch (e) {
    appLog('error', '[kommo] process-call failed', e)
  }
}

function formatUploadCompleteLog(job: KommoProcessCallJob): Record<string, unknown> {
  const base = { jobId: job.id }
  if (job.lead_id) {
    return { ...base, attachedTo: 'lead', leadId: job.lead_id }
  }
  if (job.contact_id) {
    return { ...base, attachedTo: 'contact', contactId: job.contact_id }
  }
  if (job.crm_entity === 'contact') {
    return { ...base, attachedTo: 'contact', contactId: job.contact_id ?? undefined }
  }
  return { ...base, attachedTo: 'unknown' }
}

async function pollKommoJobStatus(jobId: string, meta: EndedCallMeta): Promise<void> {
  const maxPolls = 450 // ~15 min — PBX CDR/recording retries can exceed 3 min
  let lastLoggedStatus = ''
  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    try {
      const job = await api.get<KommoProcessCallJob>(`kommo/process-call/${jobId}`)
      const st = (job.status || '').toLowerCase()
      if (st !== lastLoggedStatus) {
        if (st === 'waiting_recording' || st === 'processing' || st === 'queued') {
          lastLoggedStatus = st
          appLog('info', '[kommo] upload in progress', {
            jobId,
            status: st,
            reason: job.reason,
          })
        } else if (st === 'uploaded' || st === 'failed' || st === 'skipped') {
          lastLoggedStatus = st
        }
      }
      if (st === 'uploaded') {
        useKommoAttachmentsStore().registerFromJob({
          id: job.id,
          phone: meta.phone,
          call_time: toIso(meta.callPlacedAt),
          lead_id: job.lead_id,
          contact_id: job.contact_id,
          crm_entity: job.crm_entity,
          status: job.status,
        })
        appLog('info', '[kommo] upload complete', {
          ...formatUploadCompleteLog(job),
          reason: job.reason,
        })
        return
      }
      if (st === 'failed' || st === 'skipped') {
        appLog('warn', '[kommo] upload finished', { jobId, status: st, reason: job.reason })
        return
      }
    } catch (e) {
      appLog('warn', '[kommo] status poll error', e)
      return
    }
  }
  appLog('warn', '[kommo] status poll timed out', { jobId })
}
