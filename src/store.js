import { reactive, watch } from 'vue'
import { DIFFICULTIES } from './game/difficulty.js'
import { loadJSON, saveJSON } from './game/settings.js'

const SETTINGS_KEY = 'arflood.settings'
const saved = loadJSON(SETTINGS_KEY, {
  difficulty: 'normal',
  sound: true,
  voice: true,
  liveWeather: false,
  areaSize: 2,
})

/**
 * Shared state between the Three.js engine and the Vue UI.
 * The engine writes to it; components read it and call engine methods.
 */
export const store = reactive({
  // Which full-screen view is shown: 'tips' | 'sim' | 'quiz' | 'results' | 'badges'
  screen: 'tips',
  // Screen to return to from the badges screen
  badgesBack: 'tips',
  // 'ar' when inside a WebXR session, '3d' for the OrbitControls fallback
  mode: null,
  // null while checking, then true/false
  arSupported: null,
  arUnsupportedReason: '',
  // false when the AR session started without the dom-overlay feature
  domOverlay: true,
  // true while the AR reticle is on a floor surface
  reticleFound: false,

  // Persisted user settings
  settings: saved,

  // 'placing' | 'ready' | 'playing' | 'success' | 'failed'
  phase: 'ready',
  duration: DIFFICULTIES[saved.difficulty]?.duration ?? 60,
  // 0..1, where 1 means the water covers the safe zone
  waterLevel: 0,
  timeLeft: 60,
  score: 0,
  // [{ id, label, kind: 'supply' | 'person', done }]
  tasks: [],
  // Short feedback toast; `messageId` changes on every new message
  message: '',
  messageId: 0,
  failReason: '',
  // true while the evacuation arrows are shown
  evacuate: false,

  // Live weather (Open-Meteo); null when off or unavailable
  weather: null,

  // Filled in when the mission ends
  lastMission: null,
  // Filled in after the quiz, shown on the results screen
  lastResults: null,

  // Debug overlay (?debug in the URL)
  debug: new URLSearchParams(location.search).has('debug'),
  fps: 0,
})

watch(() => store.settings, (s) => saveJSON(SETTINGS_KEY, s), { deep: true })

export function currentDifficulty() {
  return DIFFICULTIES[store.settings.difficulty] ?? DIFFICULTIES.normal
}

export function showMessage(text) {
  store.message = text
  store.messageId++
}
