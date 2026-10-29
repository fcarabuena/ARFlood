<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { live, refreshCenters, centersList, chooseCenter, setLocation, refreshAllSoon } from '../liveStore.js'
import { OSM_SOURCE, SNAPSHOT_SOURCE } from '../api.js'
import { formatDistance, formatDuration } from '../geo.js'
import { formatTime } from '../cache.js'
import DataStamp from './DataStamp.vue'

const emit = defineEmits(['guide'])

const mapEl = ref(null)
let map = null
let layers = null
const centers = computed(() => centersList())
const verifiedCount = computed(() => centers.value.filter((c) => c.verified).length)
const route = computed(() => live.route?.data ?? null)
const routeIsForSelected = computed(
  () => route.value && live.selected && route.value.to.lat === live.selected.lat && route.value.to.lon === live.selected.lon
)
const LOCAL_SOURCE = { name: 'Verified local list (evac-centers.json)', url: `${import.meta.env.BASE_URL}evac-centers.json` }

const snapshotInfo = computed(() => {
  const s = live.snapshot?.data
  if (!s?.centers?.length) return null
  return {
    date: s.fetchedAt ? new Date(s.fetchedAt).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) : 'unknown date',
    area: s.area?.name || 'bundled area',
    count: s.centers.length,
  }
})
const sourceLabel = (c) =>
  c.verified ? '' : c.origin === 'snapshot' ? `OpenStreetMap snapshot, ${snapshotInfo.value?.date}` : 'OpenStreetMap (live)'

const COLORS = { verified: '#2fbf5a', school: '#4cc9f0', shelter: '#f2a516', assembly: '#c084fc', other: '#9aa5b1' }

function draw() {
  if (!map) return
  layers.clearLayers()
  const loc = live.location
  if (loc) {
    L.circle([loc.lat, loc.lon], { radius: Math.min(loc.accuracy || 30, 300), color: '#2b8cff', weight: 1, fillOpacity: 0.1 }).addTo(layers)
    L.circleMarker([loc.lat, loc.lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#2b8cff', fillOpacity: 1 })
      .bindTooltip('You')
      .addTo(layers)
  }
  for (const c of centers.value) {
    const selected = live.selected?.id === c.id
    L.circleMarker([c.lat, c.lon], {
      radius: selected ? 10 : c.verified ? 8 : 6,
      color: selected ? '#fff' : '#0b1d2b',
      weight: selected ? 3 : 1.5,
      fillColor: COLORS[c.kind] || COLORS.other,
      fillOpacity: 0.95,
      bubblingMouseEvents: false, // a marker tap must not also set the location
    })
      .bindTooltip(`${c.verified ? '✔ ' : ''}${c.name}`)
      .on('click', () => select(c))
      .addTo(layers)
  }
  if (routeIsForSelected.value) {
    L.polyline(route.value.coords.map((p) => [p.lat, p.lon]), {
      color: route.value.straight ? '#f2a516' : '#2fbf5a',
      weight: 5,
      opacity: 0.9,
      dashArray: route.value.straight ? '8 8' : null,
    }).addTo(layers)
  }
}

function fit() {
  if (!map) return
  const pts = []
  if (live.location) pts.push([live.location.lat, live.location.lon])
  if (routeIsForSelected.value) route.value.coords.forEach((p) => pts.push([p.lat, p.lon]))
  else centers.value.slice(0, 6).forEach((c) => pts.push([c.lat, c.lon]))
  if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30], maxZoom: 16 })
  else if (pts.length) map.setView(pts[0], 15)
}

onMounted(() => {
  map = L.map(mapEl.value, { zoomControl: true, attributionControl: true }).setView([12.88, 121.77], 5) // Philippines
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map)
  layers = L.layerGroup().addTo(map)
  // Without GPS, the user can tap the map to set their location.
  map.on('click', (e) => {
    if (live.location && !settingLocation.value) return
    setLocation({ lat: e.latlng.lat, lon: e.latlng.lng, accuracy: 50, time: Date.now(), source: 'map' })
    settingLocation.value = false
    refreshAllSoon() // debounced: several quick taps send one set of requests
  })
  draw()
  fit()
  refreshCenters() // reuses cached results while fresh (see POLICY in liveStore.js)
})

