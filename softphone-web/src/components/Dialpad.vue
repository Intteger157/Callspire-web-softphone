<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import CallerIdSelector from '@/components/CallerIdSelector.vue'
import { useCallsStore } from '@/stores/calls'

const calls = useCallsStore()
const input = ref('')

const KEYS: { digit: string; sub: string }[] = [
  { digit: '1', sub: '' },
  { digit: '2', sub: 'ABC' },
  { digit: '3', sub: 'DEF' },
  { digit: '4', sub: 'GHI' },
  { digit: '5', sub: 'JKL' },
  { digit: '6', sub: 'MNO' },
  { digit: '7', sub: 'PQRS' },
  { digit: '8', sub: 'TUV' },
  { digit: '9', sub: 'WXYZ' },
  { digit: '*', sub: '' },
  { digit: '0', sub: '+' },
  { digit: '#', sub: '' },
]

function pressKey(digit: string) {
  if (calls.isActive) { calls.sendDtmf(digit); return }
  input.value += digit
}
function backspace() { input.value = input.value.slice(0, -1) }
function call() {
  if (!input.value.trim()) return
  void calls.makeCall(input.value.trim())
  input.value = ''
}

const DTMF_CHARS = new Set(['0','1','2','3','4','5','6','7','8','9','*','#'])
function onKeyDown(e: KeyboardEvent) {
  const tag = (document.activeElement?.tagName ?? '').toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return
  if (DTMF_CHARS.has(e.key)) { e.preventDefault(); pressKey(e.key) }
  else if (e.key === 'Backspace') { e.preventDefault(); backspace() }
  else if (e.key === 'Enter')     { e.preventDefault(); call() }
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))
</script>

<template>
  <div class="dialpad">

    <!-- Input -->
    <div class="input-wrap">
      <input
        class="number-input"
        type="tel"
        :placeholder="calls.isActive ? 'DTMF…' : 'Enter number'"
        :readonly="calls.isActive"
        :value="input"
        autocomplete="off"
        @input="input = ($event.target as HTMLInputElement).value"
        @keydown.enter.prevent="call"
      />
      <button
        v-if="!calls.isActive && input.length"
        class="bsp"
        type="button"
        title="Backspace"
        aria-label="Backspace"
        @click="backspace"
      >
        <!-- Lucide delete (backspace) -->
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
          <line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/>
        </svg>
      </button>
    </div>

    <CallerIdSelector v-if="!calls.isActive" />

    <!-- Key grid -->
    <div class="grid">
      <button
        v-for="k in KEYS"
        :key="k.digit"
        type="button"
        class="key"
        @click="pressKey(k.digit)"
      >
        <span class="main">{{ k.digit }}</span>
        <span class="sub">{{ k.sub || '\u00A0' }}</span>
      </button>
    </div>

    <!-- Call button -->
    <div v-if="!calls.isActive" class="call-row">
      <button
        type="button"
        class="call-btn"
        :disabled="!input.trim()"
        @click="call"
        aria-label="Call"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12 19.79 19.79 0 0 1 1.9 3.38 2 2 0 0 1 3.89 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 5.997 5.997l1.068-1.168a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
        </svg>
      </button>
    </div>

  </div>
</template>

<style scoped>
.dialpad {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
}

/* ── Input ────────────────────────────────────────────────────────── */
.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.number-input {
  width: 100%;
  padding: 0.65rem 2.5rem 0.65rem 1rem;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  color: var(--fg);
  font-family: var(--font-mono);
  font-size: 1.25rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-align: center;
  outline: none;
  transition: border-color 0.2s, background 0.2s;
  caret-color: var(--emerald);
}
.number-input::placeholder {
  color: var(--fg-subtle);
  font-size: 0.85rem;
  letter-spacing: 0;
  font-family: var(--font-ui);
}
.number-input:focus {
  border-color: var(--border-focus);
  background: var(--surface-3);
}

.bsp {
  position: absolute;
  right: 0.6rem;
  display: grid;
  place-items: center;
  background: none;
  border: none;
  color: var(--fg-subtle);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: var(--radius-sm);
  transition: color 0.15s, background 0.15s;
}
.bsp:hover { color: var(--fg-muted); background: rgba(255,255,255,.06); }

/* ── Key grid (round, minimalist) ─────────────────────────────────── */
.grid {
  --key-size: clamp(48px, 11vh, 60px);
  --key-gap-y: clamp(8px, 1.4vh, 14px);
  --key-gap-x: clamp(14px, 2.2vh, 22px);
  display: grid;
  grid-template-columns: repeat(3, var(--key-size));
  gap: var(--key-gap-y) var(--key-gap-x);
  justify-content: center;
  padding: 0.25rem 0;
}

.key {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  width: var(--key-size);
  height: var(--key-size);
  border-radius: 50%;
  background: var(--surface-2);
  border: 1px solid var(--border);
  cursor: pointer;
  user-select: none;
  transition: background 0.12s ease, border-color 0.12s ease, transform 0.08s ease;
}
.key:hover {
  background: var(--surface-3);
  border-color: var(--border-hover);
}
.key:active {
  transform: scale(0.9);
  background: var(--input-bg);
}

.main {
  font-family: var(--font-mono);
  font-size: clamp(1.05rem, 2.6vh, 1.3rem);
  font-weight: 500;
  line-height: 1;
  color: var(--fg);
}
.sub {
  font-family: var(--font-ui);
  font-size: 0.46rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--fg-subtle);
  text-transform: uppercase;
  line-height: 1;
}

/* ── Call button (round emerald FAB) ──────────────────────────────── */
.call-row {
  display: flex;
  justify-content: center;
  padding-top: 0.35rem;
}
.call-btn {
  display: grid;
  place-items: center;
  width: clamp(48px, 10vh, 56px);
  height: clamp(48px, 10vh, 56px);
  border-radius: 50%;
  border: none;
  background: var(--emerald);
  color: #fff;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(25,195,125,0.32);
  transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
}
.call-btn:hover:not(:disabled) {
  background: var(--emerald-hover);
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(25,195,125,0.4);
}
.call-btn:active:not(:disabled) { transform: scale(0.93); }
.call-btn:disabled {
  background: var(--surface-3);
  color: var(--fg-subtle);
  box-shadow: none;
  cursor: not-allowed;
}
</style>
