/**
 * Baseball Umpire - 구종별 궤적/무브먼트 통계 분석 스크립트
 * Node.js (ESM) 단독 실행 가능 — Three.js 의존 없음
 * 실행: node scripts/pitch-analysis.mjs
 *
 * ── 분석 내용 ────────────────────────────────────────────────────────────────
 *  1. 각 구종 × 투구폼 조합에 대해 100개 투구 시뮬레이션
 *  2. 홈플레이트 도달 좌표 (plateX, plateY) 통계 (평균, 표준편차, min/max)
 *  3. 베지어 곡선 비행 경로 특성 (최고점 이탈, 최대 횡 이탈, 후반 낙차)
 *  4. MLB Statcast 실측값과 비교 (IVB, HB 기준)
 */

// ──────────────────────────────────────────────────────────────────────────────
//  상수 (pitch.ts에서 그대로 복사)
// ──────────────────────────────────────────────────────────────────────────────

const MOUND_DISTANCE = 18.44

const RELEASE_POINT = {
  overhand:      { x:  0.30, y: 1.85, z: 1.2 },
  three_quarter: { x:  0.55, y: 1.65, z: 1.0 },
  sidearm:       { x:  0.80, y: 1.25, z: 0.8 },
  underhand:     { x:  0.40, y: 0.85, z: 0.6 },
}

const PITCH_SPEED_RATIO = {
  fastball: [0.97, 1.00],
  two_seam: [0.94, 0.98],
  sinker:   [0.92, 0.97],
  cutter:   [0.88, 0.93],
  changeup: [0.80, 0.87],
  slider:   [0.85, 0.91],
  sweeper:  [0.80, 0.86],
  curve:    [0.78, 0.85],
  splitter: [0.87, 0.93],
  forkball: [0.82, 0.88],
}

const PITCH_MOVEMENT = {
  fastball: { xBase:  0.00, xRange: 0.05, yBase: +0.03, yRange: 0.03 },
  two_seam: { xBase: +0.14, xRange: 0.04, yBase: -0.14, yRange: 0.04 },
  sinker:   { xBase: +0.18, xRange: 0.04, yBase: -0.24, yRange: 0.05, forceDown: true },
  cutter:   { xBase: -0.13, xRange: 0.04, yBase: -0.07, yRange: 0.03 },
  changeup: { xBase: +0.10, xRange: 0.05, yBase: -0.24, yRange: 0.06, forceDown: true },
  slider:   { xBase: -0.16, xRange: 0.05, yBase: -0.20, yRange: 0.05 },
  sweeper:  { xBase: -0.12, xRange: 0.04, yBase: -0.10, yRange: 0.03 },
  curve:    { xBase: -0.12, xRange: 0.05, yBase: -0.44, yRange: 0.08 },
  splitter: { xBase:  0.00, xRange: 0.06, yBase: -0.34, yRange: 0.07, forceDown: true },
  forkball: { xBase:  0.00, xRange: 0.05, yBase: -0.44, yRange: 0.09, forceDown: true },
}

const FORM_MULT = {
  overhand:      { x: 0.75, y: 1.30 },
  three_quarter: { x: 1.00, y: 1.00 },
  sidearm:       { x: 1.20, y: 0.65 },
  underhand:     { x: 1.35, y: 0.50 },
}

