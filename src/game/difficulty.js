/**
 * Difficulty levels. `duration` is how long the water takes to reach the
 * top of the safe zone; `tasks` are the mission object ids that are active.
 */
export const DIFFICULTIES = {
  easy: {
    id: 'easy',
    label: 'Easy',
    duration: 90,
    tasks: ['firstaid', 'bottle', 'person1'],
    debrisSpeed: 0.6,
    debrisCount: 3,
    rain: 0.35,
    description: '90 s · 3 tasks · slow current',
  },
  normal: {
    id: 'normal',
    label: 'Normal',
    duration: 60,
    tasks: ['firstaid', 'bottle', 'flashlight', 'person1', 'person2'],
    debrisSpeed: 1,
    debrisCount: 4,
    rain: 0.6,
    description: '60 s · 5 tasks · moderate current',
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    duration: 40,
    tasks: ['firstaid', 'bottle', 'flashlight', 'radio', 'person1', 'person2', 'person3'],
    debrisSpeed: 1.6,
    debrisCount: 5,
    rain: 1,
    description: '40 s · 7 tasks · strong current',
  },
}

export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard']
