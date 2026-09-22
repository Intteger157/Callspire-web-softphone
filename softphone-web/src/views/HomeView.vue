<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import AppShell from '@/components/AppShell.vue'
import ChangePasswordModal from '@/components/ChangePasswordModal.vue'
import SettingsModal from '@/components/SettingsModal.vue'
import ThemesModal from '@/components/ThemesModal.vue'
import MicPermissionModal from '@/components/MicPermissionModal.vue'
import Dialpad from '@/components/Dialpad.vue'
import InCallView from '@/components/InCallView.vue'
import IncomingCallToast from '@/components/IncomingCallToast.vue'
import CallHistory from '@/components/CallHistory.vue'
import KommoStatus from '@/components/KommoStatus.vue'
import { useAuthStore } from '@/stores/auth'
import { useWebRtcStore } from '@/stores/webrtc'
import { useCallsStore } from '@/stores/calls'
import { useKommoStore } from '@/stores/kommo'
import { usePreferencesStore } from '@/stores/preferences'
import { useCallerIdsStore } from '@/stores/callerids'

const auth   = useAuthStore()
const prefs  = usePreferencesStore()
const webrtc = useWebRtcStore()
const calls  = useCallsStore()
const kommo  = useKommoStore()
const { audioContextUnlocked } = storeToRefs(calls)

const showChangePassword = ref(false)
const showSettings       = ref(false)
const showThemes         = ref(false)

const showInCall = computed(
  () => calls.inCall && !(calls.callStatus === 'ringing' && calls.direction === 'inbound'),
)

const regState = computed(() => {
  const s = webrtc.registrationState
  if (s === 'registered')                     return 'ok'
  if (s === 'failed')                         return 'err'
  if (s === 'connecting' || s === 'loading')  return 'warn'
  return 'idle'
})

const regLabel = computed(() => {
  switch (webrtc.registrationState) {
    case 'loading':      return 'Loading config…'
    case 'connecting':   return 'Connecting…'
    case 'registered':   return `Registered · ext ${auth.extension}`
    case 'unregistered': return 'Unregistered'
    case 'failed':       return webrtc.error ?? 'Registration failed'
    default:             return 'SIP idle'
  }
})

watch(() => auth.mustChangePassword, (must) => { if (must) showChangePassword.value = true }, { immediate: true })

function onPasswordChanged() {
  showChangePassword.value = false
  void webrtc.startUA()
}

const soundHint = ref<'idle' | 'ok' | 'denied'>('idle')
const soundEnabling = ref(false)
const showMicBlockedHelp = ref(false)
const showMicHelpModal = ref(false)
const micRetryNote = ref('')
const micPermissionState = ref<PermissionState | 'unknown'>('unknown')
const micBlockedBannerRef = ref<HTMLElement | null>(null)
const insecureContext = !window.isSecureContext
const pageProtocol = location.protocol

const showMicBlockedBanner = computed(() => {
  if (insecureContext || audioContextUnlocked.value) return false
  if (micPermissionState.value === 'denied') return true
  return showMicBlockedHelp.value && soundHint.value === 'denied'
})

async function refreshMicPermissionState() {
  if (!navigator.permissions?.query) {
    micPermissionState.value = 'unknown'
    return
  }
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    micPermissionState.value = status.state
    status.onchange = () => {
      micPermissionState.value = status.state
      if (status.state === 'granted') {
        showMicBlockedHelp.value = false
        void calls.syncAudioUnlockState()
      }
    }
  } catch {
    micPermissionState.value = 'unknown'
  }
}

