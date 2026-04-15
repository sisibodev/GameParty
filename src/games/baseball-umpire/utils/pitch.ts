import * as THREE from 'three'
import {
  PitchParams, PitchType, PitcherForm,
  DifficultyConfig, BatterProfile
} from '../types'
import { SeededRng } from './rng'

// 마운드에서 홈플레이트까지 거리 (18.44m)
export const MOUND_DISTANCE = 18.44

// 공 반지름 (MLB 규정: 지름 73~75mm → 반지름 0.037m)
// 실제 야구 규칙상 공의 어느 부분이라도 존을 통과하면 스트라이크
export const BALL_RADIUS = 0.037

// 투구 시작점 Y (릴리즈 높이)
const RELEASE_HEIGHT: Record<PitcherForm, number> = {
  overhand:       1.85,
  three_quarter:  1.70,
  sidearm:        1.40,
  underhand:      0.90,
}

// 구종별 무브먼트 파라미터 (x: 좌우, y: 상하 - 중력 외 추가 무브먼트)
type MovementRange = { x: [number, number]; y: [number, number] }
const PITCH_MOVEMENT: Record<PitchType, MovementRange> = {
  fastball:  { x: [-0.03, 0.03], y: [-0.05, 0.05] },
  two_seam:  { x: [-0.12, 0.12], y: [-0.10, 0.05] },
  changeup:  { x: [-0.08, 0.08], y: [-0.20, -0.05] },
  slider:    { x: [-0.30, 0.30], y: [-0.15, 0.05] },
  curve:     { x: [-0.15, 0.15], y: [-0.45, -0.20] },
  splitter:  { x: [-0.08, 0.08], y: [-0.55, -0.35] },
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
  const speed = rng.float(config.speedMin, config.speedMax)

  const isBorderline = rng.next() < config.borderlineRatio

  let plateX: number
  let plateY: number

  if (isBorderline) {
    // 존 경계에 걸치게
    plateX = borderlineX(rng, batter)
    plateY = borderlineY(rng, batter)
  } else {
    // 완전 스트라이크 or 완전 볼 (50:50)
    const shouldBeStrike = rng.next() < 0.5
    if (shouldBeStrike) {
      plateX = rng.float(-batter.zoneHalfWidth * 0.85, batter.zoneHalfWidth * 0.85)
      plateY = rng.float(batter.zoneBottom + 0.05, batter.zoneTop - 0.05)
    } else {
      // 존 밖 - 방향 랜덤
      const dir = rng.int(0, 4)
      if (dir === 0) {
        // 바깥쪽 (X)
        plateX = batter.zoneHalfWidth + rng.float(0.05, 0.35)
        if (rng.next() < 0.5) plateX = -plateX
        plateY = rng.float(batter.zoneBottom, batter.zoneTop)
      } else if (dir === 1) {
        // 높은 볼
        plateX = rng.float(-batter.zoneHalfWidth * 1.2, batter.zoneHalfWidth * 1.2)
        plateY = batter.zoneTop + rng.float(0.05, 0.40)
      } else {
        // 낮은 볼
        plateX = rng.float(-batter.zoneHalfWidth * 1.2, batter.zoneHalfWidth * 1.2)
        plateY = batter.zoneBottom - rng.float(0.05, 0.35)
      }
    }
  }

  // 무브먼트 적용 후 최종 위치로 역산 → 시작점 결정은 씬에서
  const mvRange = PITCH_MOVEMENT[pitchType]
  const mvX = rng.float(mvRange.x[0], mvRange.x[1])
  const mvY = rng.float(mvRange.y[0], mvRange.y[1])

  // 실제 통과 좌표에서 무브먼트를 빼면 "직선 기준" 통과점이 나옴
  // 베지어 제어점 계산을 위해 plateX/Y는 최종 통과 좌표로 사용
  const finalPlateX = plateX + mvX
  const finalPlateY = plateY + mvY

  // KBO ABS 3-plane 판정:
  //   앞면(Front): zoneHalfWidth + 2cm 확대
  //   중간면(Mid):  zoneHalfWidth + 2cm 확대
  //   끝면(End):   zoneHalfWidth 그대로, 하단 1.5cm 낮게
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
    speed: Math.round(speed),
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
 * 투구 베지어 곡선 생성
 * 시작점(마운드) → 제어점 → 끝점(홈플레이트)
 */
export function buildPitchCurve(
  params: PitchParams,
  form: PitcherForm,
): THREE.QuadraticBezierCurve3 {
  const releaseH = RELEASE_HEIGHT[form]

  // 투수 마운드 위치: z = +MOUND_DISTANCE (카메라에서 먼 쪽)
  const start = new THREE.Vector3(0, releaseH, MOUND_DISTANCE)

  // 홈플레이트 통과점: z = 0
  const end = new THREE.Vector3(params.plateX, params.plateY, 0)

  // 제어점: 중간 높이 + 사이드암 등 폼별 보정
  const ctrlX = params.plateX * 0.3
  const ctrlY = (releaseH + params.plateY) * 0.7
  const ctrlZ = MOUND_DISTANCE * 0.5
  const ctrl  = new THREE.Vector3(ctrlX, ctrlY, ctrlZ)

  return new THREE.QuadraticBezierCurve3(start, ctrl, end)
}

/** km/h → 투구 비행 시간(ms) */
export function speedToFlightMs(speedKph: number): number {
  // 거리 18.44m
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
    // 감점: 경계까지 거리 비례 0~100
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
