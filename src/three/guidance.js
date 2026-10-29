import * as THREE from 'three'
import { SAFE_ZONE_HEIGHT, SAFE_ZONE_POS } from './scene.js'

const ARROWS = 12

function chevronGeometry() {
  const s = new THREE.Shape()
  s.moveTo(-0.035, -0.02)
  s.lineTo(0, 0.02)
  s.lineTo(0.035, -0.02)
  s.lineTo(0.035, -0.04)
  s.lineTo(0, 0)
  s.lineTo(-0.035, -0.04)
  s.closePath()
  const g = new THREE.ShapeGeometry(s)
  g.rotateX(-Math.PI / 2) // lie flat, pointing towards -z
  g.scale(1.4, 1, 1.4)
  return g
}

/**
 * Animated chevrons on the ground (or on the water surface) leading to
 * the safe-zone steps, plus a light beam above the safe zone.
 */
export class EvacuationGuide {
  constructor(parent) {
    this.group = new THREE.Group()
    this.group.name = 'evacuation-guide'
    this.group.visible = false
    parent.add(this.group)
    this.opacity = 0

    // From the front-centre of the area to the foot of the safe-zone steps.
    const stepsZ = SAFE_ZONE_POS.z + 0.48
    this.curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.15, 0, 0.8),
      new THREE.Vector3(0.0, 0, 0.45),
      new THREE.Vector3(0.35, 0, 0.3),
      new THREE.Vector3(SAFE_ZONE_POS.x, 0, stepsZ + 0.05),
      new THREE.Vector3(SAFE_ZONE_POS.x, 0, stepsZ - 0.1),
    ])

    const geo = chevronGeometry()
    this.arrows = []
    for (let i = 0; i < ARROWS; i++) {
      const t = i / (ARROWS - 1)
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: 0x5dff8a, transparent: true, depthWrite: false, side: THREE.DoubleSide })
      )
      const p = this.curve.getPointAt(t)
      const tan = this.curve.getTangentAt(t)
      m.position.copy(p)
      m.rotation.y = Math.atan2(-tan.x, -tan.z)
      m.renderOrder = 3
      this.group.add(m)
      this.arrows.push({ mesh: m, t })
    }

    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.12, 1.2, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x5dff8a,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    )
    this.beam.position.set(SAFE_ZONE_POS.x, SAFE_ZONE_HEIGHT + 0.6, SAFE_ZONE_POS.z)
    this.group.add(this.beam)
  }

  update(dt, elapsed, active, waterLevel) {
    // Fade in/out instead of popping.
    this.opacity = THREE.MathUtils.clamp(this.opacity + (active ? dt : -dt) * 3, 0, 1)
    this.group.visible = this.opacity > 0.01
    if (!this.group.visible) return

    const y = Math.max(waterLevel, 0) + 0.015
    for (const a of this.arrows) {
      // A bright pulse travels along the path towards the safe zone.
      const wave = (elapsed * 0.9 - a.t) % 1
      const pulse = 0.25 + 0.75 * Math.pow(1 - ((wave + 1) % 1), 3)
      a.mesh.position.y = y
      a.mesh.material.opacity = pulse * this.opacity
    }
    this.beam.material.opacity = (0.15 + Math.sin(elapsed * 4) * 0.08) * this.opacity
  }
}
