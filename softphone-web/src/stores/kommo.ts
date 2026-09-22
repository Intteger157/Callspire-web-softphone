import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, ApiError } from '@/api/client'
import type { KommoSession, KommoStatus } from '@/api/types'
import { useKommoAttachmentsStore } from '@/stores/kommoAttachments'
import { kommoWebBaseUrl } from '@/kommo/crmUrl'

export const useKommoStore = defineStore('kommo', () => {
  const status  = ref<KommoStatus | null>(null)
  const session = ref<KommoSession | null>(null)
  const loading = ref(false)
  const error   = ref<string | null>(null)

  // ── computed views ────────────────────────────────────────────────

  /**
   * `true` when the CRM integration is fully operational for the current user:
   * enabled + available OAuth token + extension not excluded.
   */
  const isConnected = computed(
    () => !!status.value?.available && !status.value?.excluded,
  )

  /**
   * `true` when the gateway has Kommo enabled AND this extension isn't blocked
   * (regardless of whether the token is currently valid — used to decide
   *  whether to show CRM-related UI at all).
   */
  const offerGateway = computed(() => !!status.value?.offer_gateway)

  /**
   * `true` when admin enabled gateway Kommo for this extension AND selected a Kommo user.
   */
  const canUploadRecording = computed(() => {
    const s = status.value
    if (!s?.upload_enabled) {
      if (s?.offer_gateway && !s.excluded) {
        const mapped =
          session.value?.kommo_user_id ??
          s.kommo_user_id
        return !!mapped
      }
      return false
    }
    return true
  })

  /**
   * `true` when a session was fetched and the user has a mapped Kommo account.
   */
  const isUserMapped = computed(() => {
    const fromSession = session.value?.kommo_user_id || session.value?.kommo_user_name
    if (fromSession) return true
    return !!(status.value?.kommo_user_id || status.value?.kommo_user_name)
  })

  /** Display name for the connected Kommo user, or empty string. */
  const kommoUserName = computed(
    () => session.value?.kommo_user_name ?? status.value?.kommo_user_name ?? '',
  )

  /** Base URL for opening lead/contact cards in Kommo (e.g. https://mdkb.amocrm.ru). */
  const crmBaseUrl = computed(() => {
    const fromSession = kommoWebBaseUrl(session.value?.account_base_url)
    if (fromSession) return fromSession
    const sub = status.value?.subdomain?.trim()
    if (!sub) return null
    return kommoWebBaseUrl(sub) ?? (sub.includes('.') ? kommoWebBaseUrl(`https://${sub}`) : `https://${sub}.amocrm.ru`)
  })

  // ── data fetching ─────────────────────────────────────────────────

  async function fetchKommoStatus() {
    loading.value = true
    error.value = null
    try {
      // 1) Status: always fetch — determines whether CRM is configured at all.
      status.value = await api.get<KommoStatus>('kommo/status')

      // 2) Session: only when the integration is available for this user.
      if (status.value.available && !status.value.excluded) {
        try {
          session.value = await api.get<KommoSession>('kommo/session')
        } catch (e) {
          // Session failure is non-fatal: status already tells us about auth.
          session.value = null
          if (e instanceof ApiError && e.status !== 401 && e.status !== 403) {
            error.value = e instanceof Error ? e.message : 'Kommo session error'
          }
        }
      } else {
        session.value = null
      }
    } catch (e) {
      // 404/501: route missing. 401: browser hit app.py without session proxy (old mount).
      if (e instanceof ApiError && (e.status === 404 || e.status === 501 || e.status === 401)) {
        status.value = null  // not configured — silently hide the badge
      } else {
        error.value = e instanceof Error ? e.message : 'Kommo status unavailable'
        status.value = null
      }
      session.value = null
    } finally {
      loading.value = false
    }
  }

  /** Legacy single-endpoint helpers kept for backwards compatibility. */
  async function fetchStatus() {
    return fetchKommoStatus()
  }

  async function fetchSession(forceRefresh = false) {
    loading.value = true
    error.value = null
    try {
      const q = forceRefresh ? '?force_refresh=true' : ''
      session.value = await api.get<KommoSession>(`kommo/session${q}`)
      return session.value
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Kommo session failed'
      session.value = null
      throw e
    } finally {
      loading.value = false
    }
  }

  /** Clear all Kommo state on logout. */
  function reset() {
    status.value  = null
    session.value = null
    error.value   = null
    loading.value = false
    useKommoAttachmentsStore().reset()
  }

  return {
    status,
    session,
    loading,
    error,
    isConnected,
    offerGateway,
    canUploadRecording,
    isUserMapped,
    kommoUserName,
    crmBaseUrl,
    fetchKommoStatus,
    fetchStatus,
    fetchSession,
    reset,
  }
})
