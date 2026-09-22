<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { softphoneAudio, canChangeSink } from '@/audio/softphoneAudio'
import { usePreferencesStore } from '@/stores/preferences'

const emit = defineEmits<{ close: [] }>()

const prefs = usePreferencesStore()
const { microphoneId, speakerId } = storeToRefs(prefs)

interface AudioDevice {
  deviceId: string
  label: string
}

const micDevices     = ref<AudioDevice[]>([])
const speakerDevices = ref<AudioDevice[]>([])

const selectedMicId     = ref('')
const selectedSpeakerId = ref('')

const speakerRoutingSupported = canChangeSink()
const permissionState = ref<'idle' | 'requesting' | 'granted' | 'denied'>('idle')
const syncing = ref(false)

const selectedMic = computed(() =>
  micDevices.value.find((d) => d.deviceId === selectedMicId.value) ?? null,
)

const selectedSpeaker = computed(() =>
  selectedSpeakerId.value
    ? speakerDevices.value.find((d) => d.deviceId === selectedSpeakerId.value) ?? null
    : null,
)

const micLabel = computed(() => {
  if (selectedMic.value) return selectedMic.value.label
  if (selectedMicId.value) return 'Saved device unavailable'
  return 'System default'
})

const speakerLabel = computed(() =>
  selectedSpeaker.value?.label ?? 'Default output',
)

const micOpen = ref(false)
const speakerOpen = ref(false)
const micWrapRef = ref<HTMLElement | null>(null)
const speakerWrapRef = ref<HTMLElement | null>(null)

async function requestAndEnumerate() {
  permissionState.value = 'requesting'
  let stream: MediaStream | null = null
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    permissionState.value = 'granted'
  } catch {
    permissionState.value = 'denied'
  } finally {
    stream?.getTracks().forEach((t) => t.stop())
  }
  await enumerateDevices()
}

