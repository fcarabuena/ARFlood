<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { live, setLocation, chooseCenter } from '../liveStore.js'
import { watchPosition, distance, bearing, formatDistance, compassPoint } from '../geo.js'
import { watchCompass } from '../compass.js'

const props = defineProps({ compassPermission: { type: String, default: 'not-required' } })
const emit = defineEmits(['close'])

const video = ref(null)
const cameraError = ref('')
const gpsError = ref('')
const pos = ref(live.location?.source === 'gps' ? live.location : null)
const heading = ref(null)
const compassState = ref('waiting') // waiting | ok | unavailable | denied

let stream = null
let stopGps = null
let stopCompass = null
let wakeLock = null

const center = computed(() => live.selected)
const routeCoords = computed(() => {
  const r = live.route?.data
  if (!r || r.straight || !center.value) return null
  if (r.to.lat !== center.value.lat || r.to.lon !== center.value.lon) return null
  return r.coords
})

/** Nearest route vertex, the next waypoint ≥ 20 m ahead, and remaining distance. */
const guidance = computed(() => {
  const p = pos.value
  const c = center.value
  if (!p || !c) return null
  const direct = distance(p, c)
  const coords = routeCoords.value
  if (!coords || coords.length < 2) {
    return { target: c, remaining: direct, offRoute: false, nextIn: direct, direct }
  }
  let nearest = 0
  let best = Infinity
  coords.forEach((q, i) => {
    const d = distance(p, q)
    if (d < best) {
      best = d
      nearest = i
    }
  })
  let j = nearest
  while (j < coords.length - 1 && distance(p, coords[j]) < 20) j++
  let remaining = distance(p, coords[j])
  for (let k = j; k < coords.length - 1; k++) remaining += distance(coords[k], coords[k + 1])
  return { target: coords[j], remaining, offRoute: best > 60, nextIn: distance(p, coords[j]), direct }
})

const targetBearing = computed(() => (guidance.value ? bearing(pos.value, guidance.value.target) : null))
const usingNorthUp = computed(() => heading.value == null)
// Arrow rotation: relative to where the phone points, or to north if there is no heading.
const arrowAngle = computed(() => {
  if (targetBearing.value == null) return 0
  return targetBearing.value - (heading.value ?? 0)
})
const arrived = computed(() => guidance.value && guidance.value.direct < 30)
const turnHint = computed(() => {
  const a = ((arrowAngle.value % 360) + 540) % 360 - 180 // -180..180
  if (Math.abs(a) < 20) return 'Straight ahead'
  if (Math.abs(a) > 150) return 'Turn around'
  return a > 0 ? `Turn right ${Math.round(a)}°` : `Turn left ${Math.round(-a)}°`
})

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    })
    video.value.srcObject = stream
    await video.value.play().catch(() => {})
  } catch (err) {
    cameraError.value = err?.name === 'NotAllowedError' ? 'Camera permission denied: the arrow still works.' : 'Camera unavailable: the arrow still works.'
  }
}

onMounted(async () => {
  startCamera()
  stopGps = watchPosition(
    (p) => {
      pos.value = p
      gpsError.value = ''
      // Without a compass, use the GPS direction of travel while walking.
      if (compassState.value !== 'ok' && p.heading != null && !isNaN(p.heading) && (p.speed ?? 0) > 0.7) {
        heading.value = p.heading
      }
    },
    (err) => (gpsError.value = err.message)
  )
  stopCompass = watchCompass(
    (h) => {
      heading.value = h
      compassState.value = 'ok'
    },
    () => {
      if (compassState.value !== 'ok') compassState.value = props.compassPermission === 'denied' ? 'denied' : 'unavailable'
    }
  )
  try {
    wakeLock = await navigator.wakeLock?.request('screen')
  } catch {
    // keeping the screen on is optional
  }
})

onBeforeUnmount(() => {
  stream?.getTracks().forEach((t) => t.stop())
  stopGps?.()
  stopCompass?.()
  wakeLock?.release?.().catch(() => {})
  if (pos.value) setLocation({ ...pos.value, source: 'gps' })
})

function recalculate() {
  if (!pos.value || !center.value) return
  setLocation({ ...pos.value, source: 'gps' })
  chooseCenter(center.value, { recalculate: true })
}
</script>

