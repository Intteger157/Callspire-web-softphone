<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { WatchStopHandle } from 'vue'
import CallHistoryList from '@/components/CallHistoryList.vue'
import { recordMatchesNumber } from '@/components/callHistoryFormat'
import { useCdrStore } from '@/stores/cdr'
import { useAuthStore } from '@/stores/auth'
import { useKommoStore } from '@/stores/kommo'
import { useKommoAttachmentsStore } from '@/stores/kommoAttachments'
import { useCallsStore } from '@/stores/calls'
import type { CdrRecord } from '@/api/types'

const props = defineProps<{
  maxHeight?: number
}>()

const cdr = useCdrStore()
const auth = useAuthStore()
const kommo = useKommoStore()
const kommoAttachments = useKommoAttachmentsStore()

function formatCdrError(msg: string): string {
  if (/not found/i.test(msg)) {
    return 'Call history unavailable — update PBX Gateway (CDR API)'
  }
  return msg
}

const page = ref(1)
const searchOpen = ref(false)
const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)
const hdrRef = ref<HTMLElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)
const listWrapRef = ref<HTMLElement | null>(null)
const pagerRef = ref<HTMLElement | null>(null)
const measuredHeader = ref(36)
const measuredPager = ref(44)
const compactRow = ref(54)
const playerRow = ref(90)
const pageStarts = ref<number[]>([0])

const GAP = 8
/** Extra list height treated as usable when packing rows (avoids empty strip above pager). */
const PAGE_FILL_SLACK = 14
let measuring = false
let resizeTimer: ReturnType<typeof setTimeout> | null = null
let listObserver: ResizeObserver | null = null

const isCompact = computed(() => !cdr.records.length && !cdr.loading && !searchQuery.value.trim())
const needsPagination = computed(() => pageStarts.value.length > 1)
const totalPages = computed(() => Math.max(1, pageStarts.value.length))

const filteredRecords = computed(() => {
  const q = searchQuery.value.trim()
  if (!q) return cdr.records
  return cdr.records.filter((r) => recordMatchesNumber(r, auth.extension, q))
})

const visibleRecords = computed(() => {
  const records = filteredRecords.value
  if (!records.length) return []
  if (!needsPagination.value) return records
  const start = pageStarts.value[page.value - 1] ?? 0
  const end = pageStarts.value[page.value] ?? records.length
  return records.slice(start, end)
})

function toggleSearch() {
  if (searchOpen.value) {
    closeSearch()
    return
  }
  searchOpen.value = true
  void nextTick(() => searchInputRef.value?.focus())
}

function closeSearch() {
  searchOpen.value = false
  searchQuery.value = ''
  void nextTick(measureLayout)
}

async function refreshHistory() {
  await cdr.fetchHistory(50)
  if (kommo.canUploadRecording) await kommoAttachments.fetchRecent()
}

const rootStyle = computed(() => {
  const max = props.maxHeight
  if (!max || isCompact.value) return max ? { maxHeight: `${max}px` } : {}
  return { flex: '1', minHeight: '0', height: '100%', maxHeight: `${max}px` }
})

function estimatedRowHeight(_r: CdrRecord): number {
  return compactRow.value
}

function countRecordsForBudget(records: CdrRecord[], from: number, budget: number): number {
  let used = 0
  let count = 0
  const limit = budget + PAGE_FILL_SLACK
  for (let i = from; i < records.length; i++) {
    const h = estimatedRowHeight(records[i]!)
    if (count > 0 && used + h > limit) break
    used += h
    count++
  }
  return count > 0 ? count : from < records.length ? 1 : 0
}

function measureChrome() {
  if (hdrRef.value) measuredHeader.value = hdrRef.value.offsetHeight
  if (pagerRef.value) measuredPager.value = pagerRef.value.offsetHeight
  else measuredPager.value = 44
}

function calibrateRowHeightsFromDom() {
  const wrap = listWrapRef.value
  if (!wrap) return
  const items = wrap.querySelectorAll('.item')
  if (!items.length) return

  let compact = 48
  let player = 70
  items.forEach((el) => {
    const h = Math.ceil(el.getBoundingClientRect().height)
    if (h <= 0) return
    if (el.querySelector('.player')) player = Math.max(player, h)
    else compact = Math.max(compact, h)
  })
  compactRow.value = compact
  playerRow.value = player
}

