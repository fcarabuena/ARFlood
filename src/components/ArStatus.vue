<script setup>
import { computed, ref } from 'vue'
import { store } from '../store.js'

const open = ref(true)
const copied = ref(false)
const ar = computed(() => store.ar)

// Each row: label, value, state ('ok' | 'warn' | 'bad' | 'wait').
const rows = computed(() => {
  const a = ar.value
  if (!a) return []
  const hitsState = a.floorHitsPerSec > 0 ? 'ok' : a.rawHitsPerSec > 0 ? 'warn' : a.hitSource === 'created' ? 'wait' : 'bad'
  return [
    ['WebXR AR', store.arSupported ? 'supported' : 'not supported', store.arSupported ? 'ok' : 'bad'],
    ['Session', a.sessionStarted ? `started${a.domOverlay ? ' · HUD overlay on' : ' · no HUD overlay'}` : 'not running', a.sessionStarted ? 'ok' : 'bad'],
    ['Reference space', a.refSpace || '–', a.refSpace === 'local-floor' ? 'ok' : a.refSpace ? 'warn' : 'wait'],
    [
      'Hit-test source',
      a.hitSource === 'failed' ? `failed: ${a.hitSourceError}` : a.hitSource,
      a.hitSource === 'created' ? 'ok' : a.hitSource === 'failed' ? 'bad' : 'wait',
    ],
    ['Hit results / s', `${a.rawHitsPerSec} (floor-like: ${a.floorHitsPerSec})`, hitsState],
    [
      'Tracking',
      { normal: 'normal', limited: 'limited (position estimated)', lost: 'lost: no camera pose' }[a.tracking] ?? a.tracking,
      a.tracking === 'normal' ? 'ok' : a.tracking === 'limited' ? 'warn' : 'bad',
    ],
    ['Frame rate', `${a.fps} fps`, a.fps >= 25 ? 'ok' : a.fps > 0 ? 'warn' : 'wait'],
    ['Reticle', a.reticleVisible ? 'visible' : a.floorSeen ? 'hidden (floor seen earlier)' : 'hidden', a.reticleVisible ? 'ok' : 'wait'],
  ]
})

const ICON = { ok: '✓', warn: '!', bad: '✕', wait: '…' }

async function copy() {
  const a = ar.value
  const text = [
    `Flood Ready AR status, ${new Date().toISOString()}`,
    `User agent: ${navigator.userAgent}`,
    `Features: ${a.features.join(', ') || '(not reported by browser)'}`,
    ...rows.value.map(([k, v]) => `${k}: ${v}`),
    `Searching for: ${a.searchSeconds} s`,
    `Errors: ${a.errors.length ? a.errors.join(' | ') : 'none'}`,
  ].join('\n')
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    // clipboard blocked: nothing else to do
  }
}
</script>

<template>
  <div v-if="ar" class="ar-status ui" :class="{ closed: !open }" aria-live="polite">
    <div class="head">
      <button class="toggle" :aria-expanded="open" @click="open = !open">AR status {{ open ? '▾' : '▸' }}</button>
      <button v-if="open" class="copy" @click="copy">{{ copied ? '✔ Copied' : 'Copy' }}</button>
    </div>
    <template v-if="open">
      <dl>
        <template v-for="[label, value, state] in rows" :key="label">
          <dt>{{ label }}</dt>
          <dd :class="state"><span class="icon">{{ ICON[state] }}</span>{{ value }}</dd>
        </template>
      </dl>
      <ul v-if="ar.errors.length" class="errors">
        <li v-for="e in ar.errors" :key="e">{{ e }}</li>
      </ul>
      <p v-if="ar.features.length" class="features">Features: {{ ar.features.join(', ') }}</p>
    </template>
  </div>
</template>

<style scoped>
.ar-status {
  position: absolute;
  top: calc(80px + env(safe-area-inset-top));
  left: 10px;
  width: min(62vw, 300px);
  background: rgba(5, 18, 28, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  padding: 6px 10px;
  font-size: 0.72rem;
  line-height: 1.3;
  pointer-events: auto;
}
.ar-status.closed {
  width: auto;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.toggle,
.copy {
  background: none;
  border: 0;
  color: inherit;
  font: inherit;
  font-weight: 700;
  padding: 2px 0;
  cursor: pointer;
}
.copy {
  font-weight: 400;
  text-decoration: underline;
  color: var(--accent);
}
dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 8px;
  margin: 4px 0 0;
}
dt {
  opacity: 0.75;
}
dd {
  margin: 0;
  word-break: break-word;
}
.icon {
  display: inline-block;
  width: 1.1em;
  font-weight: 700;
}
.ok .icon {
  color: #5dff8a;
}
.warn .icon {
  color: #ffcf5c;
}
.bad .icon,
.bad {
  color: #ff8a8d;
}
.wait .icon {
  color: #9fb3c8;
}
.errors {
  margin: 6px 0 0;
  padding-left: 14px;
  color: #ff8a8d;
}
.features {
  margin: 4px 0 0;
  opacity: 0.7;
}
</style>