onBeforeUnmount(() => {
  map?.remove()
  map = null
})

watch([centers, () => live.selected, route], () => draw())
watch(() => live.location, () => { draw(); fit() })
watch(route, () => fit())

const settingLocation = ref(false)

async function select(c) {
  await chooseCenter(c)
  fit()
}

function openGuide(c) {
  if (live.selected?.id !== c.id) chooseCenter(c)
  emit('guide')
}
</script>

<template>
  <div class="tab">
    <div class="map-wrap">
      <div ref="mapEl" class="map" role="application" aria-label="Map of evacuation centers"></div>
      <div v-if="!live.location || settingLocation" class="map-hint">Tap the map to set your location</div>
    </div>

    <div class="legend small">
      <span><i :style="{ background: COLORS.verified }"></i>Verified</span>
      <span><i :style="{ background: COLORS.school }"></i>School</span>
      <span><i :style="{ background: COLORS.shelter }"></i>Shelter</span>
      <span><i :style="{ background: COLORS.assembly }"></i>Assembly point</span>
      <button class="link" @click="settingLocation = !settingLocation">{{ settingLocation ? 'Cancel' : 'Set location on map' }}</button>
    </div>

    <!-- Route summary -->
    <section v-if="live.selected" class="card route">
      <div class="row">
        <div>
          <div class="small muted">Route to</div>
          <b>{{ live.selected.name }}</b>
        </div>
        <button class="btn primary" @click="emit('guide')">🧭 AR Guide</button>
      </div>
      <p v-if="live.routeLoading" class="small">Finding a walking route…</p>
      <template v-else-if="routeIsForSelected">
        <p class="route-stats">
          🚶 {{ formatDistance(route.distance) }} · about {{ formatDuration(route.duration) }} walking
        </p>
        <p class="small muted">
          Route: {{ route.source }} · {{ formatTime(live.route.fetchedAt) }}
          <span v-if="live.route.stale" class="warn">(saved route, could not refresh)</span>
        </p>
        <p v-if="route.straight" class="warn small">
          Straight line only: the real path is longer. Follow roads on high ground.
        </p>
      </template>
      <p class="danger small">
        ⛔ Never walk or drive through floodwater. If a street on the route is flooded, turn back and take another way.
      </p>
    </section>

    <!-- List -->
    <section class="card">
      <div class="row">
        <h2>Nearby evacuation centers</h2>
        <button class="btn small-btn" :disabled="live.centersLoading" @click="refreshCenters({ force: true })">
          {{ live.centersLoading ? 'Loading…' : '↻ Refresh' }}
        </button>
      </div>
      <p v-if="!live.location" class="small muted">Set your location to see distances and nearby OpenStreetMap places.</p>
      <p v-if="live.localCenters?.data?.issues?.length" class="warn small">
        ⚠ evac-centers.json has {{ live.localCenters.data.issues.length }} problem(s):
        {{ live.localCenters.data.issues[0] }} (details in the browser console)
      </p>
      <p v-if="live.liveSearchSkipped && snapshotInfo" class="small muted">
        Using the bundled OpenStreetMap snapshot of {{ snapshotInfo.area }} ({{ snapshotInfo.date }}). Tap ↻ Refresh to also
        search OpenStreetMap live.
      </p>
      <p v-if="live.centersError" class="warn small">
        {{ live.centersError }}. Showing {{ snapshotInfo ? 'verified and snapshot' : 'saved and verified' }} centers only.
      </p>
      <p v-if="!verifiedCount" class="small muted">
        No verified centers configured yet. Ask your barangay/LGU for the official evacuation centers and add them to
        <code>evac-centers.json</code>.
      </p>

      <ul class="list">
        <li v-for="c in centers.slice(0, 30)" :key="c.id" :class="{ selected: live.selected?.id === c.id }">
          <button class="pick" @click="select(c)">
            <span class="dot" :style="{ background: COLORS[c.kind] || COLORS.other }"></span>
            <span class="info">
              <b>{{ c.name }}</b>
              <span class="small muted">
                <span v-if="c.verified" class="badge">✔ Verified</span>
                <template v-if="!c.verified">{{ c.label }} · <i>{{ sourceLabel(c) }}</i></template>
                <template v-if="c.address"> · {{ c.address }}</template>
                <template v-if="c.capacity"> · capacity {{ c.capacity }}</template>
              </span>
              <span v-if="c.notes" class="small">{{ c.notes }}</span>
            </span>
            <span class="dist">{{ formatDistance(c.distance) }}</span>
          </button>
          <div class="item-actions">
            <a v-if="c.contact" class="btn small-btn" :href="`tel:${c.contact.replace(/\s/g, '')}`">📞 Call</a>
            <button class="btn small-btn" @click="openGuide(c)">🧭 Guide me</button>
            <a v-if="c.osmUrl" class="small muted" :href="c.osmUrl" target="_blank" rel="noopener">OSM</a>
          </div>
        </li>
      </ul>
      <p v-if="!centers.length && !live.centersLoading" class="small muted">No centers found nearby.</p>
      <p class="small muted">
        Places from OpenStreetMap are not confirmed evacuation centers. Schools and shelters are often used, but
        check with your LGU.
      </p>
      <DataStamp :entry="live.localCenters" :source="LOCAL_SOURCE" />
      <p v-if="snapshotInfo" class="stamp small">
        Source: <a :href="SNAPSHOT_SOURCE.url" target="_blank" rel="noopener">{{ SNAPSHOT_SOURCE.name }}</a> ·
        {{ snapshotInfo.area }} · {{ snapshotInfo.count }} places · fetched {{ snapshotInfo.date }} · bundled, works offline
      </p>
      <DataStamp v-if="live.osmCenters?.data" :entry="live.osmCenters" :source="OSM_SOURCE" />
    </section>
  </div>
