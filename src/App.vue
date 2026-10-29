<script setup>
import { ref, markRaw, onMounted, onBeforeUnmount, watch, defineAsyncComponent } from 'vue'
import { store } from './store.js'
import { checkARSupport } from './three/support.js'
import { fetchLiveWeather } from './services/weather.js'
import { buildResults } from './game/analytics.js'
import Tips from './components/Tips.vue'
import Hud from './components/Hud.vue'
import Quiz from './components/Quiz.vue'
import Results from './components/Results.vue'
import Badges from './components/Badges.vue'
import About from './components/About.vue'

// Live Flood Mode is loaded on demand and never starts the 3D engine.
const LiveMode = defineAsyncComponent(() => import('./live/LiveMode.vue'))

const canvasHost = ref(null)
const overlay = ref(null)
const engine = ref(null)
const startError = ref('')

/** Creates the training 3D engine the first time it is needed (not in Live Mode). */
async function ensureEngine() {
  if (!engine.value) {
    const { FloodEngine } = await import('./three/engine.js')
    engine.value = markRaw(new FloodEngine(canvasHost.value))
    // Handy for debugging from the browser console during development.
    if (import.meta.env.DEV) window.__engine = engine.value
  }
  // Live Mode may have been opened while the engine was still loading.
  engine.value.setPaused(store.screen === 'live')
  return engine.value
}

onMounted(async () => {
  const params = new URLSearchParams(location.search)
  // `?live` (also the installed app's "Live Flood Mode" shortcut) opens Live Mode directly.
  if (params.has('live')) store.screen = 'live'

  // Dev only: `?emulate` installs an emulated AR device (see src/dev/emulator.js).
  if (import.meta.env.DEV && params.has('emulate')) {
    const { installEmulator } = await import('./dev/emulator.js')
    await installEmulator()
  }

  if (store.screen !== 'live') await ensureEngine()

  // In AR, taps on HUD buttons would also fire an XR "select" (and collect
  // whatever is behind the button). Cancel that for anything marked .ui.
  overlay.value.addEventListener('beforexrselect', (e) => {
    if (e.target.closest?.('.ui')) e.preventDefault()
  })

  const { supported, reason } = await checkARSupport()
  store.arSupported = supported
  store.arUnsupportedReason = reason

  if (store.settings.liveWeather) refreshWeather()
})

onBeforeUnmount(() => engine.value?.dispose())

// Settings changes (difficulty, sound, voice, area size) go straight to the engine.
watch(
  () => [store.settings.difficulty, store.settings.sound, store.settings.voice, store.settings.areaSize, store.weather],
  () => engine.value?.applySettings()
)

watch(
  () => store.settings.liveWeather,
  (on) => {
    if (on) refreshWeather()
    else store.weather = null
  }
)

async function refreshWeather() {
  // Resolves to null when location is denied or the network fails:
  // we then silently keep the default rain for the difficulty.
  const w = await fetchLiveWeather()
  if (store.settings.liveWeather) store.weather = w
}

async function startAR() {
  startError.value = ''
  try {
    await engine.value.startAR(overlay.value)
  } catch (err) {
    console.error(err)
    startError.value = `Could not start AR: ${err.message}`
  }
}

async function openLive() {
  engine.value?.setPaused(true) // no 3D rendering or audio in Live Mode
  store.screen = 'live'
  history.replaceState(null, '', '?live')
}

async function exitLive() {
  store.screen = 'tips'
  history.replaceState(null, '', location.pathname)
  const e = await ensureEngine()
  e.setPaused(false)
}

function start3D() {
  engine.value.start3D()
}

function openQuiz() {
  store.screen = 'quiz'
}

function finishQuiz(answers) {
  store.lastResults = buildResults(store.lastMission, answers)
  store.screen = 'results'
}

function openBadges(from) {
  store.badgesBack = from
  store.screen = 'badges'
}

function leave(target) {
  if (target === 'play' && store.mode) {
    engine.value.resetMission()
    store.screen = 'sim'
  } else if (target === 'back') {
    store.screen = store.badgesBack
  } else {
    if (store.mode === 'ar') engine.value.exitAR()
    else if (store.mode === '3d') engine.value.stop3D()
    store.screen = 'tips'
  }
}
</script>

<template>
  <div ref="canvasHost" class="canvas-host"></div>

  <!-- Everything inside #overlay is shown on top of the camera in AR (dom-overlay). -->
  <div id="overlay" ref="overlay" class="overlay">
    <Tips
      v-if="store.screen === 'tips'"
      :error="startError"
      @start-ar="startAR"
      @start-3d="start3D"
      @badges="openBadges('tips')"
      @live="openLive"
      @about="store.screen = 'about'"
    />
    <Hud v-else-if="store.screen === 'sim'" :engine="engine" @quiz="openQuiz" />
    <Quiz v-else-if="store.screen === 'quiz'" @done="finishQuiz" />
    <Results v-else-if="store.screen === 'results'" @leave="leave" @badges="openBadges('results')" />
    <Badges v-else-if="store.screen === 'badges'" @back="leave('back')" />
    <About v-else-if="store.screen === 'about'" @back="store.screen = 'tips'" />
  </div>

  <LiveMode v-if="store.screen === 'live'" @exit="exitLive" />
</template>
