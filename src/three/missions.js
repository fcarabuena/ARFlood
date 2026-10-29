import * as THREE from 'three'

export const POINTS = { supply: 100, person: 200 }

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...opts })

// ---------------------------------------------------------------------------
// Primitive models. Each returns a Group whose origin sits on the ground.
// They are the fallback when no GLB is listed in public/models/models.json
// or the file fails to load (see loadModels below).
// ---------------------------------------------------------------------------

function firstAidKit() {
  const g = new THREE.Group()
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.1), mat(0xd62828))
  box.position.y = 0.04
  const white = mat(0xffffff, { emissive: 0x333333 })
  const crossA = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.018, 0.002), white)
  const crossB = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.06, 0.002), white)
  crossA.position.set(0, 0.04, 0.051)
  crossB.position.copy(crossA.position)
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 6, 12, Math.PI), mat(0x222222))
  handle.position.y = 0.08
  g.add(box, crossA, crossB, handle)
  return g
}

function waterBottle() {
  const g = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.14, 12),
    mat(0x7fc8ff, { transparent: true, opacity: 0.75, roughness: 0.1 })
  )
  body.position.y = 0.07
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.03, 0.03, 12), body.material)
  neck.position.y = 0.155
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.018, 10), mat(0x1565c0))
  cap.position.y = 0.178
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.04, 12, 1, true), mat(0xffffff))
  label.position.y = 0.07
  g.add(body, neck, cap, label)
  return g
}

function flashlight() {
  const g = new THREE.Group()
  const inner = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.13, 12), mat(0x2b2b2b))
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.022, 0.04, 12), mat(0xf2b705))
  head.position.y = 0.085
  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(0.028, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff6c2 })
  )
  lens.rotation.x = -Math.PI / 2
  lens.position.y = 0.106
  inner.add(body, head, lens)
  // Lying on its side.
  inner.rotation.z = Math.PI / 2
  inner.position.y = 0.032
  g.add(inner)
  return g
}

function person(shirt) {
  const g = new THREE.Group()
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.08, 8), mat(0x2d3a5a))
  legs.position.y = 0.04
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.06, 4, 8), mat(shirt))
  body.position.y = 0.12
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), mat(0xe0b48a))
  head.position.y = 0.2
  // One arm raised, waving for help.
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.07, 4, 6), mat(shirt))
  arm.position.set(0.045, 0.19, 0)
  arm.rotation.z = -0.4
  g.add(legs, body, head, arm)
  g.userData.arm = arm
  return g
}

function radio() {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.05), mat(0x3d3d3d))
  body.position.y = 0.04
  const speaker = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), mat(0x777777))
  speaker.position.set(-0.025, 0.04, 0.026)
  const dial = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, 0.002), mat(0xffb703, { emissive: 0x553300 }))
  dial.position.set(0.03, 0.05, 0.026)
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.1, 6), mat(0xcccccc))
  antenna.position.set(0.045, 0.12, 0)
  antenna.rotation.z = -0.3
  g.add(body, speaker, dial, antenna)
  return g
}

function marker(color) {
  const m = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.025, 0),
    new THREE.MeshBasicMaterial({ color })
  )
  m.scale.y = 1.6
  return m
}

// `slot` is the key in public/models/models.json used to load a GLB model;
// `height` / `size` is what the GLB gets scaled to.
const DEFINITIONS = [
  { id: 'firstaid', label: 'First-aid kit', kind: 'supply', build: firstAidKit, slot: 'firstaid', size: 0.14, pos: [-0.25, 0, 0.42] },
  { id: 'bottle', label: 'Water bottle', kind: 'supply', build: waterBottle, slot: 'bottle', height: 0.18, pos: [0.3, 0, 0.05] },
  { id: 'flashlight', label: 'Flashlight', kind: 'supply', build: flashlight, slot: 'flashlight', size: 0.15, pos: [-0.5, 0, -0.05] },
  { id: 'radio', label: 'Battery radio', kind: 'supply', build: radio, slot: 'radio', size: 0.13, pos: [0.22, 0, -0.32] },
  { id: 'person1', label: 'Rescue person on the roof', kind: 'person', build: () => person(0xe76f51), slot: 'person', height: 0.2, spot: 0 },
  { id: 'person2', label: 'Rescue person on the crate', kind: 'person', build: () => person(0x2a9d8f), slot: 'person', height: 0.2, spot: 1 },
  { id: 'person3', label: 'Rescue person on the car', kind: 'person', build: () => person(0x9b5de5), slot: 'person', height: 0.2, spot: 2 },
]

const WAVE_CLIP = /wave|waving/i
const IDLE_CLIP = /idle/i
const RIGHT_ARM = /arm.?r(ight)?\b|right.?arm|upperarm.?r/i

/**
 * Creates the collectable / rescuable objects and tracks mission progress.
 */
export class MissionManager {
  constructor(parent, { rescueSpots, safeZone }) {
    this.parent = parent
    this.safeZone = safeZone
    this.items = []
    this.active = new Set(DEFINITIONS.map((d) => d.id))

    for (const def of DEFINITIONS) {
      const holder = new THREE.Group()
      holder.name = def.id
      // `visual` holds the primitive and is swapped for a GLB when one loads.
      const visual = new THREE.Group()
      const model = def.build()
      visual.add(model)
      holder.add(visual)

      // Larger invisible sphere so small objects are easy to tap on a phone.
      const proxy = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 8, 6),
        new THREE.MeshBasicMaterial({ visible: false })
      )
      proxy.position.y = 0.08
      holder.add(proxy)

