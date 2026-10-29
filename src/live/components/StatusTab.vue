<script setup>
import { computed, ref } from 'vue'
import { live, locate, refreshConditions, refreshCenters, currentRisk } from '../liveStore.js'
import { ACTIONS } from '../risk.js'
import { WEATHER_SOURCE, FLOOD_SOURCE, ELEVATION_SOURCE } from '../api.js'
import { formatTime } from '../cache.js'
import SafetyBanner from './SafetyBanner.vue'
import DataStamp from './DataStamp.vue'

const risk = computed(() => currentRisk())
const action = computed(() => (risk.value ? ACTIONS[risk.value.level] : null))
const LEVELS = {
  low: { icon: '✓', label: 'Low' },
  moderate: { icon: '⚠', label: 'Moderate' },
  high: { icon: '⛔', label: 'High' },
}

async function useMyLocation() {
  if (await locate()) {
    refreshConditions()
    refreshCenters()
  }
}

// --- 24 h rain chart -------------------------------------------------------
const hours = computed(() => live.weather?.data?.hours ?? [])
const YELLOW = 7.5 // PAGASA yellow rainfall level, mm in 1 hour
const scaleMax = computed(() => Math.max(YELLOW * 1.3, ...hours.value.map((h) => h.mm)))
const hourLabel = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric' })
const hovered = ref(null)
</script>

<template>
  <div class="tab">
    <SafetyBanner />

    <!-- Location -->
    <section class="card">
      <div class="row">
        <div>
          <h2>Your location</h2>
          <p v-if="live.location" class="small muted">
            {{ live.location.lat.toFixed(4) }}, {{ live.location.lon.toFixed(4) }}
            <template v-if="live.location.source === 'gps'">· ±{{ Math.round(live.location.accuracy) }} m</template>
            <template v-else>· set on map</template>
            · {{ formatTime(live.location.time) }}
          </p>
          <p v-else class="small muted">Needed for local rain, river and evacuation centers.</p>
        </div>
        <button class="btn primary" :disabled="live.locating" @click="useMyLocation">
          {{ live.locating ? 'Locating…' : live.location ? 'Update' : 'Use my location' }}
        </button>
      </div>
      <p v-if="live.locationError" class="error small">{{ live.locationError }}</p>
    </section>

    <!-- Risk card -->
    <section v-if="risk" class="card risk" :class="risk.level" aria-live="polite">
      <div class="risk-head">
        <span class="risk-icon" aria-hidden="true">{{ LEVELS[risk.level].icon }}</span>
        <div>
          <div class="risk-label">Flood risk estimate: <b>{{ LEVELS[risk.level].label }}</b></div>
          <div class="risk-title">{{ action.title }}</div>
        </div>
      </div>
      <ol class="steps">
        <li v-for="s in action.steps" :key="s">{{ s }}</li>
      </ol>
      <p class="small disclaimer">
        Automated estimate, not an official warning.
        <template v-if="risk.partial"> Some data is missing, so the real risk may be higher.</template>
      </p>
      <div class="risk-actions">
        <button class="btn" @click="live.tab = 'centers'">🏫 Evacuation centers</button>
        <button class="btn" @click="live.tab = 'sos'">🆘 Emergency</button>
      </div>
    </section>
    <section v-else-if="live.location" class="card">
      <p>{{ live.conditionsLoading ? 'Checking rain, river and elevation…' : 'No data yet.' }}</p>
      <button v-if="!live.conditionsLoading" class="btn" @click="refreshConditions()">Load conditions</button>
    </section>

    <!-- What the estimate is based on -->
    <section v-if="risk" class="card">
      <div class="row">
        <h2>What this is based on</h2>
        <button class="btn small-btn" :disabled="live.conditionsLoading" @click="refreshConditions({ force: true })">
          {{ live.conditionsLoading ? 'Refreshing…' : '↻ Refresh' }}
        </button>
      </div>
      <p v-if="live.refreshNote" class="small muted">{{ live.refreshNote }}</p>
      <ul class="factors">
        <li v-for="f in risk.factors" :key="f.key">
          <div class="f-head">
            <span>{{ f.label }}</span>
            <b>{{ f.value }}</b>
          </div>
          <div class="small muted">{{ f.note }}</div>
        </li>
      </ul>

      <!-- 24 h rain: one series, PAGASA yellow threshold as a reference line -->
      <figure v-if="hours.length" class="rain">
        <figcaption>
          Hourly rain, next 24 h: <b>{{ live.weather.data.total24h.toFixed(0) }} mm</b> total, peak
          <b>{{ live.weather.data.maxHourly.toFixed(1) }} mm/h</b>
        </figcaption>
        <div class="plot" role="img" :aria-label="`Hourly rain forecast. Total ${live.weather.data.total24h.toFixed(0)} mm, peak ${live.weather.data.maxHourly.toFixed(1)} mm per hour.`">
          <div class="threshold" :style="{ bottom: (YELLOW / scaleMax) * 100 + '%' }">
            <span>7.5 mm/h PAGASA yellow</span>
          </div>
          <button
            v-for="(h, i) in hours"
            :key="h.time"
            class="bar-hit"
            :aria-label="`${hourLabel(h.time)}: ${h.mm.toFixed(1)} mm${h.probability != null ? `, ${h.probability}% chance` : ''}`"
            @mouseenter="hovered = i"
            @mouseleave="hovered = null"
            @focus="hovered = i"
            @blur="hovered = null"
          >
            <span class="bar" :style="{ height: Math.max(h.mm > 0 ? 3 : 0, (h.mm / scaleMax) * 100) + '%' }"></span>
          </button>
          <div v-if="hovered != null" class="tip" :style="{ left: Math.min(85, Math.max(15, ((hovered + 0.5) / hours.length) * 100)) + '%' }">
            <b>{{ hourLabel(hours[hovered].time) }}</b><br />
            {{ hours[hovered].mm.toFixed(1) }} mm
            <template v-if="hours[hovered].probability != null"><br />{{ hours[hovered].probability }}% chance</template>
          </div>
        </div>
        <div class="axis">
          <span>{{ hourLabel(hours[0].time) }}</span>
          <span>{{ hourLabel(hours[Math.floor(hours.length / 2)].time) }}</span>
          <span>{{ hourLabel(hours[hours.length - 1].time) }}</span>
        </div>
      </figure>

      <DataStamp :entry="live.weather" :source="WEATHER_SOURCE" />
      <DataStamp :entry="live.river" :source="FLOOD_SOURCE" />
      <DataStamp :entry="live.elevation" :source="ELEVATION_SOURCE" />
    </section>
  </div>
