<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useCallsStore } from '@/stores/calls'
import Dialpad from '@/components/Dialpad.vue'

const calls = useCallsStore()
const elapsed = ref(0)
let t: ReturnType<typeof setInterval> | null = null

const WIDGET_W = 300
const pos = ref({ x: 0, y: 0 })
const dragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })

function placeDefault() {
  const margin = 20
  pos.value = {
    x: Math.max(margin, window.innerWidth - WIDGET_W - margin),
    y: Math.max(margin, window.innerHeight - 420),
  }
}

onMounted(() => {
  placeDefault()
  window.addEventListener('resize', placeDefault)
})

onUnmounted(() => {
  window.removeEventListener('resize', placeDefault)
})

function onDragStart(e: PointerEvent) {
  const target = e.target as HTMLElement
  if (target.closest('button') || target.closest('input')) return
  dragging.value = true
  dragOffset.value = { x: e.clientX - pos.value.x, y: e.clientY - pos.value.y }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onDragMove(e: PointerEvent) {
  if (!dragging.value) return
  const maxX = Math.max(0, window.innerWidth - WIDGET_W)
  const maxY = Math.max(0, window.innerHeight - 80)
  pos.value = {
    x: Math.min(maxX, Math.max(0, e.clientX - dragOffset.value.x)),
    y: Math.min(maxY, Math.max(0, e.clientY - dragOffset.value.y)),
  }
}

function onDragEnd(e: PointerEvent) {
  dragging.value = false
  try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* ignore */ }
}

function startTimer() {
  if (t) clearInterval(t)
  elapsed.value = calls.startedAt ? Math.floor((Date.now() - calls.startedAt) / 1000) : 0
  t = setInterval(() => {
    elapsed.value = calls.startedAt ? Math.floor((Date.now() - calls.startedAt) / 1000) : 0
  }, 1000)
}
function stopTimer() { if (t) { clearInterval(t); t = null } elapsed.value = 0 }

watch(() => calls.startedAt, (v) => { if (v) startTimer(); else stopTimer() }, { immediate: true })
onUnmounted(stopTimer)

watch(
  () => [calls.inCall, calls.remoteNumber, calls.remoteDisplayName] as const,
  ([inCall, number, name]) => {
    if (!inCall || !number || name) return
    window.setTimeout(() => {
      if (calls.inCall && calls.remoteNumber === number && !calls.remoteDisplayName) {
        void calls.lookupRemoteContact(number)
      }
    }, 1500)
  },
)

const duration = computed(() => {
  const s = elapsed.value % 60
  const m = Math.floor(elapsed.value / 60) % 60
  const h = Math.floor(elapsed.value / 3600)
  return h > 0
    ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
})

const statusLabel = computed(() => {
  switch (calls.callStatus) {
    case 'connecting': return 'Connecting…'
    case 'ringing':    return 'Ringing…'
    case 'active':     return 'In call'
    case 'held':       return 'On hold'
    default:           return ''
  }
})

const avatarInitials = computed(() => {
  const name = calls.remoteDisplayName.trim()
  if (!name) return ''
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
})

const showDtmf = ref(false)
</script>

<template>
  <Teleport to="body">
    <div
      class="call-widget"
      :class="{ dragging }"
      :style="{ left: `${pos.x}px`, top: `${pos.y}px`, width: `${WIDGET_W}px` }"
    >
      <!-- Drag handle -->
      <div
        class="drag-bar"
        @pointerdown="onDragStart"
        @pointermove="onDragMove"
        @pointerup="onDragEnd"
        @pointercancel="onDragEnd"
      >
        <span class="grip" aria-hidden="true" />
        <span class="drag-title">{{ statusLabel || 'Call' }}</span>
        <span v-if="calls.startedAt" class="drag-timer">{{ duration }}</span>
      </div>

      <div class="incall">
        <div class="remote">
          <div class="avatar" :class="{ named: !!calls.remoteDisplayName }">
            <span v-if="avatarInitials" class="avatar-initials">{{ avatarInitials }}</span>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <p v-if="calls.remoteDisplayName" class="contact-name">{{ calls.remoteDisplayName }}</p>
          <p class="number" :class="{ sub: !!calls.remoteDisplayName }">{{ calls.remoteNumber || 'Unknown' }}</p>
          <span class="call-status" :class="calls.callStatus">{{ statusLabel }}</span>
        </div>

        <button class="dtmf-toggle" :class="{ active: showDtmf }" @click="showDtmf = !showDtmf">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="4" height="4" rx="1"/><rect x="10" y="3" width="4" height="4" rx="1"/>
            <rect x="17" y="3" width="4" height="4" rx="1"/><rect x="3" y="10" width="4" height="4" rx="1"/>
            <rect x="10" y="10" width="4" height="4" rx="1"/><rect x="17" y="10" width="4" height="4" rx="1"/>
            <rect x="3" y="17" width="4" height="4" rx="1"/><rect x="10" y="17" width="4" height="4" rx="1"/>
            <rect x="17" y="17" width="4" height="4" rx="1"/>
          </svg>
          Keypad
        </button>

        <Transition name="fade">
          <div v-if="showDtmf" class="dtmf-wrap"><Dialpad /></div>
        </Transition>

        <div class="controls">
          <button class="ctrl" :class="{ active: calls.muted }"
            @click="calls.toggleMute()" :title="calls.muted ? 'Unmute' : 'Mute'">
            <svg v-if="!calls.muted" xmlns="http://www.w3.org/2000/svg" width="18" height="18"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8"  y1="23" x2="16" y2="23"/>
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <line x1="1" y1="1" x2="23" y2="23"/>
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8"  y1="23" x2="16" y2="23"/>
            </svg>
            <span>{{ calls.muted ? 'Unmute' : 'Mute' }}</span>
          </button>

          <button class="ctrl" :class="{ active: calls.onHold }"
            @click="calls.toggleHold()" :title="calls.onHold ? 'Resume' : 'Hold'">
            <svg v-if="!calls.onHold" xmlns="http://www.w3.org/2000/svg" width="18" height="18"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/>
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            <span>{{ calls.onHold ? 'Resume' : 'Hold' }}</span>
          </button>
        </div>

        <button class="end-btn" @click="calls.hangup()" aria-label="End call">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.99 12 19.79 19.79 0 0 1 1.9 3.38 2 2 0 0 1 3.89 1H7a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 8.91"/>
            <line x1="23" y1="1" x2="1" y2="23"/>
          </svg>
          End call
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.call-widget {
  position: fixed;
  z-index: 300;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: 0 12px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.04);
  overflow: hidden;
  animation: call-pop 0.2s cubic-bezier(.22,1,.36,1);
  touch-action: none;
}
.call-widget.dragging {
  cursor: grabbing;
  user-select: none;
  box-shadow: 0 16px 48px rgba(0,0,0,0.45);
}

