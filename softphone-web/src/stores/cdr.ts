import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { api, apiPath } from '@/api/client'
import { appLog } from '@/logging/logCapture'
import type { CdrRecord } from '@/api/types'
import { useCallsStore } from '@/stores/calls'

const RECORDING_PROXY = apiPath('recording')
// Small delay after call ends so MikoPBX has time to flush CDR to the DB.
const POST_CALL_REFRESH_DELAY_MS = 3_000

export const useCdrStore = defineStore('cdr', () => {
  const records = ref<CdrRecord[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let refreshTimer: ReturnType<typeof setTimeout> | null = null

  async function fetchHistory(limit = 50) {
    loading.value = true
    error.value = null
    try {
      const res = await api.get<{ result: boolean; data: CdrRecord[] }>(
        `cdr?limit=${limit}`,
      )
      records.value = Array.isArray(res.data) ? res.data : []
      if (!Array.isArray(res.data)) {
        throw new Error('Invalid CDR response from gateway')
      }
      appLog('info', '[cdr] loaded', { count: records.value.length })
      return records.value
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load CDR'
      error.value = msg
      appLog('error', '[cdr] fetch failed', msg, apiPath(`cdr?limit=${limit}`))
      return []
    } finally {
      loading.value = false
    }
  }

  /** Proxy URL for streaming a recording by linkedid. */
  function recordingUrl(linkedid: string): string {
    return `${RECORDING_PROXY}?linkedid=${encodeURIComponent(linkedid)}`
  }

  /**
   * Set up a watcher that refreshes the CDR list a few seconds after a call
   * ends. Called once from the component that mounts the history view so the
   * watch is torn down with that component's lifecycle.
   */
  function watchCallEnd() {
    const calls = useCallsStore()
    let wasInCall = false

    return watch(
      () => calls.callStatus,
      (status) => {
        if (status !== 'idle') {
          wasInCall = true
          return
        }
        if (!wasInCall) return
        wasInCall = false
        // Debounce: cancel any pending timer and start a new one.
        if (refreshTimer !== null) clearTimeout(refreshTimer)
        refreshTimer = setTimeout(() => {
          refreshTimer = null
          void fetchHistory()
        }, POST_CALL_REFRESH_DELAY_MS)
      },
    )
  }

  return { records, loading, error, fetchHistory, recordingUrl, watchCallEnd }
})
