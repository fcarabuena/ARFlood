import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

const BASE = `${import.meta.env.BASE_URL}models/`
const loader = new GLTFLoader()
const cache = new Map() // url -> Promise<gltf | null>
let manifestPromise = null

/** Reads public/models/models.json, which maps slot names to GLB files. */
export function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(`${BASE}models.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
  }
  return manifestPromise
}

function loadGLTF(url) {
  if (!cache.has(url)) {
    cache.set(
      url,
      loader.loadAsync(url).catch((err) => {
        console.warn(`[models] ${url} could not be loaded, using the primitive fallback.`, err?.message ?? err)
        return null
      })
    )
  }
  return cache.get(url)
}

/**
 * Loads the model for a slot. Resolves to { scene, animations } (a fresh
 * clone each call, so a model can be used several times) or null.
 */
export async function loadSlot(slot) {
  const manifest = await loadManifest()
  const file = manifest[slot]
  if (!file) return null
  const gltf = await loadGLTF(BASE + file)
  if (!gltf) return null
  return { scene: cloneSkinned(gltf.scene), animations: gltf.animations }
}

/**
 * Scales a model uniformly and moves it so its base sits on y=0, centred on x/z.
 * Pass `height` to match a height, or `size` to fit the largest footprint side.
 */
export function fitModel(object, { height, size }) {
  const box = new THREE.Box3().setFromObject(object)
  const dims = box.getSize(new THREE.Vector3())
  let s = 1
  if (height) s = height / dims.y
  else if (size) s = size / Math.max(dims.x, dims.z)
  object.scale.multiplyScalar(s)

  box.setFromObject(object)
  const center = box.getCenter(new THREE.Vector3())
  object.position.x -= center.x
  object.position.z -= center.z
  object.position.y -= box.min.y

  object.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false
      o.receiveShadow = false
    }
  })
  const wrapper = new THREE.Group()
  wrapper.add(object)
  return wrapper
}

/** Replaces the children of `slotGroup` with `model` (keeps the slot transform). */
export function swapInto(slotGroup, model) {
  for (const child of [...slotGroup.children]) {
    slotGroup.remove(child)
    child.traverse((o) => {
      if (o.isMesh) o.geometry.dispose()
    })
  }
  slotGroup.add(model)
}