function scrollToMicBanner() {
  void nextTick(() => {
    micBlockedBannerRef.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}

const enableSoundLabel = computed(() => {
  if (soundEnabling.value) return 'Requesting…'
  if (micPermissionState.value === 'denied') return 'Unblock microphone'
  return 'Enable sound'
})

function applyMicAccessResult(result: 'granted' | 'blocked' | 'denied') {
  if (result === 'granted') {
    showMicBlockedHelp.value = false
    showMicHelpModal.value = false
    micRetryNote.value = ''
    soundHint.value = 'ok'
    window.setTimeout(() => { soundHint.value = 'idle' }, 4000)
    return
  }
  soundHint.value = 'denied'
  showMicBlockedHelp.value = true
  showMicHelpModal.value = true
  if (result === 'blocked') {
    micRetryNote.value = 'Microphone is still blocked. Allow it in browser site settings, then reload this page.'
  } else {
    micRetryNote.value = 'Permission was not granted. Click Allow in the browser prompt, or unblock the microphone in site settings.'
  }
}

async function requestMicAccess(): Promise<'granted' | 'blocked' | 'denied'> {
  await refreshMicPermissionState()
  if (micPermissionState.value === 'denied') return 'blocked'

  const ok = await calls.unlockAudio({ feedback: true })
  await refreshMicPermissionState()

  if (ok) return 'granted'
  const after = micPermissionState.value as PermissionState | 'unknown'
  return after === 'denied' ? 'blocked' : 'denied'
}

async function enableSound() {
  if (soundEnabling.value) return
  soundEnabling.value = true
  soundHint.value = 'idle'
  micRetryNote.value = ''

  try {
    await refreshMicPermissionState()
    const result = micPermissionState.value === 'denied'
      ? 'blocked'
      : await requestMicAccess()
    applyMicAccessResult(result)
    if (result !== 'granted') scrollToMicBanner()
  } finally {
    soundEnabling.value = false
  }
}

async function retryMicFromModal() {
  if (soundEnabling.value) return
  soundEnabling.value = true
  micRetryNote.value = ''

  try {
    await refreshMicPermissionState()

    if (micPermissionState.value === 'granted') {
      await calls.syncAudioUnlockState()
      if (audioContextUnlocked.value) {
        applyMicAccessResult('granted')
        return
      }
    }

    if (micPermissionState.value === 'denied') {
      applyMicAccessResult('blocked')
      return
    }

    applyMicAccessResult(await requestMicAccess())
  } finally {
    soundEnabling.value = false
  }
}

const homeRef = ref<HTMLElement | null>(null)
const workspaceRef = ref<HTMLElement | null>(null)
const historyPanelRef = ref<HTMLElement | null>(null)
const callHistoryRef = ref<InstanceType<typeof CallHistory> | null>(null)
const historyInnerMax = ref(400)

let layoutObserver: ResizeObserver | null = null
let layoutSyncTimer: ReturnType<typeof setTimeout> | null = null
let dprMedia: MediaQueryList | null = null
let dprMediaHandler: (() => void) | null = null

function bindDevicePixelRatioWatch() {
  if (dprMedia && dprMediaHandler) {
    dprMedia.removeEventListener('change', dprMediaHandler)
  }
  dprMedia = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
  dprMediaHandler = () => {
    scheduleLayoutSync()
    bindDevicePixelRatioWatch()
  }
  dprMedia.addEventListener('change', dprMediaHandler)
}

function panelPaddingY(panel: HTMLElement): number {
  const s = getComputedStyle(panel)
  return parseFloat(s.paddingTop) + parseFloat(s.paddingBottom)
}

function syncHistoryInnerMax() {
  const panel = historyPanelRef.value
  if (!panel || panel.clientHeight <= 0) return
  historyInnerMax.value = Math.max(100, Math.floor(panel.clientHeight - panelPaddingY(panel)))
}

function scheduleLayoutSync() {
  if (layoutSyncTimer) clearTimeout(layoutSyncTimer)
  layoutSyncTimer = setTimeout(() => {
    syncHistoryInnerMax()
    void nextTick(() => callHistoryRef.value?.measureLayout())
  }, 50)
}

function attachLayoutObserver() {
  layoutObserver?.disconnect()
  layoutObserver = new ResizeObserver(() => scheduleLayoutSync())
  for (const el of [homeRef.value, workspaceRef.value, historyPanelRef.value]) {
    if (el) layoutObserver.observe(el)
  }
  scheduleLayoutSync()
}

function onWindowLayoutChange() {
  scheduleLayoutSync()
}

onMounted(async () => {
  if (auth.mustChangePassword) return
  await refreshMicPermissionState()
  const callerIds = useCallerIdsStore()
  await Promise.allSettled([
    webrtc.startUA(),
    kommo.fetchKommoStatus(),
    prefs.load(),
    callerIds.items.length ? Promise.resolve() : callerIds.fetch(),
  ])
  await calls.syncAudioUnlockState()

  void nextTick(() => {
    attachLayoutObserver()
    bindDevicePixelRatioWatch()
  })
  window.addEventListener('resize', onWindowLayoutChange)
  visualViewport?.addEventListener('resize', onWindowLayoutChange)
})

onUnmounted(() => {
  layoutObserver?.disconnect()
  layoutObserver = null
  if (layoutSyncTimer) clearTimeout(layoutSyncTimer)
  if (dprMedia && dprMediaHandler) dprMedia.removeEventListener('change', dprMediaHandler)
  window.removeEventListener('resize', onWindowLayoutChange)
  visualViewport?.removeEventListener('resize', onWindowLayoutChange)
})

watch(() => calls.lastError, () => void nextTick(scheduleLayoutSync))
</script>

<template>
  <AppShell
    @change-password="showChangePassword = true"
    @settings="showSettings = true"
    @themes="showThemes = true"
  >

    <div ref="homeRef" class="home">
    <!-- Status pill ─────────────────────────────────────────────── -->
    <div class="status-row">
      <div class="status-pill" :class="regState">
        <span class="dot" />
        <span>{{ regLabel }}</span>
      </div>

      <KommoStatus />

      <div v-if="insecureContext" class="insecure-warn">
        Calls require HTTPS — microphone is blocked on {{ pageProtocol }} (use https://dev.web-callspire.portalhm.cc)
      </div>

      <template v-if="!insecureContext">
        <button
          v-if="!audioContextUnlocked"
          class="sound-btn"
          :class="{ 'sound-btn-denied': micPermissionState === 'denied' || soundHint === 'denied' }"
          type="button"
          :title="micPermissionState === 'denied'
            ? 'Microphone blocked — follow the instructions to allow it in browser settings'
            : 'Allow microphone access in the browser prompt'"
          :disabled="soundEnabling"
          @click="enableSound"
        >
          <span class="audio-icon-wrap">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
            <span class="audio-dot" :class="micPermissionState === 'denied' || soundHint === 'denied' ? 'err' : 'warn'" />
          </span>
          {{ enableSoundLabel }}
        </button>
        <button
          v-else
          type="button"
          class="audio-status-btn"
          :class="{ denied: soundHint === 'denied' }"
          title="Audio devices"
          @click="showSettings = true"
        >
          <span class="audio-icon-wrap">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
            <span class="audio-dot" :class="soundHint === 'denied' ? 'err' : 'ok'" />
          </span>
        </button>
        <span v-if="soundHint === 'denied' && micPermissionState !== 'denied'" class="hint err">
          Microphone access denied
        </span>
      </template>
    </div>

    <!-- Microphone blocked banner -->
    <Transition name="fade">
      <div
        v-if="showMicBlockedBanner"
        ref="micBlockedBannerRef"
        class="mic-blocked-banner"
        role="alert"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="2" y1="2" x2="22" y2="22"/>
          <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/>
          <path d="M5 10v2a7 7 0 0 0 12 5"/>
          <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/>
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
          <line x1="12" y1="19" x2="12" y2="22"/>
          <line x1="8" y1="22" x2="16" y2="22"/>
        </svg>
        <div class="mic-blocked-text">
          <strong>Microphone is blocked for this site</strong>
          <span>
            Browser settings cannot be opened from this page.
            <button type="button" class="link-btn" @click="showMicHelpModal = true">Show how to unblock</button>
          </span>
        </div>
      </div>
    </Transition>

    <!-- Call error banner -->
    <Transition name="fade">
      <div v-if="calls.lastError" class="call-error">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>{{ calls.lastError }}</span>
        <button type="button" class="dismiss" @click="calls.lastError = null" aria-label="Dismiss">✕</button>
      </div>
    </Transition>

    <!-- ── Two-column layout ─────────────────────────────────────────── -->
    <div ref="workspaceRef" class="workspace">

      <!-- Left: phone panel -->
      <div class="phone-col">
        <div class="panel phone-panel">
          <Dialpad />
        </div>
      </div>

      <!-- Right: history -->
      <div class="history-col">
        <div ref="historyPanelRef" class="panel history-panel">
          <CallHistory ref="callHistoryRef" :max-height="historyInnerMax" />
        </div>
      </div>

    </div>
    </div>

    <!-- Floating draggable call widget -->
    <InCallView v-if="showInCall" />

    <IncomingCallToast />
    <SettingsModal v-if="showSettings" @close="showSettings = false" />
    <ThemesModal v-if="showThemes" @close="showThemes = false" />
    <MicPermissionModal
      v-if="showMicHelpModal"
      :blocked="micPermissionState === 'denied'"
      :trying="soundEnabling"
      :note="micRetryNote"
      @close="showMicHelpModal = false"
      @retry="retryMicFromModal"
    />
    <ChangePasswordModal
      v-if="showChangePassword"
      :forced="auth.mustChangePassword"
      @close="showChangePassword = false"
      @changed="onPasswordChanged"
    />

  </AppShell>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

/* ── Status ──────────────────────────────────────────────────────── */
.status-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: clamp(0.5rem, 1.5vh, 1rem);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.3rem 0.75rem;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 600;
  border: 1px solid;
  transition: all 0.25s;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.ok {
  background: var(--emerald-dim);
  border-color: var(--emerald-border);
  color: var(--emerald);
}
.ok .dot {
  background: var(--emerald);
  box-shadow: 0 0 0 2.5px color-mix(in srgb, var(--emerald) 22%, transparent);
}

.err {
  background: var(--red-dim);
  border-color: var(--red-border);
  color: var(--red);
}
.err .dot { background: var(--red); }

.warn {
  background: var(--amber-dim);
  border-color: var(--amber-border);
  color: var(--amber);
}
.warn .dot { background: var(--amber); }

.idle {
  background: var(--surface-2);
  border-color: var(--border);
  color: var(--fg-subtle);
}
.idle .dot { background: var(--fg-subtle); }

.sound-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.8rem;
  border-radius: var(--radius-full);
  border: 1px solid var(--amber-border);
  background: var(--amber-dim);
  color: var(--amber);
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-ui);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.sound-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--amber) 14%, var(--amber-dim));
  border-color: color-mix(in srgb, var(--amber) 45%, var(--amber-border));
}
.sound-btn:disabled { opacity: 0.7; cursor: wait; }
.sound-btn-denied {
  border-color: var(--red-border);
  background: var(--red-dim);
  color: var(--red);
}
.sound-btn-denied:hover:not(:disabled) {
  background: color-mix(in srgb, var(--red) 12%, var(--red-dim));
  border-color: var(--red-border);
}

