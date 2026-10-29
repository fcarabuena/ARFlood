import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createFloodScene, createFallbackEnvironment, SAFE_ZONE_HEIGHT } from './scene.js'
import { FloodWater } from './water.js'
import { MissionManager } from './missions.js'
import { ARController } from './xr.js'
import { Rain } from './rain.js'
import { EvacuationGuide } from './guidance.js'
import { loadSlot, fitModel, swapInto } from './models.js'
import { store, showMessage, currentDifficulty } from '../store.js'
import { sound } from '../services/sound.js'
import { voice } from '../services/voice.js'
import { tracker } from '../game/analytics.js'

const IDLE_WATER = 0.015 // puddle level before the mission starts
const STORM_SKY = 0x3d4854
const EVACUATE_AT = 0.7 // show the arrows when the water passes 70 %

export const isLowPower =
  /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches

/** "Rescue person on the roof" -> "rescue the person on the roof", "Water bottle" -> "collect the water bottle" */
function taskHint(item) {
  return item.kind === 'person'
    ? item.label.replace(/^Rescue person/, 'rescue the person')
    : `collect the ${item.label.toLowerCase()}`
}

/**
 * Owns the renderer, the flood scene and the mission state machine.
 * Works in two modes: WebXR AR, and a regular 3D view with OrbitControls.
 */
