<script setup>
import { computed } from 'vue'
import { store } from '../store.js'
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../game/difficulty.js'
import { loadProgress } from '../game/analytics.js'

defineProps({ error: { type: String, default: '' } })
defineEmits(['start-ar', 'start-3d', 'badges', 'live'])

const tips = [
  {
    icon: '⛰️',
    title: 'Move to higher ground',
    text: 'When a flood warning is issued or water starts rising, go to higher ground right away. Do not wait for water to reach your home.',
  },
  {
    icon: '🚫',
    title: 'Avoid floodwater',
    text: 'Never walk, swim or drive through floodwater. About 15 cm of moving water can knock you down, and 30 cm can sweep a car away. Turn around, don\'t drown.',
  },
  {
    icon: '⚡',
    title: 'Turn off electricity',
    text: 'If it is safe, switch off the main power before water enters. Never touch switches or appliances while you are wet or standing in water.',
  },
  {
    icon: '🎒',
    title: 'Keep an emergency kit',
    text: 'Prepare drinking water, food, a first-aid kit, a flashlight, batteries, medicine and important documents in a waterproof bag.',
  },
]

const levels = DIFFICULTY_ORDER.map((id) => DIFFICULTIES[id])
const diff = computed(() => DIFFICULTIES[store.settings.difficulty])
const progress = loadProgress()
const badgeCount = Object.keys(progress.badges).length
const taskWords = computed(() => {
  const n = diff.value.tasks.length
  const people = diff.value.tasks.filter((t) => t.startsWith('person')).length
  return `${n - people} supplies and rescue ${people} ${people === 1 ? 'person' : 'people'}`
})
const suggestion = computed(() => {
  const w = store.weather
  if (!store.settings.liveWeather || !w) return null
  return { ...w, label: DIFFICULTIES[w.suggested].label }
})
</script>

<template>
  <div class="screen ui">
    <div class="card tips">
      <header>
        <div class="logo">🌊</div>
        <div>
          <h1>Flood Ready AR</h1>
          <p class="muted">Learn what to do in a flood, then practise it in augmented reality.</p>
        </div>
      </header>

      <div class="live-cta">
        <div>
          <b>Flood happening now?</b>
          <span>Live risk, nearby evacuation centers, directions and emergency numbers. Works offline after first use.</span>
        </div>
        <button class="btn live-btn" @click="$emit('live')">🚨 Live Mode</button>
      </div>

      <h2>Flood safety tips</h2>
      <ul class="tip-list">
        <li v-for="tip in tips" :key="tip.title">
          <span class="tip-icon">{{ tip.icon }}</span>
          <div>
            <strong>{{ tip.title }}</strong>
            <p>{{ tip.text }}</p>
          </div>
        </li>
      </ul>

      <h2>Your mission</h2>
      <p class="muted">
        The water rises for <b>{{ diff.duration }} seconds</b>. Tap to collect {{ taskWords }}, then tap the
        green <b>safe zone</b> before the water covers it. A short quiz follows.
      </p>

      <h2>Difficulty</h2>
      <div class="segmented" role="radiogroup" aria-label="Difficulty">
        <button
          v-for="lvl in levels"
          :key="lvl.id"
          role="radio"
          :aria-checked="store.settings.difficulty === lvl.id"
          :class="{ active: store.settings.difficulty === lvl.id }"
          @click="store.settings.difficulty = lvl.id"
        >
          <b>{{ lvl.label }}</b>
          <span>{{ lvl.description }}</span>
          <span v-if="progress.best[lvl.id]" class="best">Best {{ progress.best[lvl.id] }}</span>
        </button>
      </div>

      <div class="toggles">
        <label><input v-model="store.settings.sound" type="checkbox" /> 🔊 Sound</label>
        <label><input v-model="store.settings.voice" type="checkbox" /> 🗣️ Voice guidance</label>
        <label><input v-model="store.settings.liveWeather" type="checkbox" /> 🌦️ Use live weather</label>
      </div>
      <div v-if="suggestion" class="weather">
        <span>
          Live: <b>{{ suggestion.condition }}</b>, {{ suggestion.precipitation.toFixed(1) }} mm/h
          ({{ suggestion.level.toLowerCase() }}). Rain set to match. Suggested level: <b>{{ suggestion.label }}</b>.
        </span>
        <button
          v-if="suggestion.suggested !== store.settings.difficulty"
          class="btn small-btn"
          @click="store.settings.difficulty = suggestion.suggested"
        >
          Use {{ suggestion.label }}
        </button>
      </div>

      <div class="actions">
        <button class="btn primary" :disabled="!store.arSupported" @click="$emit('start-ar')">Start AR</button>
        <button class="btn" @click="$emit('start-3d')">Start 3D demo</button>
        <button class="btn" @click="$emit('badges')">🏅 Badges ({{ badgeCount }})</button>
      </div>

      <p v-if="store.arSupported === null" class="muted small">Checking AR support…</p>
      <p v-else-if="!store.arSupported" class="muted small">
        AR is not available here ({{ store.arUnsupportedReason }}). Use the 3D demo instead.
      </p>
      <p v-else class="muted small">AR ready: you'll need about {{ store.settings.areaSize }} m × {{ store.settings.areaSize }} m of free floor.</p>
      <p v-if="error" class="error small">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.tips header {
  display: flex;
  gap: 12px;
  align-items: center;
}
.logo {
  font-size: 40px;
}
h1 {
  margin: 0;
  font-size: 1.5rem;
}
h2 {
  font-size: 1.05rem;
  margin: 18px 0 8px;
}
.live-cta {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 14px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(200, 30, 34, 0.18);
  border: 1px solid rgba(255, 90, 95, 0.6);
}
.live-cta div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.85rem;
}
.live-cta b {
  font-size: 1rem;
}
.live-btn {
  flex: none;
  background: #c81e22;
  border-color: #c81e22;
  color: #fff;
  white-space: nowrap;
}
.tip-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 10px;
}
.tip-list li {
  display: flex;
  gap: 12px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 10px 12px;
}
.tip-icon {
  font-size: 26px;
  line-height: 1.2;
}
.tip-list p {
  margin: 4px 0 0;
  font-size: 0.9rem;
  opacity: 0.85;
}
.segmented {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.segmented button {
  font: inherit;
  color: inherit;
  background: rgba(255, 255, 255, 0.06);
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  padding: 8px 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
  text-align: center;
}
.segmented button span {
  font-size: 0.7rem;
  opacity: 0.8;
}
.segmented button.active {
  border-color: var(--accent);
  background: rgba(76, 201, 240, 0.18);
}
.segmented .best {
  color: var(--accent);
  opacity: 1;
}
.toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-top: 14px;
  font-size: 0.9rem;
}
.toggles label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.toggles input {
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
}
.weather {
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(76, 201, 240, 0.12);
  font-size: 0.85rem;
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
}
.small-btn {
  padding: 6px 12px;
}
.actions {
  display: flex;
  gap: 10px;
  margin-top: 18px;
  flex-wrap: wrap;
}
.actions .btn {
  flex: 1 1 140px;
}
</style>
