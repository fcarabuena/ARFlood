import * as THREE from 'three'

// A hit counts as "floor-like" when its surface normal is within ~40° of
// vertical. (0.9 ≈ 25° was too strict for noisy early plane estimates.)
const FLOOR_NORMAL_MIN_Y = 0.75
const MAX_ERRORS = 6

function createReticle() {
  const reticle = new THREE.Group()
  // Drawn on top of everything (no depth test) so the scene can't hide it.
  const mat = (color) => new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true })
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2), mat(0xffffff))
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.015, 16).rotateX(-Math.PI / 2), mat(0xffffff))
  // Preview of the area that will be placed (scaled to the chosen size).
  const area = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
    new THREE.LineBasicMaterial({ color: 0x4cc9f0, depthTest: false, transparent: true })
  )
  for (const o of [ring, dot, area]) o.renderOrder = 999
  reticle.add(ring, dot, area)
  reticle.userData.area = area
  reticle.matrixAutoUpdate = false
  reticle.visible = false
  return reticle
}

/** Fresh diagnostics object (shown in the HUD's AR status panel). */
export function emptyArStats() {
  return {
    sessionStarted: false,
    features: [], // enabled features reported by the browser (if it tells us)
    domOverlay: false,
    refSpace: '', // 'local-floor' or 'local'
    hitSource: 'not started', // 'pending' | 'created' | 'failed'
    hitSourceError: '',
    rawHitsPerSec: 0, // all hit-test results
    floorHitsPerSec: 0, // results on horizontal surfaces (used for the reticle)
    tracking: 'not started', // 'normal' | 'limited' | 'lost'
    fps: 0,
    reticleVisible: false,
    searchSeconds: 0,
    floorSeen: false,
    errors: [],
  }
}

/**
 * Handles the WebXR AR session: hit-testing for floor surfaces, the
 * placement reticle, anchoring the placed scene, tap ("select") input,
 * and live diagnostics for the AR status panel.
 */
export class ARController {
  constructor(renderer, scene, { onSelect, onEnd, onReticle }) {
    this.renderer = renderer
    this.scene = scene
    this.onSelect = onSelect
    this.onEnd = onEnd
    this.onReticle = onReticle

    this.session = null
    this.hitTestSource = null
    this.searching = false // true while placing, i.e. reticle should be shown
    this.searchStart = 0
    this.reticle = createReticle()
    this.reticleFound = false
    this.lastHit = null
    this.lastFloorY = null // height of the last floor-like hit (real floor height)
    this.anchor = null
    this.anchoredObject = null
    this.anchorYaw = 0
    this.pendingAnchor = null // { position, yaw } for frame.createAnchor (fallback placement)
    this.stats = emptyArStats()
    this._counts = { raw: 0, floor: 0, frames: 0, since: 0 }
    scene.add(this.reticle)

    this._up = new THREE.Vector3()
    this._m = new THREE.Matrix4()
    this.raycaster = new THREE.Raycaster()

    // Controllers 0/1 receive "select" when the user taps the screen in AR
    // (or pulls the trigger on a headset / the emulator).
    this.controllers = [0, 1].map((i) => {
      const c = renderer.xr.getController(i)
      c.addEventListener('select', () => this._handleSelect(c))
      scene.add(c)
      return c
    })
    this.setAreaSize(2)
  }

  setAreaSize(metres) {
    this.reticle.userData.area.scale.set(metres, 1, metres)
  }

  /** Record an error for the status panel (most recent first). */
  logError(where, err) {
    const msg = `${where}: ${err?.name && err.name !== 'Error' ? `${err.name}: ` : ''}${err?.message ?? err}`
    this.stats.errors = [msg, ...this.stats.errors.filter((e) => e !== msg)].slice(0, MAX_ERRORS)
    console.warn('[AR]', msg)
  }

  /** (Re)start scanning for a floor: shows the reticle and restarts the coaching timer. */
  startSearching() {
    this.searching = true
    this.searchStart = performance.now()
    this.stats.floorSeen = false
  }

