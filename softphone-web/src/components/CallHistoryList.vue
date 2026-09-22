<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import AudioPlayer from '@/components/AudioPlayer.vue'
import {
  callDirection,
  otherNumber,
  isMissed,
  dispLabel,
  fmtDur,
  fmtDate,
  hasRecording,
} from '@/components/callHistoryFormat'
import { useCdrStore } from '@/stores/cdr'
import { useCallsStore } from '@/stores/calls'
import { useCallerIdsStore } from '@/stores/callerids'
import { useAuthStore } from '@/stores/auth'
import { useKommoStore } from '@/stores/kommo'
import { useKommoAttachmentsStore } from '@/stores/kommoAttachments'
import { kommoDetailUrl } from '@/kommo/crmUrl'
import type { CdrRecord } from '@/api/types'
import type { KommoCallAttachment } from '@/api/types'

defineProps<{
  records: CdrRecord[]
}>()

const cdr = useCdrStore()
const calls = useCallsStore()
const cids = useCallerIdsStore()
const auth = useAuthStore()
const kommo = useKommoStore()
const kommoAttachments = useKommoAttachmentsStore()

const menuOpen = ref(false)
const menuStyle = ref<Record<string, string>>({})
const pendingNumber = ref('')
const menuAnchor = ref<HTMLElement | null>(null)
const activeRecordKey = ref('')
const playerOpenKey = ref('')

const hasCallerIds = computed(() => cids.items.length > 0)

/** Kommo enabled — per-row CRM button appears only after upload completes (see showCrmButtonFor). */
const kommoCrmEnabled = computed(
  () => !!kommo.crmBaseUrl && !!kommo.status?.enabled && !kommo.status?.excluded,
)

function recordKey(r: CdrRecord, idx: number): string {
  return `${idx}-${r.start}-${r.src_num}-${r.dst_num}`
}

function formatLabel(item: { number: string; name: string }): string {
  return item.name && item.name !== item.number ? `${item.name} (${item.number})` : item.number
}

function positionMenu() {
  const btn = menuAnchor.value
  if (!btn) return
  const r = btn.getBoundingClientRect()
  const width = Math.max(220, 200)
  const rowH = 34
  const menuHeight = 28 + cids.items.length * rowH
  const gap = 4
  const fitsBelow = r.bottom + gap + menuHeight <= window.innerHeight - 8
  const top = fitsBelow ? r.bottom + gap : Math.max(8, r.top - gap - menuHeight)
  menuStyle.value = {
    top: `${top}px`,
    left: `${Math.min(window.innerWidth - width - 8, Math.max(8, r.right - width))}px`,
    width: `${width}px`,
  }
}

function closeMenu() {
  menuOpen.value = false
  menuAnchor.value = null
  activeRecordKey.value = ''
}

function togglePlayer(rowKey: string) {
  playerOpenKey.value = playerOpenKey.value === rowKey ? '' : rowKey
}

function closePlayer() {
  playerOpenKey.value = ''
}

function crmAttachmentFor(r: CdrRecord): KommoCallAttachment | null {
  return kommoAttachments.lookupForCdr(r, auth.extension)
}

function crmLinkFor(r: CdrRecord): string | null {
  const att = crmAttachmentFor(r)
  if (!att || (att.status && att.status !== 'uploaded')) return null
  const base = kommo.crmBaseUrl
  if (!base) return null
  if (att.lead_id) return kommoDetailUrl(base, 'lead', att.lead_id)
  if (att.contact_id) return kommoDetailUrl(base, 'contact', att.contact_id)
  return null
}

/** Show CRM link only after gateway finished Kommo upload (correct lead/contact from job). */
function showCrmButtonFor(r: CdrRecord): boolean {
  return kommoCrmEnabled.value && crmLinkFor(r) != null
}

function crmLinkTitle(r: CdrRecord): string {
  const att = crmAttachmentFor(r)
  if (att?.lead_id) return `Open lead #${att.lead_id} in Kommo`
  if (att?.contact_id) return `Open contact #${att.contact_id} in Kommo`
  return 'Open in Kommo'
}

function openCrmLink(e: MouseEvent, url: string) {
  e.stopPropagation()
  window.open(url, '_blank', 'noopener,noreferrer')
}

