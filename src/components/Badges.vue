<script setup>
import { BADGES, loadProgress } from '../game/analytics.js'
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../game/difficulty.js'

defineEmits(['back'])

const progress = loadProgress()
const date = (iso) => new Date(iso).toLocaleDateString()
</script>

<template>
  <div class="screen ui">
    <div class="card">
      <h1>🏅 Badges</h1>
      <p class="muted small">
        {{ Object.keys(progress.badges).length }} of {{ BADGES.length }} earned ·
        {{ progress.wins }} wins in {{ progress.missions }} missions
      </p>

      <ul class="grid">
        <li v-for="b in BADGES" :key="b.id" :class="{ locked: !progress.badges[b.id] }">
          <div class="medal">{{ progress.badges[b.id] ? b.icon : '🔒' }}</div>
          <div>
            <b>{{ b.title }}</b>
            <p>{{ b.text }}</p>
            <p v-if="progress.badges[b.id]" class="earned">Earned {{ date(progress.badges[b.id]) }}</p>
          </div>
        </li>
      </ul>

      <h2>Best scores</h2>
      <div class="best">
        <div v-for="id in DIFFICULTY_ORDER" :key="id">
          <span class="label">{{ DIFFICULTIES[id].label }}</span>
          <span class="value">{{ progress.best[id] ?? '–' }}</span>
        </div>
      </div>
      <p class="muted small">Progress is saved in this browser only.</p>

      <div class="actions">
        <button class="btn primary" @click="$emit('back')">Back</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
h1 {
  margin: 0;
  font-size: 1.4rem;
}
h2 {
  font-size: 1rem;
  margin: 16px 0 8px;
}
.grid {
  list-style: none;
  padding: 0;
  margin: 12px 0 0;
  display: grid;
  gap: 8px;
}
.grid li {
  display: flex;
  gap: 12px;
  align-items: center;
  background: rgba(255, 255, 255, 0.07);
  border-radius: 12px;
  padding: 10px 12px;
}
.grid li.locked {
  opacity: 0.55;
}
.medal {
  width: 52px;
  height: 52px;
  flex: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  background: radial-gradient(#ffe58a, #c9a227);
  box-shadow: 0 0 16px rgba(255, 215, 0, 0.35);
}
.locked .medal {
  background: rgba(255, 255, 255, 0.1);
  box-shadow: none;
}
.grid p {
  margin: 2px 0 0;
  font-size: 0.85rem;
  opacity: 0.85;
}
.grid .earned {
  color: var(--accent);
  font-size: 0.75rem;
}
.best {
  display: flex;
  gap: 8px;
}
.best div {
  flex: 1;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.best .label {
  font-size: 0.7rem;
  text-transform: uppercase;
  opacity: 0.7;
}
.best .value {
  font-weight: 700;
  font-size: 1.1rem;
}
.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>
