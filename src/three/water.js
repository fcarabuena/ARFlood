import * as THREE from 'three'
import { Water } from 'three/examples/jsm/objects/Water.js'

export const AREA_SIZE = 2 // metres, the flood scene is AREA_SIZE x AREA_SIZE
const HALF = AREA_SIZE / 2

// Direction the floodwater flows in, in the flood scene's local space.
const CURRENT_DIR = new THREE.Vector3(1, 0, 0.35).normalize()
const CURRENT_SPEED = 0.06 // m/s for the surface ripples and debris

/**
 * Builds a tileable normal map procedurally so we don't need to ship
 * the waternormals.jpg texture from the three.js examples.
 */
function createWaterNormals(size = 256) {
  // Sum of sine waves with integer frequencies -> seamless when repeated.
  const waves = []
  const rand = mulberry32(7)
  for (let i = 0; i < 14; i++) {
    const kx = Math.round((rand() - 0.5) * 16)
    const ky = Math.round((rand() - 0.5) * 16)
    if (kx === 0 && ky === 0) continue
    waves.push({ kx, ky, amp: 1 / Math.hypot(kx, ky), phase: rand() * Math.PI * 2 })
  }

  const height = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      let h = 0
      for (const w of waves) h += w.amp * Math.sin(2 * Math.PI * (w.kx * u + w.ky * v) + w.phase)
      height[y * size + x] = h
    }
  }

  const data = new Uint8Array(size * size * 4)
  const strength = 6
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength
      const n = new THREE.Vector3(-dx, -dy, 1).normalize()
      const i = (y * size + x) * 4
      data[i] = (n.x * 0.5 + 0.5) * 255
      data[i + 1] = (n.y * 0.5 + 0.5) * 255
      data[i + 2] = (n.z * 0.5 + 0.5) * 255
      data[i + 3] = 255
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function createDebris() {
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.9 })
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.9 })
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.8 })
  const plastic = new THREE.MeshStandardMaterial({ color: 0x2f7fbf, roughness: 0.5 })

  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.3, 8), wood)
  log.rotation.z = Math.PI / 2

  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.1), darkWood)

  const tire = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.022, 8, 16), rubber)
  tire.rotation.x = Math.PI / 2

  const plank = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.015, 0.05), wood)

  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.07, 10), plastic)

  const items = [log, crate, tire, plank, bucket]
  return items.map((mesh, i) => {
    const holder = new THREE.Group()
    holder.add(mesh)
    holder.userData = {
      x: -HALF + 0.2 + i * 0.38,
      z: -0.7 + ((i * 0.53) % 1.4),
      phase: i * 1.7,
      speed: CURRENT_SPEED * (0.7 + (i % 3) * 0.25),
      spin: (i % 2 ? 1 : -1) * (0.2 + i * 0.05),
    }
    return holder
  })
}

/**
 * The rising floodwater: a Water-shader surface, a translucent "volume"
 * so you can see the depth from the side, and floating debris.
 */
