<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{
  /** When true, the modal cannot be dismissed (forced change after first login). */
  forced?: boolean
}>()

const emit = defineEmits<{
  close: []
  changed: []
}>()

const auth = useAuthStore()

const form = reactive({
  current: '',
  next: '',
  confirm: '',
})

const submitting = ref(false)
const serverError = ref<string | null>(null)

const MIN_LEN = 8

const currentError = computed(() => (!form.current ? 'Current password is required' : ''))
const nextError = computed(() => {
  if (!form.next) return 'New password is required'
  if (form.next.length < MIN_LEN) return `Must be at least ${MIN_LEN} characters`
  return ''
})
const confirmError = computed(() => {
  if (!form.confirm) return 'Please confirm the new password'
  if (form.confirm !== form.next) return 'Passwords do not match'
  return ''
})

const isValid = computed(() => !currentError.value && !nextError.value && !confirmError.value)
const touched = ref(false)

async function onSubmit() {
  touched.value = true
  serverError.value = null
  if (!isValid.value) return

  submitting.value = true
  try {
    await auth.changePassword(form.current, form.next)
    emit('changed')
    if (!props.forced) emit('close')
  } catch (e) {
    serverError.value = e instanceof Error ? e.message : 'Failed to change password'
  } finally {
    submitting.value = false
  }
}

function onBackdrop() {
  if (!props.forced) emit('close')
}
</script>

<template>
  <div class="backdrop" @click.self="onBackdrop">
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="cpw-title">
      <header class="modal-head">
        <h2 id="cpw-title">Change password</h2>
        <button v-if="!forced" type="button" class="x" aria-label="Close" @click="emit('close')">
          ×
        </button>
      </header>

      <p v-if="forced" class="forced-note">
        You must set a new password before continuing.
      </p>

      <form novalidate @submit.prevent="onSubmit">
        <label class="field">
          <span class="label">Current password</span>
          <input v-model="form.current" type="password" autocomplete="current-password" />
          <span v-if="touched && currentError" class="field-error">{{ currentError }}</span>
        </label>

        <label class="field">
          <span class="label">New password</span>
          <input v-model="form.next" type="password" autocomplete="new-password" />
          <span v-if="touched && nextError" class="field-error">{{ nextError }}</span>
        </label>

        <label class="field">
          <span class="label">Confirm new password</span>
          <input v-model="form.confirm" type="password" autocomplete="new-password" />
          <span v-if="touched && confirmError" class="field-error">{{ confirmError }}</span>
        </label>

        <p v-if="serverError" class="alert" role="alert">{{ serverError }}</p>

        <div class="actions">
          <button
            v-if="!forced"
            type="button"
            class="secondary"
            @click="emit('close')"
          >
            Cancel
          </button>
          <button type="submit" :disabled="submitting">
            {{ submitting ? 'Saving…' : 'Update password' }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: var(--overlay);
  backdrop-filter: blur(3px);
  display: grid;
  place-items: center;
  padding: 1.5rem;
  z-index: 320;
}
.modal {
  width: min(100%, 25rem);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 1.5rem;
  box-shadow: var(--shadow);
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}
h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--fg);
}
.x {
  border: 0;
  background: transparent;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  color: var(--fg-subtle);
  transition: color 0.15s;
}
.x:hover { color: var(--fg); }
.forced-note {
  margin: 0 0 1rem;
  padding: 0.55rem 0.75rem;
  background: var(--amber-dim);
  border: 1px solid var(--amber-border);
  border-radius: var(--radius-md);
  color: var(--amber);
  font-size: 0.85rem;
}
form {
  display: grid;
  gap: 1rem;
}
.field {
  display: grid;
  gap: 0.35rem;
}
.label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--fg-muted);
}
input {
  padding: 0.6rem 0.75rem;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--fg);
  font: inherit;
  outline: none;
  transition: border-color 0.15s;
}
input:focus {
  border-color: var(--border-focus);
}
.field-error {
  color: var(--red);
  font-size: 0.78rem;
}
.alert {
  margin: 0;
  padding: 0.6rem 0.75rem;
  background: var(--red-dim);
  border: 1px solid var(--red-border);
  border-radius: var(--radius-md);
  color: var(--red);
  font-size: 0.85rem;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
}
button {
  padding: 0.6rem 1.1rem;
  border: 0;
  border-radius: var(--radius-md);
  background: var(--emerald);
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
button:hover:not(:disabled) { background: var(--emerald-hover); }
button:disabled {
  opacity: 0.6;
  cursor: wait;
}
.secondary {
  background: var(--surface-3);
  color: var(--fg);
}
.secondary:hover { background: var(--surface-3); filter: brightness(1.1); }
</style>
