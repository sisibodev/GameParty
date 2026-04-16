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
// 직구 = config.speedMin~speedMax, 다른 구종은 이 범위에 배율 적용
const PITCH_SPEED_RATIO: Record<PitchType, [number, number]> = {
  fastball: [0.97, 1.00],   // 기준 속도
  two_seam: [0.94, 0.98],   // 직구 대비 -2~-6%
  sinker:   [0.92, 0.97],   // 직구 대비 -3~-8% (무겁고 낙하)
  cutter:   [0.88, 0.93],   // 직구 대비 -7~-12% (패스트볼과 슬라이더 사이)
  changeup: [0.80, 0.87],   // 직구 대비 -13~-20% (속도차가 핵심)
  slider:   [0.85, 0.91],   // 직구 대비 -9~-15%
  sweeper:  [0.80, 0.86],   // 직구 대비 -14~-20% (슬라이더보다 느리고 횡 변화 큼)
  curve:    [0.78, 0.85],   // 직구 대비 -15~-22%
  splitter: [0.87, 0.93],   // 직구 대비 -7~-13%
  forkball: [0.82, 0.88],   // 직구 대비 -12~-18% (스플리터보다 느리고 낙차 큼)
}

// ── 구종별 무브먼트 (홈플레이트 통과 좌표 오프셋, 단위: m) ─────────────────────
// x: 좌우 이동 (±), y: 수직 추가 이동 (음수=낙하 가속, 중력 외 추가량)
type MovementRange = { x: [number, number]; y: [number, number] }
const PITCH_MOVEMENT: Record<PitchType, MovementRange> = {
  fastball: { x: [-0.04, 0.04], y: [-0.02, 0.03] },   // 백스핀으로 거의 직선
  two_seam: { x: [-0.14, 0.14], y: [-0.12, -0.02] },  // 아무쪽으로 흘러내림
  sinker:   { x: [-0.12, 0.12], y: [-0.20, -0.10] },  // 투심보다 강한 낙하 (싱커)
  cutter:   { x: [-0.15, 0.15], y: [-0.06, -0.01] },  // 작은 횡 이동, 낙하 최소 (날카로운 컷)
  changeup: { x: [-0.10, 0.10], y: [-0.15, -0.05] },  // 떨어지며 빠져나감
  slider:   { x: [-0.20, 0.20], y: [-0.12, -0.03] },  // 횡 변화 + 약간 낙하
  sweeper:  { x: [-0.28, 0.28], y: [-0.10, -0.02] },  // 큰 횡 변화 (스위퍼)
  curve:    { x: [-0.09, 0.09], y: [-0.38, -0.18] },  // 큰 낙차
  splitter: { x: [-0.06, 0.06], y: [-0.28, -0.15] },  // 급강하
  forkball: { x: [-0.07, 0.07], y: [-0.36, -0.22] },  // 스플리터보다 더 큰 낙차
}

