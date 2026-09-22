<script setup lang="ts">
import { backgroundTheme, applyBackgroundTheme, BACKGROUND_ANIMATIONS, type BackgroundAnimationId } from '@/backgroundTheme'
import {
  panelGlassEnabled,
  panelGlassOpacity,
  setPanelGlassEnabled,
  setPanelGlassOpacity,
} from '@/panelAppearance'

const emit = defineEmits<{ close: [] }>()

function selectTheme(id: BackgroundAnimationId) {
  applyBackgroundTheme(id)
}

function onGlassToggle(event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  setPanelGlassEnabled(checked)
}

function onOpacityInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  setPanelGlassOpacity(value)
}

function close() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="backdrop" @click.self="close">
      <div class="modal" role="dialog" aria-modal="true" aria-label="Background themes">

        <div class="header">
          <div>
            <h2 class="title">Themes</h2>
            <p class="subtitle">Background animation and panel appearance.</p>
          </div>
          <button type="button" class="close-btn" aria-label="Close" @click="close">✕</button>
        </div>

        <p class="section-label">Background</p>
        <div class="grid">
          <button
            v-for="option in BACKGROUND_ANIMATIONS"
            :key="option.id"
            type="button"
            class="theme-card"
            :class="{ active: backgroundTheme === option.id, [`preview--${option.id}`]: true }"
            @click="selectTheme(option.id)"
          >
            <div class="preview" aria-hidden="true">
              <span v-if="option.id === 'none'" class="preview-none">—</span>
              <span v-else-if="option.id === 'aurora'" class="preview-aurora" />
              <span v-else-if="option.id === 'waves'" class="preview-waves" />
              <span v-else-if="option.id === 'fireflies'" class="preview-fireflies" />
              <span v-else-if="option.id === 'rain'" class="preview-rain" />
              <span v-else-if="option.id === 'pulse'" class="preview-pulse" />
            </div>
            <div class="meta">
              <span class="name">{{ option.label }}</span>
              <span class="desc">{{ option.description }}</span>
            </div>
            <span v-if="backgroundTheme === option.id" class="check" aria-hidden="true">✓</span>
          </button>
        </div>

        <section
          class="glass-section"
          :class="{ 'glass-section--on': panelGlassEnabled }"
          :style="{ '--glass-preview-t': panelGlassEnabled ? panelGlassOpacity : 0 }"
        >
          <div class="glass-section__accent" aria-hidden="true" />

          <div class="glass-section__top">
            <div class="glass-section__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M4 8.5 12 3l8 5.5v9L12 23l-8-5.5v-9Z"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linejoin="round"
                />
                <path
                  d="M12 12.5 20 8M12 12.5 4 8M12 12.5v10.5"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
            <div class="glass-section__copy">
              <h3 class="glass-section__title">Panel appearance</h3>
              <p class="glass-section__hint">Let the background breathe through your tiles</p>
            </div>
          </div>

          <div class="glass-preview" aria-hidden="true">
            <div class="glass-preview__bg" />
            <div class="glass-preview__panes">
              <div class="glass-preview__pane glass-preview__pane--sm" />
              <div class="glass-preview__pane glass-preview__pane--lg" />
            </div>
          </div>

          <div class="glass-controls">
            <label class="glass-switch">
              <input
                type="checkbox"
                class="glass-input"
                :checked="panelGlassEnabled"
                @change="onGlassToggle"
              />
              <span class="glass-switch__track" aria-hidden="true">
                <span class="glass-switch__thumb" />
              </span>
              <span class="glass-switch__label">Transparent mode</span>
            </label>

            <div class="glass-slider" :class="{ disabled: !panelGlassEnabled }">
              <div class="glass-slider__head">
                <span class="glass-slider__label">Transparency</span>
                <span class="glass-slider__value">{{ panelGlassOpacity }}%</span>
              </div>
              <div class="glass-slider__track-wrap">
                <div class="glass-slider__fill" :style="{ width: `${panelGlassOpacity}%` }" />
                <input
                  type="range"
                  class="opacity-slider"
                  min="0"
                  max="100"
                  step="1"
                  :value="panelGlassOpacity"
                  :disabled="!panelGlassEnabled"
                  @input="onOpacityInput"
                />
              </div>
            </div>
          </div>
        </section>

        <div class="footer">
          <button type="button" class="done-btn" @click="close">Done</button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: var(--overlay);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.modal {
  position: relative;
  background:
    linear-gradient(165deg, color-mix(in srgb, var(--surface) 94%, var(--emerald)) 0%, var(--surface) 42%),
    var(--surface);
  border: 1px solid color-mix(in srgb, var(--border-hover) 65%, transparent);
  border-radius: var(--radius-xl);
  width: 100%;
  max-width: 640px;
  max-height: min(90vh, 720px);
  overflow: auto;
  box-shadow:
    var(--shadow),
    0 0 0 1px color-mix(in srgb, var(--emerald) 8%, transparent);
}

