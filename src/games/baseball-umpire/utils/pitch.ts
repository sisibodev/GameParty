import * as THREE from 'three'
import {
  PitchParams, PitchType, PitcherForm,
  DifficultyConfig, BatterProfile
} from '../types'
import { SeededRng } from './rng'

// 마운드에서 홈플레이트까지 거리 (18.44m)
export const MOUND_DISTANCE = 18.44

// 공 반지름 (MLB 규정: 지름 73~75mm → 반지름 0.037m)
export const BALL_RADIUS = 0.037

// 투구폼별 릴리즈 포인트 (마운드 기준, 오른손 투수 기준)
// x: 좌우 (+ = 1루측/우투수 팔 방향), y: 높이, z: 앞뒤 오프셋 (MOUND_DISTANCE에서 빼줌)
const RELEASE_POINT: Record<PitcherForm, { x: number; y: number; z: number }> = {
  overhand:      { x:  0.30, y: 1.85, z: 1.2 },  // 머리 위, 팔 약간 1루 방향
  three_quarter: { x:  0.55, y: 1.65, z: 1.0 },  // 귀 옆 대각선, 옆으로 더 벌어짐
  sidearm:       { x:  0.80, y: 1.25, z: 0.8 },  // 어깨 높이, 많이 옆으로 벌어짐
  underhand:     { x:  0.40, y: 0.85, z: 0.6 },  // 허리 아래, 약간 바깥쪽
}

// ── 변화구 풀 (직구 제외 전체 9종) ───────────────────────────────────────────
// 게임 시작 시 난이도별 breakingBallCount만큼 시드 RNG로 랜덤 선택
export const BREAKING_BALL_POOL: PitchType[] = [
  'two_seam', 'sinker', 'cutter',
  'changeup', 'slider', 'sweeper',
  'curve', 'splitter', 'forkball',
]

