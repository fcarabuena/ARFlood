/**
 * Spoken guidance using the browser's built-in speechSynthesis.
 * Lines are short; a new important line interrupts the current one.
 */
class VoiceGuide {
  constructor() {
    this.enabled = true
    this.supported = 'speechSynthesis' in window
    this.voice = null
    this.lastSpoken = new Map() // key -> time, to avoid repeating a line
    if (this.supported) {
      const pick = () => {
        const voices = speechSynthesis.getVoices()
        this.voice =
          voices.find((v) => /^en(-|_)/i.test(v.lang) && /google|natural/i.test(v.name)) ||
          voices.find((v) => /^en(-|_)/i.test(v.lang)) ||
          null
      }
      pick()
      speechSynthesis.addEventListener?.('voiceschanged', pick)
    }
  }

  setEnabled(on) {
    this.enabled = on
    if (!on) this.stop()
  }

  /**
   * @param {string} text
   * @param {{ key?: string, urgent?: boolean, cooldown?: number }} opts
   */
  say(text, { key = text, urgent = false, cooldown = 8 } = {}) {
    if (!this.supported || !this.enabled) return
    const now = performance.now() / 1000
    if (now - (this.lastSpoken.get(key) ?? -Infinity) < cooldown) return
    this.lastSpoken.set(key, now)

    if (urgent || speechSynthesis.speaking) speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    if (this.voice) u.voice = this.voice
    u.lang = this.voice?.lang || 'en-US'
    u.rate = 1.05
    speechSynthesis.speak(u)
  }

  stop() {
    if (this.supported) speechSynthesis.cancel()
  }

  reset() {
    this.lastSpoken.clear()
    this.stop()
  }
}

export const voice = new VoiceGuide()