.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 1.5rem 0.75rem;
}
.title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--fg);
}
.subtitle {
  margin: 0.35rem 0 0;
  font-size: 0.82rem;
  color: var(--fg-subtle);
  line-height: 1.45;
}
.close-btn {
  background: none;
  border: none;
  font-size: 1rem;
  color: var(--fg-subtle);
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius-sm);
}
.close-btn:hover { color: var(--fg); background: var(--surface-2); }

.section-label {
  margin: 0;
  padding: 0.25rem 1.5rem 0;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-subtle);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 0.75rem;
  padding: 0.75rem 1.5rem 0.5rem;
}

.theme-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 0.65rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}
.theme-card:hover {
  border-color: var(--border-hover);
  transform: translateY(-1px);
}
.theme-card.active {
  border-color: var(--emerald-border);
  background: color-mix(in srgb, var(--surface-2) 90%, var(--emerald));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--emerald) 35%, transparent),
    0 8px 24px color-mix(in srgb, var(--emerald) 10%, transparent);
}

.preview {
  position: relative;
  height: 72px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--bg);
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
}

.preview-none {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: var(--fg-subtle);
  font-size: 1.4rem;
}

.preview-aurora,
.preview-waves,
.preview-fireflies,
.preview-rain,
.preview-pulse {
  position: absolute;
  inset: 0;
}