export class FloodEngine {
  constructor(container) {
    this.container = container
    this.timer = new THREE.Timer()
    this.elapsed = 0 // total time, drives idle animations
    this.missionTime = 0 // seconds since the mission started
    this.uiTimer = 0
    this.fpsFrames = 0
    this.fpsTimer = 0
    this.milestones = new Set()
    this.resumePhase = null // phase to return to after "Reposition scene"

    // Renderer -------------------------------------------------------------
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    // Cap the resolution on phones: the biggest single win for frame rate.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isLowPower ? 1.5 : 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.xr.enabled = true
    renderer.xr.setFramebufferScaleFactor(isLowPower ? 0.8 : 1)
    container.appendChild(renderer.domElement)
    this.renderer = renderer

    // Scene & camera ---------------------------------------------------------
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.01, 50)

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x445533, 1.6)
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6)
    this.sun.position.set(2, 4, 1.5)
    this.scene.add(this.hemi, this.sun)

    // Flood world: everything that gets placed in AR lives under `world`.
    this.world = new THREE.Group()
    this.scene.add(this.world)
    const flood = createFloodScene()
    this.world.add(flood.root)
    this.water = new FloodWater(this.world, { lowPower: isLowPower })
    this.missions = new MissionManager(this.world, flood)
    this.guide = new EvacuationGuide(this.world)
    this.rain = new Rain(this.world, { maxDrops: isLowPower ? 450 : 900 })
    this.water.setLevel(IDLE_WATER)

    this.environment = createFallbackEnvironment()
    this.scene.add(this.environment)
    this._setStormLook(true)

    // Swap in GLB models in the background; primitives stay if any are missing.
    this.modelsReady = this._loadModels(flood.modelSlots)

    // Fallback controls --------------------------------------------------------
    this.controls = new OrbitControls(this.camera, renderer.domElement)
    this.controls.enableDamping = true
    this.controls.maxPolarAngle = Math.PI / 2.1
    this.controls.minDistance = 0.8
    this.controls.maxDistance = 6
    this.controls.autoRotate = true // slow turntable behind the start screen
    this.controls.autoRotateSpeed = 0.6
    this._frameCamera()

    this.raycaster = new THREE.Raycaster()
    this._setupPointerInput()

    // AR -----------------------------------------------------------------------
    this.ar = new ARController(renderer, this.scene, {
      onSelect: (raycaster) => this._handleTap(raycaster),
      onEnd: () => this._onARSessionEnd(),
      onReticle: (found) => (store.reticleFound = found),
    })

    // Errors while in AR are shown in the AR status panel (not only the console).
    const capture = (where) => (e) => {
      if (this.renderer.xr.isPresenting) this.ar.logError(where, e.reason ?? e.error ?? e.message)
    }
    window.addEventListener('error', capture('page error'))
    window.addEventListener('unhandledrejection', capture('unhandled promise'))

    this._onResize = () => this._resize()
    window.addEventListener('resize', this._onResize)

    this.applySettings()
    this._animate = (t, frame) => this._loop(t, frame)
    renderer.setAnimationLoop(this._animate)
  }

  async _loadModels(slots) {
    const helpers = { loadSlot, fitModel, swapInto }
    await Promise.all([
      ...slots.map(async ({ slot, group, fit }) => {
        const gltf = await loadSlot(slot)
        if (gltf) swapInto(group, fitModel(gltf.scene, fit))
      }),
      this.missions.loadModels(helpers),
    ])
  }

  // ---------------------------------------------------------------------------
  // Public API used by the Vue components
  // ---------------------------------------------------------------------------

  /** Re-reads difficulty / weather / sound settings from the store. */
  applySettings() {
    const diff = currentDifficulty()
    const playing = store.phase === 'playing' || store.phase === 'placing'
    if (!playing) {
      store.duration = diff.duration
      this.missions.setActive(diff.tasks)
      this.water.setDebris({ count: diff.debrisCount, speed: diff.debrisSpeed })
      this.resetMission()
    }
    const live = store.settings.liveWeather && store.weather
    const rain = live ? store.weather.intensity : diff.rain
    this.rain.setIntensity(rain)
    sound.setRain(rain)
    sound.setMuted(!store.settings.sound)
    voice.setEnabled(store.settings.voice)
    this.setAreaSize(store.settings.areaSize)
  }

  /** Size of the flood area in metres (AR); the scene is modelled at 2 m. */
  setAreaSize(metres) {
    const s = metres / 2
    if (store.mode === 'ar') this.world.scale.setScalar(s)
    this.ar.setAreaSize(metres)
  }

  async startAR(overlayRoot) {
    sound.unlock()
    const { domOverlay } = await this.ar.start(overlayRoot)
    store.mode = 'ar'
    store.domOverlay = domOverlay
    store.screen = 'sim'

    this._setStormLook(false)
    this.controls.enabled = false
    this.world.visible = false
    this.setAreaSize(store.settings.areaSize)
    this.ar.startSearching()
    this._publishArStats()
    this.resetMission()
    this.resumePhase = null
    store.phase = 'placing'
    voice.say('Point your phone at the floor and move it slowly. Tap when you see the circle.', { key: 'scan' })
  }

  start3D() {
    sound.unlock()
    store.mode = '3d'
    store.screen = 'sim'
    this.controls.autoRotate = false
    this._frameCamera()
    this.resetMission()
  }

  /** Back to the start screen from the 3D fallback (AR uses exitAR). */
  stop3D() {
    this.resetMission()
    store.mode = null
    store.screen = 'tips'
    this.controls.autoRotate = true
  }

  exitAR() {
    this.ar.end()
  }

  /** "Reposition scene": scan for a floor again. A running mission is paused, not lost. */
  replace() {
    if (store.mode !== 'ar' || store.phase === 'placing') return
    this.resumePhase = store.phase
    this.world.visible = false
    this.ar.clearAnchor()
    this.ar.startSearching()
    store.phase = 'placing'
  }

  /**
   * "Place in front of me": used when no floor is found. Puts the scene 1.5 m
   * ahead (at the last detected floor height, or 1.2 m below the camera).
   */
  placeInFront() {
    if (store.mode !== 'ar' || store.phase !== 'placing') return
    const placement = this.ar.getPlacementInFront(this.renderer.xr.getCamera())
    this._applyPlacement(placement)
    if (placement.estimated) showMessage('Placed 1.5 m ahead. Floor height is estimated, so it may float a little.')
  }

  startMission() {
    if (store.phase === 'placing') return
    sound.unlock()
    this.resetMission()
    store.phase = 'playing'
    const diff = currentDifficulty()
    tracker.start({ difficulty: diff.id, duration: diff.duration, tasks: this.missions.tasks })
    showMessage('Collect the supplies, rescue everyone, then reach the safe zone!')
    const next = this.missions.nextTask()
    voice.say(`The water is rising. First, ${taskHint(next)}.`, { key: 'start', urgent: true, cooldown: 0 })
  }

  restartMission() {
    this.startMission()
  }

  resetMission() {
    this.missionTime = 0
    this.milestones.clear()
    this.missions.reset()
    this.water.setLevel(IDLE_WATER)
    if (store.phase !== 'placing') store.phase = 'ready'
    store.score = 0
    store.duration = currentDifficulty().duration
    store.timeLeft = store.duration
    store.waterLevel = IDLE_WATER / SAFE_ZONE_HEIGHT
    store.failReason = ''
    store.evacuate = false
    sound.setWater(0)
    voice.reset()
    this._syncTasks()
  }

  /** Stops rendering and audio entirely (used while Live Flood Mode is open). */
  setPaused(paused) {
    if (paused) {
      this.renderer.setAnimationLoop(null)
      sound.suspend()
      voice.stop()
    } else {
      this.timer.reset?.()
      this.renderer.setAnimationLoop(this._animate)
      sound.resume()
    }
  }

  dispose() {
    this.renderer.setAnimationLoop(null)
    window.removeEventListener('resize', this._onResize)
    this.controls.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  // ---------------------------------------------------------------------------
  // Mission logic
  // ---------------------------------------------------------------------------

  _syncTasks() {
    store.tasks = this.missions.tasks
  }

  _handleTap(raycaster) {
    if (store.phase === 'placing') {
      this._placeWorld()
      return
    }
    if (store.phase !== 'playing') return

    const hit = this.missions.pick(raycaster)
    if (!hit) {
      tracker.miss()
      return
    }

    if (hit.kind === 'safezone') {
      if (this.missions.allDone()) {
        this._finish(true)
      } else {
        const left = this.missions.tasks.filter((t) => !t.done).length
        tracker.earlySafeTap(this.missionTime)
        sound.denied()
        showMessage(`Not yet! ${left} task${left > 1 ? 's' : ''} left before you can go to the safe zone.`)
        voice.say(`Not yet. First ${taskHint(this.missions.nextTask())}.`, { key: 'early', cooldown: 4 })
      }
      return
    }

    this.missions.complete(hit.id)
    tracker.task(this.missionTime, hit)
    store.score += hit.points
    this._syncTasks()
    sound.collect()
    navigator.vibrate?.(40)
    showMessage(hit.kind === 'person' ? `Person rescued! +${hit.points}` : `${hit.label} collected! +${hit.points}`)

    if (this.missions.allDone()) {
      store.evacuate = true
      setTimeout(() => store.phase === 'playing' && showMessage('All done! Follow the arrows to the safe zone!'), 1200)
      voice.say('Everyone is ready. Move to higher ground now. Follow the green arrows to the safe zone.', {
        key: 'all-done',
        urgent: true,
      })
    } else {
      voice.say(`Good. Now ${taskHint(this.missions.nextTask())}.`, { key: `next-${hit.id}`, cooldown: 0 })
    }
  }

  _finish(success) {
    const timeLeft = Math.max(0, store.duration - this.missionTime)
    if (success) {
      const bonus = Math.round(timeLeft * 10)
      store.score += bonus
      showMessage(`You reached safety! Time bonus +${bonus}`)
      sound.success()
      voice.say('You made it to higher ground. Well done!', { key: 'end', urgent: true, cooldown: 0 })
    } else {
      store.failReason = 'The water covered the safe zone before you got there.'
      sound.fail()
      voice.say('The water got too high. Next time, move to higher ground sooner.', { key: 'end', urgent: true, cooldown: 0 })
    }
    store.phase = success ? 'success' : 'failed'
    store.evacuate = false
    store.timeLeft = Math.ceil(timeLeft)
    store.waterLevel = this.water.level / SAFE_ZONE_HEIGHT
    store.lastMission = tracker.finish({ success, t: this.missionTime, score: store.score })
  }

  /** Voice, siren and guidance cues as the water rises. */
  _checkMilestones(level01) {
    const once = (key, fn) => {
      if (!this.milestones.has(key)) {
        this.milestones.add(key)
        fn()
      }
    }
    if (level01 >= 0.5) {
      once('half', () => {
        sound.siren()
        showMessage('⚠️ Water is halfway up!')
        voice.say('Warning! The water is halfway up. Hurry!', { key: 'half', urgent: true })
      })
    }
    if (level01 >= EVACUATE_AT) {
      once('evacuate', () => {
        store.evacuate = true
        voice.say('Move to higher ground now! Follow the green arrows.', { key: 'evacuate', urgent: true })
      })
    }
    if (store.duration - this.missionTime <= 10) {
      once('ten', () => voice.say('Ten seconds left!', { key: 'ten', urgent: true }))
    }
  }

  _placeWorld() {
    const placement = this.ar.getPlacement(this.renderer.xr.getCamera())
    if (!placement) {
      showMessage('Move your phone slowly to find the floor first.')
      return
    }
    this._applyPlacement(placement)
  }

  _applyPlacement(placement) {
    this.world.position.copy(placement.position)
    this.world.rotation.set(0, placement.yaw, 0)
    this.world.scale.setScalar(store.settings.areaSize / 2)
    this.world.visible = true
    this.ar.searching = false
    this.ar.anchorAt(placement.hit, this.world, placement.yaw, placement.position)

    if (this.resumePhase) {
      store.phase = this.resumePhase
      this.resumePhase = null
      showMessage('Scene moved. Carry on!')
    } else {
      store.phase = 'ready'
      showMessage('Flood area placed. Press Start when you are ready.')
      voice.say('Flood area placed. Press start when you are ready.', { key: 'placed' })
    }
  }

  _onARSessionEnd() {
    // Restore the normal 3D view.
    this._setStormLook(true)
    this.controls.enabled = true
    this.controls.autoRotate = true
    this.world.position.set(0, 0, 0)
    this.world.rotation.set(0, 0, 0)
    this.world.scale.setScalar(1)
    this.world.visible = true
    this.resumePhase = null
    store.phase = 'ready'
    this.resetMission()
    store.mode = null
    store.reticleFound = false
    if (store.screen !== 'quiz' && store.screen !== 'results' && store.screen !== 'badges') store.screen = 'tips'
    this._resize()
  }

  /** Copies AR diagnostics into the store for the HUD's AR status panel. */
  _publishArStats() {
    store.ar = { ...this.ar.stats, errors: [...this.ar.stats.errors], features: [...this.ar.stats.features] }
  }

  /** Dark stormy sky in 3D; in AR the camera feed is the background, so keep lights bright. */
  _setStormLook(storm) {
    if (storm) {
      this.scene.background = new THREE.Color(STORM_SKY)
      this.scene.fog = new THREE.Fog(STORM_SKY, 4, 12)
      this.hemi.color.set(0xb4c2cf)
      this.hemi.groundColor.set(0x2c3322)
      this.hemi.intensity = 1.25
      this.sun.color.set(0xdfe7f0)
      this.sun.intensity = 1.0
      this.environment.visible = true
    } else {
      this.scene.background = null
      this.scene.fog = null
      this.hemi.color.set(0xffffff)
      this.hemi.groundColor.set(0x445533)
      this.hemi.intensity = 1.6
      this.sun.color.set(0xffffff)
      this.sun.intensity = 1.5
      this.environment.visible = false
    }
  }

  // ---------------------------------------------------------------------------
  // Input (3D fallback): click/tap without dragging = select
  // ---------------------------------------------------------------------------

  _setupPointerInput() {
    const el = this.renderer.domElement
    const ndc = new THREE.Vector2()
    let down = null
    el.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY }
    })
    el.addEventListener('pointerup', (e) => {
      if (!down || store.mode !== '3d') return
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
      down = null
      if (moved > 8) return // it was a drag (orbit), not a tap
      const rect = el.getBoundingClientRect()
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      this.raycaster.setFromCamera(ndc, this.camera)
      this._handleTap(this.raycaster)
    })
  }

  /** Points the fallback camera at the scene, backing off on narrow (portrait) screens. */
  _frameCamera() {
    const aspect = this.container.clientWidth / this.container.clientHeight
    const dist = aspect < 1 ? 3.4 / Math.sqrt(aspect) : 3.4
    this.camera.position.set(1.9, 1.7, 2.3).normalize().multiplyScalar(dist)
    this.controls.target.set(0, 0.15, 0)
    this.controls.update()
  }

  _resize() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    if (this.renderer.xr.isPresenting) return
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  // ---------------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------------

  _loop(time, frame) {
    this.timer.update(time)
    const dt = Math.min(this.timer.getDelta(), 0.1)
    this.elapsed += dt

    if (this.renderer.xr.isPresenting) {
      this.ar.update(frame)
      this._arStatsTimer = (this._arStatsTimer ?? 0) + dt
      if (this._arStatsTimer > 0.25) {
        this._arStatsTimer = 0
        this._publishArStats()
      }
    }
    else this.controls.update()

    if (store.phase === 'playing') {
      this.missionTime += dt
      const level = Math.max(IDLE_WATER, (this.missionTime / store.duration) * SAFE_ZONE_HEIGHT)
      this.water.setLevel(level)
      this._checkMilestones(level / SAFE_ZONE_HEIGHT)
      if (this.missionTime >= store.duration) this._finish(false)
    }

    this.water.update(dt, this.elapsed)
    this.missions.update(dt, this.elapsed, this.water.level)
    this.guide.update(dt, this.elapsed, store.evacuate && store.phase === 'playing', this.water.level)
    this.rain.update(dt, this.water.level)

    // Push values to Vue ~10 times a second instead of every frame.
    this.uiTimer += dt
    if (this.uiTimer > 0.1) {
      this.uiTimer = 0
      if (store.phase === 'playing') {
        store.waterLevel = this.water.level / SAFE_ZONE_HEIGHT
        store.timeLeft = Math.max(0, Math.ceil(store.duration - this.missionTime))
        sound.setWater(store.waterLevel)
      }
    }

    this.fpsFrames++
    this.fpsTimer += dt
    if (this.fpsTimer >= 0.5) {
      if (store.debug) store.fps = Math.round(this.fpsFrames / this.fpsTimer)
      this.fpsFrames = 0
      this.fpsTimer = 0
    }

    this.renderer.render(this.scene, this.camera)
  }
}