function onCrmClick(e: MouseEvent, r: CdrRecord) {
  e.stopPropagation()
  const url = crmLinkFor(r)
  if (url) openCrmLink(e, url)
}

async function onCallClick(e: MouseEvent, number: string, rowKey: string) {
  e.stopPropagation()
  if (!number || calls.inCall) return
  if (!cids.items.length && !cids.loading) await cids.fetch()
  if (cids.items.length > 0) {
    pendingNumber.value = number
    menuAnchor.value = e.currentTarget as HTMLElement
    activeRecordKey.value = rowKey
    menuOpen.value = true
    void nextTick(positionMenu)
    return
  }
  void calls.makeCall(number)
}

function onPickCallerId(callerId: string) {
  cids.select(callerId)
  const target = pendingNumber.value
  closeMenu()
  if (target) void calls.makeCall(target)
}

function onDocClick(e: MouseEvent) {
  const target = e.target as Node
  if (menuOpen.value) {
    const menu = document.getElementById('callback-callerid-menu')
    if (menuAnchor.value?.contains(target)) return
    if (menu?.contains(target)) return
    closeMenu()
  }
  if (playerOpenKey.value) {
    const openRow = document.querySelector(`[data-player-row="${playerOpenKey.value}"]`)
    if (openRow?.contains(target)) return
    closePlayer()
  }
}

function onScroll() {
  if (menuOpen.value) closeMenu()
  if (playerOpenKey.value) closePlayer()
}

onMounted(() => {
  if (!cids.items.length) void cids.fetch()
  void (async () => {
    if (!kommo.status) await kommo.fetchKommoStatus()
    if (kommo.canUploadRecording) await kommoAttachments.fetchRecent()
  })()
  document.addEventListener('click', onDocClick, true)
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', onScroll)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocClick, true)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', onScroll)
})
</script>

<template>
  <ul class="list">
    <li
      v-for="(r, idx) in records"
      :key="recordKey(r, idx)"
      class="item"
      :class="{ missed: isMissed(r) }"
    >
      <div class="dir-icon" :class="[callDirection(r, auth.extension), { missed: isMissed(r) }]">
        <svg
          v-if="callDirection(r, auth.extension) === 'inbound'"
          xmlns="http://www.w3.org/2000/svg"
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="17" y1="7" x2="7" y2="17" />
          <polyline points="17 17 7 17 7 7" />
        </svg>
        <svg
          v-else
          xmlns="http://www.w3.org/2000/svg"
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="7" y1="17" x2="17" y2="7" />
          <polyline points="7 7 17 7 17 17" />
        </svg>
      </div>

      <div class="info">
        <div class="row1">
          <span class="num">{{ otherNumber(r, auth.extension) || '–' }}</span>
          <span class="disp" :class="r.disposition.toLowerCase().replace(' ', '-')">
            {{ dispLabel(r.disposition) }}
          </span>
        </div>
        <div class="row2">
          <span class="date">{{ fmtDate(r.start) }}</span>
          <span class="sep">·</span>
          <span class="dur">{{ fmtDur(r.billsec) }}</span>
          <button
            v-if="hasRecording(r)"
            type="button"
            class="rec-btn"
            :class="{ open: playerOpenKey === recordKey(r, idx) }"
            title="Play recording"
            aria-label="Play recording"
            :aria-expanded="playerOpenKey === recordKey(r, idx)"
            @click.stop="togglePlayer(recordKey(r, idx))"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
              <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3v5z"/>
              <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3v5z"/>
            </svg>
          </button>
          <button
            v-if="showCrmButtonFor(r)"
            type="button"
            class="crm-btn"
            :title="crmLinkTitle(r)"
            aria-label="Open in Kommo CRM"
            @click="onCrmClick($event, r)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            <span class="crm-btn-label">CRM</span>
          </button>
        </div>
        <div
          v-if="hasRecording(r) && playerOpenKey === recordKey(r, idx)"
          class="player-drop"
          :data-player-row="recordKey(r, idx)"
        >
          <AudioPlayer :url="cdr.recordingUrl(r.linkedid)" class="player" />
        </div>
      </div>

      <button
        type="button"
        class="cb"
        :class="{ active: menuOpen && activeRecordKey === recordKey(r, idx) }"
        title="Call back"
        :disabled="calls.inCall"
        aria-label="Call back"
        @click="onCallClick($event, otherNumber(r, auth.extension), recordKey(r, idx))"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12 19.79 19.79 0 0 1 1.9 3.38 2 2 0 0 1 3.89 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 5.997 5.997l1.068-1.168a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"
          />
        </svg>
      </button>
    </li>
  </ul>

  <Teleport to="body">
    <ul
      v-if="menuOpen && hasCallerIds"
      id="callback-callerid-menu"
      class="cid-menu"
      :style="menuStyle"
      role="menu"
    >
      <li class="cid-menu-hdr">Caller ID</li>
      <li v-for="item in cids.items" :key="item.number" role="none">
        <button type="button" class="cid-menu-item" role="menuitem" @click.stop="onPickCallerId(item.number)">
          {{ formatLabel(item) }}
        </button>
      </li>
    </ul>
  </Teleport>
