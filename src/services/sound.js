/**
 * All sounds are synthesised with the Web Audio API, so there are no audio
 * files to download. The AudioContext must be created from a user gesture
 * (call `unlock()` in a click handler).
 */
class FloodSound {
  constructor() {
    this.ctx = null
    this.muted = false
    this.rainTarget = 0
    this.waterTarget = 0
  }

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      this.ctx = new Ctx()
      this._build()
    }
    if (this.ctx.state === 'suspended') this.ctx.resume()
  }

  _noiseBuffer(type) {
    const ctx = this.ctx
    const length = ctx.sampleRate * 2
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1
      if (type === 'brown') {
        last = (last + 0.02 * white) / 1.02
        data[i] = last * 3.5
      } else {
        data[i] = white
      }
    }
    return buffer
  }

  _loop(buffer) {
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    src.start()
    return src
  }

  _build() {
    const ctx = this.ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 1
    this.master.connect(ctx.destination)

    // Rain: high-passed white noise.
    const rainHP = ctx.createBiquadFilter()
    rainHP.type = 'highpass'
    rainHP.frequency.value = 1200
    const rainLP = ctx.createBiquadFilter()
    rainLP.type = 'lowpass'
    rainLP.frequency.value = 8000
    this.rainGain = ctx.createGain()
    this.rainGain.gain.value = 0
    this._loop(this._noiseBuffer('white')).connect(rainHP)
    rainHP.connect(rainLP).connect(this.rainGain).connect(this.master)

    // Rushing water: low-passed brown noise, louder and brighter as it rises.
    this.waterLP = ctx.createBiquadFilter()
    this.waterLP.type = 'lowpass'
    this.waterLP.frequency.value = 300
    this.waterGain = ctx.createGain()
    this.waterGain.gain.value = 0
    this._loop(this._noiseBuffer('brown')).connect(this.waterLP)
    this.waterLP.connect(this.waterGain).connect(this.master)

    this.setRain(this.rainTarget)
    this.setWater(this.waterTarget)
  }

  setMuted(muted) {
    this.muted = muted
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05)
  }

  /** 0..1 */
  setRain(intensity) {
    this.rainTarget = intensity
    if (!this.ctx) return
    this.rainGain.gain.setTargetAtTime(0.02 + intensity * 0.12, this.ctx.currentTime, 0.4)
  }

  /** 0..1 relative to the safe zone height */
  setWater(level) {
    this.waterTarget = level
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.waterGain.gain.setTargetAtTime(0.03 + level * 0.55, t, 0.3)
    this.waterLP.frequency.setTargetAtTime(250 + level * 1100, t, 0.3)
  }

  _tone(freq, start, dur, { type = 'sine', gain = 0.2, endFreq } = {}) {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, start)
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + dur)
    g.gain.setValueAtTime(0.0001, start)
    g.gain.exponentialRampToValueAtTime(gain, start + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
    osc.connect(g).connect(this.master)
    osc.start(start)
    osc.stop(start + dur + 0.05)
  }

  collect() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this._tone(880, t, 0.15, { endFreq: 1320 })
    this._tone(1320, t + 0.08, 0.2, { gain: 0.12 })
  }

  denied() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this._tone(220, t, 0.18, { type: 'square', gain: 0.06 })
  }

  /** Civil-defence style wail, about 4 seconds. */
  siren() {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = 800
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.5
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 300
    lfo.connect(lfoGain).connect(osc.frequency)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1800
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.4)
    g.gain.setValueAtTime(0.12, t + 3.4)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4.2)
    osc.connect(lp).connect(g).connect(this.master)
    osc.start(t)
    lfo.start(t)
    osc.stop(t + 4.3)
    lfo.stop(t + 4.3)
  }

  success() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this._tone(f, t + i * 0.12, 0.35, { type: 'triangle', gain: 0.18 }))
  }

  fail() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    ;[392, 329.63, 261.63, 196].forEach((f, i) => this._tone(f, t + i * 0.25, 0.4, { type: 'triangle', gain: 0.16 }))
  }
}

export const sound = new FloodSound()
