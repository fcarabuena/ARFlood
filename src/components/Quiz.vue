<script setup>
import { ref, computed } from 'vue'
import { QUESTIONS as questions } from '../game/quiz.js'

const emit = defineEmits(['done'])

const index = ref(0)
const selected = ref(null)
const answers = []

const current = computed(() => questions[index.value])
const answered = computed(() => selected.value !== null)

function choose(i) {
  if (answered.value) return
  selected.value = i
  answers[index.value] = i
}

function next() {
  if (index.value < questions.length - 1) {
    index.value++
    selected.value = null
  } else {
    emit('done', [...answers])
  }
}
</script>

<template>
  <div class="screen ui">
    <div class="card quiz">
      <div class="progress">
        <span>Flood safety quiz · Question {{ index + 1 }} / {{ questions.length }}</span>
        <div class="bar"><div :style="{ width: ((index + (answered ? 1 : 0)) / questions.length) * 100 + '%' }"></div></div>
      </div>

      <h2>{{ current.q }}</h2>
      <div class="options">
        <button
          v-for="(opt, i) in current.options"
          :key="i"
          class="option"
          :class="{
            correct: answered && i === current.answer,
            wrong: answered && i === selected && i !== current.answer,
          }"
          :disabled="answered"
          @click="choose(i)"
        >
          {{ opt }}
        </button>
      </div>

      <div v-if="answered" class="feedback" :class="selected === current.answer ? 'good' : 'bad'">
        <b>{{ selected === current.answer ? 'Correct!' : 'Not quite.' }}</b>
        {{ current.why }}
      </div>

      <div class="actions">
        <button class="btn primary" :disabled="!answered" @click="next">
          {{ index < questions.length - 1 ? 'Next' : 'See results' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.8rem;
  opacity: 0.85;
}
.bar {
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.15);
  overflow: hidden;
}
.bar div {
  height: 100%;
  background: var(--accent);
  transition: width 0.3s;
}
h2 {
  font-size: 1.1rem;
  margin: 16px 0 12px;
}
.options {
  display: grid;
  gap: 8px;
}
.option {
  text-align: left;
  padding: 12px 14px;
  border-radius: 12px;
  border: 2px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.06);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.option:not(:disabled):hover {
  border-color: var(--accent);
}
.option.correct {
  border-color: var(--ok);
  background: rgba(47, 191, 90, 0.2);
}
.option.wrong {
  border-color: var(--danger);
  background: rgba(255, 90, 95, 0.2);
}
.option:disabled {
  cursor: default;
}
.feedback {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 0.9rem;
}
.feedback.good {
  background: rgba(47, 191, 90, 0.15);
}
.feedback.bad {
  background: rgba(255, 183, 3, 0.15);
}
.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
