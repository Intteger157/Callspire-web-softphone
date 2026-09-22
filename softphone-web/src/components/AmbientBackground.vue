<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { backgroundTheme, type BackgroundAnimationId } from '@/backgroundTheme'
import { startAmbientCanvasAnimation, type AmbientCanvasController } from '@/ambient/canvasAnimations'
import type { PointerState } from '@/ambient/canvasColors'
import { theme as uiTheme } from '@/theme'

const props = withDefaults(defineProps<{
  theme?: BackgroundAnimationId
  subtle?: boolean
  interactive?: boolean
}>(), {
  theme: undefined,
  subtle: false,
  interactive: true,
})

const rootRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const motionOk = ref(true)

const activeTheme = computed(() => props.theme ?? backgroundTheme.value)
const isLightUi = computed(() => uiTheme.value === 'light')
const showCanvas = computed(() =>
  ['aurora', 'waves', 'fireflies', 'rain', 'pulse'].includes(activeTheme.value),
)
const showCssScene = computed(() => activeTheme.value !== 'none')

let controller: AmbientCanvasController | null = null
const pointer: PointerState = { x: 0, y: 0, active: false }

function setPointerVars(x: number, y: number) {
  const nx = x / window.innerWidth
  const ny = y / window.innerHeight
  rootRef.value?.style.setProperty('--mx', String(nx))
  rootRef.value?.style.setProperty('--my', String(ny))
  pointer.x = x
  pointer.y = y
  pointer.active = true
}

function onPointerMove(e: PointerEvent) {
  if (!props.interactive || !motionOk.value) return
  setPointerVars(e.clientX, e.clientY)
}

function stopCanvas() {
  controller?.stop()
  controller = null
}

function startCanvas() {
  stopCanvas()
  if (!motionOk.value || !showCanvas.value || !canvasRef.value) return
  controller = startAmbientCanvasAnimation(
    canvasRef.value,
    activeTheme.value,
    () => ({ ...pointer }),
  )
}

function onResize() {
  controller?.resize()
}

watch(activeTheme, () => {
  startCanvas()
})

onMounted(() => {
  motionOk.value = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (props.interactive && motionOk.value) {
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    setPointerVars(window.innerWidth * 0.5, window.innerHeight * 0.42)
  }
  startCanvas()
  window.addEventListener('resize', onResize, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('resize', onResize)
  stopCanvas()
})
</script>

<template>
  <div
    v-if="showCssScene"
    ref="rootRef"
    class="ambient"
    :class="[
      `ambient--${activeTheme}`,
      {
        'ambient--subtle': subtle,
        'ambient--light-ui': isLightUi,
      },
    ]"
    aria-hidden="true"
  >
    <div class="scene">
      <template v-if="activeTheme === 'aurora'">
        <div class="aurora aurora-a" />
        <div class="aurora aurora-b" />
        <div class="aurora aurora-c" />
        <div class="stars" />
      </template>

      <template v-else-if="activeTheme === 'waves'">
        <div class="waves-bg" />
      </template>

      <template v-else-if="activeTheme === 'fireflies'">
        <div class="fireflies-bg" />
      </template>

      <template v-else-if="activeTheme === 'rain'">
        <div class="rain-bg" />
      </template>

      <template v-else-if="activeTheme === 'pulse'">
        <div class="pulse-bg" />
      </template>

      <canvas v-if="showCanvas" ref="canvasRef" class="particle-canvas" />
    </div>
  </div>
</template>

<style scoped>
.ambient {
  --mx: 0.5;
  --my: 0.42;
  --ambient-emerald: 22%;
  --ambient-blue: 18%;
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 0;
}

.ambient--subtle {
  opacity: 0.58;
}

.ambient--light-ui {
  --ambient-emerald: 34%;
  --ambient-blue: 28%;
}

.ambient--light-ui.ambient--subtle {
  opacity: 0.78;
}

.ambient--light-ui .aurora {
  mix-blend-mode: normal;
  opacity: 0.62;
  filter: blur(56px);
}

.scene {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background:
    radial-gradient(ellipse 90% 55% at 50% -5%, color-mix(in srgb, var(--emerald) var(--ambient-emerald), transparent), transparent 58%),
    radial-gradient(ellipse 70% 50% at 100% 100%, color-mix(in srgb, var(--blue) var(--ambient-blue), transparent), transparent 55%),
    var(--bg);
}

.particle-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 2;
  opacity: 0.92;
}

.ambient--light-ui .particle-canvas {
  opacity: 1;
}

