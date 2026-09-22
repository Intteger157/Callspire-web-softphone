<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useCallsStore } from '@/stores/calls'
import { usePreferencesStore } from '@/stores/preferences'
import { appLog } from '@/logging/logCapture'
import { applySystemTheme, watchSystemThemeOnLogin } from '@/theme'
import AmbientBackground from '@/components/AmbientBackground.vue'
import { pickRandomBackgroundTheme, type BackgroundAnimationId } from '@/backgroundTheme'
import {
  readRememberedEmail,
  rememberEmail,
} from '@/publicComputer'

const publicComputer = ref(false)

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const calls = useCallsStore()
const prefs = usePreferencesStore()

const form = reactive({
  email: '',
  password: '',
})

const touched = reactive({
  email: false,
  password: false,
})

const submitting = ref(false)
const pageRef = ref<HTMLElement | null>(null)
const cardRef = ref<HTMLElement | null>(null)
const motionOk = ref(true)
const loginTheme = ref<BackgroundAnimationId>(pickRandomBackgroundTheme())

const baseUrl = import.meta.env.BASE_URL

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const emailError = computed(() => {
  if (!touched.email) return ''
  if (!form.email.trim()) return 'Email is required'
  if (!EMAIL_RE.test(form.email.trim())) return 'Enter a valid email address'
  return ''
})

const passwordError = computed(() => {
  if (!touched.password) return ''
  if (!form.password) return 'Password is required'
  return ''
})

const isValid = computed(
  () =>
    !!form.email.trim() &&
    EMAIL_RE.test(form.email.trim()) &&
    !!form.password,
)

function setPointerVars(x: number, y: number) {
  const nx = x / window.innerWidth
  const ny = y / window.innerHeight
  const root = pageRef.value
  if (!root) return

  root.style.setProperty('--mx', String(nx))
  root.style.setProperty('--my', String(ny))

  if (cardRef.value && motionOk.value) {
    const tiltX = (ny - 0.5) * -6
    const tiltY = (nx - 0.5) * 6
    cardRef.value.style.setProperty('--tilt-x', `${tiltX}deg`)
    cardRef.value.style.setProperty('--tilt-y', `${tiltY}deg`)
  }
}

function onPointerMove(e: PointerEvent) {
  setPointerVars(e.clientX, e.clientY)
}

async function onSubmit() {
  touched.email = true
  touched.password = true
  auth.clearError()
  if (!isValid.value) return

  submitting.value = true
  try {
    appLog('info', '[auth] login attempt', form.email.trim().toLowerCase())
    await auth.login(form.email.trim().toLowerCase(), form.password, {
      publicComputer: publicComputer.value,
    })
    rememberEmail(form.email, publicComputer.value)
    appLog('info', '[auth] login OK')
    void prefs.load()
    void calls.unlockAudio()
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/home'
    await router.replace(redirect)
  } catch (e) {
    appLog('error', '[auth] login failed', e)
  } finally {
    submitting.value = false
  }
}

let unwatchSystemTheme: (() => void) | undefined

onMounted(() => {
  form.email = readRememberedEmail()
  applySystemTheme()
  unwatchSystemTheme = watchSystemThemeOnLogin(() => applySystemTheme())

  motionOk.value = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (motionOk.value) {
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    setPointerVars(window.innerWidth * 0.5, window.innerHeight * 0.4)
  }
})

onUnmounted(() => {
  unwatchSystemTheme?.()
  window.removeEventListener('pointermove', onPointerMove)
})
</script>

<template>
  <main ref="pageRef" class="page">
    <AmbientBackground :theme="loginTheme" />

    <section ref="cardRef" class="card">
      <div class="card-shine" aria-hidden="true" />

      <header class="head">
        <div class="logo-wrap">
          <img
            class="logo"
            :src="`${baseUrl}favicon.ico`"
            width="40"
            height="40"
            alt=""
            aria-hidden="true"
          />
        </div>
        <h1>Callspire Web Softphone</h1>
        <p class="subtitle">Sign in to start calling</p>
      </header>

      <form novalidate @submit.prevent="onSubmit">
        <label class="field">
          <span class="label">Email</span>
          <input
            v-model="form.email"
            type="email"
            :autocomplete="publicComputer ? 'off' : 'username'"
            placeholder="you@company.com"
            :class="{ invalid: emailError }"
            @blur="touched.email = true"
          />
          <span v-if="emailError" class="field-error">{{ emailError }}</span>
        </label>

        <label class="field">
          <span class="label">Password</span>
          <input
            v-model="form.password"
            type="password"
            :autocomplete="publicComputer ? 'off' : 'current-password'"
            placeholder="••••••••"
            :class="{ invalid: passwordError }"
            @blur="touched.password = true"
          />
          <span v-if="passwordError" class="field-error">{{ passwordError }}</span>
        </label>

        <label class="shared-check">
          <input v-model="publicComputer" type="checkbox" class="shared-input" />
          <span class="shared-mark" aria-hidden="true">
            <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M2.5 6.2 5 8.7 9.5 3.8"
                stroke="currentColor"
                stroke-width="1.85"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <span class="shared-title">Shared computer</span>
        </label>

        <p v-if="auth.error" class="alert" role="alert">{{ auth.error }}</p>

        <button type="submit" class="submit" :disabled="submitting || auth.loading">
          <span class="submit-label">{{ submitting ? 'Signing in…' : 'Sign in' }}</span>
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.page {
  --mx: 0.5;
  --my: 0.4;
  --tilt-x: 0deg;
  --tilt-y: 0deg;
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  overflow: hidden;
  background: transparent;
}

