<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  clearLogs,
  copyLogsToClipboard,
  downloadLogsAsTxt,
  getLogEntries,
  subscribeLogs,
  type LogEntry,
  type LogLevel,
} from '@/logging/logCapture'

const emit = defineEmits<{ close: [] }>()

const filter = ref<'all' | LogLevel>('all')
const autoScroll = ref(true)
const copyState = ref<'idle' | 'ok' | 'fail'>('idle')
const entries = ref<LogEntry[]>([...getLogEntries()])
const listEl = ref<HTMLElement | null>(null)

let unsub: (() => void) | null = null

onMounted(() => {
  unsub = subscribeLogs(() => {
    entries.value = [...getLogEntries()]
  })
})

onUnmounted(() => {
  unsub?.()
})

const filtered = computed(() => {
  if (filter.value === 'all') return entries.value
  return entries.value.filter((e) => e.level === filter.value)
})

watch(filtered, async () => {
  if (!autoScroll.value || !listEl.value) return
  await nextTick()
  listEl.value.scrollTop = listEl.value.scrollHeight
})

function fmtTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

async function copyAll() {
  copyState.value = 'idle'
  const ok = await copyLogsToClipboard(filtered.value.length ? filtered.value : entries.value)
  copyState.value = ok ? 'ok' : 'fail'
  if (ok) setTimeout(() => { copyState.value = 'idle' }, 2500)
}

function onClear() {
  clearLogs()
  entries.value = []
}

function exportTxt() {
  const list = filtered.value.length ? filtered.value : entries.value
  downloadLogsAsTxt(list)
}
</script>

<template>
  <Teleport to="body">
    <div class="backdrop" @click.self="emit('close')">
      <div class="modal" role="dialog" aria-modal="true" aria-label="Session logs">

        <div class="header">
          <div class="title-row">
            <h2 class="title">Session logs</h2>
            <span class="count">{{ filtered.length }} / {{ entries.length }}</span>
          </div>
          <button type="button" class="close-btn" aria-label="Close" @click="emit('close')">✕</button>
        </div>

        <div class="toolbar">
          <select v-model="filter" class="filter">
            <option value="all">All levels</option>
            <option value="log">Log</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
            <option value="debug">Debug</option>
          </select>

          <label class="auto">
            <input v-model="autoScroll" type="checkbox" />
            Auto-scroll
          </label>

          <div class="spacer" />

          <button type="button" class="btn ghost" @click="onClear">Clear</button>
          <button type="button" class="btn ghost" @click="exportTxt">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export to txt
          </button>
          <button type="button" class="btn primary" @click="copyAll">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            {{ copyState === 'ok' ? 'Copied!' : copyState === 'fail' ? 'Copy failed' : 'Copy logs' }}
          </button>
        </div>

        <div ref="listEl" class="list">
          <p v-if="!filtered.length" class="empty">No log entries yet. Actions and SIP events will appear here.</p>
          <div
            v-for="e in filtered"
            :key="e.id"
            class="row"
            :class="e.level"
          >
            <span class="time">{{ fmtTime(e.ts) }}</span>
            <span class="lvl">{{ e.level }}</span>
            <pre class="msg">{{ e.text }}</pre>
          </div>
        </div>

        <p class="hint">Copy logs and paste into chat when reporting issues. Includes URL, timestamps, and console output (JsSIP, API errors, etc.).</p>

      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 400;
  background: var(--overlay);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.modal {
  width: min(100%, 720px);
  max-height: min(85vh, 640px);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem 0.5rem;
  flex-shrink: 0;
}
.title-row {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}
.title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--fg);
}
.count {
  font-size: 11px;
  color: var(--fg-subtle);
  font-family: var(--font-mono);
}
.close-btn {
  background: none;
  border: none;
  color: var(--fg-subtle);
  cursor: pointer;
  font-size: 1rem;
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius-sm);
}
.close-btn:hover { color: var(--fg); background: var(--surface-2); }

.toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 1.25rem 0.75rem;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.spacer { flex: 1; }

.filter {
  appearance: none;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--fg-muted);
  font-size: 12px;
  padding: 0.35rem 0.6rem;
  cursor: pointer;
}

.auto {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 12px;
  color: var(--fg-subtle);
  cursor: pointer;
  user-select: none;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.75rem;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-ui);
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.15s, border-color 0.15s;
}
.btn.ghost {
  background: none;
  border-color: var(--border);
  color: var(--fg-muted);
}
.btn.ghost:hover { background: var(--surface-2); }
.btn.primary {
  background: var(--emerald-dim);
  border-color: var(--emerald-border);
  color: var(--emerald);
}
.btn.primary:hover { background: rgba(25,195,125,0.18); }

.list {
  flex: 1;
  overflow: auto;
  margin: 0 1rem;
  padding: 0.5rem;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  min-height: 200px;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.45;
}

.empty {
  margin: 2rem 0;
  text-align: center;
  color: var(--fg-subtle);
  font-family: var(--font-ui);
  font-size: 13px;
}

.row {
  display: grid;
  grid-template-columns: auto auto 1fr;
  gap: 0.5rem 0.65rem;
  padding: 0.25rem 0.35rem;
  border-radius: 4px;
  align-items: start;
}
.row:hover { background: rgba(255,255,255,0.03); }

.time {
  color: var(--fg-subtle);
  white-space: nowrap;
  font-size: 10px;
}
.lvl {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1px 5px;
  border-radius: 3px;
  white-space: nowrap;
}
.row.log   .lvl { background: rgba(255,255,255,0.06); color: var(--fg-subtle); }
.row.info  .lvl { background: var(--blue-dim); color: var(--blue); }
.row.warn  .lvl { background: var(--amber-dim); color: var(--amber); }
.row.error .lvl { background: var(--red-dim); color: var(--red); }
.row.debug .lvl { background: rgba(255,255,255,0.04); color: var(--fg-subtle); }

.msg {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--fg-muted);
  font-family: inherit;
  font-size: inherit;
}
.row.error .msg { color: #fca5a5; }
.row.warn  .msg { color: #fde68a; }

.hint {
  margin: 0.65rem 1.25rem 1rem;
  font-size: 11px;
  color: var(--fg-subtle);
  flex-shrink: 0;
}
</style>
