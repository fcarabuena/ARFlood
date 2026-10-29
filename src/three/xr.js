import * as THREE from 'three'

function createReticle() {
  const reticle = new THREE.Group()
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  )
  const dot = new THREE.Mesh(
    new THREE.CircleGeometry(0.015, 16).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  )
  // Preview of the area that will be placed (scaled to the chosen size).
  const area = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
    new THREE.LineBasicMaterial({ color: 0x4cc9f0 })
  )
  reticle.add(ring, dot, area)
  reticle.userData.area = area
  reticle.matrixAutoUpdate = false
  reticle.visible = false
  return reticle
}

/**
 * Handles the WebXR AR session: hit-testing for floor surfaces, the
 * placement reticle, anchoring the placed scene, and tap ("select") input.
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
    this.reticle = createReticle()
    this.reticleFound = false
    this.lastHit = null
    this.anchor = null
    this.anchoredObject = null
    this.anchorYaw = 0
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

  async start(overlayRoot) {
    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'anchors', 'local-floor'],
      domOverlay: overlayRoot ? { root: overlayRoot } : undefined,
    })
    this.session = session
    session.addEventListener('end', () => this._handleEnd())

    this.renderer.xr.setReferenceSpaceType('local')
    await this.renderer.xr.setSession(session)

    const viewerSpace = await session.requestReferenceSpace('viewer')
    this.hitTestSource = await session.requestHitTestSource({ space: viewerSpace })

    return { domOverlay: !!session.domOverlayState }
  }

  end() {
    if (this.session) this.session.end()
  }

  /** Called every frame while in AR. */
  update(frame) {
    if (!frame) return
    const refSpace = this.renderer.xr.getReferenceSpace()

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
      for (const hit of frame.getHitTestResults(this.hitTestSource)) {
        const pose = hit.getPose(refSpace)
        if (!pose) continue
        this._m.fromArray(pose.transform.matrix)
        // Only accept horizontal, upward-facing surfaces (floors / tables).
        this._up.set(0, 1, 0).transformDirection(this._m)
        if (this._up.y > 0.9) {
          this.reticle.matrix.copy(this._m)
          this.lastHit = hit
          found = true
          break
        }
      }
    }
    this.reticle.visible = found
    if (found !== this.reticleFound) {
      this.reticleFound = found
      this.onReticle?.(found)
    }
  }

  /** Position (and a yaw facing the user) for placing the scene at the reticle. */
  getPlacement(camera) {
    if (!this.reticle.visible) return null
    const position = new THREE.Vector3().setFromMatrixPosition(this.reticle.matrix)
    const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld)
    const yaw = Math.atan2(camPos.x - position.x, camPos.z - position.z)
    return { position, yaw, hit: this.lastHit }
  }

  /** Anchors `object` at the hit result, if the device supports anchors. */
  async anchorAt(hit, object, yaw) {
    this.clearAnchor()
    this.anchoredObject = object
    this.anchorYaw = yaw
    if (!hit?.createAnchor) return
    try {
      this.anchor = await hit.createAnchor()
    } catch {
      this.anchor = null // not supported: the object simply stays where it was placed
    }
  }

  clearAnchor() {
    this.anchor?.delete?.()
    this.anchor = null
    this.anchoredObject = null
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
    this.onEnd()
  }
}
