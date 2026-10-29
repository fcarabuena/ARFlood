/**
 * Device compass heading (0 = north, clockwise) of the direction the BACK
 * CAMERA points, for a phone held upright in front of you.
 *
 * - iPhone/iPad: `webkitCompassHeading` from `deviceorientation`; needs
 *   DeviceOrientationEvent.requestPermission() from a tap first.
 * - Android Chrome: `deviceorientationabsolute` (alpha/beta/gamma relative to
 *   magnetic north), converted with the W3C compass-heading formula.
 */

/**
 * Must be called from a click/tap handler (iOS 13+ requirement).
 * Resolves to 'granted' | 'denied' | 'not-required'. Newer Chromium also has
 * requestPermission(); its answer is treated as a hint only, because Android
 * may still deliver orientation events, so the guide listens either way.
 */
export async function requestCompassPermission() {
  const DOE = window.DeviceOrientationEvent
  if (DOE && typeof DOE.requestPermission === 'function') {
    try {
      return (await DOE.requestPermission()) === 'granted' ? 'granted' : 'denied'
    } catch {
      return 'denied'
    }
  }
  return 'not-required'
}

function screenAngle() {
  return screen.orientation?.angle ?? window.orientation ?? 0
}

const rad = Math.PI / 180

/** Heading of the device's back (-z axis) from W3C Device Orientation angles. */
function headingFromEuler(alpha, beta, gamma) {
  // Phone lying flat: the back points at the ground, so use the top edge instead.
  if (Math.abs(beta) < 25 && Math.abs(gamma) < 25) return 360 - alpha
  const a = alpha * rad
  const b = beta * rad
  const g = gamma * rad
  const vx = -Math.cos(a) * Math.sin(g) - Math.sin(a) * Math.sin(b) * Math.cos(g)
  const vy = -Math.sin(a) * Math.sin(g) + Math.cos(a) * Math.sin(b) * Math.cos(g)
  return Math.atan2(vx, vy) / rad
}

const norm = (d) => ((d % 360) + 360) % 360

/**
 * Calls onHeading(degrees, info) as the phone turns. Returns stop().
 * If no absolute heading arrives within 3 s, calls onUnavailable().
 */
export function watchCompass(onHeading, onUnavailable) {
  let received = false
  let smoothed = null
  const emit = (deg, source) => {
    received = true
    const h = norm(deg)
    // Low-pass filter on the circle so the arrow doesn't jitter.
    if (smoothed == null) smoothed = h
    else {
      const diff = ((h - smoothed + 540) % 360) - 180
      smoothed = norm(smoothed + diff * 0.25)
    }
    onHeading(smoothed, { source })
  }

  const onAbsolute = (e) => {
    if (e.alpha == null) return
    emit(headingFromEuler(e.alpha, e.beta ?? 90, e.gamma ?? 0) + screenAngle(), 'absolute')
  }
  const onOrientation = (e) => {
    if (typeof e.webkitCompassHeading === 'number') emit(e.webkitCompassHeading + screenAngle(), 'ios')
    else if (e.absolute && e.alpha != null && !('ondeviceorientationabsolute' in window)) {
      emit(headingFromEuler(e.alpha, e.beta ?? 90, e.gamma ?? 0) + screenAngle(), 'absolute')
    }
  }

  if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', onAbsolute)
  window.addEventListener('deviceorientation', onOrientation)
  const timer = setTimeout(() => !received && onUnavailable?.(), 3000)

  return () => {
    clearTimeout(timer)
    window.removeEventListener('deviceorientationabsolute', onAbsolute)
    window.removeEventListener('deviceorientation', onOrientation)
  }
}