@keyframes call-pop {
  from { opacity: 0; transform: scale(0.96) translateY(6px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

.drag-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.85rem;
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
  cursor: grab;
  touch-action: none;
}
.drag-bar:active { cursor: grabbing; }

.grip {
  width: 14px;
  height: 10px;
  background:
    radial-gradient(circle, var(--fg-subtle) 1.5px, transparent 1.5px) 0 0 / 7px 5px repeat;
  opacity: 0.7;
  flex-shrink: 0;
}

.drag-title {
  flex: 1;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--fg-muted);
}

.drag-timer {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-subtle);
}

.incall {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem 1rem 1.1rem;
}

.remote {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
}

.avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--surface-2);
  border: 1px solid var(--border);
  display: grid;
  place-items: center;
  color: var(--fg-subtle);
}
.avatar.named {
  background: rgba(79, 140, 255, 0.14);
  border-color: rgba(79, 140, 255, 0.35);
  color: #8eb8ff;
}
.avatar-initials {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.contact-name {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--fg);
  text-align: center;
  line-height: 1.25;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.number {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 1.35rem;
  font-weight: 600;
  color: var(--fg);
  letter-spacing: 0.03em;
}
.number.sub {
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--fg-subtle);
}

.call-status {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--fg-subtle);
}
.call-status.active    { color: var(--emerald); }
.call-status.held      { color: var(--amber); }
.call-status.connecting,
.call-status.ringing   { color: var(--blue); }

.dtmf-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--fg-subtle);
  font-size: 12.5px;
  font-weight: 500;
  font-family: var(--font-ui);
  padding: 0.45rem 0.9rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.dtmf-toggle:hover, .dtmf-toggle.active {
  background: rgba(255,255,255,.06);
  color: var(--fg-muted);
  border-color: var(--border-hover);
}

.dtmf-wrap { width: 100%; }

.controls {
  display: flex;
  gap: 0.5rem;
}

.ctrl {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 0.65rem;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  color: var(--fg-muted);
  font-size: 10.5px;
  font-weight: 600;
  font-family: var(--font-ui);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.ctrl:hover { background: var(--surface-3); border-color: var(--border-hover); }
.ctrl.active {
  background: var(--surface-3);
  border-color: var(--border-focus);
  color: var(--fg);
}

.end-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.65rem;
  background: var(--red-dim);
  border: 1px solid var(--red-border);
  border-radius: var(--radius-lg);
  color: var(--red);
  font-size: 13.5px;
  font-weight: 600;
  font-family: var(--font-ui);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.08s;
}
.end-btn:hover {
  background: color-mix(in srgb, var(--red) 22%, transparent);
  border-color: color-mix(in srgb, var(--red) 50%, transparent);
  color: var(--red);
}
.end-btn:active { transform: scale(0.98); }

:global(:root[data-theme='light']) .end-btn {
  background: var(--red);
  border-color: color-mix(in srgb, var(--red) 82%, #000);
  color: #fff;
  box-shadow: 0 1px 2px color-mix(in srgb, var(--red) 28%, transparent);
}
:global(:root[data-theme='light']) .end-btn:hover {
  background: color-mix(in srgb, var(--red) 88%, #000);
  border-color: color-mix(in srgb, var(--red) 70%, #000);
  color: #fff;
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.15s; }
.fade-enter-from,  .fade-leave-to      { opacity: 0; }
</style>
