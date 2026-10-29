import * as THREE from 'three'

/**
 * Cheap rain: line segments recycled inside a box above the flood area.
 * Only `intensity * maxDrops` drops are drawn.
 */
export class Rain {
  constructor(parent, { maxDrops = 800, width = 2.6, height = 1.8 } = {}) {
    this.maxDrops = maxDrops
    this.width = width
    this.height = height
    this.intensity = 0.6

    const positions = new Float32Array(maxDrops * 6)
    this.speeds = new Float32Array(maxDrops)
    for (let i = 0; i < maxDrops; i++) this._spawn(positions, i, Math.random() * height)

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
    this.lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0xaecbe0, transparent: true, opacity: 0.55, depthWrite: false })
    )
    this.lines.frustumCulled = false
    this.lines.name = 'rain'
    parent.add(this.lines)
    this.setIntensity(this.intensity)
  }

  _spawn(p, i, y) {
    const x = (Math.random() - 0.5) * this.width
    const z = (Math.random() - 0.5) * this.width
    const len = 0.04 + Math.random() * 0.03
    p[i * 6] = x
    p[i * 6 + 1] = y
    p[i * 6 + 2] = z
    p[i * 6 + 3] = x + 0.004
    p[i * 6 + 4] = y + len
    p[i * 6 + 5] = z
    this.speeds[i] = 2.2 + Math.random() * 1.2
  }

  setIntensity(v) {
    this.intensity = THREE.MathUtils.clamp(v, 0, 1)
    this.count = Math.round(this.maxDrops * this.intensity)
    this.lines.geometry.setDrawRange(0, this.count * 2)
    this.lines.visible = this.count > 0
  }

  /** `floor` is the y where drops disappear (the water surface). */
  update(dt, floor = 0) {
    if (!this.count) return
    const attr = this.lines.geometry.attributes.position
    const p = attr.array
    for (let i = 0; i < this.count; i++) {
      const dy = this.speeds[i] * dt
      p[i * 6 + 1] -= dy
      p[i * 6 + 4] -= dy
      if (p[i * 6 + 1] < floor) this._spawn(p, i, floor + this.height)
    }
    attr.needsUpdate = true
  }
}