function listBudget(includePager: boolean): number {
  const base = props.maxHeight ?? 480
  if (!includePager) {
    return Math.max(80, base - measuredHeader.value - GAP)
  }
  return Math.max(120, base - measuredHeader.value - measuredPager.value - GAP * 2)
}

function rebuildPageStarts() {
  const records = filteredRecords.value
  if (!records.length) {
    pageStarts.value = [0]
    return
  }

  measureChrome()

  const noPagerBudget = listBudget(false)
  const fitAll = countRecordsForBudget(records, 0, noPagerBudget)

  if (records.length <= fitAll) {
    pageStarts.value = [0]
    if (page.value > 1) page.value = 1
    return
  }

  const budget = listBudget(true)

  const starts: number[] = [0]
  let i = 0
  while (i < records.length) {
    const n = countRecordsForBudget(records, i, budget)
    if (n <= 0) {
      i++
      if (i < records.length) starts.push(i)
      continue
    }
    i += n
    if (i < records.length) starts.push(i)
  }

  pageStarts.value = starts.length ? starts : [0]
  if (page.value > starts.length) page.value = starts.length
}

async function measureLayout() {
  if (measuring) return
  measuring = true
  try {
    await nextTick()
    calibrateRowHeightsFromDom()
    rebuildPageStarts()
    await nextTick()
    calibrateRowHeightsFromDom()
    rebuildPageStarts()
  } finally {
    measuring = false
  }
}

function scheduleMeasureLayout() {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => void measureLayout(), 100)
}

function attachLayoutObservers() {
  if (!listObserver) return
  listObserver.disconnect()
  if (rootRef.value) listObserver.observe(rootRef.value)
  if (listWrapRef.value) listObserver.observe(listWrapRef.value)
}

watch(
  () => cdr.records.length,
  () => {
    page.value = 1
    void nextTick(measureLayout)
  },
)

watch(searchQuery, () => {
  page.value = 1
  void nextTick(measureLayout)
})

watch(searchOpen, (open) => {
  void nextTick(() => {
    if (open) searchInputRef.value?.focus()
    else searchInputRef.value?.blur()
    void measureLayout()
  })
})

watch(page, () => void nextTick(measureLayout))

watch(
  () => props.maxHeight,
  (next, prev) => {
    if (next != null && prev != null && next < prev - 8) {
      page.value = 1
      compactRow.value = 54
      playerRow.value = 90
    }
    void nextTick(measureLayout)
  },
)

let stopWatch: WatchStopHandle | null = null

onMounted(() => {
  stopWatch = cdr.watchCallEnd()
  listObserver = new ResizeObserver(() => scheduleMeasureLayout())
  void kommo.fetchKommoStatus().then(() => {
    if (kommo.canUploadRecording) void kommoAttachments.fetchRecent()
  })
  void cdr.fetchHistory(50).then(() => nextTick(() => {
    void measureLayout().then(() => attachLayoutObservers())
  }))
})

let wasInCallForKommo = false
watch(
  () => useCallsStore().callStatus,
  (status) => {
    if (status !== 'idle') {
      wasInCallForKommo = true
      return
    }
    if (!wasInCallForKommo || !kommo.canUploadRecording) return
    wasInCallForKommo = false
    window.setTimeout(() => void kommoAttachments.fetchRecent(), 3500)
  },
)

onUnmounted(() => {
  stopWatch?.()
  listObserver?.disconnect()
  if (resizeTimer) clearTimeout(resizeTimer)
})

defineExpose({ measureLayout })
</script>