<template>
  <div class="guide" role="dialog" aria-label="AR guide to the evacuation center">
    <video ref="video" class="camera" playsinline muted autoplay></video>
    <div v-if="cameraError" class="no-camera"></div>

    <div class="top">
      <div class="warning">
        ⛔ Never walk or drive through floodwater. Keep looking up: watch for open drains, live wires and debris.
      </div>
      <button class="close" aria-label="Close guide" @click="emit('close')">✕</button>
    </div>

    <div class="center-area">
      <template v-if="!center">
        <p class="msg">Choose an evacuation center first.</p>
      </template>
      <template v-else-if="!pos">
        <p class="msg">Getting your GPS position…<br /><small>Go outside or near a window for a better signal.</small></p>
      </template>
      <template v-else-if="arrived">
        <div class="arrived">✔</div>
        <p class="msg">You have arrived at<br /><b>{{ center.name }}</b></p>
      </template>
      <template v-else>
        <div class="arrow-wrap" :aria-label="`${turnHint}, ${formatDistance(guidance.nextIn)}`">
          <svg class="arrow" viewBox="0 0 100 140" :style="{ transform: usingNorthUp ? `rotate(${arrowAngle}deg)` : `rotateX(48deg) rotateZ(${arrowAngle}deg)` }" aria-hidden="true">
            <path d="M50 4 L94 64 L64 64 L64 136 L36 136 L36 64 L6 64 Z" fill="#2fbf5a" stroke="#ffffff" stroke-width="5" stroke-linejoin="round" />
          </svg>
        </div>
        <p class="turn">{{ usingNorthUp ? `Head ${compassPoint(targetBearing)}` : turnHint }}</p>
      </template>
    </div>

    <div v-if="center" class="panel">
      <div class="dest">{{ center.name }}</div>
      <div v-if="guidance" class="stats">
        <div>
          <span class="label">To center</span>
          <span class="value">{{ formatDistance(guidance.remaining) }}</span>
        </div>
        <div v-if="routeCoords">
          <span class="label">Next point</span>
          <span class="value">{{ formatDistance(guidance.nextIn) }}</span>
        </div>
        <div>
          <span class="label">Direction</span>
          <span class="value">{{ targetBearing != null ? `${compassPoint(targetBearing)} ${Math.round(targetBearing)}°` : '–' }}</span>
        </div>
      </div>
      <p class="status">
        <span v-if="pos">GPS ±{{ Math.round(pos.accuracy) }} m</span>
        <span v-if="compassState === 'ok'"> · Compass on</span>
        <span v-else-if="heading != null"> · Using walking direction</span>
        <span v-else> · No compass: arrow points relative to north (top = north)</span>
        <span v-if="!routeCoords"> · Straight-line direction</span>
      </p>
      <p v-if="guidance?.offRoute" class="warn">
        You are off the route.
        <button class="btn small-btn" @click="recalculate">Recalculate</button>
      </p>
      <p v-if="compassState === 'denied'" class="warn">Motion access was not allowed. On iPhone, close and reopen the guide, then tap "Allow".</p>
      <p v-if="gpsError" class="warn">{{ gpsError }}</p>
      <p v-if="cameraError" class="small muted">{{ cameraError }}</p>
    </div>
  </div>
</template>

<style scoped>
.guide {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: #05121c;
  color: #fff;
  display: flex;
  flex-direction: column;
}
.camera {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.no-camera {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 40%, #183247, #05121c);
}
.top {
  position: relative;
  display: flex;
  gap: 8px;
  padding: calc(10px + env(safe-area-inset-top)) 10px 0;
}
.warning {
  flex: 1;
  background: rgba(160, 20, 24, 0.92);
  border-radius: 12px;
  padding: 8px 12px;
  font-weight: 700;
  font-size: 0.85rem;
  line-height: 1.35;
}
.close {
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: 50%;
  border: 0;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 20px;
  cursor: pointer;
}
.center-area {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 10px;
}
.arrow-wrap {
  perspective: 700px;
}
.arrow {
  width: min(46vw, 220px);
  filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.6));
  transform-origin: 50% 50%;
}
.turn {
  margin: 14px 0 0;
  font-size: 1.5rem;
  font-weight: 800;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.9);
}
.msg {
  font-size: 1.15rem;
  background: rgba(0, 0, 0, 0.6);
  padding: 12px 16px;
  border-radius: 12px;
}
.arrived {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: #1f8f42;
  font-size: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.panel {
  position: relative;
  background: rgba(5, 18, 28, 0.88);
  padding: 12px 14px calc(12px + env(safe-area-inset-bottom));
  border-radius: 18px 18px 0 0;
}
.dest {
  font-weight: 700;
  font-size: 1.05rem;
}
.stats {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.stats div {
  flex: 1;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
}
.label {
  font-size: 0.68rem;
  text-transform: uppercase;
  opacity: 0.7;
}
.value {
  font-size: 1.2rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.status {
  font-size: 0.75rem;
  opacity: 0.8;
  margin: 8px 0 0;
}
.warn {
  color: #ffcf5c;
  font-size: 0.85rem;
  margin: 6px 0 0;
}
.small-btn {
  padding: 4px 10px;
  margin-left: 6px;
}
</style>
