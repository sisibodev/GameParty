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

// 투구 시작점 Y (릴리즈 높이)
const RELEASE_HEIGHT: Record<PitcherForm, number> = {
  overhand:       1.85,
  three_quarter:  1.70,
  sidearm:        1.40,
  underhand:      0.90,
}

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
): PitchParams {
  const pitchType = rng.pick(config.pitchTypes)

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
  const releaseH = RELEASE_HEIGHT[form]
  const bp = PITCH_BREAK[params.pitchType]

  const start = new THREE.Vector3(0, releaseH, MOUND_DISTANCE)
  const end   = new THREE.Vector3(params.plateX, params.plateY, 0)

  // 직선 경로 위 t 위치 보간 헬퍼
  const lerpOnLine = (t: number) => new THREE.Vector3(
    params.plateX * t,
    releaseH + (params.plateY - releaseH) * t,
    MOUND_DISTANCE * (1 - t),
  )

  const base1 = lerpOnLine(bp.t1)
  const base2 = lerpOnLine(bp.t2)

  const ctrl1 = new THREE.Vector3(base1.x, base1.y + bp.y1, base1.z)
  const ctrl2 = new THREE.Vector3(base2.x, base2.y + bp.y2, base2.z)

  return new THREE.CubicBezierCurve3(start, ctrl1, ctrl2, end)
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