      const mk = marker(def.kind === 'person' ? 0xffd166 : 0x4cc9f0)
      holder.add(mk)

      const base = def.kind === 'person'
        ? rescueSpots[def.spot].clone()
        : new THREE.Vector3(...def.pos)
      holder.position.copy(base)
      parent.add(holder)

      this.items.push({
        ...def,
        holder,
        visual,
        arm: model.userData.arm ?? null,
        armRest: null,
        mixer: null,
        proxy,
        marker: mk,
        base,
        done: false,
        collectT: 0, // 0..1 progress of the "collected" animation
        phase: Math.random() * Math.PI * 2,
      })
    }

    // Hit target for the safe zone (the whole platform + steps).
    this.safeTargets = []
    safeZone.traverse((o) => o.isMesh && this.safeTargets.push(o))
  }

  /**
   * Swaps primitives for GLB models where available (helpers from models.js).
   * Items without a model keep their primitive.
   */
  async loadModels({ loadSlot, fitModel, swapInto }) {
    await Promise.all(
      this.items.map(async (item) => {
        const gltf = await loadSlot(item.slot)
        if (!gltf) return
        swapInto(item.visual, fitModel(gltf.scene, { height: item.height, size: item.size }))
        item.arm = null
        if (item.kind !== 'person') return

        // Waving: use a "wave" clip if the model has one, otherwise play
        // "idle" and raise/swing the right arm procedurally on top of it.
        const wave = gltf.animations.find((c) => WAVE_CLIP.test(c.name))
        const idle = gltf.animations.find((c) => IDLE_CLIP.test(c.name))
        if (wave || idle) {
          item.mixer = new THREE.AnimationMixer(gltf.scene)
          const action = item.mixer.clipAction(wave || idle)
          action.time = Math.random() * action.getClip().duration
          action.play()
        }
        if (!wave) {
          gltf.scene.traverse((o) => {
            if (!item.arm && RIGHT_ARM.test(o.name)) item.arm = o
          })
          if (item.arm) item.armRest = item.arm.rotation.z
        }
      })
    )
  }

  /** Enables only the given mission ids (difficulty), hiding the others. */
  setActive(ids) {
    this.active = new Set(ids)
    this.reset()
  }

  get activeItems() {
    return this.items.filter((i) => this.active.has(i.id))
  }

  get tasks() {
    return this.activeItems.map(({ id, label, kind, done }) => ({ id, label, kind, done }))
  }

  allDone() {
    return this.activeItems.every((i) => i.done)
  }

  /** The next unfinished task, people first (used for voice hints). */
  nextTask() {
    const open = this.activeItems.filter((i) => !i.done)
    return open.find((i) => i.kind === 'person') || open[0] || null
  }

  reset() {
    for (const item of this.items) {
      item.done = false
      item.collectT = 0
      item.holder.visible = this.active.has(item.id)
      item.holder.position.copy(item.base)
      item.holder.scale.setScalar(1)
      item.visual.rotation.set(0, 0, 0)
    }
  }

  /** Returns what the ray hits first: a mission item, the safe zone, or null. */
  pick(raycaster) {
    const targets = [...this.safeTargets]
    for (const item of this.activeItems) if (!item.done) targets.push(item.proxy)

    const hits = raycaster.intersectObjects(targets, false)
    if (!hits.length) return null
    const obj = hits[0].object
    const item = this.items.find((i) => i.proxy === obj)
    if (item) return { kind: item.kind, id: item.id, label: item.label, points: POINTS[item.kind] }
    return { kind: 'safezone' }
  }

  complete(id) {
    const item = this.items.find((i) => i.id === id)
    if (item && !item.done) {
      item.done = true
      item.collectT = 0.0001
    }
  }

  update(dt, elapsed, waterLevel) {
    for (const item of this.items) {
      const { holder, visual, marker: mk } = item
      if (!holder.visible) continue

      if (item.done) {
        // Shrink and fly up, then hide.
        item.collectT = Math.min(1, item.collectT + dt * 2.5)
        holder.position.y += dt * 0.4
        holder.scale.setScalar(1 - item.collectT)
        if (item.collectT >= 1) holder.visible = false
        continue
      }

      // Supplies float once the water is deeper than their base.
      let y = item.base.y
      if (item.kind === 'supply' && waterLevel > item.base.y + 0.02) {
        y = waterLevel - 0.02 + Math.sin(elapsed * 2 + item.phase) * 0.01
        visual.rotation.z = Math.sin(elapsed * 1.5 + item.phase) * 0.15
        holder.position.x = item.base.x + Math.sin(elapsed * 0.4 + item.phase) * 0.03
      }
      holder.position.y = y

      if (item.kind === 'person') {
        item.mixer?.update(dt)
        if (item.arm) {
          const swing = Math.sin(elapsed * 6 + item.phase) * 0.35
          // GLB arm hangs down at rest, so raise it first; the primitive arm is already up.
          item.arm.rotation.z = item.armRest !== null ? item.armRest - 2.4 + swing : -0.4 + swing
        }
      }

      mk.position.y = (item.kind === 'person' ? 0.3 : 0.24) + Math.sin(elapsed * 3 + item.phase) * 0.015
      mk.rotation.y += dt * 2
    }

    const ring = this.safeZone.userData.ring
    const pulse = 1 + Math.sin(elapsed * 4) * 0.1
    ring.scale.set(pulse, pulse, 1)
    ring.material.color.set(this.allDone() ? 0x5dff8a : 0xffffff)
    ring.material.opacity = this.allDone() ? 0.9 : 0.35
    this.safeZone.userData.flag.rotation.y = Math.sin(elapsed * 3) * 0.3
  }
}