export class FloodWater {
  constructor(parent, { lowPower = false } = {}) {
    this.group = new THREE.Group()
    this.group.name = 'flood-water'
    parent.add(this.group)

    this.level = 0
    this.flowOffset = new THREE.Vector2()
    this.debrisSpeed = 1 // multiplier, set per difficulty

    this.surface = new Water(new THREE.PlaneGeometry(AREA_SIZE, AREA_SIZE), {
      // Low-res reflection keeps it fast on phones.
      textureWidth: 256,
      textureHeight: 256,
      waterNormals: createWaterNormals(),
      sunDirection: new THREE.Vector3(0.4, 0.8, 0.3).normalize(),
      sunColor: 0xffffff,
      waterColor: 0x5b4526, // muddy floodwater
      distortionScale: 0.08, // scene is viewed from ~1-2 m, so keep this small
      alpha: 0.88,
    })
    this.surface.rotation.x = -Math.PI / 2
    this.surface.material.transparent = true
    this.surface.material.uniforms.size.value = 90
    this._addCurrentToShader(this.surface.material)
    this.group.add(this.surface)

    if (lowPower) {
      // The reflection pass re-renders the whole scene. On phones, refresh it
      // every other frame; the one-frame lag is not noticeable.
      const renderReflection = this.surface.onBeforeRender
      let frame = 0
      this.surface.onBeforeRender = (...args) => {
        if (frame++ % 2 === 0) renderReflection.apply(this.surface, args)
      }
    }

    // Open box (no top/bottom) showing the depth of the water from the sides.
    const side = new THREE.MeshStandardMaterial({
      color: 0x4d3b22,
      transparent: true,
      opacity: 0.55,
      roughness: 0.3,
      depthWrite: false,
    })
    const hidden = new THREE.MeshBasicMaterial({ visible: false })
    const boxGeo = new THREE.BoxGeometry(AREA_SIZE, 1, AREA_SIZE)
    boxGeo.translate(0, 0.5, 0)
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z
    this.volume = new THREE.Mesh(boxGeo, [side, side, hidden, hidden, side, side])
    this.volume.renderOrder = 1
    this.group.add(this.volume)

    this.debris = createDebris()
    for (const d of this.debris) this.group.add(d)

    this.setLevel(0)
  }

  /** Make the ripples drift in CURRENT_DIR instead of only shimmering in place. */
  _addCurrentToShader(material) {
    material.uniforms.flowOffset = { value: this.flowOffset }
    const target = 'vec4 noise = getNoise( worldPosition.xz * size );'
    if (material.fragmentShader.includes(target)) {
      material.fragmentShader = material.fragmentShader
        .replace('uniform float size;', 'uniform float size;\nuniform vec2 flowOffset;')
        .replace(target, 'vec4 noise = getNoise( ( worldPosition.xz - flowOffset ) * size );')
    }
  }

  /** Difficulty: how many debris objects float (max 5) and how fast they drift. */
  setDebris({ count = 5, speed = 1 } = {}) {
    this.debrisSpeed = speed
    this.debris.forEach((d, i) => (d.userData.enabled = i < count))
  }

  setLevel(level) {
    this.level = level
    const y = Math.max(level, 0.002)
    this.surface.position.y = y
    this.volume.scale.y = y
    this.volume.visible = level > 0.01
  }

  update(dt, elapsed) {
    const u = this.surface.material.uniforms
    u.time.value += dt * (0.8 + this.debrisSpeed * 0.4)

    // The shader works in world space, so convert the current direction
    // using the scene's current orientation (AR placement can rotate it).
    const worldDir = CURRENT_DIR.clone().transformDirection(this.group.matrixWorld)
    this.flowOffset.x += worldDir.x * CURRENT_SPEED * this.debrisSpeed * dt
    this.flowOffset.y += worldDir.z * CURRENT_SPEED * this.debrisSpeed * dt

    const floating = this.level > 0.03
    for (const d of this.debris) {
      const s = d.userData
      d.visible = floating && s.enabled !== false
      if (!d.visible) continue
      s.x += CURRENT_DIR.x * s.speed * this.debrisSpeed * dt
      s.z += CURRENT_DIR.z * s.speed * this.debrisSpeed * dt + Math.sin(elapsed * 0.7 + s.phase) * 0.01 * dt
      // Wrap around so debris keeps flowing through the area.
      if (s.x > HALF - 0.1) s.x = -HALF + 0.1
      if (s.z > HALF - 0.1) s.z = -HALF + 0.1
      d.position.set(s.x, this.level + 0.01 + Math.sin(elapsed * 2.2 + s.phase) * 0.012, s.z)
      d.rotation.y += s.spin * dt
      d.rotation.z = Math.sin(elapsed * 1.6 + s.phase) * 0.12
      d.rotation.x = Math.cos(elapsed * 1.3 + s.phase) * 0.1
    }
  }
}
