import { ref } from 'vue'
import { isPublicComputerMode } from '@/publicComputer'

export type ThemeMode = 'dark' | 'light'

const STORAGE_KEY = 'callspire-theme'

function getSystemTheme(): ThemeMode {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function readSavedTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* ignore */ }
  return getSystemTheme()
}

function isLoginPath(): boolean {
  return /\/login\/?$/.test(window.location.pathname)
}

function readInitial(): ThemeMode {
  return isLoginPath() ? getSystemTheme() : readSavedTheme()
}

export const theme = ref<ThemeMode>(readInitial())

export function applyTheme(mode: ThemeMode, persist = true): void {
  theme.value = mode
  document.documentElement.setAttribute('data-theme', mode)
  if (persist) {
    try { localStorage.setItem(STORAGE_KEY, mode) } catch { /* ignore */ }
  }
}

export function applySystemTheme(): void {
  applyTheme(getSystemTheme(), false)
}

export function applySavedTheme(): void {
  applyTheme(readSavedTheme(), false)
}

export function toggleTheme(): void {
  applyTheme(theme.value === 'dark' ? 'light' : 'dark', !isPublicComputerMode())
}

/** Call once on app start so the theme is on <html> before first paint. */
export function initTheme(): void {
  applyTheme(readInitial(), false)
}

let systemThemeMq: MediaQueryList | null = null

/** Follow OS theme on the login screen (does not overwrite saved user preference). */
export function watchSystemThemeOnLogin(onChange: () => void): () => void {
  if (!window.matchMedia) return () => undefined
  systemThemeMq = window.matchMedia('(prefers-color-scheme: light)')
  const handler = () => onChange()
  systemThemeMq.addEventListener('change', handler)
  return () => systemThemeMq?.removeEventListener('change', handler)
}
