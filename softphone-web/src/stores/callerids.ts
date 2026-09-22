import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, apiPath } from '@/api/client'
import { appLog } from '@/logging/logCapture'
import type { CallerIdItem, CallerIdsResponse } from '@/api/types'

export const useCallerIdsStore = defineStore('callerids', () => {
  const items = ref<CallerIdItem[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  /** Selected caller-id number string. Empty string = use extension default. */
  const selectedCallerId = ref<string>('')

  async function fetch() {
    if (loading.value) return
    loading.value = true
    error.value = null
    try {
      const res = await api.get<CallerIdsResponse>('my-callerids')
      if (!res || typeof res !== 'object' || (!('callerids' in res) && !('callerid_items' in res))) {
        throw new Error('Invalid caller ID response from gateway')
      }
      appLog('info', '[callerids] loaded', { count: res.callerid_items?.length ?? res.callerids?.length ?? 0 })
      // Prefer callerid_items (number + label); fall back to plain string array.
      if (res.callerid_items?.length) {
        items.value = res.callerid_items
      } else {
        items.value = (res.callerids ?? []).map((n) => ({ number: n, name: n }))
      }
      // Pre-select first option if nothing chosen yet.
      if (!selectedCallerId.value && items.value.length > 0) {
        selectedCallerId.value = items.value[0].number
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load caller IDs'
      error.value = msg
      appLog('error', '[callerids] fetch failed', msg, apiPath('my-callerids'))
    } finally {
      loading.value = false
    }
  }

  function select(number: string) {
    selectedCallerId.value = number
  }

  return { items, loading, error, selectedCallerId, fetch, select }
})
