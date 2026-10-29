<script setup>
import { ref } from 'vue'

defineProps({ embedded: { type: Boolean, default: false } })
defineEmits(['back'])

const year = new Date().getFullYear()

// Every external data source, asset and library, with licence and the
// attribution text to use (also exported as plain text for reports).
const SECTIONS = [
  {
    title: 'Live data and maps (Live Flood Mode)',
    items: [
      {
        name: 'OpenStreetMap: map data',
        use: 'Evacuation centers (shelters, assembly points, schools) and the road network used for routes',
        licence: 'Open Database License (ODbL) 1.0',
        attribution: '© OpenStreetMap contributors',
        url: 'https://www.openstreetmap.org/copyright',
      },
      {
        name: 'OpenStreetMap: standard map tiles (tile.openstreetmap.org)',
        use: 'Background map in Live Mode',
        licence: 'Map data ODbL 1.0; cartography CC BY-SA 2.0; use subject to the OSMF Tile Usage Policy',
        attribution: '© OpenStreetMap contributors',
        url: 'https://operations.osmfoundation.org/policies/tiles/',
      },
      {
        name: 'Overpass API (overpass-api.de, overpass.kumi.systems, overpass.private.coffee)',
        use: 'Searching OpenStreetMap for nearby evacuation places',
        licence: 'Data ODbL 1.0 (OpenStreetMap); Overpass software AGPL-3.0',
        attribution: '© OpenStreetMap contributors, via the Overpass API',
        url: 'https://wiki.openstreetmap.org/wiki/Overpass_API',
      },
      {
        name: 'Open-Meteo: Forecast API',
        use: 'Current rain and the 24-hour hourly rain forecast',
        licence: 'CC BY 4.0 (free for non-commercial use)',
        attribution: 'Weather data by Open-Meteo.com',
        url: 'https://open-meteo.com/en/terms',
      },
      {
        name: 'Open-Meteo: Flood API, using GloFAS (Copernicus Emergency Management Service)',
        use: 'River discharge forecast compared with its usual seasonal level',
        licence: 'CC BY 4.0 via Open-Meteo; GloFAS data under the Copernicus licence (free, attribution required)',
        attribution: `Flood data by Open-Meteo.com. Generated using Copernicus Emergency Management Service information ${year}`,
        url: 'https://open-meteo.com/en/docs/flood-api',
      },
      {
        name: 'Open-Meteo: Elevation API, using Copernicus DEM GLO-90',
        use: 'Ground elevation at and around your location',
        licence: 'CC BY 4.0 via Open-Meteo; Copernicus DEM licence (free, attribution required)',
        attribution:
          'Elevation by Open-Meteo.com. Copernicus DEM GLO-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved',
        url: 'https://open-meteo.com/en/docs/elevation-api',
      },
      {
        name: 'FOSSGIS e.V. routing service (routing.openstreetmap.de, OSRM)',
        use: 'Walking routes to evacuation centers',
        licence: 'Route data ODbL 1.0 (OpenStreetMap); OSRM software BSD-2-Clause; FOSSGIS usage policy (light use)',
        attribution: 'Routing © FOSSGIS e.V. / OSRM, data © OpenStreetMap contributors',
        url: 'https://routing.openstreetmap.de/about.html',
      },
      {
        name: 'Project OSRM demo server (router.project-osrm.org)',
        use: 'Backup router when the FOSSGIS server is unavailable (car-road route; walking time estimated)',
        licence: 'OSRM software BSD-2-Clause; data ODbL 1.0; demo server usage policy (max. 1 request/second)',
        attribution: 'Routing by OSRM, data © OpenStreetMap contributors',
        url: 'https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server',
      },
      {
        name: 'Google Maps (link only)',
        use: '"Share my location" message contains a maps.google.com link; no Google data is loaded by the app',
        licence: 'Not applicable (hyperlink)',
        attribution: '',
        url: 'https://maps.google.com/',
      },
    ],
  },
  {
    title: '3D assets and media (training simulation)',
    items: [
      {
        name: 'Kenney: City Kit, Mini Arena and 3D Platformer character models',
        use: 'Houses, tree and people (GLB) in the flood scene',
        licence: 'CC0 1.0 (public domain)',
        attribution: 'Models by Kenney (www.kenney.nl), CC0',
        url: 'https://kenney.nl/support',
      },
      {
        name: 'Own work',
        use: 'Water normal map (procedural), all sounds (Web Audio synthesis), primitive models, icons',
        licence: 'Part of this project',
        attribution: '',
        url: '',
      },
    ],
  },
  {
    title: 'Software libraries',
    items: [
      { name: 'Vue 3', use: 'User interface', licence: 'MIT', attribution: '', url: 'https://vuejs.org/' },
      { name: 'three.js (incl. the Water example shader, GLTFLoader, OrbitControls)', use: '3D and WebXR rendering', licence: 'MIT', attribution: '', url: 'https://threejs.org/' },
      { name: 'Leaflet', use: 'Interactive map', licence: 'BSD-2-Clause', attribution: '', url: 'https://leafletjs.com/' },
      { name: 'Vite, @vitejs/plugin-vue, @vitejs/plugin-basic-ssl', use: 'Build and dev server', licence: 'MIT', attribution: '', url: 'https://vite.dev/' },
      { name: 'vite-plugin-pwa and Workbox', use: 'Offline support (service worker)', licence: 'MIT', attribution: '', url: 'https://vite-pwa-org.netlify.app/' },
      { name: 'IWER and @iwer/sem (Meta)', use: 'WebXR emulation during development only (not shipped)', licence: 'MIT', attribution: '', url: 'https://github.com/meta-quest/immersive-web-emulation-runtime' },
    ],
  },
  {
    title: 'Safety guidance (references for tips, quiz and checklist)',
    items: [
      { name: 'PAGASA: rainfall warning levels and flood information', use: 'Risk thresholds (7.5 / 15 / 30 mm per hour) and links', licence: 'Reference only', attribution: '', url: 'https://www.pagasa.dost.gov.ph/flood' },
      { name: 'NDRRMC', use: 'Official advisories (link)', licence: 'Reference only', attribution: '', url: 'https://ndrrmc.gov.ph/' },
      { name: 'FEMA / Ready.gov: Floods', use: 'Before / during / after steps, go-bag', licence: 'Reference only', attribution: '', url: 'https://www.ready.gov/floods' },
      { name: 'NIDM (National Institute of Disaster Management)', use: 'Flood preparedness guidance', licence: 'Reference only', attribution: '', url: 'https://nidm.gov.in/' },
      { name: 'Department of Health (Philippines)', use: 'Leptospirosis advice after floods', licence: 'Reference only', attribution: '', url: 'https://doh.gov.ph/' },
    ],
  },
]