.preview-aurora {
  background:
    radial-gradient(circle at 20% 30%, color-mix(in srgb, var(--emerald) 45%, transparent), transparent 55%),
    radial-gradient(circle at 80% 70%, color-mix(in srgb, var(--blue) 40%, transparent), transparent 50%);
  animation: preview-shift 4s ease-in-out infinite;
}
.preview-waves {
  background: linear-gradient(180deg, color-mix(in srgb, var(--blue) 15%, transparent), transparent 60%);
}
.preview-waves::after {
  content: '';
  position: absolute;
  left: -10%;
  right: -10%;
  top: 38%;
  height: 2px;
  background: color-mix(in srgb, var(--emerald) 55%, transparent);
  border-radius: 999px;
  box-shadow: 0 14px 0 color-mix(in srgb, var(--blue) 35%, transparent);
  animation: preview-wave 3s ease-in-out infinite;
}
.preview-fireflies {
  background:
    radial-gradient(circle at 50% 85%, color-mix(in srgb, var(--emerald) 35%, transparent), transparent 55%),
    radial-gradient(circle at 30% 40%, color-mix(in srgb, var(--blue) 20%, transparent), transparent 45%);
}
.preview-fireflies::after {
  content: '';
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  left: 38%;
  top: 52%;
  background: var(--emerald);
  box-shadow:
    18px -14px 0 color-mix(in srgb, var(--emerald) 70%, transparent),
    -12px -22px 0 color-mix(in srgb, var(--blue) 60%, transparent),
    28px 8px 0 color-mix(in srgb, var(--emerald) 55%, transparent);
  animation: preview-shift 3.5s ease-in-out infinite;
}
.preview-rain {
  background: linear-gradient(180deg, color-mix(in srgb, var(--blue) 18%, transparent), transparent 60%);
  mask-image: repeating-linear-gradient(108deg, black 0 1px, transparent 1px 10px);
}
.preview-rain::before,
.preview-rain::after {
  content: '';
  position: absolute;
  width: 1.5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--emerald) 55%, transparent);
  animation: preview-rain 2.2s linear infinite;
}
.preview-rain::before {
  height: 18px;
  left: 35%;
  top: 20%;
}
.preview-rain::after {
  height: 14px;
  left: 62%;
  top: 35%;
  background: color-mix(in srgb, var(--blue) 50%, transparent);
  animation-delay: -1.1s;
}
.preview-pulse {
  background:
    radial-gradient(circle at 24% 30%, color-mix(in srgb, var(--emerald) 42%, transparent), transparent 52%),
    radial-gradient(circle at 76% 62%, color-mix(in srgb, var(--blue) 38%, transparent), transparent 50%);
  animation: preview-pulse 3.5s ease-in-out infinite;
}
.preview-pulse::after {
  content: '';
  position: absolute;
  inset: 22%;
  border: 1.5px solid color-mix(in srgb, var(--emerald) 50%, transparent);
  border-radius: 50%;
  animation: preview-pulse 3.5s ease-in-out infinite;
}

.glass-section {
  position: relative;
  margin: 0.5rem 1.5rem 0;
  padding: 1.05rem 1.1rem 1.15rem;
  border-radius: var(--radius-lg);
  border: 1px solid color-mix(in srgb, var(--border-hover) 55%, transparent);
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--surface-2) 88%, var(--blue)) 0%, var(--surface-2) 55%),
    var(--surface-2);
  overflow: hidden;
  transition: border-color 0.25s, box-shadow 0.25s;
}

.glass-section--on {
  border-color: color-mix(in srgb, var(--emerald) 38%, var(--border-hover));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--emerald) 12%, transparent),
    0 12px 32px color-mix(in srgb, var(--emerald) 8%, transparent);
}

.glass-section__accent {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--emerald) 55%, transparent) 35%,
    color-mix(in srgb, var(--blue) 45%, transparent) 65%,
    transparent
  );
  opacity: 0;
  transition: opacity 0.25s;
}

.glass-section--on .glass-section__accent {
  opacity: 1;
}

.glass-section__top {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.glass-section__icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: var(--emerald);
  background: color-mix(in srgb, var(--emerald) 14%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--emerald) 28%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 10%, transparent);
}

.glass-section__icon svg {
  width: 18px;
  height: 18px;
}

.glass-section__title {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--fg);
  letter-spacing: -0.01em;
}

.glass-section__hint {
  margin: 0.2rem 0 0;
  font-size: 0.74rem;
  color: var(--fg-subtle);
  line-height: 1.4;
}

.glass-preview {
  position: relative;
  height: 58px;
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: 0.95rem;
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--fg) 4%, transparent);
}

.glass-preview__bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 28% 55%, color-mix(in srgb, var(--emerald) 42%, transparent), transparent 52%),
    radial-gradient(circle at 72% 45%, color-mix(in srgb, var(--blue) 36%, transparent), transparent 50%),
    var(--bg);
  animation: preview-shift 7s ease-in-out infinite;
}

.glass-preview__panes {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 0.45rem;
  height: 100%;
  padding: 0.55rem 0.65rem;
  align-items: stretch;
}

