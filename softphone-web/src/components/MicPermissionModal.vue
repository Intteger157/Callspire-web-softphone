<script setup lang="ts">
defineProps<{
  blocked: boolean
  trying?: boolean
  note?: string
}>()

const emit = defineEmits<{ close: []; retry: [] }>()
</script>

<template>
  <Teleport to="body">
    <div class="backdrop" @click.self="emit('close')">
      <div class="modal" role="dialog" aria-modal="true" aria-label="Microphone access">

        <div class="header">
          <h2 class="title">Allow microphone access</h2>
          <button type="button" class="close-btn" aria-label="Close" @click="emit('close')">✕</button>
        </div>

        <p class="lead">
          The softphone needs your microphone for calls.
          <strong>A web page cannot open browser settings automatically</strong> — you must allow access yourself.
        </p>

        <div v-if="blocked" class="steps blocked">
          <p class="steps-title">Microphone is blocked for this site</p>
          <ol>
            <li>Click the <strong>tune / lock icon</strong> to the left of the address bar (where the URL is).</li>
            <li>Open <strong>Site settings</strong> (or click the blocked microphone icon).</li>
            <li>Set <strong>Microphone</strong> to <strong>Allow</strong>.</li>
            <li><strong>Reload this page</strong>, then click Enable sound again.</li>
          </ol>
        </div>

        <div v-else class="steps">
          <p class="steps-title">First time?</p>
          <ol>
            <li>Click <strong>Try again</strong> below.</li>
            <li>When the browser asks, click <strong>Allow</strong> in the prompt near the address bar.</li>
          </ol>
        </div>

        <div v-if="note" class="note" role="status">{{ note }}</div>

        <div class="footer">
          <button type="button" class="btn secondary" @click="emit('close')">Close</button>
          <button
            v-if="!blocked"
            type="button"
            class="btn primary"
            :disabled="trying"
            @click="emit('retry')"
          >
            {{ trying ? 'Requesting…' : 'Try again' }}
          </button>
          <button
            v-else
            type="button"
            class="btn primary"
            :disabled="trying"
            @click="emit('retry')"
          >
            {{ trying ? 'Checking…' : 'Check again' }}
          </button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 320;
  background: var(--overlay);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  width: 100%;
  max-width: 460px;
  box-shadow: var(--shadow);
  padding-bottom: 1.25rem;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem 0;
}

.title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--fg);
}

.close-btn {
  background: none;
  border: none;
  font-size: 1rem;
  color: var(--fg-subtle);
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius-sm);
  transition: color 0.15s, background 0.15s;
}
.close-btn:hover { color: var(--fg); background: var(--surface-2); }

.lead {
  margin: 0.85rem 1.5rem 0;
  font-size: 0.88rem;
  line-height: 1.55;
  color: var(--fg-muted);
}
.lead strong { color: var(--fg); font-weight: 600; }

.steps {
  margin: 1rem 1.5rem 0;
  padding: 0.85rem 1rem;
  border-radius: var(--radius-md);
  background: var(--surface-2);
  border: 1px solid var(--border);
}
.steps.blocked {
  background: var(--red-dim);
  border-color: var(--red-border);
}
.steps-title {
  margin: 0 0 0.5rem;
  font-size: 0.82rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--fg-subtle);
}
.steps.blocked .steps-title { color: var(--red); }

.steps ol {
  margin: 0;
  padding-left: 1.2rem;
  font-size: 0.86rem;
  line-height: 1.55;
  color: var(--fg-muted);
}
.steps li + li { margin-top: 0.35rem; }
.steps strong { color: var(--fg); font-weight: 600; }

.note {
  margin: 0.85rem 1.5rem 0;
  padding: 0.6rem 0.85rem;
  border-radius: var(--radius-md);
  background: var(--amber-dim);
  border: 1px solid var(--amber-border);
  color: var(--amber);
  font-size: 0.84rem;
  line-height: 1.45;
}

.footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 1.25rem 1.5rem 0;
}

.btn {
  padding: 0.55rem 1.1rem;
  border-radius: var(--radius-md);
  font-size: 0.88rem;
  font-weight: 600;
  font-family: var(--font-ui);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.btn.secondary {
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--fg-muted);
}
.btn.secondary:hover { background: var(--surface-3); color: var(--fg); }
.btn.primary {
  background: var(--emerald);
  border: none;
  color: #fff;
}
.btn.primary:hover:not(:disabled) { background: var(--emerald-hover); }
.btn.primary:disabled { opacity: 0.65; cursor: wait; }
</style>
