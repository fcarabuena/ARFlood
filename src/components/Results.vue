<script setup>
import { computed } from 'vue'
import { store } from '../store.js'
import { BADGES } from '../game/analytics.js'

defineEmits(['leave', 'badges'])

const r = computed(() => store.lastResults)
const earnedBadges = computed(() => BADGES.filter((b) => r.value.earned.includes(b.id)))
const fmt = (t) => `${t.toFixed(1)} s`
const closeLabel = computed(() => {
  if (!r.value.success) return 'Too late: the water won'
  const left = r.value.timeLeft
  if (left < r.value.duration * 0.15) return 'Very close call'
  if (left < r.value.duration * 0.4) return 'Close'
  return 'Comfortable margin'
})
</script>

<template>
  <div class="screen ui">
    <div class="card results">
      <header>
        <div class="big-icon">{{ r.success ? '🏆' : '🌊' }}</div>
        <div>
          <h1>Mission debrief</h1>
          <p class="muted">
            {{ r.difficulty }} · {{ r.success ? 'Reached safety' : 'Mission failed' }} · Score {{ r.score }}
            <span v-if="r.newBest" class="pill">New best!</span>
            <span v-else-if="r.best" class="muted">(best {{ r.best }})</span>
          </p>
        </div>
      </header>

      <!-- How close to the deadline -->
      <section>
        <h2>Time</h2>
        <div class="deadline" :aria-label="`Used ${Math.round(r.closeness * 100)}% of the time`">
          <div class="used" :class="{ late: !r.success, close: r.success && r.closeness > 0.85 }" :style="{ width: r.closeness * 100 + '%' }"></div>
        </div>
        <p class="small">
          Used {{ fmt(r.timeUsed) }} of {{ r.duration }} s
          <template v-if="r.success"> · finished {{ fmt(r.timeLeft) }} before the deadline</template>
          · <b>{{ closeLabel }}</b>
        </p>
      </section>

      <!-- Order and time of actions -->
      <section>
        <h2>Your actions</h2>
        <ol v-if="r.timeline.length" class="timeline">
          <li v-for="(e, i) in r.timeline" :key="i">
            <span class="t">{{ fmt(e.t) }}</span>
            <span>{{ e.kind === 'person' ? '🧍' : '📦' }} {{ e.kind === 'person' ? e.label.replace('Rescue person', 'Rescued person') : e.label + ' collected' }}</span>
            <span class="split">+{{ fmt(e.split) }}</span>
          </li>
        </ol>
        <p v-else class="muted small">No tasks completed.</p>
        <p v-if="r.earlySafeTaps" class="small warn">
          Tried to go to the safe zone too early {{ r.earlySafeTaps }}×.
        </p>
      </section>

      <!-- Quiz answers -->
      <section>
        <h2>Quiz: {{ r.quizCorrect }}/{{ r.quizTotal }}</h2>
        <ul class="quiz-list">
          <li v-for="(q, i) in r.quiz" :key="i" :class="q.correct ? 'ok' : 'bad'">
            <span>{{ q.correct ? '✔' : '✘' }}</span>
            <div>
              {{ q.q }}
              <div v-if="!q.correct" class="small muted">Answer: {{ q.answer }}</div>
            </div>
          </li>
        </ul>
      </section>

      <!-- Tips based on mistakes -->
      <section>
        <h2>Tips for next time</h2>
        <ul class="tips">
          <li v-for="(tip, i) in r.tips" :key="i">{{ tip }}</li>
        </ul>
      </section>

      <!-- Badges earned this round -->
      <section v-if="earnedBadges.length">
        <h2>Badges earned</h2>
        <div class="badges">
          <div v-for="b in earnedBadges" :key="b.id" class="badge" :class="{ new: r.newBadges.includes(b.id) }">
            <span class="icon">{{ b.icon }}</span>
            <b>{{ b.title }}</b>
            <span v-if="r.newBadges.includes(b.id)" class="pill">New</span>
          </div>
        </div>
      </section>

      <div class="actions">
        <button v-if="store.mode" class="btn primary" @click="$emit('leave', 'play')">Play again</button>
        <button class="btn" @click="$emit('badges')">🏅 All badges</button>
        <button class="btn" @click="$emit('leave', 'tips')">Back to tips</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
header {
  display: flex;
  gap: 12px;
  align-items: center;
}
.big-icon {
  font-size: 44px;
}
h1 {
  margin: 0;
  font-size: 1.35rem;
}
header p {
  margin: 4px 0 0;
  font-size: 0.9rem;
}
section {
  margin-top: 14px;
}
h2 {
  font-size: 1rem;
  margin: 0 0 8px;
}
.pill {
  display: inline-block;
  background: var(--accent);
  color: #062030;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 999px;
  margin-left: 4px;
}
.deadline {
  height: 12px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}
.used {
  height: 100%;
  background: var(--ok);
}
.used.close {
  background: #ffb703;
}
.used.late {
  background: var(--danger);
}
.timeline {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 4px;
  font-size: 0.88rem;
}
.timeline li {
  display: grid;
  grid-template-columns: 56px 1fr auto;
  gap: 8px;
  background: rgba(255, 255, 255, 0.05);
  padding: 6px 10px;
  border-radius: 8px;
}
.timeline .t {
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}
.timeline .split {
  opacity: 0.6;
  font-variant-numeric: tabular-nums;
}
.warn {
  color: #ffb703;
}
.quiz-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 6px;
  font-size: 0.85rem;
}
.quiz-list li {
  display: flex;
  gap: 8px;
}
.quiz-list li.ok > span {
  color: var(--ok);
}
.quiz-list li.bad > span {
  color: var(--danger);
}
.tips {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  font-size: 0.9rem;
}
.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.badge {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 0.85rem;
}
.badge.new {
  box-shadow: 0 0 0 2px var(--accent);
}
.badge .icon {
  font-size: 1.2rem;
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 18px;
}
.actions .btn {
  flex: 1 1 120px;
}
</style>
