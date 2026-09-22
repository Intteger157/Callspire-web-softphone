<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { CallerIdItem } from '@/api/types'
import { useCallerIdsStore } from '@/stores/callerids'

const cids = useCallerIdsStore()
const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

function formatLabel(item: CallerIdItem): string {
  return item.name && item.name !== item.number ? `${item.name} (${item.number})` : item.number
}

const selectedItem = computed(() =>
  cids.items.find((i) => i.number === cids.selectedCallerId) ?? cids.items[0] ?? null,
)

function formatCallerIdError(msg: string): string {
  if (/not found/i.test(msg)) {
    return 'Caller ID unavailable — update PBX Gateway (my-callerids API)'
  }
  return msg
}

function toggle() {
  open.value = !open.value
}

function pick(number: string) {
  cids.select(number)
  open.value = false
}

function onDocClick(e: MouseEvent) {
  if (!open.value) return
  if (rootRef.value?.contains(e.target as Node)) return
  open.value = false
}

onMounted(() => {
  if (!cids.items.length) void cids.fetch()
  document.addEventListener('click', onDocClick, true)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocClick, true)
})
</script>

<template>
  <div v-if="cids.items.length || cids.loading || cids.error" ref="rootRef" class="wrap">
    <label class="lbl" for="cid-select">
      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12 19.79 19.79 0 0 1 1.9 3.38 2 2 0 0 1 3.89 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 5.997 5.997l1.068-1.168a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
      </svg>
      Caller ID
    </label>

    <div v-if="cids.items.length && selectedItem" class="combo">
      <button
        id="cid-select"
        type="button"
        class="trigger"
        :class="{ open }"
        :aria-expanded="open"
        aria-haspopup="listbox"
        @click.stop="toggle"
      >
        <span class="trigger-label">{{ formatLabel(selectedItem) }}</span>
        <svg
          class="chev"
          :class="{ open }"
          xmlns="http://www.w3.org/2000/svg"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      <ul v-if="open" class="list" role="listbox" aria-label="Caller ID">
        <li v-for="item in cids.items" :key="item.number" role="none">
          <button
            type="button"
            class="list-item"
            role="option"
            :aria-selected="item.number === cids.selectedCallerId"
            :class="{ selected: item.number === cids.selectedCallerId }"
            @click.stop="pick(item.number)"
          >
            {{ formatLabel(item) }}
          </button>
        </li>
      </ul>
    </div>

    <p v-else-if="cids.loading" class="msg">Loading…</p>
    <p v-else-if="cids.error" class="msg err">{{ formatCallerIdError(cids.error) }}</p>
  </div>
</template>

<style scoped>
.wrap {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: 100%;
}

.lbl {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  font-size: 11px;
  font-weight: 600;
  color: var(--fg-subtle);
  text-transform: uppercase;
  letter-spacing: 0.09em;
}
.lbl svg { flex-shrink: 0; }

.combo {
  position: relative;
}

.trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 0.5rem 0.6rem 0.5rem 0.75rem;
  font-size: 13px;
  font-family: var(--font-ui);
  color: var(--fg-muted);
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}
.trigger:hover {
  border-color: var(--border-hover);
  background: var(--surface-2);
}
.trigger.open,
.trigger:focus-visible {
  border-color: var(--emerald-border);
  background: var(--surface-2);
  box-shadow: 0 0 0 2px var(--emerald-dim);
}

.trigger-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.chev {
  flex-shrink: 0;
  color: var(--fg-subtle);
  transition: transform 0.15s ease, color 0.15s;
}
.chev.open {
  transform: rotate(180deg);
  color: var(--emerald);
}

.list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 40;
  margin: 0;
  padding: 0.25rem 0;
  list-style: none;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow);
  max-height: 11rem;
  overflow-y: auto;
}

.list-item {
  display: block;
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: none;
  background: none;
  text-align: left;
  font-size: 13px;
  font-family: var(--font-ui);
  color: var(--fg-muted);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.12s, color 0.12s;
}
.list-item:hover {
  background: var(--surface-2);
  color: var(--fg);
}
.list-item.selected {
  background: var(--emerald-dim);
  color: var(--emerald);
  font-weight: 600;
}
.list-item.selected:hover {
  background: var(--emerald-dim);
  color: var(--emerald-hover);
}

.msg { margin: 0; font-size: 12px; color: var(--fg-subtle); }
.msg.err { color: #fca5a5; }
</style>
