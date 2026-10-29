<script setup>
import { computed, reactive, watch } from 'vue'
import { loadJSON, saveJSON } from '../../game/settings.js'

// Based on FEMA / Ready.gov flood guidance and India NIDM flood guidelines,
// adapted for the Philippines (PAGASA advisories, leptospirosis risk).
const GO_BAG = [
  { id: 'water', text: 'Drinking water: about 4 L per person per day, for 3 days' },
  { id: 'food', text: 'Ready-to-eat food for 3 days (canned goods, biscuits) + can opener' },
  { id: 'firstaid', text: 'First-aid kit' },
  { id: 'meds', text: 'Maintenance medicines (1 week) and copies of prescriptions' },
  { id: 'flashlight', text: 'Flashlight with extra batteries' },
  { id: 'radio', text: 'Battery or hand-crank radio' },
  { id: 'power', text: 'Charged power bank and phone charger' },
  { id: 'whistle', text: 'Whistle to signal for help' },
  { id: 'docs', text: 'IDs, birth certificates, land titles, insurance in a waterproof bag' },
  { id: 'cash', text: 'Cash in small bills' },
  { id: 'clothes', text: 'Change of clothes, raincoat, sturdy closed shoes' },
  { id: 'hygiene', text: 'Hygiene kit: soap, alcohol, face masks, sanitary pads' },
  { id: 'contacts', text: 'Written list of emergency and family phone numbers' },
  { id: 'special', text: 'Supplies for babies, older people, PWDs and pets' },
]

const PHASES = [
  {
    id: 'before',
    title: 'Before a flood',
    steps: [
      'Know if your area is flood-prone and where your evacuation center is. Plan two routes on high ground.',
      'Prepare your go-bag and keep it near the door.',
      'Monitor PAGASA rainfall/flood advisories and your LGU announcements.',
      'Move valuables, documents and appliances to a higher floor.',
      'Clean drains and canals around your house.',
      'Agree on a family meeting place and who will help older people, children and PWDs.',
      'Charge phones and power banks; keep some fuel and cash.',
    ],
  },
  {
    id: 'during',
    title: 'During a flood',
    steps: [
      'Evacuate as soon as you are told to, or earlier if water is rising. Do not wait.',
      'Switch off the main electricity and gas, but only if you are dry and it is safe.',
      'Never walk, swim or drive through floodwater: 15 cm of moving water can knock you down, 30 cm can sweep a car away.',
      'Stay away from rivers, drains, canals and fallen power lines.',
      'If trapped, go to the highest floor or roof (not a closed attic) and signal for help.',
      'Keep listening to the radio or official updates. Text instead of calling to keep lines free.',
    ],
  },
  {
    id: 'after',
    title: 'After a flood',
    steps: [
      'Return home only when authorities say it is safe.',
      'Avoid floodwater: it can carry sewage and leptospirosis. If you waded through it, see a doctor or health center for preventive medicine.',
      'Have electrical systems checked before switching the power back on.',
      'Drink only boiled or bottled water until the supply is declared safe.',
      'Wear boots and gloves when cleaning; disinfect everything that got wet.',
      'Watch out for snakes, sharp debris and weakened walls or floors.',
      'Take photos of the damage for assistance and insurance claims.',
    ],
  },
]

const SOURCES = [
  { name: 'Ready.gov: Floods (FEMA)', url: 'https://www.ready.gov/floods' },
  { name: 'NIDM (National Institute of Disaster Management)', url: 'https://nidm.gov.in/' },
  { name: 'PAGASA Flood Information', url: 'https://www.pagasa.dost.gov.ph/flood' },
  { name: 'Department of Health (leptospirosis advisories)', url: 'https://doh.gov.ph/' },
]

const checked = reactive(loadJSON('arflood.gobag', {}))
watch(checked, (v) => saveJSON('arflood.gobag', v), { deep: true })
const done = computed(() => GO_BAG.filter((i) => checked[i.id]).length)
const open = reactive({ before: true, during: false, after: false })

function reset() {
  for (const k of Object.keys(checked)) delete checked[k]
}
</script>

<template>
  <div class="tab">
    <section class="card">
      <div class="row">
        <h2>🎒 Go-bag ({{ done }}/{{ GO_BAG.length }})</h2>
        <button v-if="done" class="link" @click="reset">Reset</button>
      </div>
      <div class="progress" role="progressbar" :aria-valuenow="done" :aria-valuemax="GO_BAG.length" aria-label="Go-bag packed">
        <div :style="{ width: (done / GO_BAG.length) * 100 + '%' }"></div>
      </div>
      <ul class="checks">
        <li v-for="item in GO_BAG" :key="item.id">
          <label>
            <input v-model="checked[item.id]" type="checkbox" />
            <span :class="{ done: checked[item.id] }">{{ item.text }}</span>
          </label>
        </li>
      </ul>
    </section>

    <section v-for="phase in PHASES" :key="phase.id" class="card">
      <button class="phase-head" :aria-expanded="open[phase.id]" @click="open[phase.id] = !open[phase.id]">
        <h2>{{ phase.title }}</h2>
        <span aria-hidden="true">{{ open[phase.id] ? '▾' : '▸' }}</span>
      </button>
      <ol v-if="open[phase.id]" class="steps">
        <li v-for="s in phase.steps" :key="s">{{ s }}</li>
      </ol>
    </section>

    <p class="small muted sources">
      Guidance adapted from:
      <template v-for="(s, i) in SOURCES" :key="s.url">
        <a :href="s.url" target="_blank" rel="noopener">{{ s.name }}</a><span v-if="i < SOURCES.length - 1"> · </span>
      </template>
    </p>
  </div>
</template>

<style scoped>
.tab {
  display: grid;
  gap: 12px;
}
h2 {
  margin: 0;
  font-size: 1rem;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.progress {
  height: 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
  margin: 10px 0;
}
.progress div {
  height: 100%;
  background: #2fbf5a;
  transition: width 0.2s;
}
.checks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
}
.checks label {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 6px 2px;
  cursor: pointer;
}
.checks input {
  width: 20px;
  height: 20px;
  flex: none;
  accent-color: #2fbf5a;
}
.done {
  opacity: 0.6;
  text-decoration: line-through;
}
.phase-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  background: none;
  border: 0;
  color: inherit;
  font: inherit;
  padding: 0;
  cursor: pointer;
  text-align: left;
}
.steps {
  margin: 10px 0 0;
  padding-left: 20px;
  display: grid;
  gap: 6px;
  font-size: 0.92rem;
}
.link {
  background: none;
  border: 0;
  color: var(--accent);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.sources a {
  color: inherit;
}
</style>