const PITCH_BREAK = {
  fastball: { t1: 0.30, x1:  0.00, y1: +0.22, t2: 0.70, x2:  0.00, y2:  0.00 },
  two_seam: { t1: 0.33, x1: +0.04, y1: +0.04, t2: 0.72, x2: +0.07, y2: -0.12 },
  sinker:   { t1: 0.33, x1: +0.05, y1:  0.00, t2: 0.73, x2: +0.08, y2: -0.25 },
  cutter:   { t1: 0.28, x1: -0.02, y1: +0.09, t2: 0.84, x2: -0.08, y2: -0.05 },
  slider:   { t1: 0.30, x1: +0.10, y1: +0.06, t2: 0.76, x2: -0.06, y2: -0.12 },
  sweeper:  { t1: 0.28, x1:  0.00, y1: +0.02, t2: 0.73, x2: -0.22, y2: -0.05 },
  changeup: { t1: 0.33, x1: +0.03, y1: +0.08, t2: 0.76, x2: +0.06, y2: -0.20 },
  curve:    { t1: 0.26, x1:  0.00, y1: +0.34, t2: 0.65, x2: -0.06, y2: -0.28 },
  splitter: { t1: 0.35, x1:  0.00, y1:  0.00, t2: 0.86, x2:  0.00, y2: -0.32 },
  forkball: { t1: 0.35, x1: +0.02, y1:  0.00, t2: 0.81, x2: +0.02, y2: -0.40 },
}

const FORM_BREAK_MULT = {
  overhand:      { x1: 0.60, x2: 0.60, y1: 1.20, y2: 1.20 },
  three_quarter: { x1: 1.00, x2: 1.00, y1: 1.00, y2: 1.00 },
  sidearm:       { x1: 1.40, x2: 1.40, y1: 0.45, y2: 0.55 },
  underhand:     { x1: 1.10, x2: 1.10, y1: 0.38, y2: 0.55 },
}

// MLB Statcast 실측 평균값 (우투수 기준, cm 단위)
// HB: 수평 무브먼트 (+= 암사이드/1루, -= 글러브사이드/3루)
// IVB: 수직 유도 무브먼트 (+= 중력 이상 상승, -= 중력 이상 낙하)
// 참고: Baseball Savant 2023 MLB 평균
const MLB_REFERENCE = {
  fastball: { hb: +12, ivb: +40, desc: '백스핀 상승감, 암사이드 약간' },
  two_seam: { hb: +18, ivb: +18, desc: '암사이드 런, 싱커보다 덜 가라앉음' },
  sinker:   { hb: +22, ivb:  +8, desc: '강한 암사이드 런 + 침하' },
  cutter:   { hb:  -7, ivb: +28, desc: '글러브사이드 짧은 컷, 직구-슬라이더 중간' },
  changeup: { hb: +15, ivb:  +6, desc: '암사이드 런 + 낙하 (직구 위장)' },
  slider:   { hb: -14, ivb:  +2, desc: '글러브사이드 횡 변화 + 약간 낙하' },
  sweeper:  { hb: -32, ivb:  +7, desc: '글러브사이드 대형 스윕 (수직변화 작음)' },
  curve:    { hb:  -8, ivb: -20, desc: '12-6 큰 낙차 (오버핸드), 커브볼' },
  splitter: { hb:  +2, ivb:  +5, desc: '직선 진입 후 급락 (포크보다 낙차 작음)' },
  forkball: { hb:  +2, ivb:  -2, desc: '스플리터보다 더 큰 낙차' },
}

// ──────────────────────────────────────────────────────────────────────────────
//  Mulberry32 RNG (rng.ts 동일 구현)
// ──────────────────────────────────────────────────────────────────────────────
class SeededRng {
  constructor(seed) { this.seed = seed >>> 0 }

