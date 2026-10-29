<script setup>
import { computed, onMounted, ref } from 'vue'
import { live, loadContacts, saveLocalRescue, setLocation } from '../liveStore.js'
import { getPosition } from '../geo.js'
import { formatTime } from '../cache.js'

// Built-in defaults so the call buttons work even if contacts never loaded.
const DEFAULT_NATIONAL = [
  { label: 'Emergency Hotline', number: '911', note: 'Police, fire, medical, rescue (nationwide)' },
  { label: 'Philippine Red Cross', number: '143', note: 'Rescue, ambulance, relief' },
]

onMounted(() => {
  if (!live.contacts?.data || live.online) loadContacts()
})

const contacts = computed(() => live.contacts?.data)
const national = computed(() => contacts.value?.national?.length ? contacts.value.national : DEFAULT_NATIONAL)
const localNumber = computed(() => live.localRescue || contacts.value?.localRescue?.number || '')
const localLabel = computed(() => contacts.value?.localRescue?.label || 'Local rescue (MDRRMO / CDRRMO)')
const tel = (n) => `tel:${n.replace(/[^\d+]/g, '')}`

const editing = ref(false)
const draft = ref('')
function edit() {
  draft.value = localNumber.value
  editing.value = true
}
function save() {
  saveLocalRescue(draft.value)
  editing.value = false
}

// --- Share my location ------------------------------------------------------------
const sharePos = ref(null)
const shareError = ref('')
const locating = ref(false)
const copied = ref(false)

async function getFix() {
  locating.value = true
  shareError.value = ''
  try {
    const p = await getPosition({ timeout: 12000 })
    sharePos.value = p
    setLocation({ ...p, source: 'gps' })
  } catch (err) {
    shareError.value = err.message
    if (live.location) sharePos.value = live.location // last known
  } finally {
    locating.value = false
  }
}

const mapsLink = computed(() =>
  sharePos.value ? `https://maps.google.com/?q=${sharePos.value.lat.toFixed(6)},${sharePos.value.lon.toFixed(6)}` : ''
)
const message = computed(() => {
  if (!sharePos.value) return ''
  const acc = sharePos.value.accuracy ? ` (±${Math.round(sharePos.value.accuracy)} m)` : ''
  return `I need help (flood). My location${acc} at ${formatTime(sharePos.value.time)}: ${mapsLink.value}`
})
const smsLink = computed(() => `sms:?&body=${encodeURIComponent(message.value)}`)
const canShare = typeof navigator.share === 'function'

async function share() {
  try {
    await navigator.share({ title: 'My location', text: message.value })
  } catch {
    // user cancelled
  }
}
async function copy() {
  try {
    await navigator.clipboard.writeText(message.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    shareError.value = 'Could not copy. Select the text above and copy it manually.'
  }
}
</script>

<template>
  <div class="tab">
    <section class="card">
      <h2>Call for help</h2>
      <div class="calls">
        <a v-for="c in national" :key="c.number" class="call" :href="tel(c.number)">
          <span class="num">📞 {{ c.number }}</span>
          <span class="lbl">{{ c.label }}</span>
          <span v-if="c.note" class="note">{{ c.note }}</span>
        </a>
        <a v-if="localNumber && !editing" class="call local" :href="tel(localNumber)">
          <span class="num">📞 {{ localNumber }}</span>
          <span class="lbl">{{ localLabel }}</span>
        </a>
      </div>

      <div class="local-edit">
        <template v-if="editing">
          <label class="small" for="local-rescue">Your city/municipality rescue number</label>
          <div class="edit-row">
            <input id="local-rescue" v-model="draft" type="tel" inputmode="tel" placeholder="e.g. 0917 123 4567" />
            <button class="btn primary" @click="save">Save</button>
            <button class="btn" @click="editing = false">Cancel</button>
          </div>
        </template>
        <button v-else class="link" @click="edit">
          {{ localNumber ? 'Edit local rescue number' : '+ Add your local rescue number (MDRRMO / CDRRMO)' }}
        </button>
      </div>
      <p v-if="contacts?.issues?.length" class="warn small">
        ⚠ emergency-contacts.json: {{ contacts.issues[0] }}
      </p>
      <p class="small muted">If calls don't go through, send a text: SMS often works when calls fail.</p>
    </section>

    <section class="card">
      <h2>Share my location</h2>
      <button class="btn primary wide" :disabled="locating" @click="getFix">
        {{ locating ? 'Getting GPS fix…' : sharePos ? '↻ Update my location' : '📍 Get my location to share' }}
      </button>
      <p v-if="shareError" class="warn small">{{ shareError }}</p>
      <template v-if="sharePos">
        <p class="message">{{ message }}</p>
        <div class="share-row">
          <a class="btn" :href="smsLink">💬 Send by SMS</a>
          <button v-if="canShare" class="btn" @click="share">📤 Share…</button>
          <button class="btn" @click="copy">{{ copied ? '✔ Copied' : '📋 Copy' }}</button>
          <a class="btn" :href="mapsLink" target="_blank" rel="noopener">🗺️ Open map</a>
        </div>
      </template>
    </section>

    <section class="card">
      <h2>If you are trapped by floodwater</h2>
      <ul class="steps">
        <li>Go to the highest floor or the roof. Don't go into a closed attic: you could be trapped by rising water.</li>
        <li>Call 911 or 143, or text your location to family and your barangay.</li>
        <li>Signal rescuers with a flashlight, whistle or bright cloth.</li>
        <li>Stay away from electrical wires and outlets in water.</li>
        <li>Do not try to swim or walk through moving water.</li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.tab {
  display: grid;
  gap: 12px;
}
h2 {
  margin: 0 0 10px;
  font-size: 1rem;
}
.calls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
}
.call {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: #b3141a;
  color: #fff;
  text-decoration: none;
  border-radius: 14px;
  padding: 14px;
  min-height: 84px;
}
.call.local {
  background: #8a3b00;
}
.call:active {
  filter: brightness(1.2);
}
.num {
  font-size: 1.6rem;
  font-weight: 800;
}
.lbl {
  font-weight: 700;
}
.note {
  font-size: 0.75rem;
  opacity: 0.85;
}
.local-edit {
  margin-top: 10px;
}
.edit-row {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
.edit-row input {
  flex: 1;
  min-width: 0;
  font: inherit;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
}
.link {
  background: none;
  border: 0;
  color: var(--accent);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
}
.wide {
  width: 100%;
}
.message {
  background: rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  padding: 10px;
  font-size: 0.9rem;
  word-break: break-word;
  user-select: text;
}
.share-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.share-row .btn {
  flex: 1 1 120px;
  text-align: center;
  text-decoration: none;
}
.steps {
  margin: 0;
  padding-left: 20px;
  display: grid;
  gap: 6px;
  font-size: 0.92rem;
}
.warn {
  color: #ffcf5c;
}
</style>