</template>

<style scoped>
.tab {
  display: grid;
  gap: 12px;
}
h2 {
  margin: 0;
  font-size: 1rem;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.row p {
  margin: 4px 0 0;
}
.risk {
  border: 2px solid;
}
.risk.low {
  border-color: #2fbf5a;
  background: #0d2a17;
}
.risk.moderate {
  border-color: #f2a516;
  background: #2e2108;
}
.risk.high {
  border-color: #ff4d4f;
  background: #3a0d0f;
}
.risk-head {
  display: flex;
  gap: 12px;
  align-items: center;
}
.risk-icon {
  width: 48px;
  height: 48px;
  flex: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  font-weight: 800;
  color: #fff;
}
.low .risk-icon {
  background: #1f8f42;
}
.moderate .risk-icon {
  background: #c27d00;
}
.high .risk-icon {
  background: #c81e22;
}
.risk-label {
  font-size: 0.85rem;
}
.risk-title {
  font-size: 1.1rem;
  font-weight: 700;
}
.steps {
  margin: 12px 0 0;
  padding-left: 20px;
  display: grid;
  gap: 6px;
}
.disclaimer {
  margin: 10px 0 0;
  opacity: 0.8;
}
.risk-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.risk-actions .btn {
  flex: 1 1 140px;
}
.factors {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.f-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 0.92rem;
}
.f-head b {
  text-align: right;
}
.rain {
  margin: 14px 0 4px;
}
figcaption {
  font-size: 0.85rem;
  margin-bottom: 8px;
}
.plot {
  position: relative;
  height: 90px;
  display: flex;
  align-items: flex-end;
  gap: 2px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.25);
}
.bar-hit {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: flex-end;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: default;
}
.bar-hit:focus-visible {
  outline: 2px solid var(--accent);
}
.bar {
  width: 100%;
  background: #4cc9f0;
  border-radius: 4px 4px 0 0;
}
.bar-hit:hover .bar,
.bar-hit:focus .bar {
  background: #8fe0f8;
}
.threshold {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px dashed rgba(255, 207, 92, 0.8);
  pointer-events: none;
}
.threshold span {
  position: absolute;
  right: 0;
  bottom: 2px;
  font-size: 0.65rem;
  color: #ffcf5c;
}
.tip {
  position: absolute;
  bottom: 100%;
  transform: translate(-50%, -6px);
  background: #0b1d2b;
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 0.72rem;
  white-space: nowrap;
  pointer-events: none;
  z-index: 2;
}
.axis {
  display: flex;
  justify-content: space-between;
  font-size: 0.68rem;
  opacity: 0.7;
  margin-top: 3px;
}
</style>
