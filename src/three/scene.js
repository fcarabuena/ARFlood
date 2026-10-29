import * as THREE from 'three'
import { AREA_SIZE } from './water.js'

// Height of the safe-zone platform. The water reaches this at the end of the timer.
export const SAFE_ZONE_HEIGHT = 0.45
export const SAFE_ZONE_POS = new THREE.Vector3(0.6, 0, -0.6)

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts })

function house({ w, h, d, wall, roof, gabled }) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(wall))
  body.position.y = h / 2
  g.add(body)

  if (gabled) {
    const roofGeo = new THREE.ConeGeometry(Math.max(w, d) * 0.78, h * 0.6, 4)
    roofGeo.rotateY(Math.PI / 4)
    const r = new THREE.Mesh(roofGeo, mat(roof))
    r.position.y = h + h * 0.3
    g.add(r)
  } else {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, 0.02, d + 0.03), mat(roof))
    slab.position.y = h + 0.01
    g.add(slab)
  }

  const door = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.25, h * 0.45), mat(0x3b2a1a))
  door.position.set(0, h * 0.225, d / 2 + 0.001)
  g.add(door)

  const winMat = mat(0x9fd3ff, { emissive: 0x1a3550 })
  for (const x of [-w * 0.3, w * 0.3]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.18, h * 0.18), winMat)
    win.position.set(x, h * 0.65, d / 2 + 0.001)
    g.add(win)
  }
  g.userData.roofHeight = gabled ? h * 1.6 : h + 0.02
  return g
}

function tree() {
  const g = new THREE.Group()
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.3, 6), mat(0x5a3d22))
  trunk.position.y = 0.15
  const top = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), mat(0x2f6b34, { flatShading: true }))
  top.position.y = 0.35
  g.add(trunk, top)
  return g
}