  /**
   * Starts the AR session. Only throws if the session itself can't start.
   * Problems after that (reference space, hit-test source) are recorded in
   * this.stats and the session keeps running, so the user still sees the HUD
   * and can use "Place in front of me".
   */
  async start(overlayRoot) {
    this.stats = emptyArStats()
    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'local-floor', 'anchors'],
      domOverlay: overlayRoot ? { root: overlayRoot } : undefined,
    })
    this.session = session
    this.stats.sessionStarted = true
    this.stats.domOverlay = !!session.domOverlayState
    this.stats.features = Array.isArray(session.enabledFeatures) ? [...session.enabledFeatures] : []
    session.addEventListener('end', () => this._handleEnd())
    session.addEventListener('visibilitychange', () => {
      if (session.visibilityState !== 'visible') this.logError('session', `visibility is "${session.visibilityState}"`)
    })

    // Prefer 'local-floor' (origin on the floor); fall back to 'local'.
    let refType = 'local'
    try {
      await session.requestReferenceSpace('local-floor')
      refType = 'local-floor'
    } catch (err) {
      this.logError('local-floor unavailable, using local', err)
    }
    this.stats.refSpace = refType
    this.renderer.xr.setReferenceSpaceType(refType)
    await this.renderer.xr.setSession(session)

    // Hit test along the centre of the screen (the viewer's forward ray).
    this.stats.hitSource = 'pending'
    try {
      const viewerSpace = await session.requestReferenceSpace('viewer')
      this.hitTestSource = await session.requestHitTestSource({ space: viewerSpace })
      this.stats.hitSource = 'created'
    } catch (err) {
      this.stats.hitSource = 'failed'
      this.stats.hitSourceError = String(err?.message ?? err)
      this.logError('hit-test source', err)
    }
    this._counts = { raw: 0, floor: 0, frames: 0, since: performance.now() }
    return { domOverlay: this.stats.domOverlay }
  }

  end() {
    if (this.session) this.session.end()
  }

  /** Called every frame while in AR. */
  update(frame) {
    if (!frame) return
    const refSpace = this.renderer.xr.getReferenceSpace()
    this._counts.frames++

    // Tracking state from the viewer pose.
    const viewer = refSpace ? frame.getViewerPose(refSpace) : null
    this.stats.tracking = !viewer ? 'lost' : viewer.emulatedPosition ? 'limited' : 'normal'

    // Fallback placement asked for an anchor: create it from this frame.
    if (this.pendingAnchor && frame.createAnchor && typeof XRRigidTransform !== 'undefined') {
      const { position: p } = this.pendingAnchor
      this.pendingAnchor = null
      frame
        .createAnchor(new XRRigidTransform({ x: p.x, y: p.y, z: p.z }), refSpace)
        .then((a) => (this.anchor = a))
        .catch((err) => this.logError('anchor', err))
    }

    // Keep the placed scene locked to its anchor as ARCore refines tracking.
    if (this.anchor && this.anchoredObject && frame.trackedAnchors?.has(this.anchor)) {
      const pose = frame.getPose(this.anchor.anchorSpace, refSpace)
      if (pose) {
        const p = pose.transform.position
        this.anchoredObject.position.set(p.x, p.y, p.z)
        this.anchoredObject.rotation.set(0, this.anchorYaw, 0)
      }
    }

    let found = false
    if (this.hitTestSource && this.searching) {
      let results = []
      try {
        results = frame.getHitTestResults(this.hitTestSource)
      } catch (err) {
        this.logError('getHitTestResults', err)
      }
      this._counts.raw += results.length
      for (const hit of results) {
        const pose = hit.getPose(refSpace)
        if (!pose) continue
        this._m.fromArray(pose.transform.matrix)
        // Accept horizontal, upward-facing surfaces (floors / tables).
        this._up.set(0, 1, 0).transformDirection(this._m)
        if (this._up.y > FLOOR_NORMAL_MIN_Y) {
          this._counts.floor++
          this.reticle.matrix.copy(this._m)
          this.lastHit = hit
          this.lastFloorY = pose.transform.position.y
          this.stats.floorSeen = true
          found = true
          break
        }
      }
    }
    this.reticle.visible = found
    this.stats.reticleVisible = found
    if (found !== this.reticleFound) {
      this.reticleFound = found
      this.onReticle?.(found)
    }

    // Per-second rates for the status panel.
    const now = performance.now()
    const dt = (now - this._counts.since) / 1000
    if (dt >= 1) {
      this.stats.rawHitsPerSec = Math.round(this._counts.raw / dt)
      this.stats.floorHitsPerSec = Math.round(this._counts.floor / dt)
      this.stats.fps = Math.round(this._counts.frames / dt)
      this._counts = { raw: 0, floor: 0, frames: 0, since: now }
    }
    this.stats.searchSeconds = this.searching ? Math.floor((now - this.searchStart) / 1000) : 0
  }

  /** Position (and a yaw facing the user) for placing the scene at the reticle. */
  getPlacement(camera) {
    if (!this.reticle.visible) return null
    const position = new THREE.Vector3().setFromMatrixPosition(this.reticle.matrix)
    const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld)
    const yaw = Math.atan2(camPos.x - position.x, camPos.z - position.z)
    return { position, yaw, hit: this.lastHit }
  }

  /**
   * Fallback when no floor is found: 1.5 m ahead of the camera (horizontally),
   * at the height of the last real floor hit if there was one, otherwise
   * 1.2 m below the camera. Faces the user.
   */
  getPlacementInFront(camera, distance = 1.5, drop = 1.2) {
    const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld)
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(camera.matrixWorld))
    forward.y = 0
    if (forward.lengthSq() < 1e-4) forward.set(0, 0, -1) // looking straight down: use the default direction
    forward.normalize()
    const position = camPos.clone().addScaledVector(forward, distance)
    position.y = this.lastFloorY ?? camPos.y - drop
    const yaw = Math.atan2(camPos.x - position.x, camPos.z - position.z)
    return { position, yaw, hit: null, estimated: this.lastFloorY == null }
  }

  /** Anchors `object` at a hit result, or at a position (fallback placement). */
  async anchorAt(hit, object, yaw, position = null) {
    this.clearAnchor()
    this.anchoredObject = object
    this.anchorYaw = yaw
    if (!hit) {
      // No hit result to anchor to: ask the next frame for a free-standing anchor.
      // (Tried when 'anchors' was granted, or when the browser doesn't report enabled features.)
      const features = this.stats.features
      if (position && (!features.length || features.includes('anchors'))) this.pendingAnchor = { position: position.clone(), yaw }
      return
    }
    if (!hit.createAnchor) return
    try {
      this.anchor = await hit.createAnchor()
    } catch (err) {
      this.anchor = null // not supported: the object simply stays where it was placed
      this.logError('anchor', err)
    }
  }

  clearAnchor() {
    this.anchor?.delete?.()
    this.anchor = null
    this.anchoredObject = null
    this.pendingAnchor = null
  }

  _handleSelect(controller) {
    this.raycaster.setFromXRController(controller)
    this.onSelect(this.raycaster)
  }

  _handleEnd() {
    this.clearAnchor()
    this.hitTestSource?.cancel?.()
    this.hitTestSource = null
    this.session = null
    this.searching = false
    this.reticle.visible = false
    this.reticleFound = false
    this.lastHit = null
    this.lastFloorY = null
    this.stats.sessionStarted = false
    this.stats.tracking = 'ended'
    this.onEnd()
  }
}
