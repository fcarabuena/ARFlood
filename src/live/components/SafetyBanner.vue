<script setup>
import { computed } from 'vue'
import { live } from '../liveStore.js'

defineProps({ compact: { type: Boolean, default: false } })

const lgu = computed(() => live.contacts?.data?.lguAdvisory)
</script>

<template>
  <aside class="banner" :class="{ compact }" role="note" aria-label="Safety notice">
    <span class="icon" aria-hidden="true">⚠️</span>
    <div>
      <strong>This app does not replace official warnings.</strong>
      <template v-if="!compact">
        Its risk level is an automated estimate from weather models. Always follow PAGASA, NDRRMC
        and your LGU / barangay. If authorities tell you to evacuate, go, even if this app shows low risk.
      </template>
      <span class="links">
        <a href="https://www.pagasa.dost.gov.ph/flood" target="_blank" rel="noopener">PAGASA flood info</a>
        <a href="https://www.pagasa.dost.gov.ph/weather" target="_blank" rel="noopener">PAGASA weather</a>
        <a href="https://ndrrmc.gov.ph/" target="_blank" rel="noopener">NDRRMC</a>
        <a v-if="lgu?.url" :href="lgu.url" target="_blank" rel="noopener">{{ lgu.label || 'LGU advisories' }}</a>
        <span v-else-if="!compact" class="muted">LGU: check your city/municipality DRRMO page</span>
      </span>
    </div>
  </aside>
</template>

<style scoped>
.banner {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  background: #3a2a05;
  border: 1px solid #b8860b;
  color: #fff3cd;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 0.88rem;
  line-height: 1.4;
}
.banner.compact {
  border-radius: 0;
  border-width: 0 0 1px;
  padding: 6px 12px;
  font-size: 0.78rem;
}
.icon {
  font-size: 1.2rem;
  line-height: 1.2;
}
.compact .icon {
  font-size: 1rem;
}
.links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 4px;
}
.compact .links {
  display: inline-flex;
  margin: 0 0 0 6px;
}
a {
  color: #ffd76a;
  font-weight: 600;
}
</style>