/* ── Glass card ──────────────────────────────────────────────────── */
.card {
  position: relative;
  z-index: 2;
  width: min(100%, 23.5rem);
  padding: 2rem 2rem 1.85rem;
  border-radius: calc(var(--radius-xl) + 4px);
  border: 1px solid color-mix(in srgb, var(--border) 80%, var(--emerald-border));
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  backdrop-filter: blur(18px) saturate(1.2);
  -webkit-backdrop-filter: blur(18px) saturate(1.2);
  box-shadow:
    0 24px 64px color-mix(in srgb, var(--fg) 8%, transparent),
    0 0 0 1px color-mix(in srgb, #fff 6%, transparent) inset;
  transform: perspective(900px) rotateX(var(--tilt-x)) rotateY(var(--tilt-y));
  transition: transform 0.18s ease-out, box-shadow 0.25s ease;
  animation: card-in 0.75s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.card:hover {
  box-shadow:
    0 28px 72px color-mix(in srgb, var(--emerald) 12%, transparent),
    0 0 0 1px color-mix(in srgb, var(--emerald-border) 40%, transparent) inset;
}

.card-shine {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: radial-gradient(
    520px circle at calc(var(--mx) * 100%) calc(var(--my) * 100%),
    color-mix(in srgb, #fff 14%, transparent),
    transparent 42%
  );
  opacity: 0.7;
}

.head {
  position: relative;
  margin-bottom: 1.6rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.logo-wrap {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--emerald-dim) 70%, transparent);
  border: 1px solid var(--emerald-border);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--emerald) 15%, transparent);
  animation: logo-float 4s ease-in-out infinite;
}

.logo {
  width: 36px;
  height: 36px;
  object-fit: contain;
}

h1 {
  margin: 0;
  font-size: 1.28rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--fg);
  line-height: 1.25;
}

.subtitle {
  margin: 0;
  font-size: 0.82rem;
  color: var(--fg-subtle);
}

form {
  position: relative;
  display: grid;
  gap: 1rem;
}

.field {
  display: grid;
  gap: 0.35rem;
}

.label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--fg-muted);
  letter-spacing: 0.02em;
}

input {
  padding: 0.68rem 0.85rem;
  background: color-mix(in srgb, var(--input-bg) 90%, transparent);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--fg);
  font: inherit;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}
input::placeholder {
  color: var(--fg-subtle);
  opacity: 0.65;
}
input:hover {
  border-color: var(--border-hover);
}
input:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--emerald) 14%, transparent);
  background: color-mix(in srgb, var(--surface) 60%, var(--input-bg));
}
input.invalid {
  border-color: var(--red);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--red) 12%, transparent);
}

.field-error {
  color: var(--red);
  font-size: 0.78rem;
}

.shared-check {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: 0.1rem;
  cursor: pointer;
  user-select: none;
}
.shared-input {
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
.shared-mark {
  box-sizing: border-box;
  width: 20px;
  height: 20px;
  min-width: 20px;
  min-height: 20px;
  flex: 0 0 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--border-hover);
  border-radius: 50%;
  background: color-mix(in srgb, var(--input-bg) 92%, var(--surface));
  color: #fff;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
.shared-mark svg {
  width: 12px;
  height: 12px;
  display: block;
  opacity: 0;
  transform: scale(0.75);
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.shared-input:checked + .shared-mark {
  border-color: var(--emerald);
  background: var(--emerald);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--emerald) 40%, transparent);
}
.shared-input:checked + .shared-mark svg {
  opacity: 1;
  transform: scale(1);
}
.shared-input:focus-visible + .shared-mark {
  outline: 2px solid color-mix(in srgb, var(--emerald) 45%, transparent);
  outline-offset: 2px;
}
.shared-title {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--fg-muted);
  line-height: 1.3;
}

.alert {
  margin: 0;
  padding: 0.6rem 0.75rem;
  background: var(--red-dim);
  border: 1px solid var(--red-border);
  border-radius: var(--radius-md);
  color: var(--red);
  font-size: 0.85rem;
  animation: shake 0.45s ease;
}

.submit {
  position: relative;
  margin-top: 0.35rem;
  padding: 0.72rem;
  border: 0;
  border-radius: var(--radius-md);
  background: linear-gradient(
    135deg,
    var(--emerald) 0%,
    color-mix(in srgb, var(--emerald) 70%, var(--blue)) 100%
  );
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease;
  box-shadow: 0 10px 28px color-mix(in srgb, var(--emerald) 28%, transparent);
}
.submit::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    105deg,
    transparent 38%,
    color-mix(in srgb, #fff 35%, transparent) 50%,
    transparent 62%
  );
  transform: translateX(-120%);
  transition: transform 0.55s ease;
}
.submit:hover:not(:disabled) {
  filter: brightness(1.05);
  transform: translateY(-1px);
  box-shadow: 0 14px 32px color-mix(in srgb, var(--emerald) 34%, transparent);
}
.submit:hover:not(:disabled)::after {
  transform: translateX(120%);
}
.submit:active:not(:disabled) {
  transform: translateY(0);
}
.submit:disabled {
  opacity: 0.65;
  cursor: wait;
  box-shadow: none;
}

.submit-label {
  position: relative;
  z-index: 1;
}

@keyframes card-in {
  from {
    opacity: 0;
    transform: perspective(900px) translateY(28px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: perspective(900px) rotateX(var(--tilt-x)) rotateY(var(--tilt-y));
  }
}

@keyframes logo-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-4px); }
  40% { transform: translateX(4px); }
  60% { transform: translateX(-3px); }
  80% { transform: translateX(3px); }
}

@media (prefers-reduced-motion: reduce) {
  .logo-wrap,
  .card,
  .alert {
    animation: none !important;
    transition: none !important;
  }
  .card {
    transform: none !important;
  }
}
</style>
