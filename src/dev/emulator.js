/**
 * Development helper: open the app with `?emulate` to install the Immersive
 * Web Emulation Runtime (the engine behind Meta's Immersive Web Emulator
 * extension) with a synthetic room, so `immersive-ar` + hit-test work on a
 * desktop without the extension. Only loaded in `npm run dev`.
 *
 * The emulated device is exposed as `window.__xrDevice` so you can move it
 * from the console, e.g.:
 *   __xrDevice.position.set(0, 1.4, 1.5)
 *   __xrDevice.controllers.right.updateButtonValue('trigger', 1)  // then 0
 */
export async function installEmulator(room = 'sunlit_living_room') {
  if (navigator.xr && (await navigator.xr.isSessionSupported?.('immersive-ar').catch(() => false))) {
    console.info('[emulator] Native/extension WebXR AR already available, not installing IWER.')
    return null
  }
  const { XRDevice, metaQuest3 } = await import('iwer')
  const { SyntheticEnvironmentModule } = await import('@iwer/sem')

  const device = new XRDevice(metaQuest3, { stereoEnabled: false })
  // Desktop browsers often expose a native navigator.xr without AR support;
  // force the emulated runtime over it.
  device.installRuntime({ forceInstall: true })
  device.installSEM(SyntheticEnvironmentModule)
  try {
    await device.sem.loadDefaultEnvironment(room)
  } catch (err) {
    console.warn('[emulator] Could not load synthetic room, hit-test will find nothing.', err)
  }
  window.__xrDevice = device
  console.info(`[emulator] IWER installed (Meta Quest 3, room "${room}").`)
  return device
}