.glass-preview__pane {
  border-radius: 8px;
  backdrop-filter: blur(10px) saturate(1.15);
  -webkit-backdrop-filter: blur(10px) saturate(1.15);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border-hover) 72%, transparent);
  background: color-mix(
    in srgb,
    var(--surface) calc(100% - var(--glass-preview-t, 0) * 1%),
    transparent
  );
  transition: background 0.2s ease, backdrop-filter 0.2s ease;
}

.glass-preview__pane--sm {
  flex: 0 0 32%;
}

.glass-preview__pane--lg {
  flex: 1;
}

.glass-controls {
  display: grid;
  gap: 0.85rem;
}

.glass-switch {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  cursor: pointer;
  user-select: none;
}

.glass-input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.glass-switch__track {
  position: relative;
  width: 38px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--input-bg) 80%, var(--surface-3));
  border: 1px solid var(--border-hover);
  transition: background 0.2s, border-color 0.2s;
}

.glass-switch__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--fg-muted);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: transform 0.2s cubic-bezier(0.34, 1.3, 0.64, 1), background 0.2s;
}

.glass-input:checked + .glass-switch__track {
  background: color-mix(in srgb, var(--emerald) 82%, #000);
  border-color: color-mix(in srgb, var(--emerald) 70%, transparent);
}

.glass-input:checked + .glass-switch__track .glass-switch__thumb {
  transform: translateX(16px);
  background: #fff;
}

.glass-input:focus-visible + .glass-switch__track {
  outline: 2px solid color-mix(in srgb, var(--emerald) 45%, transparent);
  outline-offset: 2px;
}

.glass-switch__label {
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--fg);
}

.glass-slider {
  padding: 0.65rem 0.75rem;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--surface) 55%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  transition: opacity 0.2s;
}

.glass-slider.disabled {
  opacity: 0.42;
  pointer-events: none;
}

.glass-slider__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.glass-slider__label {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--fg-subtle);
}

.glass-slider__value {
  font-size: 0.78rem;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--emerald);
  min-width: 2.5rem;
  text-align: right;
}

.glass-slider__track-wrap {
  position: relative;
  height: 18px;
  display: flex;
  align-items: center;
}

.glass-slider__fill {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--emerald) 70%, var(--blue)),
    var(--emerald)
  );
  pointer-events: none;
  transition: width 0.12s ease;
  opacity: 0.85;
}

.opacity-slider {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 18px;
  margin: 0;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
}
.opacity-slider:disabled {
  cursor: not-allowed;
}
.opacity-slider::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--border-hover) 45%, transparent);
}
.opacity-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  margin-top: -5px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid var(--emerald);
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--emerald) 18%, transparent),
    0 2px 6px rgba(0, 0, 0, 0.2);
  transition: transform 0.12s ease;
}
.opacity-slider:active::-webkit-slider-thumb {
  transform: scale(1.08);
}
.opacity-slider::-moz-range-track {
  height: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--border-hover) 45%, transparent);
}
.opacity-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid var(--emerald);
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--emerald) 18%, transparent),
    0 2px 6px rgba(0, 0, 0, 0.2);
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.name {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--fg);
}
.desc {
  font-size: 0.72rem;
  color: var(--fg-subtle);
  line-height: 1.35;
}

.check {
  position: absolute;
  top: 0.55rem;
  right: 0.55rem;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: var(--emerald);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
  display: grid;
  place-items: center;
}

.footer {
  padding: 1rem 1.5rem 1.25rem;
  display: flex;
  justify-content: flex-end;
}
.done-btn {
  padding: 0.6rem 1.6rem;
  background: var(--emerald);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}
.done-btn:hover { background: var(--emerald-hover); }

@keyframes preview-shift {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(6px, -4px); }
}
@keyframes preview-wave {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
@keyframes preview-rain {
  from { transform: translateY(-6px); opacity: 0.5; }
  to { transform: translateY(22px); opacity: 1; }
}
@keyframes preview-pulse {
  0%, 100% { transform: scale(1); opacity: 0.85; }
  50% { transform: scale(1.08); opacity: 1; }
}
</style>
