<script setup>
import { computed, onMounted, ref } from 'vue'
import { live, refreshConditions, refreshCenters, loadContacts, checkConnection, refreshFloodReports } from './liveStore.js'
import { requestCompassPermission } from './compass.js'
import { formatTime } from './cache.js'
import SafetyBanner from './components/SafetyBanner.vue'
import StatusTab from './components/StatusTab.vue'
import CentersTab from './components/CentersTab.vue'
import SosTab from './components/SosTab.vue'
import ChecklistTab from './components/ChecklistTab.vue'
import GuideView from './components/GuideView.vue'
import ReportsBanner from './components/ReportsBanner.vue'
import About from '../components/About.vue'

const emit = defineEmits(['exit'])

const TABS = [
  { id: 'status', icon: '🌧️', label: 'Status' },
  { id: 'centers', icon: '🏫', label: 'Centers' },
  { id: 'sos', icon: '🆘', label: 'Emergency' },
  { id: 'checklist', icon: '✅', label: 'Checklist' },
]

const compassPermission = ref('not-required')

// Oldest "last updated" among the data on screen, for the offline notice.
const lastUpdated = computed(() => {
  const times = [live.weather, live.river, live.elevation, live.osmCenters]
    .map((e) => e?.fetchedAt)
    .filter(Boolean)
  return times.length ? Math.min(...times) : null
})

onMounted(async () => {
  loadContacts()
  refreshFloodReports()
  // Cached data shows immediately; refresh in the background if we have a connection.
  if ((await checkConnection()) && live.location) {
    refreshConditions()
    refreshCenters()
  }
})

// Called from a tap: iOS only allows the motion-permission prompt in a user gesture.
async function openGuide() {
  compassPermission.value = await requestCompassPermission()
  live.guideOpen = true
}
</script>

<template>
  <div class="live">
    <header class="head">
      <button class="back" aria-label="Back to training" @click="emit('exit')">←</button>
      <div class="title">
        <b>Live Flood Mode</b>
        <span v-if="!live.online" class="offline">● Offline / no connection: last updated {{ formatTime(lastUpdated) }}</span>
        <span v-else class="online">● Online</span>
      </div>
      <button class="info" :class="{ active: live.tab === 'about' }" aria-label="About and data sources" @click="live.tab = live.tab === 'about' ? 'status' : 'about'">ⓘ</button>
    </header>
    <SafetyBanner v-if="live.tab !== 'status'" compact />
    <ReportsBanner />

    <main class="content">
      <StatusTab v-if="live.tab === 'status'" />
      <CentersTab v-else-if="live.tab === 'centers'" @guide="openGuide" />
      <SosTab v-else-if="live.tab === 'sos'" />
      <ChecklistTab v-else-if="live.tab === 'checklist'" />
      <About v-else-if="live.tab === 'about'" embedded class="card" />
    </main>

    <nav class="tabs" aria-label="Live Mode sections">
      <button
        v-for="t in TABS"
        :key="t.id"
        :class="{ active: live.tab === t.id }"
        :aria-current="live.tab === t.id ? 'page' : null"
        @click="live.tab = t.id"
      >
        <span aria-hidden="true">{{ t.icon }}</span>
        {{ t.label }}
      </button>
    </nav>

    <GuideView v-if="live.guideOpen" :compass-permission="compassPermission" @close="live.guideOpen = false" />
  </div>
</template>

<style scoped>
.live {
  position: fixed;
  inset: 0;
  z-index: 20000;
  display: flex;
  flex-direction: column;
  background: #08141d;
  color: var(--text);
}
.head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: calc(8px + env(safe-area-inset-top)) 12px 8px;
  background: #0b2a3f;
}
.back {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: transparent;
  color: inherit;
  font-size: 1.2rem;
  cursor: pointer;
}
.info {
  margin-left: auto;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: transparent;
  color: inherit;
  font-size: 1.1rem;
  cursor: pointer;
}
.info.active {
  background: rgba(76, 201, 240, 0.25);
}
.title {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.offline {
  color: #ffcf5c;
  font-size: 0.78rem;
}
.online {
  color: #5dff8a;
  font-size: 0.78rem;
}
.content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  -webkit-overflow-scrolling: touch;
}
.content > * {
  max-width: 720px;
  margin: 0 auto;
}
.tabs {
  display: flex;
  background: #0b2a3f;
  padding-bottom: env(safe-area-inset-bottom);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
.tabs button {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 4px;
  background: none;
  border: 0;
  color: rgba(255, 255, 255, 0.7);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}
.tabs button span {
  font-size: 1.3rem;
}
.tabs button.active {
  color: #fff;
  background: rgba(76, 201, 240, 0.15);
  box-shadow: inset 0 3px 0 var(--accent);
}
.live :deep(.card) {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 14px;
}
</style>