<template>
  <section
    ref="rootRef"
    class="history"
    :class="{ compact: isCompact, filled: !isCompact }"
    :style="rootStyle"
  >
    <div ref="hdrRef" class="hdr">
      <h3 class="title" :class="{ 'title-hidden': searchOpen }">Recent calls</h3>
      <div class="hdr-actions">
        <div class="search-expand" :class="{ open: searchOpen }">
          <div class="search-expand-inner">
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              type="search"
              class="search-input"
              placeholder="Search by number…"
              autocomplete="off"
              @keydown.esc="closeSearch"
            />
          </div>
        </div>
        <button
          type="button"
          class="icon-btn"
          :class="{ active: searchOpen }"
          title="Search by number"
          aria-label="Search by number"
          :aria-expanded="searchOpen"
          @click="toggleSearch"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
        <button class="icon-btn" :disabled="cdr.loading" title="Refresh" @click="refreshHistory">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            :class="{ spin: cdr.loading }"
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>
    </div>

    <p v-if="cdr.error" class="state err">{{ formatCdrError(cdr.error) }}</p>

    <div v-else-if="cdr.loading && !cdr.records.length" class="empty">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="spin"
      >
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
        <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
      </svg>
    </div>

    <div v-else-if="isCompact" class="empty">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path
          d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12 19.79 19.79 0 0 1 1.9 3.38 2 2 0 0 1 3.89 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 5.997 5.997l1.068-1.168a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"
        />
      </svg>
      <span>No calls yet</span>
    </div>

    <div v-else-if="searchQuery.trim() && !filteredRecords.length" class="empty">
      <span>No calls match this number</span>
    </div>

    <template v-else>
      <div ref="listWrapRef" class="list-wrap">
        <CallHistoryList :records="visibleRecords" />
      </div>

      <nav v-if="needsPagination" ref="pagerRef" class="pager" aria-label="Recent calls pages">
        <button type="button" class="pager-btn" :disabled="page <= 1" @click="page--">‹ Prev</button>
        <span class="pager-info">{{ page }} / {{ totalPages }}</span>
        <button type="button" class="pager-btn" :disabled="page >= totalPages" @click="page++">
          Next ›
        </button>
      </nav>
    </template>
  </section>
</template>

<style scoped>
.history {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 0;
}

.history.compact {
  height: auto;
}

.history.filled {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.history.filled .list-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-shrink: 0;
  min-height: 28px;
}

.title {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  color: var(--fg-subtle);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  flex-shrink: 0;
  max-width: 10rem;
  opacity: 1;
  overflow: hidden;
  white-space: nowrap;
  transition: max-width 0.28s ease, opacity 0.2s ease, margin 0.28s ease;
}

.title-hidden {
  max-width: 0;
  opacity: 0;
  margin-right: -0.25rem;
}

.hdr-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.35rem;
  flex: 1;
  min-width: 0;
}

/* Slide-out search: expands left from the magnifier icon */
.search-expand {
  display: grid;
  grid-template-columns: 0fr;
  flex: 1;
  min-width: 0;
  transition: grid-template-columns 0.28s ease;
}

.search-expand.open {
  grid-template-columns: 1fr;
}

.search-expand-inner {
  overflow: hidden;
  min-width: 0;
}

.search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.35rem 0.55rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.03);
  color: var(--fg);
  font-size: 12.5px;
  font-family: var(--font-mono);
  outline: none;
  opacity: 0;
  transition: opacity 0.15s ease 0.08s, border-color 0.15s;
}
.search-expand.open .search-input {
  opacity: 1;
}
.search-input:focus {
  border-color: var(--emerald-border);
}
.search-input::placeholder {
  color: var(--fg-subtle);
  font-family: var(--font-ui);
}

.icon-btn {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--fg-subtle);
  cursor: pointer;
  padding: 0;
  transition: color 0.15s, background 0.15s;
}
.icon-btn:hover:not(:disabled) {
  color: var(--fg-muted);
  background: rgba(255, 255, 255, 0.06);
}
.icon-btn.active {
  color: var(--emerald);
  background: var(--emerald-dim);
}
.icon-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.state {
  margin: 0;
  font-size: 12.5px;
}
.state.err {
  color: #fca5a5;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: var(--fg-subtle);
  font-size: 13px;
  padding: 1.25rem 0;
}

.list-wrap {
  flex-shrink: 1;
  min-height: 0;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding-top: 0.25rem;
  margin-top: auto;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.pager-btn {
  padding: 0.3rem 0.65rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.03);
  color: var(--fg-muted);
  font-size: 11.5px;
  font-weight: 500;
  font-family: var(--font-ui);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.pager-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  color: var(--fg);
  border-color: var(--border-hover);
}
.pager-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.pager-info {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--fg-subtle);
  font-family: var(--font-mono);
  min-width: 4.5rem;
  text-align: center;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.spin {
  animation: spin 0.8s linear infinite;
}
</style>
