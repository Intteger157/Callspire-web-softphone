import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { api } from '@/api/client'
import { softphoneAudio } from '@/audio/softphoneAudio'
import type { UserPreferences } from '@/api/types'

export const usePreferencesStore = defineStore('preferences', () => {
  const preferences = ref<UserPreferences>({})
  const loading = ref(false)
  const error = ref<string | null>(null)

  // ---------- convenience computed (read-only accessors) ----------
  const microphoneId = computed(() => preferences.value.micId ?? '')
  const speakerId    = computed(() => preferences.value.speakerId ?? '')

  // ---------- persistence ----------
  async function load() {
    loading.value = true
    error.value = null
    try {
      const res = await api.get<{ preferences: UserPreferences }>('me/preferences')
      preferences.value = res.preferences ?? {}
      return preferences.value
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load preferences'
      // Non-fatal: work with defaults.
      return preferences.value
    } finally {
      loading.value = false
    }
  }

  async function save(patch: Partial<UserPreferences>) {
    preferences.value = { ...preferences.value, ...patch }
    loading.value = true
    error.value = null
    try {
      const res = await api.put<{ preferences: UserPreferences }>('me/preferences', patch)
      preferences.value = res.preferences ?? preferences.value
      return preferences.value
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to save preferences'
      // Keep locally-applied values even when the server save fails.
      return preferences.value
    } finally {
      loading.value = false
    }
  }

  // ---------- device setters ----------
  /** Update the preferred microphone and persist. */
  async function setMicrophoneId(id: string) {
    return save({ micId: id || undefined })
  }

  /** Update the preferred speaker, persist, and route audio to it immediately. */
  async function setSpeakerId(id: string) {
    await save({ speakerId: id || undefined })
    // Route existing remote-audio element to the new sink.
    void softphoneAudio.updateSpeakerDevice(id)
  }

  // Propagate speaker changes that arrive from server load.
  watch(speakerId, (id) => {
    if (id) void softphoneAudio.updateSpeakerDevice(id)
  })

  return {
    preferences,
    loading,
    error,
    microphoneId,
    speakerId,
    load,
    save,
    setMicrophoneId,
    setSpeakerId,
  }
})