</template>

<style scoped>
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.item {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.55rem 0.5rem;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  transition: background 0.12s, border-color 0.12s;
  cursor: default;
}
.item:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--border);
}
.item.missed:hover {
  background: var(--red-dim);
  border-color: var(--red-border);
}

.dir-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  margin-top: 0.1rem;
  border-radius: var(--radius-sm);
  display: grid;
  place-items: center;
}
.dir-icon.inbound {
  background: var(--blue-dim);
  color: var(--blue);
}
.dir-icon.outbound {
  background: var(--emerald-dim);
  color: var(--emerald);
}
.dir-icon.inbound.missed {
  background: var(--red-dim);
  color: var(--red);
}

.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
}

.row1 {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.num {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.item.missed .num {
  color: var(--red);
}

.disp {
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  padding: 1px 5px;
  border-radius: 3px;
  flex-shrink: 0;
}
.disp.answered {
  background: var(--emerald-dim);
  color: var(--emerald);
}
.disp.no-answer {
  background: var(--red-dim);
  color: var(--red);
}
.disp.busy {
  background: var(--amber-dim);
  color: var(--amber);
}
.disp.failed {
  background: rgba(255, 255, 255, 0.04);
  color: var(--fg-subtle);
}

.row2 {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 11px;
  color: var(--fg-subtle);
}
.sep {
  opacity: 0.5;
}
.dur {
  font-family: var(--font-mono);
}

.rec-btn {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  margin-left: 0.15rem;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--fg-subtle);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.rec-btn:hover,
.rec-btn.open {
  background: var(--emerald-dim);
  color: var(--emerald);
  border-color: var(--emerald-border);
}

.crm-btn {
  flex-shrink: 0;
  height: 20px;
  min-width: 42px;
  margin-left: 0.1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  padding: 0 0.35rem 0 0.28rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--fg-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s, opacity 0.15s;
}
.crm-btn:disabled {
  cursor: wait;
  opacity: 0.65;
}
.crm-btn-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 1;
}
.crm-btn:hover {
  background: var(--blue-dim);
  color: var(--blue);
  border-color: rgba(96, 165, 250, 0.35);
}

.player-drop {
  margin-top: 0.35rem;
  animation: player-drop-in 0.15s ease-out;
}
@keyframes player-drop-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.player {
  max-width: 100%;
}

.cb {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  margin-top: 0.05rem;
  display: grid;
  place-items: center;
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--fg-subtle);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  padding: 0;
}
.cb:hover:not(:disabled),
.cb.active {
  background: var(--emerald-dim);
  color: var(--emerald);
  border-color: var(--emerald-border);
}
.cb:disabled {
  opacity: 0.25;
  cursor: default;
}

.cid-menu {
  position: fixed;
  z-index: 1200;
  margin: 0;
  padding: 0.25rem 0;
  list-style: none;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.cid-menu-hdr {
  padding: 0.35rem 0.75rem 0.25rem;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--fg-subtle);
}

.cid-menu-item {
  display: block;
  width: 100%;
  padding: 0.45rem 0.75rem;
  border: none;
  background: none;
  text-align: left;
  font-size: 12.5px;
  font-family: var(--font-ui);
  color: var(--fg-muted);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cid-menu-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--fg);
}
</style>
