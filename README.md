# Flood Ready AR: Web-based AR Flood Simulation

A lightweight flood-awareness app that runs in the browser, with two parts:

- **Training simulation.** On an ARCore-capable Android phone it places a flood scene on your floor using
  WebXR. On other devices (iPhone, laptop) it runs the same scene in normal 3D.
- **[Live Flood Mode](#live-flood-mode).** For use during a real flood: a local risk estimate, nearby
  evacuation centers, walking directions with a camera-based guide arrow, emergency numbers, location
  sharing and a preparedness checklist. It works offline after the first use (installable PWA).

> ⚠️ **Live Flood Mode does not replace official warnings.** Always follow PAGASA, NDRRMC and your LGU.

**Stack:** Vite + Vue 3 (JavaScript), Three.js, WebXR (`immersive-ar` with `hit-test`, `dom-overlay`
and optional `anchors`), Web Audio API and the Web Speech API. No Unity, no native app. All sounds are
synthesised in code, so there are no audio files.

## Features

| | |
|---|---|
| **AR placement** | A reticle appears on detected horizontal surfaces, with an outline of the area to be placed. Choose an area size (1 m, 1.5 m or 2 m) for smaller rooms, then tap to place. The scene is anchored with WebXR Anchors when the device supports them, so it stays put while you walk. **Reposition scene** moves it at any time; a running mission is paused, not lost. |
| **Rising water** | The Three.js `Water` shader (`three/examples/jsm/objects/Water.js`) rises to the safe-zone height over the mission time. The ripples drift in the direction of the current. A translucent volume shows the depth, and up to 5 debris objects bob and drift. |
| **Missions** | Collect supplies and rescue people by tapping them (raycast), then tap the raised green **safe zone** before the water covers it. Supplies float once the water reaches them. |
| **Difficulty** | **Easy** 90 s, 3 tasks, slow current. **Normal** 60 s, 5 tasks. **Hard** 40 s, 7 tasks, fast current and more debris. Chosen on the start screen. |
| **3D models** | GLB models (CC0, from Kenney) for houses, trees and people, loaded with `GLTFLoader`. Built-in primitives are used for any model that is missing. People play their idle animation and wave an arm, or play a "wave" clip if the GLB has one. |
| **Atmosphere** | Rain particles, a dark stormy sky in 3D mode, and Web Audio sound: a rain loop, rushing water that gets louder and brighter as the level rises, a siren at 50 % water, and success, fail and collect sounds. There is a mute button in the HUD. |
| **Voice guidance** | `speechSynthesis` speaks short instructions at key moments: "The water is rising. First, rescue the person on the roof", "Warning! The water is halfway up", "Move to higher ground now! Follow the green arrows", and so on. It can be turned on or off on the start screen and in the HUD. |
| **Evacuation guidance** | Animated green arrows on the ground (or on the water) lead to the safe-zone steps, with a light beam over the platform. They appear once all tasks are done, or when the water passes 70 %. |
| **Live weather (optional)** | **Use live weather** asks for your location and calls the free [Open-Meteo](https://open-meteo.com/) API (no key needed). The current precipitation rate (mm/h; heavy is 7.6 mm/h or more, or a thunderstorm) sets the rain intensity and suggests a difficulty. If location is denied, the network is offline or the request times out, it silently falls back to the defaults. |
| **Analytics & badges** | Tracks the time of each task, the order of actions, early safe-zone attempts, how close you got to the deadline, and your quiz answers. The **Mission debrief** shows all of this, plus tips based on your mistakes. Best scores per difficulty and earned badges are saved in `localStorage`, with a **Badges** screen. |
| **Learning** | Flood safety tips on the start screen, and a 5-question quiz with explanations after each mission. |
| **Fallback** | Without WebXR AR, the same scene runs in 3D with OrbitControls (drag to orbit, scroll or pinch to zoom, click or tap to interact). |

**Scoring:** +100 per supply, +200 per person, plus 10 points for every second left when you reach the safe zone.

**Badges:**

| Badge | How to earn it |
|---|---|
| 🏠 Safe & Sound | Complete a mission. |
| ⚡ Quick Responder | Reach safety with at least half of the time left. |
| 🛟 Lifesaver | Rescue every person before picking up any supplies, then win. |
| 🎓 Flood Expert | Answer all 5 quiz questions correctly. |
| ⛈️ Storm Survivor | Complete a mission on Hard. |

## Setup

Requirements: [Node.js](https://nodejs.org/) 20.19+ (or 22.12+).

```bash
npm install
npm run dev          # HTTPS dev server, reachable on your local network (--host)
npm run build        # checks the data files, then builds into dist/
npm run check-data   # only validate public/evac-centers.json and public/emergency-contacts.json
npm run fetch-centers -- --area "Marikina"   # bundle an OpenStreetMap snapshot of evacuation places
npm run scrape-floods -- --dry-run   # collect flood reports now and print them (normally done by GitHub Actions)
npm test             # scraper and report-logic tests (saved sample pages, no network)
npm run preview      # serve the production build (also HTTPS + --host)
npm run preview:local  # production build over plain HTTP on localhost:4173 (to test offline/PWA)
npm run deploy       # build for GitHub Pages and publish (see "Deploy to GitHub Pages")
```

`npm run dev` prints something like:

```
➜  Local:   https://localhost:5173/
➜  Network: https://192.168.1.23:5173/
```

The dev server uses a self-signed certificate from `@vitejs/plugin-basic-ssl`. WebXR, geolocation and
speech only work on HTTPS ("secure context"), so this is required on the phone. Your browser will show
a certificate warning the first time. This is expected for local development, so accept it and continue.

**URL flags**

| Flag | Effect |
|---|---|
| `?live` | Opens Live Flood Mode directly (also the installed app's shortcut). |
| `?debug` | Shows an FPS counter under the HUD buttons. |
| `?emulate` | *Dev server only.* Installs an emulated AR headset with a virtual room; see [Testing without a phone](#option-b-built-in-emulator-emulate). |

## Live Flood Mode

Open it with the red **🚨 Live Mode** button on the start screen, or with `?live`. It is a separate,
lightweight part of the app. The 3D engine is not loaded (or is paused if it was already running), so it
uses no 3D rendering and much less battery.

| Tab | What it does |
|---|---|
| **Status** | Asks for your location, then shows current rain, the next 24 h of hourly rain, river flow and ground elevation. These are combined into a **Low / Moderate / High** risk card that says what to do at each level. Each data block shows its **source** and **last updated** time. |
| **Centers** | A Leaflet map and list of evacuation centers. Your **verified local list** (`public/evac-centers.json`) comes first, then nearby OpenStreetMap shelters, assembly points and schools, all sorted by distance. Tap one to get a **walking route**, then **🧭 AR Guide**. Without GPS you can tap the map to set your location. |
| **AR Guide** | Full screen: the back camera feed with a big arrow pointing along the route toward the center (compass + GPS bearing). The distance updates live, and there is a "never walk through floodwater" warning, arrival detection and off-route recalculation. GPS, camera, compass and the screen wake lock run **only while the guide is open**. |
| **Emergency** | One-tap calls to **911**, the **Philippine Red Cross (143)** and your **local rescue number** (editable in the app or in `public/emergency-contacts.json`). **Share my location** by SMS, the Web Share sheet or copy, with a Google Maps link. Also covers what to do if you are trapped. |
| **Checklist** | A go-bag checklist (saved on the device) and before / during / after flood steps adapted from FEMA (Ready.gov), NIDM, PAGASA and DOH guidance. |

### Data sources

| Data | Source | Notes |
|---|---|---|
| Current rain + 24 h hourly forecast | [Open-Meteo Forecast API](https://open-meteo.com/en/docs) | The current value is a 15-minute total, converted to mm/h. |
| River discharge vs. usual level | [Open-Meteo Flood API](https://open-meteo.com/en/docs/flood-api) (GloFAS, ~5 km grid) | One request fetches 5 years of daily history plus a 7-day forecast. "Usual" is the median flow for the same time of year (±15 days) in past years, and the 3-day peak is compared to it. Rivers too small for the model count as "no major river". |
| Elevation | [Open-Meteo Elevation API](https://open-meteo.com/en/docs/elevation-api) (Copernicus DEM 90 m) | Your point plus 8 points 500 m around you, to spot low-lying dips. |
| Evacuation centers | 1. `public/evac-centers.json` (verified), 2. `public/osm-centers-snapshot.json` (bundled [OpenStreetMap](https://www.openstreetmap.org/copyright) snapshot), 3. live [Overpass](https://wiki.openstreetmap.org/wiki/Overpass_API) results | Loaded in that order, and lower-priority duplicates (same OSM id, or within 60 m) are dropped. Verified centers are listed first, then OpenStreetMap places by distance, each labelled "OpenStreetMap snapshot, <date>" or "OpenStreetMap (live)". Tags: `emergency=assembly_point`, `amenity=shelter` (bus stops, picnic huts and similar are filtered out), `social_facility=shelter`, `amenity=school`. |
| Walking route | OSRM: the [FOSSGIS foot server](https://routing.openstreetmap.de/), then the [OSRM demo server](https://project-osrm.org/), then a straight line | The public OSRM demo server only has a **car** profile (it ignores `foot`), so the FOSSGIS-hosted OSRM foot server is tried first. If only the demo server answers, the walking time is estimated from the distance. |
| Map tiles | [OpenStreetMap](https://www.openstreetmap.org/copyright) | Tiles you have viewed are cached for 7 days for offline use. |

All of these are free and need no API key. The public Overpass servers are often overloaded, so the
verified local list matters: it always works, including offline.

### How the risk level is estimated

Points are added for each factor. Rain thresholds follow PAGASA's rainfall warning levels for 1-hour
rain: yellow 7.5–15 mm, orange 15–30 mm, red > 30 mm.

| Factor | 1 point | 2 points | 3 points |
|---|---|---|---|
| Rain right now | ≥ 7.5 mm/h | ≥ 15 mm/h | ≥ 30 mm/h |
| Next 24 h (higher of hourly peak / total) | ≥ 7.5 mm/h or ≥ 50 mm | ≥ 15 mm/h or ≥ 100 mm | ≥ 30 mm/h or ≥ 200 mm |
| River (3-day peak vs. usual) | ≥ 1.5× | ≥ 2.5×, or above the usual 90th percentile | ≥ 4× |
| Elevation (only when rain or river already score) | < 5 m above sea level, or ≥ 3 m lower than the area around you (1 point each) | | |

**High** means a total of 4 or more, or any single factor at 3 points. **Moderate** means a total of 2 or
more. Anything else is **Low**. If some data could not be loaded, the card says the real risk may be
higher. The thresholds live in `src/live/risk.js`. This is a simple, transparent heuristic for
awareness. It is **not a forecast model and not an official warning**.

### Configure for your area

Both files ship **empty on purpose**. Only add information confirmed by your barangay / MDRRMO / CDRRMO.
After editing, rebuild and redeploy so the offline copy updates.

**`public/evac-centers.json`**: verified evacuation centers, listed first and marked ✔ Verified. Example
with one center (the shipped file has `"centers": []`):

```json
{
  "updated": "2026-11-01",
  "source": "City DRRMO evacuation center list (date received)",
  "centers": [
    {
      "name": "Sample Barangay Covered Court",
      "lat": 14.6512,
      "lon": 121.1033,
      "address": "Street, Barangay, City",
      "capacity": 300,
      "contact": "0917 123 4567",
      "notes": "Use the 2nd-floor hall if the court floods."
    }
  ]
}
```

| Field | Required | Format |
|---|---|---|
| `name` | yes | text |
| `lat`, `lon` | yes | numbers **without quotes**, e.g. `14.6512` (Philippines: lat ≈ 5–21, lon ≈ 117–127). In Google Maps, right-click the spot and click the coordinates to copy them (the first number is lat). |
| `address`, `contact`, `notes` | no | text |
| `capacity` | no | number of people |
| `updated`, `source` (top level) | no | text, shown as the source of the list |

**`public/emergency-contacts.json`**: example (the shipped file has empty numbers and `"national": []`):

```json
{
  "national": [],
  "localRescue": { "label": "City Rescue (CDRRMO)", "number": "0917 123 4567" },
  "lguAdvisory": { "label": "City advisories", "url": "https://www.example.gov.ph/advisories" }
}
```

- `national`: leave it as `[]` to use the built-in **911** and **Philippine Red Cross 143**, or list your
  own `{ "label": "...", "number": "..." }` entries to replace them.
- `localRescue.number`: your city/municipality rescue hotline, as text in quotes. Users can also change it in the app.
- `lguAdvisory.url`: a full `https://` link, shown in the safety banner.

(The example names, numbers and links above only show the format. Use the official ones for your area.)

**Validation.** Both files are checked for mistakes:

- **On every build** (`npm run build`, `npm run deploy`, or on demand `npm run check-data`). A mistake stops
  the build with a clear message, for example:

  ```
  ✖ public/evac-centers.json → centers[0]: unknown field "nmae". Did you mean "name"?
  ✖ public/evac-centers.json → centers[0] ("Court"): "lat" must be a number without quotes, e.g. "lat": 14.6.
  ✖ public/evac-centers.json: invalid JSON at line 3, column 40 (...). Common causes: a missing comma between
    entries, a comma after the last entry, or quotes missing around a name.
  ✖ public/emergency-contacts.json → lguAdvisory: "url" must be a full https:// address (got "facebook.com/mycity").
  ```

  It also catches swapped lat/lon, numbers in quotes, phone numbers with letters, and duplicate
  coordinates (warning).
- **In the app**: the same messages are logged with `console.error` (prefixed `[Flood Ready]`), and Live
  Mode shows a short notice on the Centers / Emergency tab. Valid entries still work; broken ones are skipped.

### OpenStreetMap snapshot (recommended)

The public Overpass servers are often overloaded, so the app doesn't depend on them. Instead, fetch the
OpenStreetMap places for your area **once**, and they ship with the app (and work offline):

```bash
npm run fetch-centers -- --area "Marikina"                        # a city/municipality boundary
npm run fetch-centers -- --lat 14.6507 --lon 121.1029 --radius 5000   # or a circle (metres, max 25 km)
npm run deploy                                                    # publish it
```

- `--area` looks up the boundary with [Nominatim](https://nominatim.openstreetmap.org/) (", Philippines" is
  added unless you include a comma). It prints the matches it found; if it picked the wrong place, re-run
  with `--relation <id>` from that list.
- It queries Overpass once, **retrying patiently with backoff** (10 s, 20 s, 40 s, 60 s…, alternating two
  servers) for up to 5 minutes (`--max-minutes 10` for longer). It writes
  `public/osm-centers-snapshot.json` with the fetch date, the area, and the places.
- The snapshot is precached by the service worker, so it is available offline after the first visit.
- In the app: if the snapshot covers your location, **no live Overpass query is made**. Tap ↻ Refresh on
  the Centers tab to add live results on top. Outside the snapshot area, the app searches live as before.
- Snapshot places are still **not verified** evacuation centers. Verified ones belong in `evac-centers.json`.

**If Overpass is still down**, the script stops without changing anything and prints the exact query. Then:

1. Open [overpass-turbo.eu](https://overpass-turbo.eu/).
2. Replace the query on the left with the one printed by the script. To print it without fetching, add
   `--print-query`, e.g. `npm run fetch-centers -- --area "Marikina" --print-query`. For Marikina it is:

   ```
   [out:json][timeout:90];area(id:3600146949)->.a;(nwr(area.a)["emergency"="assembly_point"];nwr(area.a)["social_facility"="shelter"];nwr(area.a)["amenity"="shelter"];nwr(area.a)["amenity"="school"];);out center tags;
   ```
3. Click **Run**. If it reports that the server is busy, open **Settings → General → Overpass-API
   server**, choose another server, and run again.
4. Click **Export → Data → raw OSM data** (GeoJSON also works) and save the file.
5. Convert it into the snapshot: `npm run fetch-centers -- --import path/to/export.json --area "Marikina"`

**Refreshing later:** re-run the same `fetch-centers` command (it overwrites the snapshot), check the summary
it prints, then `git commit` + `npm run deploy`. Once before the rainy season (around May) and again
mid-season is plenty. Installed apps pick up the new snapshot on their next visit.

### Fair use of the free public services

These services are run by volunteers and non-profits. Live Mode follows their usage policies:

| Service | Policy (summary) | What the app does |
|---|---|---|
| Overpass API | Light use; avoid repeated identical queries; retry with backoff when busy | The bundled snapshot replaces live queries wherever it covers you. Live: one query at a time, max 5 km radius and 120 results, cached **24 h** per place (~1 km), manual refresh at most every **2 min**, and failures back off too. `fetch-centers`: one query per run, with exponential backoff. |
| Nominatim (script only) | Max 1 request/second, identifying User-Agent | One lookup per `fetch-centers` run, with a `FloodReadyAR/1.0 (…)` User-Agent. The app itself never calls Nominatim. |
| FOSSGIS routing (OSRM) | "Use a valid user agent and, if applicable, a correct referrer. No scraping, no heavy usage." | Routes cached **12 h** per center and start point (~100 m, last 20 routes). Requests spaced ≥ 1.5 s; "Recalculate" at most every **30 s**. |
| OSRM demo server | Max 1 request/second, no heavy use | Only used as a fallback, with the same spacing as above. |
| OSM tile server | Valid Referer from web pages, cache tiles ≥ 7 days, no bulk/prefetch | Only tiles you view are loaded; cached 7 days by the service worker; attribution shown on the map. |
| Open-Meteo | Free for non-commercial use (< 10,000 calls/day), attribution (CC BY 4.0) | Weather reused for **10 min**, river for **3 h**, elevation for **30 days** per place. Refresh at most once a minute. Credited in About. |

**App identification.** Browsers don't let web pages set a custom `User-Agent`. The app uses the browser's
real User-Agent and sends its address as the `Referer` (`<meta name="referrer"
content="strict-origin-when-cross-origin">` plus `referrerPolicy` on every request), which is what these
policies ask web apps to do. Map taps that move your location are **debounced** (1.5 s), so several quick
taps send one set of requests. Request times are remembered in `localStorage`, so reloading the page doesn't
reset the limits. The numbers are in `POLICY` in `src/live/liveStore.js`.

### Offline (PWA)

`vite-plugin-pwa` generates a service worker that precaches the app, tips, quiz, checklist, models,
`evac-centers.json` and `emergency-contacts.json`. Live data (risk inputs, OSM centers, your route, your
location and contacts) is saved in `localStorage` every time it is fetched. With no signal, the app still
opens and shows **"Offline: last updated <time>"** with the last saved data. Data that belongs to a place
more than 2 km from where you are now is labelled as such.

- The "Offline / no connection" notice comes from a real connectivity check (a tiny uncached request to the
  site), because `navigator.onLine` stays `true` on Wi-Fi without internet or with no mobile signal.
- On Android Chrome: menu → **Install app** / **Add to Home screen**. On iPhone Safari: Share →
  **Add to Home Screen**. The installed app has a **Live Flood Mode** shortcut.
- **Service workers need a trusted HTTPS certificate.** The self-signed dev certificate is not trusted, so
  offline mode **does not activate over `https://<PC-IP>:5173`**. To try it:
  - on a desktop, run `npm run preview:local` and open `http://localhost:4173` (localhost counts as secure), or
  - on a phone, deploy `dist/` to any HTTPS static host (GitHub Pages, Netlify, Vercel, Cloudflare Pages).
- Open Live Mode once while online (after setting your location) so there is data to show offline.

### Compass and the AR Guide

- **iPhone (iOS 13+)**: tapping **AR Guide** asks for motion & orientation access (Apple only allows this
  prompt from a tap). The guide then uses `webkitCompassHeading`.
- **Android Chrome**: uses `deviceorientationabsolute` and converts it to the direction the back camera
  points. Hold the phone upright in front of you.
- If no compass is available, the arrow switches to **north-up** (top of the screen = north). Once you
  start walking, the GPS direction of travel is used.
- Compass readings can be off near metal, cars and power lines. Move the phone in a figure-8 to calibrate.
  The heading is magnetic north; in the Philippines that differs from true north by about 1°.
- The arrow follows the route's next point about 20 m ahead, or points straight at the center when only a
  straight line is available. **It cannot see floodwater: always check the street ahead yourself.**

## Reported flooding

A GitHub Actions workflow (`.github/workflows/flood-reports.yml`) runs `scripts/scrape-floods.js` **every 30
minutes** (and on demand). It collects recent flood reports, commits them to `public/flood-reports.json` when
they changed, and redeploys GitHub Pages. In Live Mode:

- **Map layer "Reported flooding"** (toggle at the top right of the map): red = official PAGASA advisory (high
  confidence), amber = news report (medium confidence). Each popup shows the place, the source link and "reported X
  min ago".
- **Banner** on every tab when a report is within **2 km** of you, and the **risk card goes up one level**.
- **Routes:** OSRM can't be told to avoid an area, so the app asks for up to 3 alternative walking routes and picks
  the one crossing the fewest reported flood areas (a longer detour is used if it avoids them). If every route passes
  near a report, the route turns red with a warning, also shown in the AR Guide.
- Everywhere: *"Reports may be incomplete or outdated. Always follow official advisories."* No report does not mean
  no flooding.

### Sources

Each source's robots.txt is checked every run (cached for that run). A source that disallows us is skipped.
Every URL is requested **at most once per run**, requests to one site are spaced ≥ 1.5 s apart, and the bot
identifies itself as `FloodReadyBot/1.0 (+https://fcarabuena.github.io/ARFlood/; …)`.

| Source | Confidence | robots.txt / terms (checked 2026-10-29) | What is used |
|---|---|---|---|
| [PAGASA public alerts (CAP feed)](https://publicalert.pagasa.dost.gov.ph/feeds/) | high | No robots.txt (404 = no restrictions). Feed says **"Licensed under CC BY 4.0"**. | General Flood Advisories and rainfall warnings from the last 24 h that are still active (not "Final"/all clear, not expired). Each area comes with its **PSGC code** and polygon. |
| [PAGASA river basin status](https://www.pagasa.dost.gov.ph/flood) | high | No robots.txt (404). Public government page. | Basins whose status is not "Non-Flood Watch". |
| Google News RSS search ("flood", "baha", "pagbaha", "lubog") | — | **robots.txt: `Disallow: /` for all agents, no Allow for `/rss`. Skipped.** | Nothing. The check stays in the code, so it would be used automatically if Google allowed it. |
| [Inquirer.net](https://newsinfo.inquirer.net/feed), [Rappler](https://www.rappler.com/feed/), [GMA News](https://data.gmanetwork.com/gno/rss/news/feed.xml), [Philstar](https://www.philstar.com/rss/nation) RSS | medium | robots.txt allows these feed paths (GMA's data host has no robots.txt). Articles are © the publishers. | Items from the last 24 h that mention flooding ("flood…", "baha", "binaha", "pagbaha", "lubog"…). Items only about "flood control" projects are ignored. Only the **headline, a ≤ 220-character excerpt and the link** are kept. |

Google News was in the original plan, but its robots.txt forbids crawling `/rss`, so the four RSS feeds above
replace it. Each is a publisher's own official feed. Remove any of them in `scripts/lib/sources.mjs` if you prefer.

### Place names (no guessing)

Places are matched against **`data/ph-places.json`**: the PSA's PSGC list (17 regions, 81 provinces, 1,634
cities/municipalities, 42,046 barangays), with coordinates from Wikidata (CC0). It is rebuilt with
`npm run build-places` when the PSGC changes. Rules:

- PAGASA advisories carry PSGC codes, which are looked up directly.
- In news, the longest name wins ("Quezon City" is not Quezon province, "Metro Manila" is not Manila), and only
  capitalised mentions count.
- Names shared by several towns (e.g. "San Jose") are used only if a province or region in the same text says which
  one; otherwise they are skipped. Town names that are everyday words or famous people's names (Rizal, Bago,
  Mabini…) need the same confirmation.
- Barangays are only matched as "Barangay/Brgy. X" or "X, <City>" next to their own city. They use the barangay's
  coordinates when Wikidata has them, otherwise the city's (marked as city-level precision).
- Precision shown on the map: barangay (700 m area), city/municipality (3 km), PAGASA advisory (the province polygon).
  Province- or region-only news is listed but not used for "near you" or routing.

### Output: `public/flood-reports.json`

```json
{
  "generatedAt": "2026-10-29T15:25:58.240Z",
  "windowHours": 24,
  "sources": [{ "id": "pagasa-cap", "status": "ok", "reports": 0, "note": "…" }, { "id": "google-news", "status": "skipped", "reason": "disallowed by robots.txt (Disallow: /)" }],
  "reports": [{
    "id": "0fce724a1566", "kind": "news", "confidence": "medium",
    "place": { "psgc": "015518000", "name": "Dagupan City", "level": "city", "province": "Pangasinan", "region": "Ilocos Region", "precision": "city" },
    "lat": 16.043, "lon": 120.334,
    "source": "GMA News", "sourceUrl": "https://www.gmanetwork.com/news/…",
    "headline": "Floodwaters persist in Dagupan cemetery as Undas nears",
    "excerpt": "A cemetery in Dagupan City remains flooded…",
    "publishedAt": "2026-10-29T13:26:44.000Z"
  }],
  "notices": []
}
```

Official advisories also have `polygon` and `expiresAt`. Reports older than 24 h are dropped by the scraper, and
again by the app. The file is fetched **network-first** (not frozen in the offline cache), with the last copy used
offline.

### Reliability and the workflow

- A source that fails (timeout, HTTP error, page layout change) is logged as a warning in the Actions run and its
  summary table. The other sources are still used, and the run doesn't fail.
- If **every** source fails, the existing file is kept unchanged.
- The tests (`npm test`, 23 tests on saved sample pages in `tests/fixtures/`) run before each scrape. If a parser
  is broken, the workflow stops before publishing anything.
- The file is only rewritten when the reports changed (or every 6 h as a heartbeat), so there is no commit every
  30 minutes.
- **Your local copy:** the workflow commits to `master`, so run `git pull --rebase` before you push your own changes.
- **First run:** GitHub → repository → **Actions** → "Flood reports" → **Run workflow**. Scheduled runs then
  start automatically, though GitHub may delay them by several minutes. GitHub pauses scheduled workflows in
  repositories with no activity for 60 days, and the workflow's own commits count as activity.

### Flood-prone areas (Project NOAH): not included

Project NOAH's website ([noah.up.edu.ph](https://noah.up.edu.ph)) is a JavaScript-only app: its terms, licence and
even robots.txt can't be read without running the site, and no open licence for reusing its hazard maps could be
confirmed. So no NOAH layer was added. If you get written permission from the UP NOAH Center (with the tile/WMS URL
and attribution text they want), it can be added as a second overlay next to "Reported flooding" in
`CentersTab.vue`.

## Testing AR

Test in this order: the emulator first (fast iteration), then a real phone (camera, tracking, touch, performance).

### Option A: Immersive Web Emulator extension (Chrome / Edge)

The [Immersive Web Emulator](https://chromewebstore.google.com/detail/immersive-web-emulator/cgffilbpcibhmcfbgggfhfolhkfbhmik)
(by Meta) emulates a WebXR headset in the browser.

1. Install the extension from the Chrome Web Store. It works in Chrome and Edge.
2. Run `npm run dev` and open `https://localhost:5173` on the desktop. Accept the certificate warning.
3. Open DevTools (F12) and select the **WebXR** tab that the extension adds.
4. Choose a headset that supports AR, for example **Meta Quest 3**, then reload the page.
   **Start AR** should now be enabled.
5. In the WebXR panel, turn on a **synthetic environment** (a virtual room) so hit-test has a floor to
   find. Without a room, the reticle never appears.
6. Click **Start AR**. Tilt the emulated headset down until the white reticle and blue outline sit on
   the floor.
7. Press the right controller's **trigger** (select) to place the scene. Aim the controller at items and
   people and pull the trigger to collect and rescue them, then aim at the green safe zone.
8. The HUD (Start, Reposition scene, checklist and so on) is drawn on top of the emulated view and works
   with the mouse. A headset has no DOM overlay, so the app raises its HUD above the emulator's canvas.

### Option B: built-in emulator (`?emulate`)

The dev server can load the same emulation runtime as the extension
([IWER](https://github.com/meta-quest/immersive-web-emulation-runtime) plus its Synthetic Environment
Module) without installing anything:

1. `npm run dev`, then open `https://localhost:5173/?emulate&debug`.
2. Click **Start AR**. The device is exposed in the console as `__xrDevice`:

   ```js
   // look down at the floor
   const a = -40 * Math.PI / 180; __xrDevice.quaternion.set(Math.sin(a / 2), 0, 0, Math.cos(a / 2))
   // pull and release the trigger = tap/select
   __xrDevice.controllers.right.updateButtonValue('trigger', 1)
   __xrDevice.controllers.right.updateButtonValue('trigger', 0)
   ```

This mode exists for quick checks and automated tests. It is never included in `npm run build`.

### Option C: an Android phone (ARCore)

1. **Check the phone.** It must be [ARCore-supported](https://developers.google.com/ar/devices) and have
   **Google Play Services for AR** installed and up to date (Play Store). Use a recent **Chrome**.
2. **Same Wi-Fi.** Connect the phone and the computer to the same Wi-Fi network.
3. **Start the server** on the computer with `npm run dev`.
4. **Open the Network URL** for your Wi-Fi adapter (`https://<your-PC-IP>:5173`) in Chrome on the
   phone. Ignore addresses for VPN or virtual adapters (Tailscale, WSL, Docker).
5. **Accept the certificate warning**: *Advanced → Proceed to … (unsafe)*.
6. Tap **Start AR** and allow camera access.
7. Choose an **Area size** that fits your free floor space, then move the phone slowly until the prompt
   turns green ("Floor found"). Tap to place.
8. Press **Start mission**. Walk around and tap the items, the people and finally the safe zone.

**Phone checklist.** These are the things only a real device can confirm:

- [ ] Reticle appears on the floor within a few seconds, and not on walls.
- [ ] Tap places the scene where the reticle is, facing you.
- [ ] HUD is visible over the camera (DOM overlay), and the buttons respond.
- [ ] Tapping a HUD button does **not** also collect an object behind it (`.ui` + `beforexrselect`).
- [ ] The scene stays in place as you walk around it (anchors / tracking).
- [ ] The 2 m (or chosen) area matches the real space you expected.
- [ ] **Reposition scene** works mid-mission, and progress is kept.
- [ ] Sound plays (rain, water, siren at 50 %), and mute works.
- [ ] Voice guidance speaks, and the toggle silences it.
- [ ] `?debug` FPS stays at 30 or above during a Hard mission.

**Troubleshooting**

- *Page doesn't load on the phone:* Windows Firewall is probably blocking Node. Allow
  "Node.js JavaScript Runtime" on **Private** networks, and check that the Wi-Fi network is set to
  *Private*.
- *"Start AR" is disabled:* the page isn't on HTTPS, the device doesn't support ARCore, or Google Play
  Services for AR is missing. **Start 3D demo** still works.
- *No reticle:* add more light, and aim at a textured floor (plain glossy floors are hard to track).
  Move the phone slowly from side to side for a few seconds.
- *Dev server exits with `Assertion failed: !current_write_` (TLSWrap):* this is a crash inside Node's
  TLS layer, which Vite 8 hits when serving HTTPS over HTTP/2 under load (seen on Node 26). Restart
  `npm run dev`. If it keeps happening, switch to Node 22 or 24 LTS.
- *No voice:* some Android phones need a text-to-speech voice installed
  (Settings → Accessibility → Text-to-speech).
- *Remote debugging:* connect the phone over USB, enable USB debugging, and open `chrome://inspect` on
  the computer to see the phone's console.

## Performance

Target: 30+ fps on a mid-range Android phone. On phones and touch devices:

- The pixel ratio is capped at 1.5, and the WebXR framebuffer is scaled to 0.8.
- The water reflection render target is 256 × 256 and refreshes every other frame. This is the most
  expensive pass, because it re-renders the scene.
- Rain is capped at 450 line segments (900 on desktop), and only `intensity × max` are drawn.
- There are at most 5 debris objects (3, 4 or 5 depending on difficulty) and no shadows.
- Models are small low-poly GLBs that share one 512 × 512 colour-map texture per kit (about 330 KB in total).

Use `?debug` to see the frame rate on the device.

## 3D models

GLB files live in `public/models/` and are mapped to scene slots in **`public/models/models.json`**:

```json
{
  "houseRoof": "city/building-garage.glb",
  "houseA": "city/building-small-a.glb",
  "houseB": "city/building-small-c.glb",
  "houseC": "city/building-small-d.glb",
  "tree": "nature/tree.glb",
  "person": "people/person.glb"
}
```

- Models are auto-scaled to fit their slot and placed on the ground, so their original units don't matter.
- If a slot has no entry, or its file fails to load, the built-in primitive is used and a warning is logged.
- **Supplies** use primitives by default. To use models, put files in `public/models/supplies/` and add
  for example `"firstaid": "supplies/firstaid.glb"`, `"bottle"`, `"flashlight"` and `"radio"` to the manifest.
- **People:** a clip whose name contains `wave` is played if present. Otherwise the `idle` clip plays,
  and a node named like `arm-right` / `RightArm` is raised and swung procedurally.
- Kenney GLBs reference `Textures/colormap.png` next to the file, so keep each kit in its own folder
  with its `Textures/` directory.
- Keep the total under about 10 MB. Prefer low-poly models with a single small texture, and compress big
  files with [gltf-transform](https://gltf-transform.dev/) (`gltf-transform optimize in.glb out.glb`).

**Included models** (all CC0, public domain):

| Files | Source |
|---|---|
| `city/building-*.glb` | Kenney, [Starter Kit City Builder](https://github.com/KenneyNL/Starter-Kit-City-Builder) (models from the City Kit) |
| `nature/tree.glb` | Kenney, [Starter Kit Basic Scene](https://github.com/KenneyNL/Starter-Kit-Basic-Scene) (Mini Arena) |
| `people/person.glb` | Kenney, [Starter Kit 3D Platformer](https://github.com/KenneyNL/Starter-Kit-3D-Platformer) (animated character) |

**More free sources:**

| Source | License | Good for |
|---|---|---|
| [Kenney](https://kenney.nl/assets) (City Kit, Nature Kit, Survival Kit, Mini Characters) | CC0 | Houses, trees, props, characters |
| [Quaternius](https://quaternius.com/) (Ultimate Modular, Animated Characters, Survival packs) | CC0 | Animated people (including wave clips), props |
| [Poly Pizza](https://poly.pizza/) | Mostly CC0 / CC-BY (check each model) | Single low-poly props: first-aid kit, bottle, flashlight, radio |
| [Sketchfab](https://sketchfab.com/search?features=downloadable&licenses=7c23a1ba438d4306920229c12afcb5f9&type=models) (filter by CC0) | CC0 or CC-BY | Specific props; download as glTF/GLB |
| [Mixamo](https://www.mixamo.com/) | Free with an Adobe account; may be used in your project but not redistributed as raw files | Rigging and animations ("Waving", "Idle") for your own character |

## Project structure

```
scripts/check-data.mjs   # validates the data files before every build
scripts/fetch-centers.mjs  # npm run fetch-centers: bundle an OpenStreetMap snapshot (or --import an overpass-turbo export)
scripts/scrape-floods.js   # flood reports → public/flood-reports.json (run by .github/workflows/flood-reports.yml)
scripts/lib/               # robots.txt, polite fetcher, PSGC place matcher, sources (PAGASA CAP/basins, news RSS)
scripts/build-places.mjs   # rebuilds data/ph-places.json (PSGC + Wikidata coordinates)
data/ph-places.json        # bundled PSGC place list for the scraper (not shipped to the app)
tests/                     # npm test: scraper + report logic, with saved pages in tests/fixtures/
src/
├── main.js / App.vue    # app entry; App creates the engine and switches screens
├── store.js             # shared reactive state + persisted settings
├── style.css
├── three/
│   ├── engine.js        # renderer, loop, mission state machine, cues, 3D fallback
│   ├── scene.js         # ground, houses, trees, car, safe zone, stormy 3D environment
│   ├── water.js         # Water shader, water volume, procedural normals, debris
│   ├── missions.js      # supplies + people, raycast picking, GLB swap, waving
│   ├── models.js        # GLTFLoader, models.json manifest, fit-to-slot
│   ├── rain.js          # rain particles
│   ├── guidance.js      # evacuation arrows + safe-zone beam
│   └── xr.js            # AR session, hit-test reticle, anchors, select input
├── services/
│   ├── sound.js         # Web Audio: rain, rushing water, siren, jingles
│   ├── voice.js         # speechSynthesis guidance
│   └── weather.js       # geolocation + Open-Meteo
├── game/
│   ├── difficulty.js    # Easy / Normal / Hard settings
│   ├── quiz.js          # quiz questions
│   ├── analytics.js     # mission tracking, results, tips, badges, best scores
│   └── settings.js      # safe localStorage helpers
├── dev/emulator.js      # ?emulate (dev only)
├── components/About.vue # About & data sources (licences, attribution; "Copy as text")
├── live/                # Live Flood Mode (loaded on demand, no 3D)
│   ├── LiveMode.vue     # header, offline notice, tabs, guide launcher
│   ├── liveStore.js     # Live Mode state and refresh actions
│   ├── api.js           # Open-Meteo (forecast, flood, elevation), Overpass, OSRM, JSON files
│   ├── risk.js          # Low/Moderate/High scoring + what to do
│   ├── cache.js         # localStorage cache with "last updated"
│   ├── geo.js           # distance, bearing, GPS helpers
│   ├── compass.js       # iOS/Android compass heading + permission
│   ├── validate.js      # checks evac-centers.json / emergency-contacts.json for mistakes
│   ├── osm.js           # OpenStreetMap query + parsing, shared with fetch-centers
│   ├── reports.js       # reported flooding: near-you areas, route hazards, route choice
│   └── components/      # StatusTab, CentersTab (Leaflet), GuideView, SosTab, ChecklistTab, SafetyBanner, DataStamp
└── components/
    ├── Tips.vue         # start screen: tips, difficulty, toggles, live weather
    ├── Hud.vue          # in-game HUD and result dialog
    ├── Quiz.vue         # 5-question quiz
    ├── Results.vue      # mission debrief: timeline, deadline, tips, badges
    └── Badges.vue       # all badges + best scores
```

### How it works

- **Engine ↔ UI.** `FloodEngine` writes game state into the reactive `store`, and Vue components call
  engine methods. Timer, water level and sound are updated about 10 times a second, not every frame.
- **AR taps vs. HUD taps.** With DOM overlay, tapping a button would also fire an XR `select`.
  `App.vue` cancels it with `beforexrselect` for any element inside a `.ui` element.
- **HUD in emulators.** The overlay has `z-index: 10000`, so it stays above the fullscreen canvas that
  WebXR emulators insert. On a phone, the DOM overlay API shows it over the camera.
- **Water.** The normal map is generated procedurally. A patched shader uniform (`flowOffset`) scrolls
  the ripples in the direction of the current.
- **Tapping small objects.** Each mission object has an invisible, larger hit sphere.

### Tuning

- Difficulty (time, tasks, debris, default rain): `src/game/difficulty.js`
- Safe-zone height (the water reaches it when time runs out): `SAFE_ZONE_HEIGHT` in `src/three/scene.js`
- Object positions: `DEFINITIONS` in `src/three/missions.js`
- Voice lines: `src/three/engine.js` (search for `voice.say`)
- Badges and debrief tips: `src/game/analytics.js`

## Deploy to GitHub Pages

The site is published as `https://<your-username>.github.io/<repo>/` over HTTPS, which gives you a working
service worker (offline mode), camera, GPS and compass on any phone without certificate warnings.
`npm run deploy` builds with the right base path (worked out from your `origin` remote) and pushes `dist/`
to a `gh-pages` branch.

**One-time setup**

1. **GitHub account.** Sign up or sign in at [github.com](https://github.com/).
2. **Create the repository.** Go to [github.com/new](https://github.com/new):
   - Repository name: `ARFlood` (any name works; the site path follows it)
   - Visibility: **Public** (GitHub Pages is free for public repositories)
   - Leave "Add a README", ".gitignore" and "license" **unticked** (this project already has them)
   - Click **Create repository**.
3. **Connect this folder and push** (in the project folder, in PowerShell or Git Bash):

   ```bash
   git checkout master
   git remote add origin https://github.com/<your-username>/ARFlood.git
   git push -u origin master
   git push origin live-flood-mode pages-deploy   # optional: also publish the feature branches
   ```

   On the first push, Git for Windows opens **Git Credential Manager**: choose **Sign in with your
   browser**, log in to GitHub and click **Authorize**. Git remembers this.
   (Optional: `git config user.email "<the email on your GitHub account>"` so commits link to your profile.)
4. **Publish:**

   ```bash
   npm run deploy
   ```

   This validates the data files, builds with base `/ARFlood/`, and pushes the site to the `gh-pages` branch.
5. **Turn on Pages.** On GitHub, open the repository → **Settings** → **Pages**. Under "Build and
   deployment", set **Source: Deploy from a branch**, **Branch: `gh-pages`**, folder **`/ (root)`**, then
   click **Save**. After about a minute, the page shows *"Your site is live at
   https://<your-username>.github.io/ARFlood/"*. HTTPS is enabled automatically.

**Updating the site later:** commit your changes, `git push`, then `npm run deploy` again. Visitors get the new
version automatically on their next visit (the service worker updates itself).

**Notes**

- Repository named `<your-username>.github.io`? Then the site is served at the domain root and the base path
  is `/` automatically.
- Custom domain or another host? Override the base path: `BASE_PATH=/ npm run build:pages`. In Git Bash,
  prefix it with `MSYS_NO_PATHCONV=1`, otherwise Git Bash rewrites `/` paths; the build stops with a
  clear error if that happens.
- Netlify alternative: drag the `dist/` folder from `npm run build` onto
  [app.netlify.com/drop](https://app.netlify.com/drop). It is served at the domain root, so no base path is needed.

## Live Mode checklist (needs a real phone)

- [ ] iPhone: tapping **AR Guide** shows the motion permission prompt, and after "Allow" the arrow turns with the phone.
- [ ] Android: the arrow points the right way when you hold the phone upright and turn around.
- [ ] Distance counts down as you walk, and "You have arrived" appears within about 30 m.
- [ ] The camera feed shows behind the arrow, and closing the guide turns off the camera and GPS.
- [ ] Call buttons open the dialer with 911 / 143 / your local number.
- [ ] **Send by SMS** opens the messaging app with the location text (iOS and Android handle `sms:` slightly differently).
- [ ] The installed PWA opens in airplane mode and shows "Offline: last updated …" with your last data.

## Browser support

| Device | Mode |
|---|---|
| Android + Chrome + ARCore | Full AR (hit-test, DOM overlay HUD, anchors) |
| iPhone / iPad (Safari) | 3D fallback (iOS Safari has no WebXR AR) |
| Desktop Chrome / Edge / Firefox | 3D fallback, or AR via the Immersive Web Emulator / `?emulate` |

Live Flood Mode works on all of them, including iPhone (Safari 13+). The AR Guide needs a phone with a compass for the turning arrow.
