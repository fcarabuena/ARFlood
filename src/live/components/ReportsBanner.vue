<script setup>
import { computed } from 'vue'
import { live, reportsNearMe } from '../liveStore.js'
import { formatAge } from '../cache.js'
import { formatDistance } from '../geo.js'

const near = computed(() => reportsNearMe())
const first = computed(() => near.value[0])
</script>

<template>
  <div v-if="first" class="reports-banner" role="alert">
    <span class="icon" aria-hidden="true">🌊</span>
    <div class="text">
      <b>Flooding reported near you:</b>
      {{ first.place.name }}
      <span class="muted">
        ({{ first.confidence === 'high' ? 'official PAGASA advisory' : first.source }},
        {{ formatAge(Date.parse(first.publishedAt)) }}{{ first.distance > 0 ? `, ${formatDistance(first.distance)} away` : ', your area' }})
      </span>
      <template v-if="near.length > 1"> and {{ near.length - 1 }} more</template>.
      <span class="small">Reports may be incomplete or outdated. Always follow official advisories.</span>
    </div>
    <button v-if="live.tab !== 'centers'" class="btn small-btn" @click="live.tab = 'centers'">Map</button>
  </div>
</template>

<style scoped>
.reports-banner {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 8px 12px;
  background: #5c0f13;
  border-bottom: 1px solid #ff4d4f;
  color: #ffe3e3;
  font-size: 0.85rem;
  line-height: 1.35;
}
.icon {
  font-size: 1.2rem;
}
.text {
  flex: 1;
}
.muted {
  opacity: 0.8;
}
.small {
  display: block;
  font-size: 0.75rem;
  opacity: 0.85;
  margin-top: 2px;
}
.small-btn {
  padding: 5px 10px;
  flex: none;
}
</style>