async function enumerateDevices() {
  const all = await navigator.mediaDevices.enumerateDevices()
  micDevices.value = all
    .filter((d) => d.kind === 'audioinput')
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `Microphone ${i + 1}`,
    }))

  if (speakerRoutingSupported) {
    speakerDevices.value = all
      .filter((d) => d.kind === 'audiooutput')
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Speaker ${i + 1}`,
      }))
  }

  reconcileSelections()
}

function reconcileSelections() {
  syncing.value = true
  try {
    const savedMic = microphoneId.value
    const savedSpeaker = speakerId.value

    if (savedMic && micDevices.value.some((d) => d.deviceId === savedMic)) {
      selectedMicId.value = savedMic
    } else {
      selectedMicId.value = ''
    }

    if (savedSpeaker && speakerDevices.value.some((d) => d.deviceId === savedSpeaker)) {
      selectedSpeakerId.value = savedSpeaker
    } else {
      selectedSpeakerId.value = ''
    }
  } finally {
    syncing.value = false
  }
}

function onDeviceChange() { void enumerateDevices() }

function onDocClick(e: MouseEvent) {
  const t = e.target as Node
  if (micOpen.value && !micWrapRef.value?.contains(t)) micOpen.value = false
  if (speakerOpen.value && !speakerWrapRef.value?.contains(t)) speakerOpen.value = false
}

async function pickMic(id: string) {
  selectedMicId.value = id
  micOpen.value = false
  if (!syncing.value) await prefs.setMicrophoneId(id)
}

async function pickSpeaker(id: string) {
  selectedSpeakerId.value = id
  speakerOpen.value = false
  if (!syncing.value) await prefs.setSpeakerId(id)
}

onMounted(async () => {
  navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)
  document.addEventListener('click', onDocClick, true)
  await prefs.load()
  await requestAndEnumerate()
})

onUnmounted(() => {
  navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange)
  document.removeEventListener('click', onDocClick, true)
})

watch([microphoneId, speakerId], () => reconcileSelections())

const testing = ref(false)

async function testSpeaker() {
  testing.value = true
  try {
    await softphoneAudio.testSpeaker(selectedSpeakerId.value)
  } finally {
    setTimeout(() => { testing.value = false }, 600)
  }
}

function close() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="backdrop" @click.self="close">
      <div class="modal" role="dialog" aria-modal="true" aria-label="Audio settings">

        <div class="header">
          <h2 class="title">Audio settings</h2>
          <button type="button" class="close-btn" aria-label="Close" @click="close">✕</button>
        </div>

        <div v-if="permissionState === 'requesting'" class="notice info">
          Requesting microphone access to list devices…
        </div>
        <div v-else-if="permissionState === 'denied'" class="notice warn">
          Microphone access was denied. Device names may be hidden.
          Allow access in your browser settings and reopen this panel.
        </div>

        <!-- Microphone -->
        <section class="section">
          <label class="section-label" for="mic-select">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
            Microphone
          </label>

          <div ref="micWrapRef" class="combo">
            <button
              id="mic-select"
              type="button"
              class="trigger"
              :class="{ open: micOpen, stale: selectedMicId && !selectedMic }"
              :disabled="!micDevices.length"
              :aria-expanded="micOpen"
              aria-haspopup="listbox"
              @click.stop="micOpen = !micOpen"
            >
              <span class="trigger-label">{{ micDevices.length ? micLabel : 'No devices found' }}</span>
              <svg class="chev" :class="{ open: micOpen }" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            <ul v-if="micOpen && micDevices.length" class="menu" role="listbox">
              <li role="option" :aria-selected="selectedMicId === ''">
                <button type="button" class="menu-item" :class="{ active: selectedMicId === '' }" @click.stop="pickMic('')">
                  System default
                </button>
              </li>
              <li v-for="d in micDevices" :key="d.deviceId" role="option" :aria-selected="selectedMicId === d.deviceId">
                <button type="button" class="menu-item" :class="{ active: selectedMicId === d.deviceId }" @click.stop="pickMic(d.deviceId)">
                  {{ d.label }}
                </button>
              </li>
            </ul>
          </div>
        </section>

        <!-- Speaker -->
        <section class="section" v-if="speakerRoutingSupported">
          <label class="section-label" for="speaker-select">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
            Speaker / Headset
          </label>

          <div class="speaker-row">
            <div ref="speakerWrapRef" class="combo flex-1">
              <button
                id="speaker-select"
                type="button"
                class="trigger"
                :class="{ open: speakerOpen, stale: selectedSpeakerId && !selectedSpeaker }"
                :disabled="!speakerDevices.length"
                :aria-expanded="speakerOpen"
                aria-haspopup="listbox"
                @click.stop="speakerOpen = !speakerOpen"
              >
                <span class="trigger-label">{{ speakerLabel }}</span>
                <svg class="chev" :class="{ open: speakerOpen }" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              <ul v-if="speakerOpen" class="menu" role="listbox">
                <li role="option" :aria-selected="selectedSpeakerId === ''">
                  <button type="button" class="menu-item" :class="{ active: selectedSpeakerId === '' }" @click.stop="pickSpeaker('')">
                    Default output
                  </button>
                </li>
                <li v-for="d in speakerDevices" :key="d.deviceId" role="option" :aria-selected="selectedSpeakerId === d.deviceId">
                  <button type="button" class="menu-item" :class="{ active: selectedSpeakerId === d.deviceId }" @click.stop="pickSpeaker(d.deviceId)">
                    {{ d.label }}
                  </button>
                </li>
              </ul>
            </div>

            <button
              type="button"
              class="test-btn"
              :disabled="testing"
              @click="testSpeaker"
              title="Play a short test beep on the selected output"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="15" height="15" aria-hidden="true">
                <path d="M8 5v14l11-7z"/>
              </svg>
              {{ testing ? 'Testing…' : 'Test' }}
            </button>
          </div>
        </section>

        <p v-else class="notice info">
          Output routing is not supported in this browser.
          Chrome, Edge, and Opera allow selecting a specific headset.
        </p>

        <div class="footer">
          <p v-if="prefs.error" class="save-err">{{ prefs.error }}</p>
          <button type="button" class="done-btn" @click="close">Done</button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: var(--overlay);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  width: 100%;
  max-width: 440px;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem 0;
}
.title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--fg);
}
.close-btn {
  background: none;
  border: none;
  font-size: 1rem;
  color: var(--fg-subtle);
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius-sm);
  transition: color 0.15s, background 0.15s;
}
.close-btn:hover { color: var(--fg); background: var(--surface-2); }

.section {
  padding: 1.1rem 1.5rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.section-label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--fg-subtle);
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

.combo {
  position: relative;
}
.combo.flex-1 { flex: 1; }

.trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  padding: 0.6rem 0.9rem;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 0.88rem;
  font-family: var(--font-ui);
  color: var(--fg);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}
.trigger:hover:not(:disabled) { border-color: var(--border-hover); }
.trigger.open { border-color: var(--border-focus); }
.trigger:disabled { opacity: 0.5; cursor: default; }
.trigger.stale .trigger-label { color: var(--amber); }

.trigger-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chev {
  flex-shrink: 0;
  color: var(--fg-subtle);
  transition: transform 0.15s;
}
.chev.open { transform: rotate(180deg); }

.menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 10;
  margin: 0;
  padding: 0.3rem 0;
  list-style: none;
  max-height: 220px;
  overflow-y: auto;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow);
}

.menu-item {
  display: block;
  width: 100%;
  padding: 0.5rem 0.9rem;
  border: none;
  background: none;
  text-align: left;
  font-size: 0.86rem;
  font-family: var(--font-ui);
  color: var(--fg-muted);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.12s, color 0.12s;
}
.menu-item:hover { background: rgba(255, 255, 255, 0.06); color: var(--fg); }
.menu-item.active { color: var(--emerald); font-weight: 600; }

.speaker-row {
  display: flex;
  gap: 0.6rem;
  align-items: center;
}

.test-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.6rem 0.9rem;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--fg-muted);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.test-btn:hover:not(:disabled) {
  background: var(--emerald-dim);
  border-color: var(--emerald-border);
  color: var(--emerald);
}
.test-btn:disabled { opacity: 0.5; cursor: default; }

.notice {
  margin: 0.8rem 1.5rem 0;
  padding: 0.6rem 0.85rem;
  border-radius: var(--radius-md);
  font-size: 0.82rem;
  line-height: 1.5;
}
.notice.info { background: var(--blue-dim); color: var(--blue); }
.notice.warn { background: var(--amber-dim); color: var(--amber); }

.footer {
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.5rem;
}

.save-err {
  margin: 0;
  font-size: 0.8rem;
  color: var(--red);
}

.done-btn {
  align-self: flex-end;
  padding: 0.6rem 1.6rem;
  background: var(--emerald);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.done-btn:hover { background: var(--emerald-hover); }
</style>
