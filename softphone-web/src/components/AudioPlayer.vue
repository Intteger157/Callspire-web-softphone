<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { appLog } from '@/logging/logCapture'

const props = defineProps<{
  /** Full URL to the audio recording (e.g. /softphone/api/recording?linkedid=…). */
  url: string
  /** CDR billsec — used when browser cannot read duration from streamed audio. */
  durationHint?: number
}>()

type PlayerState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error'
const state = ref<PlayerState>('idle')
const currentTime = ref(0)
const duration = ref(0)
const errorMsg = ref('')

let audio: HTMLAudioElement | null = null
let blobUrl: string | null = null
let loadGen = 0

function fmt(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds) % 60
  const m = Math.floor(seconds / 60) % 60
  const h = Math.floor(seconds / 3600)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

const progress = ref(0)

function applyDurationHint() {
  const hint = props.durationHint ?? 0
  if (hint <= 0) return
  if (!duration.value || !isFinite(duration.value) || duration.value === 0) {
    duration.value = hint
  }
}

function wireAudio(el: HTMLAudioElement) {
  el.addEventListener('loadedmetadata', () => {
    if (el.duration && isFinite(el.duration) && el.duration > 0) {
      duration.value = el.duration
    }
    applyDurationHint()
    if (state.value === 'loading') state.value = 'ready'
  })
  el.addEventListener('durationchange', () => {
    if (el.duration && isFinite(el.duration) && el.duration > 0) {
      duration.value = el.duration
    } else {
      applyDurationHint()
    }
  })
  el.addEventListener('canplay', () => {
    if (state.value === 'loading') state.value = 'ready'
    applyDurationHint()
  })
  el.addEventListener('timeupdate', () => {
    currentTime.value = el.currentTime
    const dur = duration.value > 0 ? duration.value : el.duration
    progress.value = dur > 0 ? (el.currentTime / dur) * 100 : 0
  })
  el.addEventListener('ended', () => {
    state.value = 'paused'
    currentTime.value = 0
    progress.value = 0
    el.currentTime = 0
  })
  el.addEventListener('error', () => {
    const code = el.error?.code
    errorMsg.value = code ? `Playback error (${code})` : 'Could not load recording'
    state.value = 'error'
    appLog('warn', '[player] audio error', { url: props.url, code })
  })
}

function disposeAudio() {
  if (audio) {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    audio = null
  }
  if (blobUrl) {
    URL.revokeObjectURL(blobUrl)
    blobUrl = null
  }
}

async function loadRecording() {
  const gen = ++loadGen
  state.value = 'loading'
  errorMsg.value = ''
  disposeAudio()
  applyDurationHint()

  try {
    const res = await fetch(props.url, { credentials: 'include' })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    const blob = await res.blob()
    if (gen !== loadGen) return
    if (blob.size < 32) {
      throw new Error('Recording file is empty')
    }
    blobUrl = URL.createObjectURL(blob)
    audio = new Audio()
    audio.preload = 'auto'
    wireAudio(audio)
    audio.src = blobUrl
    audio.load()
    state.value = 'ready'
    appLog('info', '[player] loaded', { bytes: blob.size, type: blob.type || 'unknown' })
  } catch (e) {
    if (gen !== loadGen) return
    const msg = e instanceof Error ? e.message : 'Could not load recording'
    errorMsg.value = msg
    state.value = 'error'
    appLog('warn', '[player] fetch failed', msg, props.url)
  }
}

function togglePlay() {
  if (state.value === 'idle' || state.value === 'error') {
    void loadRecording().then(() => {
      if (state.value === 'ready' || state.value === 'paused') void play()
    })
    return
  }
  if (state.value === 'loading') return
  if (state.value === 'playing') {
    audio?.pause()
    state.value = 'paused'
  } else {
    void play()
  }
}

async function play() {
  if (!audio) {
    await loadRecording()
  }
  if (!audio || state.value === 'error') return
  try {
    await audio.play()
    state.value = 'playing'
    if ((!duration.value || duration.value === 0) && audio.duration > 0) {
      duration.value = audio.duration
    } else {
      applyDurationHint()
    }
  } catch {
    errorMsg.value = 'Playback blocked — click again'
    state.value = 'paused'
  }
}

function seek(e: MouseEvent) {
  const dur = duration.value
  if (!audio || dur <= 0) return
  const bar = e.currentTarget as HTMLElement
  const rect = bar.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  audio.currentTime = ratio * dur
  progress.value = ratio * 100
}

watch(
  () => props.url,
  () => {
    loadGen++
    disposeAudio()
    state.value = 'idle'
    currentTime.value = 0
    duration.value = 0
    progress.value = 0
    errorMsg.value = ''
    applyDurationHint()
  },
)

onUnmounted(() => {
  loadGen++
  disposeAudio()
})
</script>

<template>
  <div class="player" :class="{ error: state === 'error' }" role="group" aria-label="Recording player">
    <button
      type="button"
      class="play-btn"
      :aria-label="state === 'playing' ? 'Pause' : 'Play'"
      :title="state === 'playing' ? 'Pause' : 'Play'"
      :disabled="state === 'error'"
      @click="togglePlay"
    >
      <span class="icon-slot" aria-hidden="true">
        <svg v-if="state === 'loading'" class="glyph spin" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="10" stroke-opacity=".25"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="1"/>
        </svg>
        <svg v-else-if="state !== 'playing'" class="glyph glyph-play" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor">
          <path d="M2.5 1.2v9.6L10.5 6 2.5 1.2z"/>
        </svg>
        <svg v-else class="glyph glyph-pause" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor">
          <rect x="2" y="1" width="2.5" height="10" rx="0.4"/>
          <rect x="7.5" y="1" width="2.5" height="10" rx="0.4"/>
        </svg>
      </span>
    </button>

    <span class="time current">{{ fmt(currentTime) }}</span>

    <div
      class="bar-wrap"
      role="slider"
      :aria-valuenow="Math.round(progress)"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="`Playback progress: ${fmt(currentTime)} of ${fmt(duration)}`"
      @click="seek"
    >
      <div class="bar-bg">
        <div class="bar-fill" :style="{ width: progress + '%' }" />
      </div>
    </div>

    <span class="time total">{{ fmt(duration) }}</span>

    <span v-if="state === 'error'" class="err-hint" :title="errorMsg">⚠</span>
  </div>
</template>

<style scoped>
.player {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.25rem 0.5rem;
  width: 100%;
  max-width: none;
}
.player.error {
  border-color: var(--red-border);
  background: var(--red-dim);
}

.play-btn {
  position: relative;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 50%;
  border: none;
  background: var(--emerald);
  color: #fff;
  cursor: pointer;
  transition: background 0.15s;
  vertical-align: middle;
}
.icon-slot {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.glyph {
  display: block;
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}
.glyph-play {
  transform: translateX(0.5px);
}
.play-btn:hover:not(:disabled) { background: var(--emerald-hover); }
.play-btn:disabled { background: var(--surface-3); color: var(--fg-subtle); cursor: default; }

.time {
  font-size: 0.7rem;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--fg-muted);
  white-space: nowrap;
  flex-shrink: 0;
  min-width: 2.2rem;
}
.total { color: var(--fg-subtle); }

.bar-wrap {
  flex: 1;
  padding: 0.5rem 0;
  cursor: pointer;
}
.bar-bg {
  height: 3px;
  background: var(--surface-3);
  border-radius: 2px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  background: var(--emerald);
  border-radius: 2px;
  transition: width 0.1s linear;
}

.err-hint {
  color: var(--red);
  font-size: 0.85rem;
  flex-shrink: 0;
}

.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
