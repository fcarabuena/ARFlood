<script setup>
import { computed } from 'vue'
import { formatTime, formatAge } from '../cache.js'
import { formatDistance } from '../geo.js'
import { live, dataDistance } from '../liveStore.js'

const props = defineProps({
  entry: { type: Object, default: null }, // { data, fetchedAt, stale, error }
  source: { type: Object, required: true }, // { name, url }
})

const away = computed(() => dataDistance(props.entry))
</script>

<template>
  <p class="stamp">
    Source:
    <a :href="source.url" target="_blank" rel="noopener">{{ source.name }}</a>
    · Updated {{ formatTime(entry?.fetchedAt) }}
    <span v-if="entry?.fetchedAt">({{ formatAge(entry.fetchedAt) }})</span>
    <span v-if="entry?.stale && entry?.fetchedAt" class="warn">
      · {{ live.online ? 'Could not refresh' : 'Offline' }}: showing last saved data
    </span>
    <span v-else-if="entry?.error" class="warn"> · Unavailable: {{ entry.error }}</span>
    <span v-if="away > 2000" class="warn"> · For a place {{ formatDistance(away) }} from you</span>
  </p>
</template>

<style scoped>
.stamp {
  margin: 6px 0 0;
  font-size: 0.72rem;
  opacity: 0.8;
  line-height: 1.4;
}
a {
  color: inherit;
}
.warn {
  color: #ffcf5c;
  opacity: 1;
}
</style>