  next() {
    this.seed |= 0
    this.seed = (this.seed + 0x6d2b79f5) | 0
    let t = Math.imul(this.seed ^ (this.seed >>> 15), 1 | this.seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  float(min, max) { return this.next() * (max - min) + min }
  int(min, max)   { return Math.floor(this.next() * (max - min)) + min }
  pick(arr)       { return arr[this.int(0, arr.length)] }
}

// ──────────────────────────────────────────────────────────────────────────────
//  3D 벡터 (Three.js 없이)
// ──────────────────────────────────────────────────────────────────────────────
function vec3(x, y, z) { return { x, y, z } }

function lerpVec3(a, b, t) {
  return vec3(a.x + (b.x - a.x)*t, a.y + (b.y - a.y)*t, a.z + (b.z - a.z)*t)
}

/** 큐빅 베지어 곡선 샘플 */
function cubicBezier(p0, p1, p2, p3, t) {
  const u = 1 - t
  return vec3(
    u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
    u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y,
    u*u*u*p0.z + 3*u*u*t*p1.z + 3*u*t*t*p2.z + t*t*t*p3.z,
  )
}

// ──────────────────────────────────────────────────────────────────────────────
//  베지어 커브 빌더 (buildPitchCurve 동일 로직)
// ──────────────────────────────────────────────────────────────────────────────
function buildCurve(pitchType, form, plateX, plateY) {
  const rp  = RELEASE_POINT[form]
  const bp  = PITCH_BREAK[pitchType]
  const fb  = FORM_BREAK_MULT[form]

  const startZ = MOUND_DISTANCE - rp.z
  const start  = vec3(rp.x, rp.y, startZ)
  const end    = vec3(plateX, plateY, -0.30)

  const totalZ = startZ - (-0.30)
  const lerp   = (t) => vec3(
    rp.x + (plateX - rp.x) * t,
    rp.y + (plateY - rp.y) * t,
    startZ - totalZ * t,
  )

  const base1 = lerp(bp.t1)
  const base2 = lerp(bp.t2)

  const ctrl1 = vec3(
    base1.x + bp.x1 * fb.x1,
    base1.y + bp.y1 * fb.y1,
    base1.z,
  )

  const ctrl2RawY = base2.y + bp.y2 * fb.y2
  const isDescending = rp.y > plateY
  const ctrl2Y = (isDescending && ctrl2RawY < plateY) ? plateY : ctrl2RawY
  const ctrl2 = vec3(
    base2.x + bp.x2 * fb.x2,
    ctrl2Y,
    base2.z,
  )

  return { start, ctrl1, ctrl2, end }
}

// ──────────────────────────────────────────────────────────────────────────────
//  비행 경로 특성 측정
//  "직선 대비 이탈량"을 측정해서 궤적 특성 확인
// ──────────────────────────────────────────────────────────────────────────────
function analyzeTrajectory(pitchType, form, plateX, plateY, N_SAMPLES = 60) {
  const { start, ctrl1, ctrl2, end } = buildCurve(pitchType, form, plateX, plateY)

  let maxAboveLineDy = 0   // 직선 대비 최대 위쪽 이탈 (상승 아크)
  let maxBelowLineDy = 0   // 직선 대비 최대 아래쪽 이탈 (침하 아크)
  let maxArmDx = 0         // 암사이드 최대 이탈
  let maxGloveDx = 0       // 글러브사이드 최대 이탈

  // 후반 35% (t=0.65~1.0) 에서 수직 변화량 (tail drop)
  const p65 = cubicBezier(start, ctrl1, ctrl2, end, 0.65)
  const p80 = cubicBezier(start, ctrl1, ctrl2, end, 0.80)
  const p100 = end

  // 직선 위 65% 지점 Y
  const line65y = start.y + (end.y - start.y) * 0.65
  const line80y = start.y + (end.y - start.y) * 0.80

  for (let i = 0; i <= N_SAMPLES; i++) {
    const t = i / N_SAMPLES
    const pt = cubicBezier(start, ctrl1, ctrl2, end, t)
    const lineX = start.x + (end.x - start.x) * t
    const lineY = start.y + (end.y - start.y) * t

    const dy = pt.y - lineY   // + = 직선보다 위
    const dx = pt.x - lineX   // + = 직선보다 오른쪽(암사이드)

    if (dy > maxAboveLineDy) maxAboveLineDy = dy
    if (dy < -maxBelowLineDy) maxBelowLineDy = -dy
    if (dx > maxArmDx) maxArmDx = dx
    if (dx < -maxGloveDx) maxGloveDx = -dx
  }

  // 후반 낙차: t=0.65→1.0 구간에서 실제 Y 변화 vs 직선 Y 변화
  const actualDropLate = p65.y - end.y                // 양수 = 실제로 내려감
  const lineDropLate   = line65y - end.y              // 직선상의 낙차
  const extraDropLate  = actualDropLate - lineDropLate // 추가 낙차 (양수=더 떨어짐)

  // ctrl1 값 (직선 기준 이탈로 표현)
  const ctrl1AboveLine = ctrl1.y - (start.y + (end.y - start.y) * (ctrl1.z - start.z) / (end.z - start.z + 0.0001))

  return {
    maxAboveLineDy: +(maxAboveLineDy * 100).toFixed(1),   // cm
    maxBelowLineDy: +(maxBelowLineDy * 100).toFixed(1),   // cm
    maxArmDx: +(maxArmDx * 100).toFixed(1),               // cm
    maxGloveDx: +(maxGloveDx * 100).toFixed(1),           // cm
    extraDropLate: +(extraDropLate * 100).toFixed(1),      // cm (후반 추가 낙차)
    ctrl1AboveLine: +(ctrl1AboveLine * 100).toFixed(1),    // cm
    ctrl1, ctrl2, start, end,
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  무브먼트 통계 시뮬레이션 (100개 투구)
//  strike zone 중앙을 타깃으로 고정, 무브먼트 적용 후 최종 좌표 기록
// ──────────────────────────────────────────────────────────────────────────────
function simulateMovement(pitchType, form, N = 100) {
  const mv = PITCH_MOVEMENT[pitchType]
  const fm = FORM_MULT[form]

  const mvXs = []
  const mvYs = []

  for (let seed = 0; seed < N; seed++) {
    const rng = new SeededRng(seed * 1337 + 42)
    const variety = rng.float(0.85, 1.15)
    const rawMvX = (mv.xBase + rng.float(-mv.xRange, mv.xRange)) * fm.x * variety
    const rawMvY = (mv.yBase + rng.float(-mv.yRange, mv.yRange)) * fm.y * variety
    const mvY = mv.forceDown ? Math.min(rawMvY, -0.05) : rawMvY

    mvXs.push(rawMvX * 100)  // m → cm
    mvYs.push(mvY * 100)
  }

  const mean = arr => arr.reduce((a,b) => a+b, 0) / arr.length
  const std  = arr => {
    const m = mean(arr)
    return Math.sqrt(arr.reduce((a,b) => a+(b-m)**2, 0) / arr.length)
  }

  return {
    mvX_mean: +mean(mvXs).toFixed(1),
    mvX_std:  +std(mvXs).toFixed(1),
    mvY_mean: +mean(mvYs).toFixed(1),
    mvY_std:  +std(mvYs).toFixed(1),
    mvX_min:  +Math.min(...mvXs).toFixed(1),
    mvX_max:  +Math.max(...mvXs).toFixed(1),
    mvY_min:  +Math.min(...mvYs).toFixed(1),
    mvY_max:  +Math.max(...mvYs).toFixed(1),
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  메인
// ──────────────────────────────────────────────────────────────────────────────

const PITCH_TYPES = ['fastball','two_seam','sinker','cutter','changeup','slider','sweeper','curve','splitter','forkball']
const FORMS       = ['overhand','three_quarter','sidearm','underhand']
const FORM_KR     = { overhand:'오버핸드', three_quarter:'쓰리쿼터', sidearm:'사이드암', underhand:'언더핸드' }
const PITCH_KR    = {
  fastball:'직구', two_seam:'투심', sinker:'싱커', cutter:'커터',
  changeup:'체인지업', slider:'슬라이더', sweeper:'스위퍼',
  curve:'커브', splitter:'스플리터', forkball:'포크볼',
}

// 스트라이크존 중앙 타깃 (medium 체형)
const TARGET_X = 0.00
const TARGET_Y = 0.825

console.log('='.repeat(100))
console.log('⚾  Baseball Umpire — 구종 × 투구폼 궤적/무브먼트 분석 (N=100 시뮬레이션)')
console.log('='.repeat(100))
console.log(`타깃: 스트라이크존 중앙 (X=${TARGET_X}, Y=${TARGET_Y})`)
console.log('')

// ── Part 1: MLB Statcast 비교 (무브먼트 수치) ──────────────────────────────────
console.log('━'.repeat(100))
console.log('【 PART 1 】 구종별 무브먼트 비교 — MLB Statcast 실측 대비')
console.log('  HB  : 수평 무브먼트 (cm)  + = 암사이드(1루), - = 글러브사이드(3루)')
console.log('  VB  : 수직 무브먼트 (cm)  + = 상승 성분, - = 침하 성분')
console.log('  폼별 배율 적용, 100개 랜덤 샘플 mean±std')
console.log('━'.repeat(100))

const pitchKrPad = (s) => (PITCH_KR[s] + '        ').slice(0, 8)

console.log(`\n${'구종'.padEnd(10)} ${'폼'.padEnd(10)} ${'게임HB'.padStart(8)} ${'게임VB'.padStart(8)} ${'MLB_HB'.padStart(8)} ${'MLB_VB'.padStart(8)} ${'HB차이'.padStart(8)} ${'VB차이'.padStart(8)}  평가`)
console.log('-'.repeat(100))

for (const pt of PITCH_TYPES) {
  const ref = MLB_REFERENCE[pt]
  for (const form of FORMS) {
    const mv = simulateMovement(pt, form)
    const hbDiff = (mv.mvX_mean - ref.hb).toFixed(1)
    const vbDiff = (mv.mvY_mean - ref.ivb).toFixed(1)
    const hbOk   = Math.abs(mv.mvX_mean - ref.hb)  <= 15 ? '✅' : Math.abs(mv.mvX_mean - ref.hb) <= 25 ? '⚠️' : '❌'
    const vbOk   = Math.abs(mv.mvY_mean - ref.ivb) <= 15 ? '✅' : Math.abs(mv.mvY_mean - ref.ivb) <= 25 ? '⚠️' : '❌'
    const ok     = hbOk === '✅' && vbOk === '✅' ? '✅ 좋음' :
                   hbOk === '❌' || vbOk === '❌' ? '❌ 수정필요' : '⚠️ 약간차이'

    const gameHb = `${mv.mvX_mean>0?'+':''}${mv.mvX_mean}`
    const gameVb = `${mv.mvY_mean>0?'+':''}${mv.mvY_mean}`
    const mlbHb  = `${ref.hb>0?'+':''}${ref.hb}`
    const mlbVb  = `${ref.ivb>0?'+':''}${ref.ivb}`
    const hdStr  = `${parseFloat(hbDiff)>0?'+':''}${hbDiff}`
    const vdStr  = `${parseFloat(vbDiff)>0?'+':''}${vbDiff}`

    console.log(
      `${(PITCH_KR[pt]+'       ').slice(0,9)} ${(FORM_KR[form]+'        ').slice(0,9)}`+
      ` ${gameHb.padStart(8)} ${gameVb.padStart(8)} ${mlbHb.padStart(8)} ${mlbVb.padStart(8)}`+
      ` ${hdStr.padStart(8)} ${vdStr.padStart(8)}  ${ok}`
    )
  }
  console.log('')
}

// ── Part 2: 비행 궤적 상세 분석 ─────────────────────────────────────────────
console.log('━'.repeat(100))
console.log('【 PART 2 】 베지어 비행 경로 특성 (중앙 스트라이크 타깃 기준)')
console.log('  ↑arc  : 직선 대비 최대 상승 이탈 (cm) — 커브·직구 솟음 아크')
console.log('  ↓arc  : 직선 대비 최대 하강 이탈 (cm)')
console.log('  →arm  : 암사이드 최대 횡 이탈 (cm)  ←glv: 글러브사이드 최대 횡 이탈 (cm)')
console.log('  ↓tail : 후반(t=0.65→1.0) 추가 낙차 (cm) — 스플리터/포크볼 급락 체크')
console.log('  ctrl1Y: ctrl1의 직선 대비 Y 이탈 (cm, 양수=솟음, 12-6 커브 확인)')
console.log('━'.repeat(100))

for (const pt of PITCH_TYPES) {
  console.log(`\n▶ ${PITCH_KR[pt]} (${pt})   MLB참고: HB=${MLB_REFERENCE[pt].hb>0?'+':''}${MLB_REFERENCE[pt].hb}cm  IVB=${MLB_REFERENCE[pt].ivb>0?'+':''}${MLB_REFERENCE[pt].ivb}cm  [${MLB_REFERENCE[pt].desc}]`)
  console.log(`  ${'폼'.padEnd(10)} ${'↑arc'.padStart(7)} ${'↓arc'.padStart(7)} ${'→arm'.padStart(7)} ${'←glv'.padStart(7)} ${'↓tail'.padStart(7)} ${'ctrl1Y'.padStart(8)}  ctrl1 좌표                판정`)

  for (const form of FORMS) {
    const rp = RELEASE_POINT[form]
    const tr = analyzeTrajectory(pt, form, TARGET_X, TARGET_Y)
    const c1 = tr.ctrl1
    const c2 = tr.ctrl2

    // 구종별 이상적인 특성 기준
    let assessment = ''
    if (pt === 'fastball') {
      assessment = tr.ctrl1AboveLine > 10 ? '✅ 솟음OK' : '⚠️ 솟음부족'
    } else if (pt === 'curve') {
      const rising = c1.y > rp.y
      assessment = rising ? `✅ 12-6솟음(ctrl1.y=${c1.y.toFixed(3)}>${rp.y})` : `❌ 솟음없음`
    } else if (pt === 'splitter' || pt === 'forkball') {
      assessment = tr.extraDropLate > 5 ? `✅ 후반급락${tr.extraDropLate}cm` : `⚠️ 후반급락 약함`
    } else if (pt === 'slider') {
      assessment = (tr.maxArmDx > 3 && tr.maxGloveDx > 3) ? '✅ S커브OK' : '⚠️ 횡변화확인'
    } else if (pt === 'sweeper') {
      assessment = tr.maxGloveDx > 5 ? `✅ 스윕${tr.maxGloveDx}cm` : '⚠️ 스윕약함'
    } else if (pt === 'sinker') {
      assessment = tr.maxArmDx > 2 ? `✅ 암사이드런${tr.maxArmDx}cm` : '⚠️ 횡이탈약함'
    } else if (pt === 'cutter') {
      assessment = tr.maxGloveDx > 1 ? `✅ 컷${tr.maxGloveDx}cm` : '⚠️ 컷약함'
    } else {
      assessment = '—'
    }

    console.log(
      `  ${(FORM_KR[form]+'        ').slice(0,10)}`+
      ` ${('+'+tr.maxAboveLineDy).padStart(7)}`+
      ` ${('-'+tr.maxBelowLineDy).padStart(7)}`+
      ` ${('+'+tr.maxArmDx).padStart(7)}`+
      ` ${('-'+tr.maxGloveDx).padStart(7)}`+
      ` ${('-'+tr.extraDropLate).padStart(7)}`+
      ` ${(tr.ctrl1AboveLine>0?'+':'')+tr.ctrl1AboveLine}`.padStart(9)+
      `  ctrl1(${c1.x.toFixed(3)},${c1.y.toFixed(3)}) ctrl2(${c2.x.toFixed(3)},${c2.y.toFixed(3)})`+
      `  ${assessment}`
    )
  }
}

// ── Part 3: 요약 평가 테이블 ──────────────────────────────────────────────────
console.log('\n')
console.log('━'.repeat(100))
console.log('【 PART 3 】 종합 평가 매트릭스 (구종 × 폼)')
console.log('━'.repeat(100))

const header = `${''.padEnd(8)} ${'오버핸드'.padEnd(12)} ${'쓰리쿼터'.padEnd(12)} ${'사이드암'.padEnd(12)} ${'언더핸드'.padEnd(12)}`
console.log(header)
console.log('-'.repeat(60))

// 각 셀: HB/VB 오차 기반 평가
for (const pt of PITCH_TYPES) {
  const ref = MLB_REFERENCE[pt]
  let row = `${(PITCH_KR[pt]+'      ').slice(0,7)} `
  for (const form of FORMS) {
    const mv = simulateMovement(pt, form)
    const hbErr = Math.abs(mv.mvX_mean - ref.hb)
    const vbErr = Math.abs(mv.mvY_mean - ref.ivb)
    const cell =
      (hbErr <= 15 && vbErr <= 15) ? '✅     ' :
      (hbErr <= 25 && vbErr <= 25) ? '⚠️     ' : '❌     '
    row += `${cell.padEnd(14)}`
  }
  console.log(row)
}

// ── Part 4: 구종별 폼 특이사항 리포트 ─────────────────────────────────────────
console.log('\n')
console.log('━'.repeat(100))
console.log('【 PART 4 】 폼별 구종 특이사항 (실제와 다른 점 상세)')
console.log('━'.repeat(100))

for (const pt of PITCH_TYPES) {
  const ref = MLB_REFERENCE[pt]
  const issues = []

  for (const form of FORMS) {
    const mv = simulateMovement(pt, form)
    const tr = analyzeTrajectory(pt, form, TARGET_X, TARGET_Y)
    const hbErr = mv.mvX_mean - ref.hb
    const vbErr = mv.mvY_mean - ref.ivb

    const formKr = FORM_KR[form]
    if (Math.abs(hbErr) > 15 || Math.abs(vbErr) > 15) {
      issues.push(
        `  [${formKr}] HB: 게임${mv.mvX_mean>0?'+':''}${mv.mvX_mean} vs MLB${ref.hb>0?'+':''}${ref.hb} (차이${hbErr>0?'+':''}${hbErr.toFixed(1)}cm)` +
        `, VB: 게임${mv.mvY_mean>0?'+':''}${mv.mvY_mean} vs MLB${ref.ivb>0?'+':''}${ref.ivb} (차이${vbErr>0?'+':''}${vbErr.toFixed(1)}cm)`
      )
    }

    // 궤적 특이사항
    if (pt === 'curve') {
      const rp = RELEASE_POINT[form]
      const ctrl1y = tr.ctrl1.y
      if (ctrl1y <= rp.y) {
        issues.push(`  [${formKr}] ⚠️ 커브 ctrl1.y(${ctrl1y.toFixed(3)}) ≤ 릴리즈포인트(${rp.y}) → 12-6 솟음 없음`)
      } else {
        issues.push(`  [${formKr}] ✅ 커브 ctrl1.y(${ctrl1y.toFixed(3)}) > 릴리즈(${rp.y}) → 12-6 솟음 +${((ctrl1y-rp.y)*100).toFixed(1)}cm`)
      }
    }

    if (pt === 'fastball' && form === 'underhand') {
      const rp = RELEASE_POINT[form]
      const ctrl1y = tr.ctrl1.y
      issues.push(`  [${formKr}] 직구 ctrl1.y=${ctrl1y.toFixed(3)} vs rp.y=${rp.y} → ${ctrl1y > rp.y ? `✅ 라이징 +${((ctrl1y-rp.y)*100).toFixed(1)}cm` : '❌ 라이징 없음'}`)
    }
  }

  if (issues.length > 0) {
    console.log(`\n▶ ${PITCH_KR[pt]} (MLB: HB${ref.hb>0?'+':''}${ref.hb}cm, IVB${ref.ivb>0?'+':''}${ref.ivb}cm)`)
    issues.forEach(i => console.log(i))
  }
}

console.log('\n' + '='.repeat(100))
console.log('분석 완료')
console.log('='.repeat(100))