function safeZone() {
  const g = new THREE.Group()
  g.name = 'safe-zone'
  const size = 0.42

  const base = new THREE.Mesh(new THREE.BoxGeometry(size, SAFE_ZONE_HEIGHT, size), mat(0x8c8c8c))
  base.position.y = SAFE_ZONE_HEIGHT / 2
  g.add(base)

  // Green top so it reads as "safe" from above.
  const top = new THREE.Mesh(new THREE.BoxGeometry(size + 0.02, 0.02, size + 0.02), mat(0x2fbf5a, { emissive: 0x0b3a18 }))
  top.position.y = SAFE_ZONE_HEIGHT + 0.01
  g.add(top)

  // Steps on one side.
  for (let i = 0; i < 4; i++) {
    const stepH = SAFE_ZONE_HEIGHT * ((i + 1) / 5)
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.16, stepH, 0.06), mat(0x7a7a7a))
    step.position.set(0, stepH / 2, size / 2 + 0.03 + (3 - i) * 0.06)
    g.add(step)
  }

  // Flag pole + flag.
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 6), mat(0xdddddd))
  pole.position.set(-size / 2 + 0.04, SAFE_ZONE_HEIGHT + 0.15, -size / 2 + 0.04)
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.07), mat(0x2fbf5a, { side: THREE.DoubleSide, emissive: 0x0b3a18 }))
  flag.position.set(pole.position.x + 0.06, SAFE_ZONE_HEIGHT + 0.26, pole.position.z)
  g.add(pole, flag)
  g.userData.flag = flag

  // Pulsing ring that marks where to tap.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.12, 0.15, 32),
    new THREE.MeshBasicMaterial({ color: 0x5dff8a, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = SAFE_ZONE_HEIGHT + 0.025
  g.add(ring)
  g.userData.ring = ring

  return g
}

/**
 * Builds the static parts of the 2m x 2m flood scene: ground, houses,
 * trees and the raised safe-zone platform. Origin is the centre of the
 * area at floor level.
 */
export function createFloodScene() {
  const root = new THREE.Group()
  root.name = 'flood-scene'

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(AREA_SIZE, AREA_SIZE),
    mat(0x6f8a4a, { transparent: true, opacity: 0.92 })
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = 0.001
  root.add(ground)

  // A dirt road across the area.
  const road = new THREE.Mesh(new THREE.PlaneGeometry(AREA_SIZE, 0.32), mat(0x8a7556))
  road.rotation.x = -Math.PI / 2
  road.position.set(0, 0.002, 0.12)
  root.add(road)

  // Thin border so the edges of the area are visible in AR.
  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(AREA_SIZE, 0.01, AREA_SIZE)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
  )
  border.position.y = 0.005
  root.add(border)

  const houseA = house({ w: 0.36, h: 0.24, d: 0.32, wall: 0xe6d3b3, roof: 0x7b4b3a, gabled: false })
  houseA.position.set(-0.6, 0, -0.58)
  const houseB = house({ w: 0.32, h: 0.22, d: 0.28, wall: 0xcfe0e8, roof: 0xa33b2b, gabled: true })
  houseB.position.set(-0.62, 0, 0.62)
  houseB.rotation.y = 0.3
  const houseC = house({ w: 0.26, h: 0.2, d: 0.26, wall: 0xf0e2a8, roof: 0x55606b, gabled: true })
  houseC.position.set(0.1, 0, -0.68)
  const houseD = house({ w: 0.28, h: 0.22, d: 0.26, wall: 0xd9c2c2, roof: 0x4a5a3a, gabled: true })
  houseD.position.set(-0.05, 0, 0.72)
  houseD.rotation.y = Math.PI
  root.add(houseA, houseB, houseC, houseD)

  const t1 = tree()
  t1.position.set(0.3, 0, 0.78)
  const t2 = tree()
  t2.position.set(-0.2, 0, -0.3)
  t2.scale.setScalar(0.8)
  root.add(t1, t2)

  // Crate a person is stranded on.
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), mat(0x8b6b3f))
  crate.position.set(0.62, 0.07, 0.58)
  root.add(crate)

  // A car stuck on the road (third person stands on its roof on Hard).
  const car = new THREE.Group()
  const carBody = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.12), mat(0x2a6fdb, { roughness: 0.4 }))
  carBody.position.y = 0.05
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.11), mat(0x2a6fdb, { roughness: 0.4 }))
  cabin.position.set(-0.01, 0.105, 0)
  car.add(carBody, cabin)
  for (const [x, z] of [[-0.08, -0.06], [0.08, -0.06], [-0.08, 0.06], [0.08, 0.06]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 10), mat(0x111111))
    wheel.rotation.x = Math.PI / 2
    wheel.position.set(x, 0.025, z)
    car.add(wheel)
  }
  car.position.set(-0.15, 0, 0.1)
  car.rotation.y = 0.2
  root.add(car)

  const safe = safeZone()
  safe.position.copy(SAFE_ZONE_POS)
  root.add(safe)

  return {
    root,
    safeZone: safe,
    // Where the people to rescue stand (local positions).
    rescueSpots: [
      new THREE.Vector3(houseA.position.x, houseA.userData.roofHeight, houseA.position.z),
      new THREE.Vector3(crate.position.x, 0.14, crate.position.z),
      new THREE.Vector3(car.position.x - 0.01, 0.13, car.position.z),
    ],
    // Groups that can be replaced by GLB models (see public/models/models.json).
    // houseRoof keeps the primitive's height so the person still stands on the roof.
    modelSlots: [
      { slot: 'houseRoof', group: houseA, fit: { height: 0.24 } },
      { slot: 'houseA', group: houseB, fit: { size: 0.34 } },
      { slot: 'houseB', group: houseC, fit: { size: 0.3 } },
      { slot: 'houseC', group: houseD, fit: { size: 0.3 } },
      { slot: 'tree', group: t1, fit: { height: 0.42 } },
      { slot: 'tree', group: t2, fit: { height: 0.42 } },
    ],
  }
}

/** Extra ground and distant hills used only in the non-AR 3D fallback. */
export function createFallbackEnvironment() {
  const g = new THREE.Group()
  const grass = new THREE.Mesh(new THREE.CircleGeometry(9, 48), mat(0x3d4f2c))
  grass.rotation.x = -Math.PI / 2
  grass.position.y = -0.002
  g.add(grass)

  // Puddles of water spreading outside the area.
  const puddleMat = new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.15, metalness: 0.2 })
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4
    const r = 1.8 + (i % 3) * 0.6
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.3 + (i % 2) * 0.25, 20), puddleMat)
    puddle.rotation.x = -Math.PI / 2
    puddle.position.set(Math.cos(a) * r, 0.001, Math.sin(a) * r)
    puddle.scale.y = 0.6
    g.add(puddle)
  }

  const hillMat = mat(0x34452a, { flatShading: true })
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    const hill = new THREE.Mesh(new THREE.ConeGeometry(1.4 + (i % 3) * 0.5, 1 + (i % 4) * 0.4, 6), hillMat)
    hill.position.set(Math.cos(a) * 8, 0, Math.sin(a) * 8)
    g.add(hill)
  }
  return g
}
