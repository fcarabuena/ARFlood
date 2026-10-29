<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { store, currentDifficulty } from '../store.js'

const props = defineProps({ engine: { type: Object, required: true } })
defineEmits(['quiz'])

const levelPct = computed(() => Math.min(100, Math.round(store.waterLevel * 100)))
const levelClass = computed(() => (levelPct.value >= 70 ? 'danger' : levelPct.value >= 50 ? 'warn' : 'ok'))
const doneCount = computed(() => store.tasks.filter((t) => t.done).length)
const timeClass = computed(() => (store.timeLeft <= 10 && store.phase === 'playing' ? 'danger' : ''))
const allDone = computed(() => store.tasks.length > 0 && doneCount.value === store.tasks.length)
const difficulty = computed(() => currentDifficulty())
const showChecklist = ref(true)
const sizes = [1, 1.5, 2]

const prompt = computed(() => {
  switch (store.phase) {
    case 'placing':
      return store.reticleFound
        ? 'Floor found. Tap the screen to place the flood area here.'
        : 'Move your phone slowly over the floor until a white circle appears.'
    case 'ready':
      return store.mode === 'ar'
        ? 'Walk around the area. Press Start when you are ready.'
        : 'Drag to look around, scroll/pinch to zoom. Press Start when you are ready.'
    case 'playing':
      return allDone.value ? 'Tap the green safe zone now!' : 'Tap items to collect them and people to rescue them.'
    default:
      return ''
  }
})

// Toast messages from the engine.
const toast = ref('')
let toastTimer = null
watch(
  () => store.messageId,
  () => {
    toast.value = store.message
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => (toast.value = ''), 2600)
  }
)
onBeforeUnmount(() => clearTimeout(toastTimer))

function exit() {
  if (store.mode === 'ar') props.engine.exitAR()
  else props.engine.stop3D()
}
</script>

