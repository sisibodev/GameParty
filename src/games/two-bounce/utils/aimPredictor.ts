import { PHYSICS, calcLaunchVelocity, stepBall } from './physics'
import type { Vec3 } from '../types'

/**
 * 공이 림 높이를 통과할 때의 허용 수평 오차.
 * 림 반지름(0.27m) = 공이 림 안쪽 면 내에 진입하는 최대 범위.
 * 기존 0.305m(림+튜브)에서 좁혀 림 바깥 통과는 제외한다.
 */
const ARRIVE_TOLERANCE = PHYSICS.HOOP_RADIUS  // 0.27m

/** 파워 0~1을 몇 단계로 샘플링할지 */
const SAMPLE_COUNT = 100

/** 시뮬레이션 타임스텝 (초) — 실제 게임 60fps와 일치 */
const SIM_DT = 1 / 60

/** 시뮬레이션 최대 스텝 수 (약 8초) */
const MAX_STEPS = 480

export interface PowerRange {
  min: number     // 0~1, 권장 구간 시작
  max: number     // 0~1, 권장 구간 끝
  optimal: number // 0~1, 권장 구간 중앙 (최적 파워)
}

/**
 * 현재 슛 위치와 조준 방향을 기준으로,
 * 공이 림 근처를 통과할 가능성이 높은 파워 구간을 반환한다.
 *
 * 해석적 탄도 공식 대신 실제 stepBall 물리 시뮬레이션을 사용해
 * 공기 저항(AIR_DAMPING)과 중력을 실제 게임과 동일하게 반영한다.
 *
 * @returns 권장 파워 구간, 없으면 null (각도/거리가 불가능한 경우)
 */
export function predictPowerRange(
  startPos: Vec3,
  azimuth: number,
  elevation: number,
): PowerRange | null {
  const hoop = PHYSICS.HOOP_CENTER

  let minPower: number | null = null
  let maxPower: number | null = null

  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    const power = i / SAMPLE_COUNT
    const initVel = calcLaunchVelocity(azimuth, elevation, power)

    let pos: Vec3 = { ...startPos }
    let vel: Vec3 = { ...initVel }
    let prevY = pos.y
    let found = false

    for (let step = 0; step < MAX_STEPS; step++) {
      const next = stepBall(pos, vel, SIM_DT)

      // 하강 중 림 높이 교차 감지
      if (prevY >= hoop.y && next.pos.y < hoop.y) {
        // 선형 보간으로 교차 지점 추정
        const f = (hoop.y - pos.y) / (next.pos.y - pos.y)
        const crossX = pos.x + (next.pos.x - pos.x) * f
        const crossZ = pos.z + (next.pos.z - pos.z) * f

        const dx = crossX - hoop.x
        const dz = crossZ - hoop.z
        const horizDist = Math.sqrt(dx * dx + dz * dz)

        if (horizDist <= ARRIVE_TOLERANCE) {
          found = true
        }
        break  // 하강 교차는 한 번만 체크
      }

      // 바닥 아래 또는 범위 밖이면 중단
      if (next.pos.y < -1 || Math.abs(next.pos.z) > PHYSICS.OUT_OF_BOUNDS_Z) break

      prevY = next.pos.y
      pos = next.pos
      vel = next.vel
    }

    if (found) {
      if (minPower === null) minPower = power
      maxPower = power
    }
  }

  if (minPower === null || maxPower === null) return null

  return {
    min: minPower,
    max: maxPower,
    optimal: (minPower + maxPower) / 2,
  }
}

/**
 * 현재 위치에서 림 중심까지의 수평 거리 (m).
 */
export function calcDistanceToHoop(startPos: Vec3): number {
  const hoop = PHYSICS.HOOP_CENTER
  const dx = startPos.x - hoop.x
  const dz = startPos.z - hoop.z
  return Math.sqrt(dx * dx + dz * dz)
}

/**
 * 현재 발사 각도에서 공의 포물선 정점이 림 높이(HOOP_HEIGHT)에 정확히 닿는 최소 파워.
 *
 * "노란 마커 = 이 파워로 쏘면 공이 딱 림 높이까지만 뜨고 내려간다"는 기준선.
 * 골대 방향/거리와 무관하게 항상 계산되므로 어느 방향을 보든 표시된다.
 * _azimuth는 시그니처 호환을 위해 유지하되 계산에는 사용하지 않는다.
 * startPos.y만 반영하여 발사 높이에 따른 차이는 유지한다.
 */
export function calcPowerForHoopHeight(
  startPos: Vec3,
  _azimuth: number,
  elevation: number,
): number | null {
  // 림 높이(3.05m)보다 낮은 기준선 사용 — 노란 마커 파워에서는 어느 거리에서도
  // 공이 림 높이에 못 미치도록 여유를 둔다. 실제 득점은 노란 마커보다 위에서 시작.
  const targetY = PHYSICS.HOOP_HEIGHT - 0.45  // ≈ 2.6m

  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    const power = i / SAMPLE_COUNT
    // 방향 무관 — y 정점이 기준 높이에 닿는지만 판정
    const initVel = calcLaunchVelocity(0, elevation, power)

    let pos: Vec3 = { x: 0, y: startPos.y, z: 0 }
    let vel: Vec3 = { ...initVel }

    for (let step = 0; step < MAX_STEPS; step++) {
      const next = stepBall(pos, vel, SIM_DT)

      if (next.pos.y >= targetY) return power

      if (next.pos.y < -1) break
      pos = next.pos
      vel = next.vel
    }
  }

  return null
}
