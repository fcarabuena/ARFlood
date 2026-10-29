import { loadJSON, saveJSON } from './settings.js'
import { QUESTIONS } from './quiz.js'
import { DIFFICULTIES } from './difficulty.js'

const PROGRESS_KEY = 'arflood.progress'

export const BADGES = [
  { id: 'safe-and-sound', icon: '🏠', title: 'Safe & Sound', text: 'Complete a mission on any difficulty.' },
  { id: 'quick-responder', icon: '⚡', title: 'Quick Responder', text: 'Reach the safe zone with at least half of the time left.' },
  { id: 'lifesaver', icon: '🛟', title: 'Lifesaver', text: 'Rescue every person before picking up any supplies, then win.' },
  { id: 'flood-expert', icon: '🎓', title: 'Flood Expert', text: 'Answer all 5 quiz questions correctly.' },
  { id: 'storm-survivor', icon: '⛈️', title: 'Storm Survivor', text: 'Complete a mission on Hard.' },
]

export function loadProgress() {
  return loadJSON(PROGRESS_KEY, { best: {}, badges: {}, missions: 0, wins: 0 })
}

/**
 * Records what happens during one mission: when each task was done,
 * the order, mistakes, and how close to the deadline the player finished.
 */
class MissionTracker {
  constructor() {
    this.current = null
  }

  start({ difficulty, duration, tasks }) {
    this.current = {
      difficulty,
      duration,
      taskCount: tasks.length,
      events: [], // { t, type, id?, label?, kind? }
      earlySafeTaps: 0,
      missedTaps: 0,
      result: null,
    }
  }

  task(t, { id, label, kind }) {
    this.current?.events.push({ t, type: 'task', id, label, kind })
  }

  earlySafeTap(t) {
    if (!this.current) return
    this.current.earlySafeTaps++
    this.current.events.push({ t, type: 'early-safe' })
  }

  miss() {
    if (this.current) this.current.missedTaps++
  }

  finish({ success, t, score }) {
    if (!this.current) return null
    this.current.result = { success, t, score, timeLeft: Math.max(0, this.current.duration - t) }
    this.current.events.push({ t, type: success ? 'safe' : 'flooded' })
    return this.current
  }
}

export const tracker = new MissionTracker()

/**
 * Builds the results summary after the quiz, awards badges and saves progress.
 * @param {object} mission  tracker.current after finish()
 * @param {number[]} answers selected option index per quiz question
 */
export function buildResults(mission, answers) {
  const quizCorrect = answers.filter((a, i) => a === QUESTIONS[i].answer).length
  const wrongQuestions = QUESTIONS.filter((q, i) => answers[i] !== q.answer)

  const tasks = mission ? mission.events.filter((e) => e.type === 'task') : []
  // Time spent on each task = time since the previous task (or the start).
  const taskTimes = tasks.map((e, i) => ({ ...e, split: e.t - (i ? tasks[i - 1].t : 0) }))
  const res = mission?.result
  const success = !!res?.success

  // ---- Tips based on mistakes --------------------------------------------
  const tips = []
  if (mission) {
    if (!success) {
      tips.push('The water reached the safe zone first. In a real flood, leave for higher ground as soon as a warning is issued.')
    } else if (res.timeLeft < mission.duration * 0.25) {
      tips.push(`You reached safety with only ${Math.round(res.timeLeft)} s left. Floodwater can rise within minutes, so act early.`)
    }
    const lastPerson = Math.max(-1, ...tasks.map((e, i) => (e.kind === 'person' ? i : -1)))
    const firstSupply = tasks.findIndex((e) => e.kind === 'supply')
    if (firstSupply !== -1 && lastPerson > firstSupply) {
      tips.push('You picked up supplies before everyone was safe. Help people first: belongings can be replaced, lives can\'t.')
    }
    if (mission.earlySafeTaps > 0) {
      tips.push('You tried to evacuate before finishing. Before you leave, check that everyone is with you and grab your emergency kit.')
    }
    const slow = taskTimes.filter((e) => e.kind === 'supply' && e.split > mission.duration / 4)
    if (slow.length) {
      tips.push(`Finding the ${slow[0].label.toLowerCase()} took ${slow[0].split.toFixed(1)} s. Keep your emergency kit in one known place so you can grab it fast.`)
    }
    if (tasks.length < mission.taskCount) {
      tips.push(`You finished ${tasks.length} of ${mission.taskCount} tasks. Look around the whole area; people and supplies can be behind buildings.`)
    }
  }
  for (const q of wrongQuestions) tips.push(q.topic)
  if (!tips.length) tips.push('Excellent! You acted quickly, helped everyone and know the safety rules.')

  // ---- Badges ---------------------------------------------------------------
  const earned = []
  if (success) earned.push('safe-and-sound')
  if (success && res.timeLeft >= mission.duration / 2) earned.push('quick-responder')
  if (success) {
    const persons = tasks.filter((e) => e.kind === 'person')
    const firstSupplyT = tasks.find((e) => e.kind === 'supply')?.t ?? Infinity
    if (persons.length && persons.every((p) => p.t < firstSupplyT)) earned.push('lifesaver')
  }
  if (quizCorrect === QUESTIONS.length) earned.push('flood-expert')
  if (success && mission.difficulty === 'hard') earned.push('storm-survivor')

  // ---- Save progress -------------------------------------------------------------
  const progress = loadProgress()
  const newBadges = earned.filter((id) => !progress.badges[id])
  for (const id of newBadges) progress.badges[id] = new Date().toISOString()
  let newBest = false
  if (mission) {
    progress.missions++
    if (success) progress.wins++
    const prev = progress.best[mission.difficulty] ?? 0
    if (res.score > prev) {
      progress.best[mission.difficulty] = res.score
      newBest = true
    }
  }
  saveJSON(PROGRESS_KEY, progress)

  return {
    success,
    difficulty: mission ? DIFFICULTIES[mission.difficulty]?.label : null,
    score: res?.score ?? 0,
    duration: mission?.duration ?? 0,
    timeUsed: res?.t ?? 0,
    timeLeft: res?.timeLeft ?? 0,
    // 0..1: how much of the available time was used. Close to 1 = close call.
    closeness: mission ? Math.min(1, (res?.t ?? 0) / mission.duration) : 0,
    timeline: taskTimes,
    earlySafeTaps: mission?.earlySafeTaps ?? 0,
    quizCorrect,
    quizTotal: QUESTIONS.length,
    quiz: QUESTIONS.map((q, i) => ({ q: q.q, correct: answers[i] === q.answer, answer: q.options[q.answer] })),
    tips,
    earned,
    newBadges,
    best: mission ? progress.best[mission.difficulty] : null,
    newBest,
  }
}