<template>
  <div class="hud">
    <!-- Top bar -->
    <div class="topbar ui">
      <div class="stat" :class="timeClass">
        <span class="label">Time</span>
        <span class="value">{{ store.timeLeft }}s</span>
      </div>
      <div class="stat">
        <span class="label">Score</span>
        <span class="value">{{ store.score }}</span>
      </div>
      <div class="stat">
        <span class="label">Tasks</span>
        <span class="value">{{ doneCount }}/{{ store.tasks.length }}</span>
      </div>
      <button class="btn small-btn" @click="exit">{{ store.mode === 'ar' ? 'Exit AR' : 'Menu' }}</button>
    </div>

    <!-- Mission checklist -->
    <div v-if="store.phase !== 'placing'" class="checklist ui" @click="showChecklist = !showChecklist">
      <div class="checklist-title">Mission · {{ difficulty.label }} {{ showChecklist ? '▾' : '▸' }}</div>
      <ul v-if="showChecklist">
        <li v-for="task in store.tasks" :key="task.id" :class="{ done: task.done }">
          <span class="box">{{ task.done ? '✔' : '' }}</span>
          {{ task.kind === 'supply' ? 'Collect ' + task.label.toLowerCase() : task.label }}
        </li>
        <li :class="{ done: store.phase === 'success', locked: !allDone }">
          <span class="box">{{ store.phase === 'success' ? '✔' : '' }}</span>
          Reach the safe zone
        </li>
      </ul>
    </div>

    <!-- Right column: water level + sound/voice toggles -->
    <div class="side">
      <div v-if="store.phase !== 'placing'" class="water-meter ui" :title="`Water level ${levelPct}%`">
        <div class="meter-label">Water</div>
        <div class="meter">
          <div class="fill" :class="levelClass" :style="{ height: levelPct + '%' }"></div>
          <div class="safe-line"><span>Safe zone</span></div>
        </div>
        <div class="meter-label">{{ levelPct }}%</div>
      </div>
      <button
        class="icon-btn ui"
        :aria-label="store.settings.sound ? 'Mute sound' : 'Unmute sound'"
        :aria-pressed="!store.settings.sound"
        @click="store.settings.sound = !store.settings.sound"
      >
        {{ store.settings.sound ? '🔊' : '🔇' }}
      </button>
      <button
        class="icon-btn ui"
        :class="{ off: !store.settings.voice }"
        :aria-label="store.settings.voice ? 'Turn voice guidance off' : 'Turn voice guidance on'"
        :aria-pressed="store.settings.voice"
        @click="store.settings.voice = !store.settings.voice"
      >
        🗣️
      </button>
      <div v-if="store.debug" class="fps">{{ store.fps }} fps</div>
    </div>

    <!-- Toast -->
    <transition name="fade">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>

    <!-- Bottom: prompt + main action -->
    <div class="bottom">
      <div v-if="store.evacuate && store.phase === 'playing'" class="evacuate">
        ⬆ Move to higher ground! Follow the green arrows.
      </div>
      <p v-if="prompt" class="prompt" :class="{ found: store.phase === 'placing' && store.reticleFound }">{{ prompt }}</p>
      <div v-if="store.phase === 'placing'" class="sizes ui" role="radiogroup" aria-label="Area size">
        <span>Area size</span>
        <button
          v-for="s in sizes"
          :key="s"
          role="radio"
          :aria-checked="store.settings.areaSize === s"
          :class="{ active: store.settings.areaSize === s }"
          @click="store.settings.areaSize = s"
        >
          {{ s }} m
        </button>
      </div>
      <div class="bottom-actions ui">
        <button v-if="store.phase === 'ready'" class="btn primary big" @click="engine.startMission()">
          ▶ Start mission
        </button>
        <button v-if="store.phase === 'playing'" class="btn big" @click="engine.restartMission()">
          ↻ Restart
        </button>
        <button
          v-if="store.mode === 'ar' && (store.phase === 'ready' || store.phase === 'playing')"
          class="btn"
          @click="engine.replace()"
        >
          ⤧ Reposition scene
        </button>
      </div>
    </div>

    <!-- Result -->
    <div v-if="store.phase === 'success' || store.phase === 'failed'" class="modal-backdrop ui">
      <div class="card result">
        <div class="result-icon">{{ store.phase === 'success' ? '🏆' : '🌊' }}</div>
        <h2>{{ store.phase === 'success' ? 'Mission complete!' : 'Mission failed' }}</h2>
        <p v-if="store.phase === 'success'">
          You finished every task and reached the safe zone with {{ store.timeLeft }}s to spare.
        </p>
        <p v-else>
          {{ store.failReason }} You finished {{ doneCount }} of {{ store.tasks.length }} tasks. Remember: in
          a real flood, move to higher ground early, before the water rises.
        </p>
        <p class="final-score">Score: <b>{{ store.score }}</b></p>
        <div class="actions">
          <button class="btn primary" @click="$emit('quiz')">Take the quiz</button>
          <button class="btn" @click="engine.restartMission()">Try again</button>
        </div>
        <p class="muted small">{{ difficulty.label }} · {{ store.duration }} s</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.topbar {
  position: absolute;
  top: calc(10px + env(safe-area-inset-top));
  left: 10px;
  right: 10px;
  display: flex;
  gap: 8px;
  align-items: stretch;
  pointer-events: auto;
}
.stat {
  flex: 1;
  background: var(--panel);
  border-radius: 12px;
  padding: 6px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  backdrop-filter: blur(6px);
}
.stat .label {
  font-size: 0.7rem;
  text-transform: uppercase;
  opacity: 0.7;
}
.stat .value {
  font-size: 1.25rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.stat.danger .value {
  color: var(--danger);
  animation: blink 1s infinite;
}
.small-btn {
  padding: 6px 12px;
}

.checklist {
  position: absolute;
  top: calc(80px + env(safe-area-inset-top));
  left: 10px;
  max-width: 62vw;
  background: var(--panel);
  border-radius: 12px;
  padding: 8px 12px;
  pointer-events: auto;
  cursor: pointer;
  font-size: 0.85rem;
  backdrop-filter: blur(6px);
}
.checklist-title {
  font-weight: 700;
}
.checklist ul {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: grid;
  gap: 4px;
}
.checklist li {
  display: flex;
  gap: 8px;
  align-items: center;
}
.checklist li.done {
  opacity: 0.6;
  text-decoration: line-through;
}
.checklist li.locked {
  opacity: 0.5;
}
.box {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 2px solid #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  flex: none;
}
li.done .box {
  background: var(--ok);
  border-color: var(--ok);
}

.side {
  position: absolute;
  top: calc(80px + env(safe-area-inset-top));
  right: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.icon-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: var(--panel);
  font-size: 20px;
  cursor: pointer;
  pointer-events: auto;
  backdrop-filter: blur(6px);
}
.icon-btn.off {
  opacity: 0.45;
  filter: grayscale(1);
}
.fps {
  font-size: 0.7rem;
  background: var(--panel);
  padding: 2px 6px;
  border-radius: 6px;
  font-variant-numeric: tabular-nums;
}
.evacuate {
  background: rgba(47, 191, 90, 0.9);
  color: #04210e;
  font-weight: 700;
  padding: 8px 14px;
  border-radius: 999px;
  text-align: center;
  font-size: 0.85rem;
  animation: blink 1.2s infinite;
}
.sizes {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--panel);
  padding: 6px 10px;
  border-radius: 12px;
  pointer-events: auto;
  font-size: 0.85rem;
}
.sizes button {
  font: inherit;
  color: inherit;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
}
.sizes button.active {
  background: var(--accent);
  color: #062030;
  border-color: var(--accent);
}
.prompt.found {
  background: rgba(47, 191, 90, 0.85);
  color: #04210e;
  font-weight: 600;
}

