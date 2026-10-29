// Kept free of three.js imports so the start screen and Live Mode can check
// AR support without loading the 3D engine.

/** Checks whether this browser can start an immersive AR session. */
export async function checkARSupport() {
  if (!window.isSecureContext) {
    return { supported: false, reason: 'Page is not served over HTTPS, so WebXR is disabled.' }
  }
  if (!('xr' in navigator)) {
    return { supported: false, reason: 'This browser has no WebXR support.' }
  }
  try {
    const ok = await navigator.xr.isSessionSupported('immersive-ar')
    return ok
      ? { supported: true, reason: '' }
      : { supported: false, reason: 'Immersive AR is not supported on this device.' }
  } catch (err) {
    return { supported: false, reason: `WebXR check failed: ${err.message}` }
  }
}
