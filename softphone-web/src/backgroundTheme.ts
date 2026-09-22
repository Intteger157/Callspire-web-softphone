import { ref } from 'vue'
import { isPublicComputerMode } from '@/publicComputer'

export type BackgroundAnimationId =
  | 'none'
  | 'aurora'
  | 'waves'
  | 'fireflies'
  | 'rain'
  | 'pulse'

export interface BackgroundAnimationOption {
  id: BackgroundAnimationId
  label: string
  description: string
}

export const BACKGROUND_ANIMATIONS: BackgroundAnimationOption[] = [
  { id: 'none', label: 'Off', description: 'Plain background without animation' },
  { id: 'aurora', label: 'Aurora', description: 'Northern lights with connected particles' },
  { id: 'waves', label: 'Waves', description: 'Flowing luminous wave lines' },
  { id: 'fireflies', label: 'Fireflies', description: 'Soft glowing sparks drifting upward' },
  { id: 'rain', label: 'Rain', description: 'Gentle luminous streaks falling through the scene' },
  { id: 'pulse', label: 'Pulse', description: 'Large glowing rings that breathe across the screen' },
]

export const ANIMATED_BACKGROUND_IDS = BACKGROUND_ANIMATIONS
  .filter((o) => o.id !== 'none')
  .map((o) => o.id)

export function pickRandomBackgroundTheme(
  exclude: BackgroundAnimationId[] = [],
): BackgroundAnimationId {
  const pool = ANIMATED_BACKGROUND_IDS.filter((id) => !exclude.includes(id))
  if (pool.length === 0) return 'aurora'
  return pool[Math.floor(Math.random() * pool.length)]!
}

const STORAGE_KEY = 'callspire-background-theme'
const VALID_IDS = new Set<BackgroundAnimationId>(BACKGROUND_ANIMATIONS.map((o) => o.id))

const LEGACY_THEME_MAP: Record<string, BackgroundAnimationId> = {
  mesh: 'fireflies',
  starfield: 'rain',
  grid: 'pulse',
  prism: 'rain',
  nebula: 'rain',
  shimmer: 'rain',
  drift: 'rain',
  orbit: 'pulse',
}

function normalizeBackgroundTheme(raw: string | null): BackgroundAnimationId | null {
  if (!raw) return null
  if (VALID_IDS.has(raw as BackgroundAnimationId)) return raw as BackgroundAnimationId
  return LEGACY_THEME_MAP[raw] ?? null
}

function readSavedBackgroundTheme(): BackgroundAnimationId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    const normalized = normalizeBackgroundTheme(saved)
    if (normalized) return normalized
  } catch { /* ignore */ }
  return 'aurora'
}

export const backgroundTheme = ref<BackgroundAnimationId>(readSavedBackgroundTheme())

export function applyBackgroundTheme(id: BackgroundAnimationId, persist = true): void {
  backgroundTheme.value = id
  if (persist && !isPublicComputerMode()) {
    try { localStorage.setItem(STORAGE_KEY, id) } catch { /* ignore */ }
  }
}

export function initBackgroundTheme(): void {
  backgroundTheme.value = readSavedBackgroundTheme()
}
