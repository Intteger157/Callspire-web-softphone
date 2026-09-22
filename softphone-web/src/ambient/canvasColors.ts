export function readThemeColor(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

export function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '')
  if (normalized.length !== 6) return `rgba(16, 185, 129, ${alpha})`
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function mixRgba(colorA: string, colorB: string, weightA: number, alpha: number) {
  const parse = (hex: string) => {
    const normalized = hex.replace('#', '')
    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16),
    }
  }
  const a = parse(colorA)
  const b = parse(colorB)
  const w = Math.min(1, Math.max(0, weightA))
  const r = Math.round(a.r * w + b.r * (1 - w))
  const g = Math.round(a.g * w + b.g * (1 - w))
  const bl = Math.round(a.b * w + b.b * (1 - w))
  return `rgba(${r}, ${g}, ${bl}, ${alpha})`
}

export interface PointerState {
  x: number
  y: number
  active: boolean
}

export function readCanvasColors() {
  return {
    emerald: readThemeColor('--emerald', '#10b981'),
    blue: readThemeColor('--blue', '#3b82f6'),
  }
}

export function isLightUiTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light'
}

export function alphaForUi(base: number) {
  return isLightUiTheme() ? Math.min(1, base * 1.55) : base
}
