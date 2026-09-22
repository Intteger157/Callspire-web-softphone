import { api, ApiError } from '@/api/client'
import type { KommoContactLookup } from '@/api/types'
import { appLog } from '@/logging/logCapture'

const cache = new Map<string, KommoContactLookup>()

function hasLookupData(result: KommoContactLookup | null | undefined): result is KommoContactLookup {
  return !!result && (Boolean(result.name) || result.lead_id != null)
}

export async function lookupKommoContact(phone: string): Promise<KommoContactLookup | null> {
  const key = phone.trim()
  if (!key) return null
  const cached = cache.get(key)
  if (cached && hasLookupData(cached)) return cached

  try {
    const result = await api.get<KommoContactLookup>(
      `kommo/contact?phone=${encodeURIComponent(key)}`,
    )
    cache.set(key, result)
    if (hasLookupData(result)) {
      appLog('info', '[kommo] contact resolved', {
        phone: key,
        name: result.name,
        leadId: result.lead_id,
      })
    }
    return hasLookupData(result) ? result : null
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 0
    const msg = e instanceof Error ? e.message : String(e)
    if (status === 404) {
      appLog(
        'warn',
        '[kommo] GET /kommo/contact not found — deploy app_kommo.py + mount.py on gateway',
        msg,
      )
    } else {
      appLog('warn', `[kommo] contact lookup failed (${status || 'network'})`, msg)
    }
    return null
  }
}

export function clearKommoContactCache(): void {
  cache.clear()
}