.water-meter {
  width: 54px;
  background: var(--panel);
  border-radius: 12px;
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  backdrop-filter: blur(6px);
}
.meter-label {
  font-size: 0.72rem;
  font-weight: 600;
}
.meter {
  position: relative;
  width: 18px;
  height: 160px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.15);
  overflow: visible;
}
.fill {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  border-radius: 9px;
  transition: height 0.15s linear, background 0.3s;
}
.fill.ok {
  background: linear-gradient(#4cc9f0, #1d6fa5);
}
.fill.warn {
  background: linear-gradient(#ffb703, #b5651d);
}
.fill.danger {
  background: linear-gradient(#ff5a5f, #a4161a);
}
.safe-line {
  position: absolute;
  top: 0;
  left: -6px;
  right: -6px;
  border-top: 2px dashed var(--ok);
}
.safe-line span {
  position: absolute;
  top: 3px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.55rem;
  white-space: nowrap;
  color: var(--ok);
}

.toast {
  position: absolute;
  top: 42%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.75);
  padding: 10px 16px;
  border-radius: 999px;
  font-weight: 600;
  text-align: center;
  max-width: 86vw;
}

.bottom {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: calc(16px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.prompt {
  margin: 0;
  background: var(--panel);
  padding: 8px 14px;
  border-radius: 12px;
  text-align: center;
  font-size: 0.9rem;
  max-width: 520px;
}
.bottom-actions {
  display: flex;
  gap: 10px;
  pointer-events: auto;
}
.big {
  font-size: 1.05rem;
  padding: 12px 22px;
}

.modal-backdrop {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.35);
  pointer-events: auto;
}
.result {
  text-align: center;
  max-width: 400px;
}
.result-icon {
  font-size: 48px;
}
.result h2 {
  margin: 4px 0 8px;
}
.final-score {
  font-size: 1.2rem;
}
.result .actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}

@keyframes blink {
  50% {
    opacity: 0.4;
  }
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