.mic-blocked-banner {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  padding: 0.65rem 0.85rem;
  margin-bottom: 0.75rem;
  border-radius: var(--radius-md);
  background: var(--red-dim);
  border: 1px solid var(--red-border);
  color: var(--fg-muted);
  font-size: 12.5px;
  line-height: 1.45;
  flex-shrink: 0;
}
.mic-blocked-banner svg {
  flex-shrink: 0;
  margin-top: 0.1rem;
  color: var(--red);
}
.mic-blocked-text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.mic-blocked-text strong {
  font-weight: 600;
  color: var(--red);
}
.link-btn {
  display: inline;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-weight: 600;
  color: var(--red);
  text-decoration: underline;
  cursor: pointer;
}
.link-btn:hover { color: var(--fg); }

.audio-status-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--fg-muted);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.audio-status-btn:hover {
  background: var(--surface-3);
  color: var(--fg);
  border-color: var(--border-hover);
}
.audio-status-btn.denied {
  border-color: var(--red-border);
  background: var(--red-dim);
  color: var(--red);
}

.audio-icon-wrap {
  position: relative;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
}
.audio-dot {
  position: absolute;
  top: -1px;
  right: -2px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1.5px solid var(--surface);
  box-sizing: border-box;
}
.audio-dot.ok {
  background: var(--emerald);
  box-shadow: 0 0 0 1px rgba(25, 195, 125, 0.25);
}
.audio-dot.warn {
  background: var(--amber);
}
.audio-dot.err {
  background: var(--red);
}