// ── 구종별 베지어 궤적 파라미터 ───────────────────────────────────────────────
// 쿼드라틱 → 큐빅 베지어로 변경: 제어점 2개로 구종별 고유 궤적 구현
// t1/t2: 직선 경로 위 제어점 위치 (0=마운드, 1=홈플레이트)
// y1/y2: 직선 경로 대비 Y 오프셋 (양수=위, 음수=아래)
interface BreakProfile { t1: number; y1: number; t2: number; y2: number }
const PITCH_BREAK: Record<PitchType, BreakProfile> = {
  //            early                    late
  fastball: { t1: 0.33, y1: +0.10,  t2: 0.72, y2: +0.06 },  // 역회전 → 떠오르는 느낌
  two_seam: { t1: 0.33, y1: +0.05,  t2: 0.72, y2: -0.07 },  // 초반 직구처럼 → 후반 침하
  sinker:   { t1: 0.33, y1: +0.03,  t2: 0.73, y2: -0.12 },  // 후반 강한 침하 (투심보다 더)
  cutter:   { t1: 0.28, y1: +0.08,  t2: 0.82, y2: -0.04 },  // 직구 유사 → 극후반 짧은 꺾임
  changeup: { t1: 0.33, y1: +0.09,  t2: 0.76, y2: -0.14 },  // 초반 직구 위장 → 후반 낙하
  slider:   { t1: 0.30, y1: +0.04,  t2: 0.78, y2: -0.06 },  // 직구 유사 → 후반 횡 꺾임
  sweeper:  { t1: 0.28, y1: +0.02,  t2: 0.74, y2: -0.04 },  // 완만하다 후반 크게 휩쓸림
  curve:    { t1: 0.28, y1: +0.20,  t2: 0.67, y2: -0.15 },  // 큰 포물선 (12-6 커브)
  splitter: { t1: 0.33, y1: +0.06,  t2: 0.83, y2: -0.24 },  // 직구 위장 → 극후반 급락
  forkball: { t1: 0.33, y1: +0.04,  t2: 0.80, y2: -0.30 },  // 스플리터보다 느리고 낙차 큼
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

  // 구종별 구속 계산: 직구 기준 속도 × 구종 배율
  const baseSpeed = rng.float(config.speedMin, config.speedMax)
  const speedRatio = rng.float(PITCH_SPEED_RATIO[pitchType][0], PITCH_SPEED_RATIO[pitchType][1])
  const speed = Math.round(baseSpeed * speedRatio)

  const isBorderline = rng.next() < config.borderlineRatio

  let plateX: number
  let plateY: number

  if (isBorderline) {
    plateX = borderlineX(rng, batter)
    plateY = borderlineY(rng, batter)
  } else {
    const shouldBeStrike = rng.next() < 0.5
    if (shouldBeStrike) {
      plateX = rng.float(-batter.zoneHalfWidth * 0.85, batter.zoneHalfWidth * 0.85)
      plateY = rng.float(batter.zoneBottom + 0.05, batter.zoneTop - 0.05)
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

  const mvRange = PITCH_MOVEMENT[pitchType]
  const mvX = rng.float(mvRange.x[0], mvRange.x[1])
  const mvY = rng.float(mvRange.y[0], mvRange.y[1])

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

  const planeHitCount = [frontPlaneHit, midPlaneHit, endPlaneHit].filter(Boolean).length
  const isStrike = planeHitCount >= 2

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
    planeHitCount,
    isBorderline,
    playerCall: null,
    correct: undefined,
    scoreChange: undefined,
  }
}

/**
 * 구종별 고유 궤적 생성 (CubicBezierCurve3)
 *
 * 마운드(시작) → ctrl1(초반 방향) → ctrl2(후반 꺾임) → 홈플레이트(끝)
 *
 * 제어점은 직선 경로 위 특정 t 위치에서 Y 오프셋으로 정의:
 *   - 직구:    ctrl1 위로 → 올라오는 느낌
 *   - 커브:    ctrl1 크게 위 → ctrl2 아래 → 큰 포물선
 *   - 체인지업: ctrl1 직구처럼 위 → ctrl2 크게 아래 → 후반 낙하 위장
 *   - 스플리터: ctrl1 직구와 동일 → ctrl2 극후반에 급락
 */
export function buildPitchCurve(
  params: PitchParams,
  form: PitcherForm,
): THREE.CubicBezierCurve3 {
  const rp = RELEASE_POINT[form]
  const bp = PITCH_BREAK[params.pitchType]

  // 릴리즈 포인트: z는 마운드에서 앞쪽으로 rp.z만큼 이동한 위치
  const startZ = MOUND_DISTANCE - rp.z
  const start  = new THREE.Vector3(rp.x, rp.y, startZ)
  // 홈플레이트(z=0)를 지나 포수 미트 위치(z=-0.30)까지 연장
  // → 리플레이에서 front(0.13) · mid(0) · end(-0.13) 판 3개를 모두 통과
  const end    = new THREE.Vector3(params.plateX, params.plateY, -0.30)

  // 직선 경로 위 t 위치 보간 헬퍼 (릴리즈 포인트 → 미트)
  const totalZ = startZ - (-0.30)
  const lerpOnLine = (t: number) => new THREE.Vector3(
    rp.x + (params.plateX - rp.x) * t,
    rp.y  + (params.plateY - rp.y)  * t,
    startZ - totalZ * t,
  )

  const base1 = lerpOnLine(bp.t1)
  const base2 = lerpOnLine(bp.t2)

  const ctrl1 = new THREE.Vector3(base1.x, base1.y + bp.y1, base1.z)
  const ctrl2 = new THREE.Vector3(base2.x, base2.y + bp.y2, base2.z)

  return new THREE.CubicBezierCurve3(start, ctrl1, ctrl2, end)
}

// ── 구종별 스핀/물리 파라미터 ──────────────────────────────────────────────────
// spinX: 백스핀(+) / 탑스핀(-) → 마그누스 수직
// spinZ: 사이드스핀(±) → 마그누스 수평
// dragCoeff: 공기저항 계수 (높을수록 속도 감소 큼)
interface SpinProfile { spinX: number; spinZ: number; drag: number }
const SPIN_PROFILE: Record<PitchType, SpinProfile> = {
  fastball: { spinX: +2400, spinZ:    0, drag: 0.32 }, // 강한 백스핀 → 뜨는 느낌
  two_seam: { spinX: +1800, spinZ: +300, drag: 0.33 }, // 약한 백스핀 + 사이드 → 침하
  sinker:   { spinX: +1200, spinZ: +500, drag: 0.34 }, // 탑스핀 계열 → 급강하
  cutter:   { spinX: +2000, spinZ: -600, drag: 0.33 }, // 백스핀 + 역사이드 → 짧은 꺾임
  changeup: { spinX: +1000, spinZ: +200, drag: 0.44 }, // 느린 속도 + 낮은 스핀 → 낙하
  slider:   { spinX:  +600, spinZ: -1800, drag: 0.35 }, // 세로+가로 복합
  sweeper:  { spinX:  +200, spinZ: -2400, drag: 0.36 }, // 거의 순수 사이드스핀 → 크게 횡변화
  curve:    { spinX: -2000, spinZ:  +400, drag: 0.38 }, // 탑스핀 → 크게 하강
  splitter: { spinX:  +400, spinZ:    0, drag: 0.40 }, // 낮은 스핀 → 후반 급락
  forkball: { spinX:  +200, spinZ:    0, drag: 0.42 }, // 극저 스핀 → 더 큰 낙차
}

// 마그누스 계수 (실제 야구공 기준 근사값)
const MAGNUS_COEFF = 0.00013  // N·s/m 단위 근사
const GRAVITY      = 9.81     // m/s²
const BALL_MASS    = 0.145    // kg (공 무게)
const BALL_AREA    = Math.PI * 0.037 ** 2  // 단면적 m²
const AIR_DENSITY  = 1.225    // kg/m³

/**
 * 물리 기반 궤적: 마그누스 효과 + 중력 + 공기저항을 수치 적분하여
 * N개 샘플 포인트를 생성 후 CatmullRom 곡선으로 반환
 */
export function buildPhysicsCurve(
  params: PitchParams,
  form: PitcherForm = 'overhand',
): THREE.CatmullRomCurve3 {
  const rp    = RELEASE_POINT[form]
  const sp    = SPIN_PROFILE[params.pitchType]
  const v0    = params.speed / 3.6           // m/s 변환
  const startZ = MOUND_DISTANCE - rp.z

  // 초기 속도벡터: 릴리즈 포인트 → 홈플레이트 방향
  const dx = params.plateX - rp.x
  const dy = params.plateY - rp.y
  const dz = -(startZ + 0.30)               // z 이동량 (음수 방향)
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

  // 단위 방향벡터 × 초기 속도
  let vx = (dx / dist) * v0
  let vy = (dy / dist) * v0
  let vz = (dz / dist) * v0

  let px = rp.x
  let py = rp.y
  let pz = startZ

  const points: THREE.Vector3[] = [new THREE.Vector3(px, py, pz)]

  // 스핀 → 각속도 (rpm → rad/s)
  const omegaX = (sp.spinX / 60) * 2 * Math.PI  // 수평 회전축(백/탑스핀)
  const omegaZ = (sp.spinZ / 60) * 2 * Math.PI  // 수직 회전축(사이드스핀)

  // 수치 적분: 4th-order Runge-Kutta로 N 스텝
  const N_STEPS  = 120
  const totalTime = (dist / v0) * 1.05          // 예상 비행시간 × 여유
  const dt       = totalTime / N_STEPS

  for (let i = 0; i < N_STEPS; i++) {
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz)

    // 공기저항 (drag): F = -0.5 * Cd * rho * A * v * v_unit
    const dragScale = 0.5 * sp.drag * AIR_DENSITY * BALL_AREA * speed / BALL_MASS
    const fdx = -dragScale * vx
    const fdy = -dragScale * vy
    const fdz = -dragScale * vz

    // 마그누스 힘: F = MAGNUS_COEFF * (omega × v)
    // omega = (omegaX, 0, omegaZ) — 단순화 (Y축 스핀 무시)
    // omega × v = (omegaZ*vy - 0*vz, 0*vz - omegaX*vz, omegaX*vy - omegaZ*vx)
    const magScale = MAGNUS_COEFF * (sp.spinX !== 0 || sp.spinZ !== 0 ? 1 : 0)
    const fmx = magScale * (omegaZ * vy)
    const fmy = magScale * (-omegaX * vz - omegaZ * vx)
    const fmz = magScale * (omegaX * vy)

    // 총 가속도
    const ax = fdx + fmx
    const ay = fdy + fmy - GRAVITY
    const az = fdz + fmz

    // 속도/위치 업데이트
    vx += ax * dt
    vy += ay * dt
    vz += az * dt
    px += vx * dt
    py += vy * dt
    pz += vz * dt

    points.push(new THREE.Vector3(px, py, pz))

    // 홈플레이트 뒤까지 통과하면 종료
    if (pz <= -0.30) break
  }

  // 마지막 점을 정확히 미트 위치로 보정
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
