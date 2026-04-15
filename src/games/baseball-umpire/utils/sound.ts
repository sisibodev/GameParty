let audioCtx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  // 브라우저 정책으로 suspended 상태일 수 있으므로 resume
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

/** 공이 미트에 도달할 때 "펑" 소리 */
export function playMittSound() {
  const ctx = getCtx()

  const now = ctx.currentTime

  // ── 노이즈 버퍼 (타격감) ────────────────────────────────────────────
  const duration = 0.12  // 120ms
  const sampleRate = ctx.sampleRate
  const buffer = ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate)
  const data   = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1
  }

  const noise = ctx.createBufferSource()
  noise.buffer = buffer

  // ── 저역 필터 (둔탁한 '팝' 음색) ───────────────────────────────────
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(800, now)
  lp.frequency.exponentialRampToValueAtTime(200, now + duration)

  // ── 게인 엔벨로프 (짧고 강하게 → 빠르게 감쇠) ─────────────────────
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(1.0, now + 0.004)     // 빠른 어택
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration)

  // ── 저음 보강 (body 감) ──────────────────────────────────────────────
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(120, now)
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.08)

  const oscGain = ctx.createGain()
  oscGain.gain.setValueAtTime(0.5, now)
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1)

  // ── 연결 ─────────────────────────────────────────────────────────────
  noise.connect(lp)
  lp.connect(gain)
  gain.connect(ctx.destination)

  osc.connect(oscGain)
  oscGain.connect(ctx.destination)

  noise.start(now)
  noise.stop(now + duration)
  osc.start(now)
  osc.stop(now + 0.1)
}
