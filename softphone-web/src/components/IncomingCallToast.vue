<script setup lang="ts">
import { computed, watch } from 'vue'
import { useCallsStore } from '@/stores/calls'

const calls = useCallsStore()

watch(
  () => [calls.callStatus, calls.direction, calls.remoteNumber, calls.remoteDisplayName] as const,
  ([status, direction, number, name]) => {
    if (status !== 'ringing' || direction !== 'inbound' || !number || name) return
    window.setTimeout(() => {
      if (
        calls.callStatus === 'ringing' &&
        calls.direction === 'inbound' &&
        calls.remoteNumber === number &&
        !calls.remoteDisplayName
      ) {
        void calls.lookupRemoteContact(number)
      }
    }, 1500)
  },
)

const avatarInitials = computed(() => {
  const name = calls.remoteDisplayName.trim()
  if (!name) return ''
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
})

function answer() {
  calls.answer()
}

function decline() {
  calls.hangup()
}
</script>

<template>
  <Transition name="toast">
    <div
      v-if="calls.callStatus === 'ringing' && calls.direction === 'inbound'"
      class="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Incoming call"
    >
      <div class="card">
        <p class="label">Incoming call</p>
        <div class="indicator" :class="{ named: !!calls.remoteDisplayName }">
          <span v-if="avatarInitials" class="avatar-initials">{{ avatarInitials }}</span>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12 19.79 19.79 0 0 1 1.9 3.38 2 2 0 0 1 3.89 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 5.997 5.997l1.068-1.168a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        </div>

        <p v-if="calls.remoteDisplayName" class="contact-name">{{ calls.remoteDisplayName }}</p>
        <p class="number" :class="{ sub: !!calls.remoteDisplayName }">{{ calls.remoteNumber || 'Unknown' }}</p>

        <div class="actions">
          <button type="button" class="btn decline" @click="decline" aria-label="Decline">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="26" height="26">
              <path d="M19.59 7.33l-2.22 2.22c-.28.28-.72.29-1 .02-1.02-.87-2.18-1.56-3.46-2.02-.36-.13-.6-.47-.6-.85V4c0-.41-.3-.77-.71-.79A10.01 10.01 0 0 0 4 11.54c0 .45.03.89.08 1.33.05.43.46.73.89.66l2.67-.44c.37-.06.67-.33.75-.7.18-.78.5-1.52.93-2.17.2-.3.16-.69-.09-.94l-1.5-1.5a8.004 8.004 0 0 0-.02.22c0 4.42 3.58 8 8 8 .07 0 .15 0 .22-.01l-1.5-1.5c-.25-.25-.64-.29-.94-.09-.65.43-1.38.75-2.17.93-.37.08-.64.38-.7.75l-.44 2.67c-.07.43.23.84.66.89.44.05.88.08 1.33.08 5.52 0 10-4.48 10-10 0-.69-.07-1.36-.2-2.01-.06-.29-.24-.54-.49-.68z"/>
            </svg>
            Decline
          </button>

          <button type="button" class="btn answer" @click="answer" aria-label="Answer">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="26" height="26">
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
            </svg>
            Answer
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 260;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: var(--overlay);
  backdrop-filter: blur(3px);
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 2rem 2rem 1.75rem;
  text-align: center;
  box-shadow: var(--shadow);
  width: 100%;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
}

.indicator {
  width: 3.25rem;
  height: 3.25rem;
  border-radius: 50%;
  background: var(--emerald-dim);
  color: var(--emerald);
  display: grid;
  place-items: center;
  animation: ring-pulse 1.2s ease-in-out infinite;
}
.indicator.named {
  background: rgba(79, 140, 255, 0.14);
  color: #8eb8ff;
  animation: none;
}
.avatar-initials {
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.ring-icon { font-size: 1.4rem; }

@keyframes ring-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(25,195,125,.45); }
  50%       { box-shadow: 0 0 0 12px rgba(25,195,125,0); }
}

.label {
  margin: 0;
  font-size: 0.78rem;
  color: var(--fg-subtle);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 600;
}

.contact-name {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--fg);
  line-height: 1.25;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.number {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 1.7rem;
  font-weight: 600;
  color: var(--fg);
  letter-spacing: 0.03em;
}
.number.sub {
  font-size: 1rem;
  font-weight: 500;
  color: var(--fg-subtle);
}

.actions {
  display: flex;
  gap: 1rem;
  margin-top: 0.75rem;
}

.btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  width: 5rem;
  padding: 0.85rem 0;
  border: none;
  border-radius: var(--radius-lg);
  font-size: 0.78rem;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}
.btn:active { transform: scale(0.94); }

.answer { background: var(--emerald); }
.answer:hover { background: var(--emerald-hover); }

.decline { background: var(--red); }
.decline:hover { filter: brightness(1.08); }

/* Transition */
.toast-enter-active { transition: transform 0.25s cubic-bezier(.22,1,.36,1), opacity 0.2s; }
.toast-leave-active { transition: transform 0.18s ease-in, opacity 0.16s; }
.toast-enter-from  { transform: scale(0.94); opacity: 0; }
.toast-leave-to    { transform: scale(0.94); opacity: 0; }
</style>
