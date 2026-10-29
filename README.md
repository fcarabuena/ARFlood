# Flood Ready AR: Web-based AR Flood Simulation

A lightweight flood-awareness simulation that runs in the browser. On an ARCore-capable Android phone
it places a flood scene on your floor using WebXR. On other devices (iPhone, laptop) it runs the same
scene in normal 3D.

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
npm run dev      # HTTPS dev server, reachable on your local network (--host)
npm run build    # production build into dist/
npm run preview  # serve the production build (also HTTPS + --host)
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
| `?debug` | Shows an FPS counter under the HUD buttons. |
| `?emulate` | *Dev server only.* Installs an emulated AR headset with a virtual room; see [Testing without a phone](#option-b-built-in-emulator-emulate). |

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

## Browser support

| Device | Mode |
|---|---|
| Android + Chrome + ARCore | Full AR (hit-test, DOM overlay HUD, anchors) |
| iPhone / iPad (Safari) | 3D fallback (iOS Safari has no WebXR AR) |
| Desktop Chrome / Edge / Firefox | 3D fallback, or AR via the Immersive Web Emulator / `?emulate` |
