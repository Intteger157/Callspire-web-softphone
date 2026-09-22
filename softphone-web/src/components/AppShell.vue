<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useWebRtcStore } from '@/stores/webrtc'
import { useKommoStore } from '@/stores/kommo'
import LogsModal from '@/components/LogsModal.vue'
import AmbientBackground from '@/components/AmbientBackground.vue'
import { errorCount, subscribeLogs } from '@/logging/logCapture'
import { theme, toggleTheme } from '@/theme'

const showLogs = ref(false)
const warnErrorCount = ref(errorCount())
let unsubLogs: (() => void) | null = null

onMounted(() => {
  unsubLogs = subscribeLogs(() => { warnErrorCount.value = errorCount() })
  document.addEventListener('click', onDocClick, true)
})
onUnmounted(() => {
  unsubLogs?.()
  document.removeEventListener('click', onDocClick, true)
})

const emit = defineEmits<{ 'change-password': []; settings: []; themes: [] }>()

const baseUrl = import.meta.env.BASE_URL

const router  = useRouter()
const auth    = useAuthStore()
const webrtc  = useWebRtcStore()
const kommo   = useKommoStore()

const settingsOpen = ref(false)
const settingsWrapRef = ref<HTMLElement | null>(null)

const initials = computed(() => {
  const src = auth.email || auth.extension || '?'
  return src.slice(0, 2).toUpperCase()
})

function toggleSettingsMenu() {
  settingsOpen.value = !settingsOpen.value
}

function closeSettingsMenu() {
  settingsOpen.value = false
}

function openAudioSettings() {
  closeSettingsMenu()
  emit('settings')
}

function openThemes() {
  closeSettingsMenu()
  emit('themes')
}

function openChangePassword() {
  closeSettingsMenu()
  emit('change-password')
}

function onDocClick(e: MouseEvent) {
  if (!settingsOpen.value) return
  if (settingsWrapRef.value?.contains(e.target as Node)) return
  closeSettingsMenu()
}

async function logout() {
  closeSettingsMenu()
  webrtc.clearCredentials()
  kommo.reset()
  await auth.logout()
  await router.replace('/login')
}
</script>

<template>
  <div class="shell">
    <AmbientBackground subtle />

    <header class="topbar">

      <!-- Brand -->
      <div class="brand">
        <img
          class="brand-icon"
          :src="`${baseUrl}favicon.ico`"
          width="18"
          height="18"
          alt=""
          aria-hidden="true"
        />
        <span class="brand-text">Callspire Web Softphone</span>
      </div>

      <!-- User area -->
      <div class="user" v-if="auth.isAuthenticated">
        <button class="top-btn logs-btn" @click="showLogs = true" title="Session logs">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          <span v-if="warnErrorCount" class="logs-badge">{{ warnErrorCount > 99 ? '99+' : warnErrorCount }}</span>
        </button>

        <!-- Theme toggle -->
        <button class="top-btn" @click="toggleTheme()" :title="theme === 'dark' ? 'Switch to light' : 'Switch to dark'">
          <svg v-if="theme === 'dark'" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        </button>

        <!-- Settings dropdown -->
        <div ref="settingsWrapRef" class="settings-wrap">
          <button
            type="button"
            class="top-btn"
            :class="{ active: settingsOpen }"
            title="Settings"
            aria-haspopup="menu"
            :aria-expanded="settingsOpen"
            @click.stop="toggleSettingsMenu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>

          <ul v-if="settingsOpen" class="settings-menu" role="menu">
            <li role="none">
              <button type="button" class="menu-item" role="menuitem" @click.stop="openThemes">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
                </svg>
                Themes
              </button>
            </li>
            <li role="none">
              <button type="button" class="menu-item" role="menuitem" @click.stop="openAudioSettings">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
                Audio devices
              </button>
            </li>
            <li role="none">
              <button type="button" class="menu-item" role="menuitem" @click.stop="openChangePassword">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                Change password
              </button>
            </li>
          </ul>
        </div>

        <div class="user-meta">
          <span class="user-email">{{ auth.email }}</span>
          <span class="user-ext" v-if="auth.extension">ext {{ auth.extension }}</span>
        </div>

        <div class="avatar">{{ initials }}</div>

        <button type="button" class="logout-btn" @click="logout">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Log out
        </button>
      </div>

    </header>

    <main class="content">
      <slot />
    </main>

    <LogsModal v-if="showLogs" @close="showLogs = false" />
  </div>
</template>

<style scoped>
.shell {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
  background: var(--bg);
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0 1.25rem;
  height: 48px;
  background: color-mix(in srgb, var(--sidebar) 52%, transparent);
  backdrop-filter: blur(16px) saturate(1.2);
  -webkit-backdrop-filter: blur(16px) saturate(1.2);
  border-bottom: 1px solid color-mix(in srgb, var(--border) 58%, transparent);
  flex-shrink: 0;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
  font-size: 13.5px;
  color: var(--fg);
  letter-spacing: -0.01em;
  flex-shrink: 1;
  min-width: 0;
}
.brand-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  object-fit: contain;
}
.brand-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

.user-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
}
.user-email {
  font-size: 12px;
  color: var(--fg-muted);
  line-height: 1;
}
.user-ext {
  font-size: 10.5px;
  color: var(--fg-subtle);
  font-family: var(--font-mono);
  line-height: 1;
}

.avatar {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  background: var(--surface-3);
  border: 1px solid var(--border-hover);
  display: grid;
  place-items: center;
  font-size: 10px;
  font-weight: 700;
  color: var(--fg-muted);
  flex-shrink: 0;
}

.top-btn {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--fg-subtle);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}
.top-btn:hover,
.top-btn.active {
  color: var(--fg);
  background: rgba(255,255,255,0.06);
}

.settings-wrap {
  position: relative;
}

.settings-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 120;
  min-width: 190px;
  margin: 0;
  padding: 0.3rem 0;
  list-style: none;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  padding: 0.5rem 0.85rem;
  border: none;
  background: none;
  text-align: left;
  font-size: 13px;
  font-family: var(--font-ui);
  color: var(--fg-muted);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s, color 0.12s;
}
.menu-item svg {
  flex-shrink: 0;
  opacity: 0.85;
}
.menu-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--fg);
}

.logout-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.35rem 0.65rem;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  font-size: 12.5px;
  font-family: var(--font-ui);
  font-weight: 500;
  color: var(--fg-muted);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}
.logout-btn svg {
  flex-shrink: 0;
  opacity: 0.9;
}
.logout-btn:hover {
  color: var(--fg);
  background: rgba(255, 255, 255, 0.06);
}

.logs-btn { position: relative; }
.logs-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: var(--surface-3);
  border: 1px solid var(--border-hover);
  color: var(--fg-subtle);
  font-size: 9px;
  font-weight: 600;
  line-height: 12px;
  text-align: center;
  pointer-events: none;
}

.content {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: clamp(0.5rem, 1.5vh, 1rem) clamp(0.75rem, 2vw, 1.25rem) clamp(0.75rem, 2vh, 1.25rem);
  max-width: min(1080px, 100%);
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

@media (max-width: 700px) {
  .content {
    padding: 0.75rem 1rem 1rem;
  }
}

@media (max-height: 720px) {
  .topbar {
    height: 44px;
    padding: 0 1rem;
  }

  .user-meta {
    display: none;
  }
}
</style>