const BROWSER_APIS =
  'WebXR (immersive-ar, hit-test, dom-overlay, anchors), Geolocation, DeviceOrientation, MediaDevices (camera), Web Audio, Web Speech (speechSynthesis), Screen Wake Lock, Web Share, Service Worker / Cache Storage, localStorage.'

const copied = ref(false)
async function copyText() {
  const lines = ['Flood Ready AR: data sources, assets and licences', '']
  for (const s of SECTIONS) {
    lines.push(s.title)
    for (const i of s.items) {
      lines.push(`- ${i.name}: ${i.use}. Licence: ${i.licence}.${i.attribution ? ` Attribution: "${i.attribution}".` : ''}${i.url ? ` ${i.url}` : ''}`)
    }
    lines.push('')
  }
  lines.push(`Browser APIs: ${BROWSER_APIS}`)
  try {
    await navigator.clipboard.writeText(lines.join('\n'))
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <div :class="embedded ? 'about' : 'screen ui'">
    <div :class="embedded ? 'about' : 'card about'">
      <div class="head">
        <h1>About &amp; data sources</h1>
        <button class="btn small-btn" @click="copyText">{{ copied ? '✔ Copied' : '📋 Copy as text' }}</button>
      </div>
      <p class="muted small">
        Flood Ready AR is a student project for flood-safety education. Live Flood Mode shows automated estimates
        from the public services below. <b>It does not replace official warnings</b> from PAGASA, NDRRMC or your LGU.
      </p>

      <section v-for="s in SECTIONS" :key="s.title">
        <h2>{{ s.title }}</h2>
        <ul>
          <li v-for="i in s.items" :key="i.name">
            <b><a v-if="i.url" :href="i.url" target="_blank" rel="noopener">{{ i.name }}</a><template v-else>{{ i.name }}</template></b>
            <div class="small">{{ i.use }}</div>
            <div class="small"><span class="tag">Licence</span> {{ i.licence }}</div>
            <div v-if="i.attribution" class="small"><span class="tag">Attribution</span> {{ i.attribution }}</div>
          </li>
        </ul>
      </section>

      <section>
        <h2>Browser APIs</h2>
        <p class="small">{{ BROWSER_APIS }}</p>
      </section>

      <section>
        <h2>Privacy and fair use</h2>
        <ul class="plain small">
          <li>No account, no analytics, no tracking. Scores, badges, settings and saved data stay in this browser (localStorage).</li>
          <li>Your location is only sent to the services above (Open-Meteo, Overpass, routing) to fetch data for that place, and it is never stored on a server by this app.</li>
          <li>Requests are cached and rate-limited to respect each service's usage policy. The app identifies itself to them by its web address (HTTP Referer).</li>
        </ul>
      </section>

      <div v-if="!embedded" class="actions">
        <button class="btn primary" @click="$emit('back')">Back</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
h1 {
  margin: 0;
  font-size: 1.3rem;
}
h2 {
  font-size: 1rem;
  margin: 18px 0 8px;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
li {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  padding: 8px 10px;
  line-height: 1.4;
}
ul.plain li {
  background: none;
  padding: 0 0 0 14px;
  position: relative;
}
ul.plain li::before {
  content: '•';
  position: absolute;
  left: 0;
}
a {
  color: var(--accent);
}
.tag {
  display: inline-block;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  opacity: 0.7;
  min-width: 70px;
}
.small-btn {
  padding: 6px 12px;
  flex: none;
}
.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
