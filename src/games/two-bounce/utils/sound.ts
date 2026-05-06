let ctx: AudioContext | null = null
let masterGainNode: GainNode | null = null
let muted = localStorage.getItem('twobounce_muted') === '1'

const BOUNCE_COOLDOWN_MS = 80
const HIT_COOLDOWN_MS = 80
const NET_COOLDOWN_MS = 200

let lastBounceAt = 0
let lastBackboardAt = 0
let lastRimAt = 0
let lastNetAt = 0

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function getMasterGain(ac: AudioContext): GainNode {
  if (!masterGainNode || masterGainNode.context !== ac) {
    masterGainNode = ac.createGain()
    masterGainNode.gain.value = muted ? 0 : 1
    masterGainNode.connect(ac.destination)
  }
  return masterGainNode
}

export function setMuted(value: boolean): void {
  muted = value
  localStorage.setItem('twobounce_muted', value ? '1' : '0')
  if (masterGainNode) masterGainNode.gain.value = value ? 0 : 1
}

export function isMuted(): boolean {
  return muted
}

export function playShootSound(): void {
  try {
    const ac = getCtx()
    const mg = getMasterGain(ac)
    const bufSize = ac.sampleRate * 0.18
    const buf = ac.createBuffer(1, bufSize, ac.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize)
    }

    const src = ac.createBufferSource()
    src.buffer = buf

    const filter = ac.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 800
    filter.Q.value = 0.8

    const gain = ac.createGain()
    gain.gain.setValueAtTime(0.35, ac.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18)

    src.connect(filter)
    filter.connect(gain)
    gain.connect(mg)
    src.start()
  } catch {
    // 브라우저 자동 재생 정책으로 실패 시 무시
  }
}

export function playBounceSound(speed: number): void {
  const now = performance.now()
  if (now - lastBounceAt < BOUNCE_COOLDOWN_MS) return
  lastBounceAt = now

  try {
    const ac = getCtx()
    const mg = getMasterGain(ac)
    const volume = Math.min(speed / 6, 1) * 0.7

    const osc = ac.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(130, ac.currentTime)
    osc.frequency.exponentialRampToValueAtTime(38, ac.currentTime + 0.14)

    const gain = ac.createGain()
    gain.gain.setValueAtTime(volume, ac.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18)

    osc.connect(gain)
    gain.connect(mg)
    osc.start()
    osc.stop(ac.currentTime + 0.18)
  } catch {
    // 브라우저 자동 재생 정책으로 실패 시 무시
  }
}

export function playBackboardSound(speed: number): void {
  const now = performance.now()
  if (now - lastBackboardAt < HIT_COOLDOWN_MS) return
  lastBackboardAt = now

  try {
    const ac = getCtx()
    const mg = getMasterGain(ac)
    const volume = Math.min(speed / 10, 1) * 0.75

    const bufSize = Math.floor(ac.sampleRate * 0.12)
    const buf = ac.createBuffer(1, bufSize, ac.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.3))
    }

    const src = ac.createBufferSource()
    src.buffer = buf

    const filter = ac.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 600
    filter.Q.value = 0.5

    const gain = ac.createGain()
    gain.gain.setValueAtTime(volume, ac.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12)

    src.connect(filter)
    filter.connect(gain)
    gain.connect(mg)
    src.start()
  } catch {
    // 브라우저 자동 재생 정책으로 실패 시 무시
  }
}

export function playNetSound(): void {
  const now = performance.now()
  if (now - lastNetAt < NET_COOLDOWN_MS) return
  lastNetAt = now

  try {
    const ac = getCtx()
    const mg = getMasterGain(ac)
    const duration = 0.4

    const bufSize = Math.floor(ac.sampleRate * duration)
    const buf = ac.createBuffer(1, bufSize, ac.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < bufSize; i++) {
      const attack = Math.min(i / (bufSize * 0.04), 1)
      const decay = Math.exp(-i / (bufSize * 0.35))
      data[i] = (Math.random() * 2 - 1) * attack * decay
    }

    const src = ac.createBufferSource()
    src.buffer = buf

    const filter1 = ac.createBiquadFilter()
    filter1.type = 'bandpass'
    filter1.frequency.value = 3500
    filter1.Q.value = 0.7

    const filter2 = ac.createBiquadFilter()
    filter2.type = 'bandpass'
    filter2.frequency.value = 800
    filter2.Q.value = 1.2

    const gainHigh = ac.createGain()
    gainHigh.gain.setValueAtTime(0.55, ac.currentTime)
    gainHigh.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration)

    const gainLow = ac.createGain()
    gainLow.gain.setValueAtTime(0.25, ac.currentTime)
    gainLow.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration * 0.5)

    src.connect(filter1)
    src.connect(filter2)
    filter1.connect(gainHigh)
    filter2.connect(gainLow)
    gainHigh.connect(mg)
    gainLow.connect(mg)
    src.start()
  } catch {
    // 브라우저 자동 재생 정책으로 실패 시 무시
  }
}

export function playRimSound(speed: number): void {
  const now = performance.now()
  if (now - lastRimAt < HIT_COOLDOWN_MS) return
  lastRimAt = now

  try {
    const ac = getCtx()
    const mg = getMasterGain(ac)
    const volume = Math.min(speed / 10, 1) * 0.85

    const bufSize = Math.floor(ac.sampleRate * 0.025)
    const buf = ac.createBuffer(1, bufSize, ac.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.15))
    }
    const noiseSrc = ac.createBufferSource()
    noiseSrc.buffer = buf

    const noiseFilter = ac.createBiquadFilter()
    noiseFilter.type = 'bandpass'
    noiseFilter.frequency.value = 2200
    noiseFilter.Q.value = 1.2

    const noiseGain = ac.createGain()
    noiseGain.gain.setValueAtTime(volume * 1.2, ac.currentTime)
    noiseGain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.03)

    noiseSrc.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(mg)
    noiseSrc.start()

    // 비조화 배음 오실레이터 3개: 금속 특유의 쨍한 링 잔향
    const partials: Array<{ freq: number; gain: number; decay: number }> = [
      { freq: 360, gain: volume * 0.85, decay: 0.75 },
      { freq: 605, gain: volume * 0.55, decay: 0.5 },
      { freq: 990, gain: volume * 0.28, decay: 0.3 },
    ]

    for (const p of partials) {
      const osc = ac.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = p.freq

      const g = ac.createGain()
      g.gain.setValueAtTime(p.gain, ac.currentTime)
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + p.decay)

      osc.connect(g)
      g.connect(mg)
      osc.start()
      osc.stop(ac.currentTime + p.decay)
    }
  } catch {
    // 브라우저 자동 재생 정책으로 실패 시 무시
  }
}

export function playMissSound(): void {
  try {
    const ac = getCtx()
    const mg = getMasterGain(ac)

    // 짧은 하강 톤: 실패 피드백
    const osc = ac.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(220, ac.currentTime)
    osc.frequency.exponentialRampToValueAtTime(80, ac.currentTime + 0.28)

    const gain = ac.createGain()
    gain.gain.setValueAtTime(0.4, ac.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.32)

    osc.connect(gain)
    gain.connect(mg)
    osc.start()
    osc.stop(ac.currentTime + 0.32)
  } catch {
    // 브라우저 자동 재생 정책으로 실패 시 무시
  }
}
