import { ref } from 'vue'
import { isPublicComputerMode } from '@/publicComputer'

const ENABLED_KEY = 'callspire-panel-glass'
const TRANSPARENCY_KEY = 'callspire-panel-glass-transparency'
const LEGACY_OPACITY_KEY = 'callspire-panel-glass-opacity'

export const panelGlassEnabled = ref(readEnabled())
/** 0 = opaque panels, 100 = fully transparent panels */
export const panelGlassOpacity = ref(readTransparency())

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

function clampTransparency(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)))
}

function surfaceStrengthFromTransparency(transparency: number) {
  return clampTransparency(100 - transparency)
}

function readTransparency(): number {
  try {
    const saved = localStorage.getItem(TRANSPARENCY_KEY)
    if (saved !== null) {
      const value = Number(saved)
      if (Number.isFinite(value)) return clampTransparency(value)
    }

    const legacy = localStorage.getItem(LEGACY_OPACITY_KEY)
    if (legacy !== null) {
      const value = Number(legacy)
      if (Number.isFinite(value) && value >= 35 && value <= 92) {
        return clampTransparency(100 - value)
      }
      if (Number.isFinite(value)) return clampTransparency(value)
    }
  } catch { /* ignore */ }
  return 30
}

export function applyPanelGlassSettings(
  enabled = panelGlassEnabled.value,
  transparency = panelGlassOpacity.value,
) {
  const root = document.documentElement
  if (enabled) {
    const t = clampTransparency(transparency)
    const strength = surfaceStrengthFromTransparency(t)
    const blurPx = Math.max(4, Math.round(18 - t * 0.12))
    const borderStrength = Math.min(100, Math.round(68 + t * 0.32))
    const ambientBoost = (1 + (t / 100) * 0.75).toFixed(2)
    const saturate = (1.05 + (t / 100) * 0.35).toFixed(2)

    root.setAttribute('data-panel-glass', 'true')
    root.style.setProperty('--panel-bg', `color-mix(in srgb, var(--surface) ${strength}%, transparent)`)
    root.style.setProperty('--panel-blur', `${blurPx}px`)
    root.style.setProperty('--panel-saturate', saturate)
    root.style.setProperty('--panel-border-strength', `${borderStrength}%`)
    root.style.setProperty('--panel-border-color', 'var(--border-hover)')
    root.style.setProperty('--ambient-glass-boost', ambientBoost)
  } else {
    root.removeAttribute('data-panel-glass')
    root.style.removeProperty('--panel-bg')
    root.style.removeProperty('--panel-blur')
    root.style.removeProperty('--panel-saturate')
    root.style.removeProperty('--panel-border-strength')
    root.style.removeProperty('--panel-border-color')
    root.style.removeProperty('--ambient-glass-boost')
  }
}

export function setPanelGlassEnabled(enabled: boolean, persist = true) {
  panelGlassEnabled.value = enabled
  applyPanelGlassSettings()
  if (persist && !isPublicComputerMode()) {
    try { localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0') } catch { /* ignore */ }
  }
}

export function setPanelGlassOpacity(transparency: number, persist = true) {
  panelGlassOpacity.value = clampTransparency(transparency)
  applyPanelGlassSettings()
  if (persist && !isPublicComputerMode()) {
    try {
      localStorage.setItem(TRANSPARENCY_KEY, String(panelGlassOpacity.value))
    } catch { /* ignore */ }
  }
}

export function initPanelGlassSettings() {
  applyPanelGlassSettings()
}