// ── 구종별 구속 배율 (직구 기준 상대 속도) ────────────────────────────────────
const PITCH_SPEED_RATIO: Record<PitchType, [number, number]> = {
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

// ── 구종별 무브먼트 (방향성 적용, 우투수 기준) ────────────────────────────────
// xBase: 기준 횡 이동 (+= 포수시점 우/1루방향, -= 포수시점 좌/3루방향)
// xRange: 공마다 달라지는 ±변동폭
// yBase: 기준 수직 이동 (+= 상승, -= 낙하)
// yRange: ±변동폭
// forceDown: true → y 항상 음수 보장 (포크/싱커 등 낙하계)
// ※ 폼별 배율(FORM_MULT)과 ±15% 개인 편차(variety)가 추가 적용됨
interface DirectionalMovement {
  xBase: number; xRange: number
  yBase: number; yRange: number
  forceDown?: boolean
}
const PITCH_MOVEMENT: Record<PitchType, DirectionalMovement> = {
  //              xBase   xRange  yBase   yRange
  fastball: { xBase:  0.00, xRange: 0.05, yBase: +0.03, yRange: 0.03 },              // 백스핀 상승감
  two_seam: { xBase: +0.14, xRange: 0.04, yBase: -0.14, yRange: 0.04 },              // 1루방향 런+침하
  sinker:   { xBase: +0.18, xRange: 0.04, yBase: -0.24, yRange: 0.05, forceDown: true }, // 강한 런+침하
  cutter:   { xBase: -0.13, xRange: 0.04, yBase: -0.07, yRange: 0.03 },              // 3루방향 짧은 컷
  changeup: { xBase: +0.10, xRange: 0.05, yBase: -0.24, yRange: 0.06, forceDown: true }, // 암사이드+낙하
  slider:   { xBase: -0.28, xRange: 0.06, yBase: -0.20, yRange: 0.05 },              // 3루방향 횡변화+낙하
  sweeper:  { xBase: -0.38, xRange: 0.07, yBase: -0.12, yRange: 0.04 },              // 크게 좌로 스윕
  curve:    { xBase: -0.12, xRange: 0.05, yBase: -0.44, yRange: 0.08 },              // 큰 낙차+약간 좌
  splitter: { xBase:  0.00, xRange: 0.06, yBase: -0.34, yRange: 0.07, forceDown: true }, // 직선 급강하
  forkball: { xBase:  0.00, xRange: 0.05, yBase: -0.44, yRange: 0.09, forceDown: true }, // 더 큰 낙차
}

// ── 투구폼별 무브먼트 배율 ──────────────────────────────────────────────────────
// 오버핸드: 수직 강조 / 사이드암: 수평 강조 / 언더핸드: 수평 극대화
const FORM_MULT: Record<PitcherForm, { x: number; y: number }> = {
  overhand:      { x: 0.75, y: 1.30 },
  three_quarter: { x: 1.00, y: 1.00 },
  sidearm:       { x: 1.55, y: 0.60 },
  underhand:     { x: 1.80, y: 0.45 },
}

// ── 구종별 베지어 궤적 파라미터 ───────────────────────────────────────────────
// t1/t2: 직선 경로 위 제어점 위치 (0=마운드, 1=홈플레이트)
// y1/y2: 직선 경로 대비 Y 오프셋 (양수=위, 음수=아래)
// ※ forceDown 구종은 y1=0 으로 설정 → 릴리즈포인트 낮은 폼에서도 위로 안 뜸
interface BreakProfile { t1: number; y1: number; t2: number; y2: number }
const PITCH_BREAK: Record<PitchType, BreakProfile> = {
  //            early                    late
  fastball: { t1: 0.33, y1: +0.10,  t2: 0.72, y2: +0.06 },  // 백스핀 상승감
  two_seam: { t1: 0.33, y1: +0.03,  t2: 0.72, y2: -0.09 },  // 초반 직구 → 후반 침하
  sinker:   { t1: 0.33, y1:  0.00,  t2: 0.73, y2: -0.15 },  // 처음부터 침하 (위로 안 뜸)
  cutter:   { t1: 0.28, y1: +0.08,  t2: 0.82, y2: -0.05 },  // 직구 유사 → 극후반 컷
  changeup: { t1: 0.33, y1: +0.05,  t2: 0.76, y2: -0.18 },  // 초반 직구 위장 → 후반 낙하
  slider:   { t1: 0.30, y1: +0.05,  t2: 0.78, y2: -0.09 },  // 직구 유사 → 후반 횡+낙하
  sweeper:  { t1: 0.28, y1: +0.02,  t2: 0.74, y2: -0.05 },  // 완만 → 후반 크게 스윕
  curve:    { t1: 0.28, y1: +0.22,  t2: 0.67, y2: -0.18 },  // 큰 포물선 (12-6)
  splitter: { t1: 0.35, y1:  0.00,  t2: 0.83, y2: -0.28 },  // 직구 위장 → 극후반 급락
  forkball: { t1: 0.35, y1:  0.00,  t2: 0.80, y2: -0.34 },  // 처음부터 낙하, 큰 낙차
}

// ── 투구폼별 궤적 아크 배율 ───────────────────────────────────────────────────
// 오버핸드: 수직 아크 강조 / 사이드암·언더핸드: 수직 아크 감소(수평 느낌)
const FORM_BREAK_MULT: Record<PitcherForm, { y1: number; y2: number }> = {
  overhand:      { y1: 1.20, y2: 1.20 },
  three_quarter: { y1: 1.00, y2: 1.00 },
  sidearm:       { y1: 0.45, y2: 0.55 },
  underhand:     { y1: 0.20, y2: 0.35 },
}

// ── 관리자 런타임 오버라이드 ──────────────────────────────────────────────────
export interface DirectionalMovementExport {
  xBase: number; xRange: number
  yBase: number; yRange: number
  forceDown?: boolean
}
export interface BreakProfileExport { t1: number; y1: number; t2: number; y2: number }
export interface FullPitchConfig {
  pitchMovement:  Record<PitchType, DirectionalMovementExport>
  formMult:       Record<PitcherForm, { x: number; y: number }>
  pitchBreak:     Record<PitchType, BreakProfileExport>
  formBreakMult:  Record<PitcherForm, { y1: number; y2: number }>
}

let _configOverride: FullPitchConfig | null = null

/** 관리자 에디터에서 저장한 설정을 런타임에 적용 */
export function applyPitchConfig(config: FullPitchConfig) {
  _configOverride = config
}

/** 현재 기본값을 FullPitchConfig 형태로 반환 (에디터 초기값으로 사용) */
export function getDefaultPitchConfig(): FullPitchConfig {
  return {
    pitchMovement:  structuredClone(PITCH_MOVEMENT) as Record<PitchType, DirectionalMovementExport>,
    formMult:       structuredClone(FORM_MULT),
    pitchBreak:     structuredClone(PITCH_BREAK) as Record<PitchType, BreakProfileExport>,
    formBreakMult:  structuredClone(FORM_BREAK_MULT),
  }
}

/** 현재 활성 설정 반환 (오버라이드 있으면 오버라이드, 없으면 기본값) */
export function getActivePitchConfig(): FullPitchConfig {
  return _configOverride ?? getDefaultPitchConfig()
}

/** 보더라인 공: 존 경계 ±5% 이내에 의도적으로 위치 */
function borderlineX(rng: SeededRng, batter: BatterProfile): number {
  const side = rng.next() < 0.5 ? 1 : -1
  return batter.zoneHalfWidth * side + rng.float(-0.02, 0.02)
}

function borderlineY(rng: SeededRng, batter: BatterProfile): number {
  const edge = rng.next() < 0.5 ? 'top' : 'bottom'
  if (edge === 'top') return batter.zoneTop + rng.float(-0.03, 0.03)
  return batter.zoneBottom + rng.float(-0.03, 0.03)
}

export function generatePitch(
  rng: SeededRng,
  index: number,
  batter: BatterProfile,
  config: DifficultyConfig,
  pitchIndex: number,
  pitcherForm: PitcherForm,
  activePitchTypes: PitchType[],
): PitchParams {
  const pitchType = rng.pick(activePitchTypes)

  // 구종별 구속 계산
  const baseSpeed = rng.float(config.speedMin, config.speedMax)
  const speedRatio = rng.float(PITCH_SPEED_RATIO[pitchType][0], PITCH_SPEED_RATIO[pitchType][1])
  const speed = Math.min(Math.round(baseSpeed * speedRatio), 170)

  const isBorderline = rng.next() < config.borderlineRatio
  // 런타임 오버라이드 우선 적용
  const _pm = _configOverride?.pitchMovement ?? PITCH_MOVEMENT
  const _fm = _configOverride?.formMult      ?? FORM_MULT
  const mv = _pm[pitchType]
  const fm = _fm[pitcherForm]

  let plateX: number
  let plateY: number

  if (isBorderline) {
    plateX = borderlineX(rng, batter)
    plateY = borderlineY(rng, batter)
  } else {
    const shouldBeStrike = rng.next() < 0.5
    if (shouldBeStrike) {
      plateX = rng.float(-batter.zoneHalfWidth * 0.85, batter.zoneHalfWidth * 0.85)
      // forceDown 구종은 하단 60% 이내를 타깃으로 (낙하계가 높은 공이 되지 않도록)
      if (mv.forceDown) {
        const maxY = batter.zoneBottom + (batter.zoneTop - batter.zoneBottom) * 0.6
        plateY = rng.float(batter.zoneBottom + 0.05, maxY)
      } else {
        plateY = rng.float(batter.zoneBottom + 0.05, batter.zoneTop - 0.05)
      }
    } else {
      const dir = rng.int(0, 4)
      if (dir === 0) {
        plateX = batter.zoneHalfWidth + rng.float(0.05, 0.35)
        if (rng.next() < 0.5) plateX = -plateX
        plateY = rng.float(batter.zoneBottom, batter.zoneTop)
      } else if (dir === 1) {
        plateX = rng.float(-batter.zoneHalfWidth * 1.2, batter.zoneHalfWidth * 1.2)
        plateY = batter.zoneTop + rng.float(0.05, 0.40)
      } else {
        plateX = rng.float(-batter.zoneHalfWidth * 1.2, batter.zoneHalfWidth * 1.2)
        plateY = batter.zoneBottom - rng.float(0.05, 0.35)
      }
    }
  }

  // ── 무브먼트 계산 ─────────────────────────────────────────────────────────
  // ±15% 개인 편차: 같은 구종도 공마다 무브먼트가 조금씩 다름
  const variety = rng.float(0.85, 1.15)

  const rawMvX = (mv.xBase + rng.float(-mv.xRange, mv.xRange)) * fm.x * variety
  const rawMvY = (mv.yBase + rng.float(-mv.yRange, mv.yRange)) * fm.y * variety

  const mvX = rawMvX
  // forceDown 구종: 항상 낙하 방향 보장 (최소 -5cm 낙하)
  const mvY = mv.forceDown ? Math.min(rawMvY, -0.05) : rawMvY

  const finalPlateX = plateX + mvX
  const finalPlateY = plateY + mvY

  // KBO ABS 3-plane 판정
  const frontHalfW = batter.zoneHalfWidth + 0.02
  const midHalfW   = batter.zoneHalfWidth + 0.02
  const endHalfW   = batter.zoneHalfWidth

  const frontPlaneHit =
    Math.abs(finalPlateX) <= frontHalfW + BALL_RADIUS &&
    finalPlateY >= batter.zoneBottom - BALL_RADIUS &&
    finalPlateY <= batter.zoneTop    + BALL_RADIUS

  const midPlaneHit =
    Math.abs(finalPlateX) <= midHalfW + BALL_RADIUS &&
    finalPlateY >= batter.zoneBottom - BALL_RADIUS &&
    finalPlateY <= batter.zoneTop    + BALL_RADIUS

  const endPlaneHit =
    Math.abs(finalPlateX) <= endHalfW + BALL_RADIUS &&
    finalPlateY >= (batter.zoneBottom - 0.015) - BALL_RADIUS &&
    finalPlateY <= batter.zoneTop + BALL_RADIUS

  // 2026 KBSA ABS 판정: 중간면(mid plane)에 스치기만 해도 스트라이크
  const isStrike = midPlaneHit

  void index

  return {
    pitchIndex,
    pitchType,
    pitcherForm,
    speed,
    plateX: finalPlateX,
    plateY: finalPlateY,
    isStrike,
    frontPlaneHit,
    midPlaneHit,
    endPlaneHit,
    isBorderline,
    playerCall: null,
    correct: undefined,
    scoreChange: undefined,
  }
}

/**
 * 구종별 고유 궤적 생성 (CubicBezierCurve3)
 *
 * 투구폼별 아크 배율(FORM_BREAK_MULT) 적용:
 *   - 오버핸드: 수직 아크 강조 (커브·스플리터 낙차 크게)
 *   - 사이드암: 수직 아크 감소 (횡 변화가 두드러지는 궤적)
 *   - 언더핸드: 수직 아크 최소 (거의 수평에 가까운 궤적)
 */
export function buildPitchCurve(
  params: PitchParams,
  form: PitcherForm,
): THREE.CubicBezierCurve3 {
  const rp = RELEASE_POINT[form]
  const bp = (_configOverride?.pitchBreak    ?? PITCH_BREAK)[params.pitchType]
  const fb = (_configOverride?.formBreakMult ?? FORM_BREAK_MULT)[form]

  const startZ = MOUND_DISTANCE - rp.z
  const start  = new THREE.Vector3(rp.x, rp.y, startZ)
  const end    = new THREE.Vector3(params.plateX, params.plateY, -0.30)

  const totalZ = startZ - (-0.30)
  const lerpOnLine = (t: number) => new THREE.Vector3(
    rp.x + (params.plateX - rp.x) * t,
    rp.y  + (params.plateY - rp.y) * t,
    startZ - totalZ * t,
  )

  const base1 = lerpOnLine(bp.t1)
  const base2 = lerpOnLine(bp.t2)

  // 폼별 배율로 수직 아크 조정
  const ctrl1 = new THREE.Vector3(base1.x, base1.y + bp.y1 * fb.y1, base1.z)
  const ctrl2 = new THREE.Vector3(base2.x, base2.y + bp.y2 * fb.y2, base2.z)

  return new THREE.CubicBezierCurve3(start, ctrl1, ctrl2, end)
}

// ── 구종별 스핀/물리 파라미터 ──────────────────────────────────────────────────
interface SpinProfile { spinX: number; spinZ: number; drag: number }
const SPIN_PROFILE: Record<PitchType, SpinProfile> = {
  fastball: { spinX: +2400, spinZ:    0, drag: 0.32 },
  two_seam: { spinX: +1800, spinZ: +300, drag: 0.33 },
  sinker:   { spinX: +1200, spinZ: +500, drag: 0.34 },
  cutter:   { spinX: +2000, spinZ: -600, drag: 0.33 },
  changeup: { spinX: +1000, spinZ: +200, drag: 0.44 },
  slider:   { spinX:  +600, spinZ: -1800, drag: 0.35 },
  sweeper:  { spinX:  +200, spinZ: -2400, drag: 0.36 },
  curve:    { spinX: -2000, spinZ:  +400, drag: 0.38 },
  splitter: { spinX:  +400, spinZ:    0, drag: 0.40 },
  forkball: { spinX:  +200, spinZ:    0, drag: 0.42 },
}

const MAGNUS_COEFF = 0.00013
const GRAVITY      = 9.81
const BALL_MASS    = 0.145
const BALL_AREA    = Math.PI * 0.037 ** 2
const AIR_DENSITY  = 1.225

export function buildPhysicsCurve(
  params: PitchParams,
  form: PitcherForm = 'overhand',
): THREE.CatmullRomCurve3 {
  const rp    = RELEASE_POINT[form]
  const sp    = SPIN_PROFILE[params.pitchType]
  const v0    = params.speed / 3.6
  const startZ = MOUND_DISTANCE - rp.z

  const dx = params.plateX - rp.x
  const dy = params.plateY - rp.y
  const dz = -(startZ + 0.30)
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

  let vx = (dx / dist) * v0
  let vy = (dy / dist) * v0
  let vz = (dz / dist) * v0

  let px = rp.x
  let py = rp.y
  let pz = startZ

  const points: THREE.Vector3[] = [new THREE.Vector3(px, py, pz)]

  const omegaX = (sp.spinX / 60) * 2 * Math.PI
  const omegaZ = (sp.spinZ / 60) * 2 * Math.PI

  const N_STEPS  = 120
  const totalTime = (dist / v0) * 1.05
  const dt       = totalTime / N_STEPS

  for (let i = 0; i < N_STEPS; i++) {
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz)

    const dragScale = 0.5 * sp.drag * AIR_DENSITY * BALL_AREA * speed / BALL_MASS
    const fdx = -dragScale * vx
    const fdy = -dragScale * vy
    const fdz = -dragScale * vz

    const magScale = MAGNUS_COEFF * (sp.spinX !== 0 || sp.spinZ !== 0 ? 1 : 0)
    const fmx = magScale * (omegaZ * vy)
    const fmy = magScale * (-omegaX * vz - omegaZ * vx)
    const fmz = magScale * (omegaX * vy)

    const ax = fdx + fmx
    const ay = fdy + fmy - GRAVITY
    const az = fdz + fmz

    vx += ax * dt
    vy += ay * dt
    vz += az * dt
    px += vx * dt
    py += vy * dt
    pz += vz * dt

    points.push(new THREE.Vector3(px, py, pz))
    if (pz <= -0.30) break
  }

  if (points.length > 1) {
    points[points.length - 1].set(params.plateX, params.plateY, -0.30)
  }

  return new THREE.CatmullRomCurve3(points)
}

/** km/h → 투구 비행 시간(ms) */
export function speedToFlightMs(speedKph: number): number {
  const mps = speedKph / 3.6
  return (MOUND_DISTANCE / mps) * 1000
}

/** 판정 점수 계산 */
export function calcScore(
  playerCall: 'strike' | 'ball',
  params: PitchParams,
  batter: BatterProfile,
  combo: number,
): { score: number; correct: boolean } {
  const correct = (playerCall === 'strike') === params.isStrike

  if (!correct) {
    const dX = Math.max(0, Math.abs(params.plateX) - batter.zoneHalfWidth)
    const dY = params.plateY < batter.zoneBottom
      ? batter.zoneBottom - params.plateY
      : params.plateY > batter.zoneTop
        ? params.plateY - batter.zoneTop
        : 0
    const dist = Math.sqrt(dX * dX + dY * dY)
    const normalized = Math.min(dist / 0.5, 1)
    const penalty = Math.round(5 + normalized * 95)
    return { score: -penalty, correct: false }
  }

  const base = params.isBorderline ? 150 : 100
  const multiplier = Math.min(1.0 + (combo - 1) * 0.1, 2.0)
  return { score: Math.round(base * multiplier), correct: true }
}
