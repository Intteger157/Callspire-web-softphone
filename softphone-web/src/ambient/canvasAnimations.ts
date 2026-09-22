import type { BackgroundAnimationId } from '@/backgroundTheme'
import {
  alphaForUi,
  hexToRgba,
  mixRgba,
  readCanvasColors,
  type PointerState,
} from '@/ambient/canvasColors'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  phase: number
}

interface Firefly {
  x: number
  y: number
  vx: number
  vy: number
  phase: number
  size: number
}

interface PulseNode {
  x: number
  y: number
  r: number
  phase: number
  mix: number
}

interface RainDrop {
  x: number
  y: number
  len: number
  speed: number
  mix: number
  width: number
}

export interface AmbientCanvasController {
  stop: () => void
  resize: () => void
}

export function startAmbientCanvasAnimation(
  canvas: HTMLCanvasElement,
  theme: BackgroundAnimationId,
  getPointer: () => PointerState,
): AmbientCanvasController | null {
  if (theme === 'none') return null

  const context = canvas.getContext('2d')
  if (!context) return null
  const ctx: CanvasRenderingContext2D = context

  let width = 0
  let height = 0
  let frame = 0
  let particles: Particle[] = []
  let fireflies: Firefly[] = []
  let pulseNodes: PulseNode[] = []
  let rainDrops: RainDrop[] = []

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    width = window.innerWidth
    height = window.innerHeight
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    seed()
  }

  function seedParticles() {
    const count = Math.min(72, Math.max(36, Math.floor((width * height) / 18000)))
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: 1 + Math.random() * 1.6,
      phase: Math.random() * Math.PI * 2,
    }))
  }

  function seedFireflies() {
    const count = Math.min(48, Math.max(24, Math.floor((width * height) / 24000)))
    fireflies = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.18,
      vy: -0.15 - Math.random() * 0.35,
      phase: Math.random() * Math.PI * 2,
      size: 1.2 + Math.random() * 2.2,
    }))
  }

  function seedPulse() {
    pulseNodes = [
      { x: width * 0.18, y: height * 0.24, r: 120 + width * 0.07, phase: 0, mix: 0.35 },
      { x: width * 0.82, y: height * 0.34, r: 105 + width * 0.06, phase: 1.4, mix: 0.72 },
      { x: width * 0.52, y: height * 0.74, r: 145 + width * 0.08, phase: 2.6, mix: 0.5 },
      { x: width * 0.34, y: height * 0.52, r: 95 + width * 0.045, phase: 3.9, mix: 0.42 },
    ]
  }

  function seedRain() {
    const count = Math.min(90, Math.max(45, Math.floor((width * height) / 14000)))
    rainDrops = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      len: 14 + Math.random() * 32,
      speed: 2.2 + Math.random() * 4.5,
      mix: Math.random(),
      width: 0.7 + Math.random() * 1.3,
    }))
  }

  function seed() {
    if (theme === 'aurora') seedParticles()
    if (theme === 'fireflies') seedFireflies()
    if (theme === 'rain') seedRain()
    if (theme === 'pulse') seedPulse()
  }

  function drawAurora(time: number, pointer: PointerState) {
    const { emerald, blue } = readCanvasColors()
    const linkDistance = Math.min(150, Math.max(110, width * 0.12))
    const linkDistanceSq = linkDistance * linkDistance

    ctx.clearRect(0, 0, width, height)

    for (const particle of particles) {
      particle.x += particle.vx
      particle.y += particle.vy
      if (particle.x <= 0 || particle.x >= width) particle.vx *= -1
      if (particle.y <= 0 || particle.y >= height) particle.vy *= -1

      if (pointer.active) {
        const dx = pointer.x - particle.x
        const dy = pointer.y - particle.y
        const distSq = dx * dx + dy * dy
        const influence = 140
        if (distSq > 0 && distSq < influence * influence) {
          const dist = Math.sqrt(distSq)
          const force = (1 - dist / influence) * 0.045
          particle.vx += (dx / dist) * force
          particle.vy += (dy / dist) * force
        }
      }
      particle.vx *= 0.992
      particle.vy *= 0.992
    }

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i]
        const b = particles[j]
        const dx = a.x - b.x
        const dy = a.y - b.y
        const distSq = dx * dx + dy * dy
        if (distSq > linkDistanceSq) continue
        const dist = Math.sqrt(distSq)
        const alpha = alphaForUi((1 - dist / linkDistance) * 0.22)
        ctx.strokeStyle = mixRgba(emerald, blue, 0.55, alpha)
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
    }

    if (pointer.active) {
      const pulse = 0.55 + Math.sin(time * 0.0025) * 0.08
      const glow = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 180 * pulse)
      glow.addColorStop(0, hexToRgba(emerald, alphaForUi(0.22)))
      glow.addColorStop(0.45, hexToRgba(blue, alphaForUi(0.1)))
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, width, height)
    }

    for (const particle of particles) {
      const twinkle = 0.45 + Math.sin(time * 0.003 + particle.phase) * 0.25
      ctx.beginPath()
      ctx.fillStyle = mixRgba(emerald, blue, twinkle, alphaForUi(twinkle * 0.85))
      ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  function drawWaves(time: number, pointer: PointerState) {
    const { emerald, blue } = readCanvasColors()
    ctx.clearRect(0, 0, width, height)

    const pointerShift = pointer.active ? (pointer.x / width - 0.5) * 40 : 0
    const layers = [
      { amp: 28, freq: 0.0045, speed: 0.0009, y: height * 0.28, color: emerald, alpha: alphaForUi(0.14) },
      { amp: 36, freq: 0.0032, speed: 0.0006, y: height * 0.52, color: blue, alpha: alphaForUi(0.12) },
      { amp: 22, freq: 0.0058, speed: 0.0011, y: height * 0.72, color: emerald, alpha: alphaForUi(0.1) },
    ]

    for (const layer of layers) {
      ctx.beginPath()
      for (let x = 0; x <= width; x += 4) {
        const y = layer.y
          + Math.sin(x * layer.freq + time * layer.speed + pointerShift * 0.02) * layer.amp
          + Math.sin(x * layer.freq * 1.7 + time * layer.speed * 1.3) * (layer.amp * 0.35)
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = hexToRgba(layer.color, layer.alpha)
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.lineTo(width, height)
      ctx.lineTo(0, height)
      ctx.closePath()
      ctx.fillStyle = hexToRgba(layer.color, layer.alpha * 0.35)
      ctx.fill()
    }
  }

  function drawFireflies(time: number, pointer: PointerState) {
    const { emerald, blue } = readCanvasColors()
    ctx.clearRect(0, 0, width, height)

    for (const fly of fireflies) {
      fly.x += fly.vx + Math.sin(time * 0.001 + fly.phase) * 0.08
      fly.y += fly.vy

      if (fly.y < -20) {
        fly.y = height + 20
        fly.x = Math.random() * width
      }
      if (fly.x < 0) fly.x = width
      if (fly.x > width) fly.x = 0

      if (pointer.active) {
        const dx = pointer.x - fly.x
        const dy = pointer.y - fly.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 0 && dist < 120) {
          fly.vx += (dx / dist) * 0.008
          fly.vy += (dy / dist) * 0.006
        }
      }

      fly.vx *= 0.985
      fly.vy = Math.min(-0.08, fly.vy * 0.998)

      const glow = 0.35 + Math.sin(time * 0.004 + fly.phase) * 0.35
      const halo = ctx.createRadialGradient(fly.x, fly.y, 0, fly.x, fly.y, fly.size * 8)
      halo.addColorStop(0, mixRgba(emerald, blue, 0.6, alphaForUi(glow * 0.55)))
      halo.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = halo
      ctx.fillRect(fly.x - fly.size * 8, fly.y - fly.size * 8, fly.size * 16, fly.size * 16)

      ctx.beginPath()
      ctx.fillStyle = mixRgba(emerald, blue, 0.7, alphaForUi(glow))
      ctx.arc(fly.x, fly.y, fly.size, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  function drawRain(_time: number, pointer: PointerState) {
    const { emerald, blue } = readCanvasColors()
    ctx.clearRect(0, 0, width, height)

    const wind = pointer.active ? (pointer.x / width - 0.5) * 8 : 0
    ctx.lineCap = 'round'

    for (const drop of rainDrops) {
      drop.y += drop.speed
      drop.x += wind * 0.015

      if (drop.y > height + drop.len) {
        drop.y = -drop.len
        drop.x = Math.random() * width
      }
      if (drop.x < -20) drop.x = width + 20
      if (drop.x > width + 20) drop.x = -20

      const alpha = alphaForUi(0.1 + drop.mix * 0.14)
      ctx.strokeStyle = mixRgba(emerald, blue, drop.mix, alpha)
      ctx.lineWidth = drop.width
      ctx.beginPath()
      ctx.moveTo(drop.x, drop.y)
      ctx.lineTo(drop.x - 2.5, drop.y + drop.len)
      ctx.stroke()
    }
  }

  function drawPulse(time: number, pointer: PointerState) {
    const { emerald, blue } = readCanvasColors()
    ctx.clearRect(0, 0, width, height)

    const shiftX = pointer.active ? (pointer.x / width - 0.5) * 32 : 0
    const shiftY = pointer.active ? (pointer.y / height - 0.5) * 24 : 0

    ctx.globalCompositeOperation = 'lighter'

    for (const node of pulseNodes) {
      const pulse = 0.5 + Math.sin(time * 0.0014 + node.phase) * 0.5
      const radius = node.r * (0.72 + pulse * 0.55)
      const x = node.x + shiftX * (0.35 + node.mix * 0.25)
      const y = node.y + shiftY * (0.35 + node.mix * 0.25)
      const alpha = alphaForUi(0.12 + pulse * 0.14)

      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius)
      grad.addColorStop(0, mixRgba(emerald, blue, node.mix, alpha * 1.15))
      grad.addColorStop(0.4, mixRgba(emerald, blue, node.mix, alpha * 0.55))
      grad.addColorStop(1, 'rgba(0,0,0,0)')

      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()

      ctx.beginPath()
      ctx.strokeStyle = mixRgba(emerald, blue, node.mix, alphaForUi(0.06 + pulse * 0.1))
      ctx.lineWidth = 1.5
      ctx.arc(x, y, radius * 0.78, 0, Math.PI * 2)
      ctx.stroke()
    }

    ctx.globalCompositeOperation = 'source-over'
  }

  function draw(time: number) {
    const pointer = getPointer()
    switch (theme) {
      case 'aurora':
        drawAurora(time, pointer)
        break
      case 'waves':
        drawWaves(time, pointer)
        break
      case 'fireflies':
        drawFireflies(time, pointer)
        break
      case 'rain':
        drawRain(time, pointer)
        break
      case 'pulse':
        drawPulse(time, pointer)
        break
      default:
        ctx.clearRect(0, 0, width, height)
    }
  }

  function loop(now: number) {
    draw(now)
    frame = window.requestAnimationFrame(loop)
  }

  resize()
  frame = window.requestAnimationFrame(loop)

  return {
    stop() {
      window.cancelAnimationFrame(frame)
      ctx.clearRect(0, 0, width, height)
    },
    resize,
  }
}