</template>

<style scoped>
.tab {
  display: grid;
  gap: 12px;
}
.map-wrap {
  position: relative;
}
.map {
  height: 46vh;
  min-height: 260px;
  border-radius: 14px;
  overflow: hidden;
  background: #1b2833;
}
.map-hint {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.75);
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.8rem;
  z-index: 500;
  pointer-events: none;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  align-items: center;
}
.legend i {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 5px;
  vertical-align: -1px;
}
.link {
  background: none;
  border: 0;
  color: var(--accent);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
  margin-left: auto;
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
.route-stats {
  font-size: 1.05rem;
  font-weight: 600;
  margin: 8px 0 2px;
}
.route p {
  margin: 6px 0 0;
}
.warn {
  color: #ffcf5c;
}
.danger {
  color: #ff9a9c;
  font-weight: 600;
}
.list {
  list-style: none;
  margin: 10px 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.list li {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  padding: 8px 10px;
  border: 1px solid transparent;
}
.list li.selected {
  border-color: var(--accent);
}
.pick {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  width: 100%;
  background: none;
  border: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  padding: 0;
  cursor: pointer;
}
.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-top: 4px;
  flex: none;
}
.info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dist {
  font-weight: 700;
  white-space: nowrap;
}
.badge {
  color: #5dff8a;
  font-weight: 700;
  margin-right: 4px;
}
.item-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 6px 0 0 22px;
}
.stamp {
  margin: 6px 0 0;
  opacity: 0.8;
  font-size: 0.72rem;
}
.stamp a {
  color: inherit;
}
.small-btn {
  padding: 5px 10px;
  font-size: 0.85rem;
  text-decoration: none;
}
code {
  font-size: 0.8rem;
}
</style>
