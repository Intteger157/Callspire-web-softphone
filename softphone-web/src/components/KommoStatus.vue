<script setup lang="ts">
import { computed } from 'vue'
import { useKommoStore } from '@/stores/kommo'

const kommo = useKommoStore()

type Variant = 'ok' | 'partial' | 'warn' | 'excluded' | 'hidden'

const variant = computed((): Variant => {
  const s = kommo.status
  if (!s || !s.enabled) return 'hidden'

  if (s.excluded) return 'excluded'

  if (!s.available) {
    return s.authorized && s.needs_reauthorize ? 'warn' : 'warn'
  }

  if (kommo.isConnected) {
    return kommo.isUserMapped ? 'ok' : 'partial'
  }

  return 'warn'
})

const label = computed((): string => {
  switch (variant.value) {
    case 'ok':
    case 'partial':
    case 'warn':
    case 'excluded':
      return 'CRM'
    default:
      return ''
  }
})

const tooltip = computed((): string => {
  const s = kommo.status
  if (!s) return ''

  if (s.excluded) {
    return 'Kommo: this extension is not linked to amoCRM. Contact your administrator.'
  }
  if (!s.authorized) {
    return 'Kommo: gateway not authorized — ask admin to connect Kommo OAuth.'
  }
  if (s.needs_reauthorize) {
    return 'Kommo: authorization expired — ask admin to re-authorize Kommo.'
  }
  if (!s.available && s.error) {
    return `Kommo unavailable: ${s.error}`
  }
  if (!s.available) {
    return 'Kommo integration is unavailable right now.'
  }
  if (kommo.isConnected && !kommo.isUserMapped) {
    return 'Kommo connected, but your SIP extension is not mapped to a Kommo user.'
  }
  if (kommo.isConnected && kommo.isUserMapped) {
    const name = kommo.kommoUserName
    return name ? `CRM synced · ${name}` : 'CRM synced'
  }
  return ''
})
</script>

<template>
  <span
    v-if="variant !== 'hidden'"
    class="badge"
    :class="variant"
    :title="tooltip"
    role="status"
    :aria-label="tooltip || 'CRM status'"
  >
    <span class="dot" />
    <span class="text">{{ label }}</span>
    <svg
      v-if="variant === 'warn' || variant === 'excluded'"
      class="icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      width="11"
      height="11"
      aria-hidden="true"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
    </svg>
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.28rem 0.62rem;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: default;
  user-select: none;
  white-space: nowrap;
  border: 1px solid transparent;
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.04);
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.text { line-height: 1; }
.icon { flex-shrink: 0; }

.badge.ok {
  background: var(--emerald-dim);
  color: var(--emerald);
  border-color: var(--emerald-border);
}
.badge.ok .dot {
  background: var(--emerald);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--emerald) 24%, transparent);
}

.badge.partial {
  background: var(--amber-dim);
  color: var(--amber);
  border-color: var(--amber-border);
}
.badge.partial .dot {
  background: var(--amber);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--amber) 22%, transparent);
}

.badge.warn {
  background: var(--amber-dim);
  color: var(--amber);
  border-color: var(--amber-border);
}
.badge.warn .dot {
  background: var(--amber);
}

.badge.excluded {
  background: var(--red-dim);
  color: var(--red);
  border-color: var(--red-border);
}
.badge.excluded .dot {
  background: var(--red);
}
</style>