/* Aurora */
.aurora {
  position: absolute;
  width: 150%;
  height: 150%;
  left: -25%;
  top: -25%;
  border-radius: 42%;
  filter: blur(72px);
  opacity: 0.55;
  mix-blend-mode: screen;
}
.aurora-a {
  background: conic-gradient(
    from 210deg at 50% 50%,
    color-mix(in srgb, var(--emerald) 70%, transparent),
    transparent 28%,
    color-mix(in srgb, var(--blue) 55%, transparent),
    transparent 62%,
    color-mix(in srgb, var(--emerald) 45%, transparent)
  );
  animation: aurora-drift-a 28s ease-in-out infinite;
  transform: translate(calc((var(--mx) - 0.5) * 60px), calc((var(--my) - 0.5) * 40px));
}
.aurora-b {
  background: radial-gradient(circle at 30% 40%, color-mix(in srgb, var(--blue) 50%, transparent) 0%, transparent 55%);
  animation: aurora-drift-b 34s ease-in-out infinite;
  opacity: 0.42;
  transform: translate(calc((var(--mx) - 0.5) * -50px), calc((var(--my) - 0.5) * 35px));
}
.aurora-c {
  background: radial-gradient(circle at 70% 60%, color-mix(in srgb, var(--emerald) 40%, var(--blue) 20%) 0%, transparent 50%);
  animation: aurora-drift-c 22s ease-in-out infinite;
  opacity: 0.38;
}

.stars {
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle, color-mix(in srgb, var(--fg) 18%, transparent) 0.6px, transparent 0.7px),
    radial-gradient(circle, color-mix(in srgb, var(--fg) 10%, transparent) 0.5px, transparent 0.6px);
  background-size: 120px 120px, 180px 180px;
  background-position: 0 0, 40px 60px;
  mask-image: radial-gradient(ellipse 75% 65% at 50% 45%, black 15%, transparent 78%);
  opacity: 0.35;
  animation: stars-drift 90s linear infinite;
}

.ambient--light-ui .stars {
  opacity: 0.22;
}

.waves-bg,
.fireflies-bg,
.rain-bg,
.pulse-bg {
  position: absolute;
  inset: 0;
}

.waves-bg {
  background:
    radial-gradient(ellipse 80% 40% at 20% 20%, color-mix(in srgb, var(--emerald) var(--ambient-emerald), transparent), transparent 60%),
    radial-gradient(ellipse 70% 45% at 80% 80%, color-mix(in srgb, var(--blue) var(--ambient-blue), transparent), transparent 55%);
}

.fireflies-bg {
  background:
    radial-gradient(ellipse 70% 50% at 50% 100%, color-mix(in srgb, var(--emerald) calc(var(--ambient-emerald) + 8%), transparent), transparent 62%),
    radial-gradient(ellipse 55% 40% at 20% 30%, color-mix(in srgb, var(--blue) var(--ambient-blue), transparent), transparent 55%);
}

.rain-bg {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--blue) calc(var(--ambient-blue) + 10%), transparent), transparent 52%),
    radial-gradient(ellipse 90% 45% at 50% 0%, color-mix(in srgb, var(--emerald) var(--ambient-emerald), transparent), transparent 58%);
  mask-image: repeating-linear-gradient(
    108deg,
    black 0 1px,
    transparent 1px 14px
  );
  opacity: 0.55;
}

.pulse-bg {
  background:
    radial-gradient(circle at 18% 24%, color-mix(in srgb, var(--emerald) calc(var(--ambient-emerald) + 14%), transparent), transparent 46%),
    radial-gradient(circle at 82% 34%, color-mix(in srgb, var(--blue) calc(var(--ambient-blue) + 12%), transparent), transparent 44%),
    radial-gradient(circle at 52% 74%, color-mix(in srgb, var(--emerald) calc(var(--ambient-emerald) + 8%), transparent), transparent 42%),
    radial-gradient(circle at 34% 52%, color-mix(in srgb, var(--blue) calc(var(--ambient-blue) + 6%), transparent), transparent 38%);
  animation: pulse-breathe 8s ease-in-out infinite;
}

.ambient--light-ui .rain-bg {
  opacity: 0.72;
}

.ambient--light-ui .pulse-bg {
  opacity: 1;
}

@keyframes aurora-drift-a {
  0%, 100% { transform: translate(calc((var(--mx) - 0.5) * 60px), calc((var(--my) - 0.5) * 40px)) rotate(0deg) scale(1); }
  50% { transform: translate(calc((var(--mx) - 0.5) * 80px), calc((var(--my) - 0.5) * 55px)) rotate(18deg) scale(1.08); }
}
@keyframes aurora-drift-b {
  0%, 100% { transform: translate(calc((var(--mx) - 0.5) * -50px), calc((var(--my) - 0.5) * 35px)) rotate(0deg); }
  50% { transform: translate(calc((var(--mx) - 0.5) * -70px), calc((var(--my) - 0.5) * -25px)) rotate(-14deg); }
}
@keyframes aurora-drift-c {
  0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.34; }
  50% { transform: translate(-40px, 30px) scale(1.12); opacity: 0.48; }
}
@keyframes stars-drift {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(-120px, -80px, 0); }
}
@keyframes pulse-breathe {
  0%, 100% { transform: scale(1); opacity: 0.82; }
  50% { transform: scale(1.06); opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .aurora,
  .stars {
    animation: none !important;
  }
  .particle-canvas {
    display: none;
  }
}
</style>