.hint      { font-size: 12px; font-weight: 500; }
.hint.err  { color: var(--red); }

.insecure-warn {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: var(--amber);
  background: var(--amber-dim);
  border: 1px solid var(--amber-border);
  border-radius: var(--radius-md);
  padding: 0.35rem 0.75rem;
}

/* Call error banner */
.call-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.85rem;
  margin-bottom: 0.75rem;
  border-radius: var(--radius-md);
  background: var(--red-dim);
  border: 1px solid var(--red-border);
  color: var(--red);
  font-size: 12.5px;
  font-weight: 500;
  flex-shrink: 0;
}
.call-error svg { flex-shrink: 0; }
.call-error span { flex: 1; }
.dismiss {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  opacity: 0.7;
  padding: 0 0.25rem;
}
.dismiss:hover { opacity: 1; }

/* ── Layout ──────────────────────────────────────────────────────── */
.workspace {
  display: grid;
  grid-template-columns: min(320px, 100%) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: clamp(0.65rem, 1.5vw, 1rem);
  align-items: stretch;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.phone-col,
.history-col {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.phone-col {
  max-height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
}

@media (max-width: 700px) {
  .workspace {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .phone-col {
    flex-shrink: 0;
    max-height: none;
    overflow: visible;
  }
}

.panel {
  background: var(--panel-bg, var(--surface));
  background-clip: padding-box;
  backdrop-filter: blur(var(--panel-blur, 0)) saturate(var(--panel-saturate, 1));
  -webkit-backdrop-filter: blur(var(--panel-blur, 0)) saturate(var(--panel-saturate, 1));
  border-radius: var(--radius-xl);
  border: none;
  box-shadow: inset 0 0 0 1px color-mix(
    in srgb,
    var(--panel-border-color, var(--border))
    var(--panel-border-strength, 100%),
    transparent
  );
  overflow: hidden;
}

.phone-panel {
  padding: clamp(0.75rem, 2vh, 1.5rem) clamp(0.75rem, 2vw, 1.25rem);
  display: flex;
  flex-direction: column;
  gap: clamp(0.5rem, 1.5vh, 1rem);
  flex-shrink: 0;
}

.history-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
  padding: clamp(0.75rem, 1.5vh, 1.25rem);
  overflow: hidden;
}

/* Transition */
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s; }
.fade-enter-from,  .fade-leave-to      { opacity: 0; }
</style>
