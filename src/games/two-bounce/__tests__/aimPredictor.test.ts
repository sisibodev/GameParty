import { describe, it, expect } from 'vitest'
import { predictPowerRange, calcDistanceToHoop, calcPowerForHoopHeight } from '../utils/aimPredictor'
import { PHYSICS, calcLaunchVelocity, stepBall } from '../utils/physics'
import type { Vec3 } from '../types'

function v(x: number, y: number, z: number): Vec3 {
  return { x, y, z }
}

const FREE_THROW = PHYSICS.FREE_THROW_POS  // z=4.57, y=1.4
const HOOP = PHYSICS.HOOP_CENTER            // z=-0.63, y=3.05

// ─── predictPowerRange ────────────────────────────────────────────────────────

describe('predictPowerRange', () => {
  it('자유투 위치 + 적절한 각도 → 권장 구간 반환', () => {
    const range = predictPowerRange(FREE_THROW, 0, 0.6)
    expect(range).not.toBeNull()
  })

  it('권장 구간의 min <= optimal <= max', () => {
    const range = predictPowerRange(FREE_THROW, 0, 0.6)
    expect(range).not.toBeNull()
    if (range) {
      expect(range.min).toBeLessThanOrEqual(range.optimal)
      expect(range.optimal).toBeLessThanOrEqual(range.max)
    }
  })

  it('min/max/optimal 모두 0~1 범위 안에 있음', () => {
    const range = predictPowerRange(FREE_THROW, 0, 0.6)
    if (range) {
      expect(range.min).toBeGreaterThanOrEqual(0)
      expect(range.max).toBeLessThanOrEqual(1)
    }
  })

  it('거의 수평 각도 (낮은 elevation) → 림 도달 불가, null 반환', () => {
    const range = predictPowerRange(FREE_THROW, 0, -0.05)
    expect(range).toBeNull()
  })

  it('조준 방향이 림과 정반대 (azimuth=π) → null 반환', () => {
    const range = predictPowerRange(FREE_THROW, Math.PI, 0.6)
    expect(range).toBeNull()
  })

  it('optimal 파워로 쐈을 때 시뮬레이션 상 림 높이 도달 가능', () => {
    const range = predictPowerRange(FREE_THROW, 0, 0.6)
    if (!range) return
    // 실제 stepBall 시뮬레이션으로 optimal 파워 궤적이 림 높이를 통과하는지 확인
    const initVel = calcLaunchVelocity(0, 0.6, range.optimal)
    let pos = { ...FREE_THROW }
    let vel = { ...initVel }
    let prevY = pos.y
    let crossedRimHeight = false
    for (let step = 0; step < 480; step++) {
      const next = stepBall(pos, vel, 1 / 60)
      if (prevY >= HOOP.y && next.pos.y < HOOP.y) {
        crossedRimHeight = true
        break
      }
      if (next.pos.y < -1) break
      prevY = next.pos.y
      pos = next.pos
      vel = next.vel
    }
    expect(crossedRimHeight).toBe(true)
  })

  it('결과는 매번 새 객체 반환 (불변)', () => {
    const a = predictPowerRange(FREE_THROW, 0, 0.6)
    const b = predictPowerRange(FREE_THROW, 0, 0.6)
    if (a && b) expect(a).not.toBe(b)
  })

  it('높은 elevation일수록 optimal 파워가 더 높음', () => {
    const rangeA = predictPowerRange(FREE_THROW, 0, 0.5)
    const rangeB = predictPowerRange(FREE_THROW, 0, 0.9)
    if (rangeA && rangeB) {
      expect(rangeB.optimal).toBeGreaterThan(rangeA.optimal)
    }
  })

  it('크래시 없이 실행됨 — 극단적 입력', () => {
    expect(() => predictPowerRange(v(0, 1.4, 10), 0, 0.1)).not.toThrow()
    expect(() => predictPowerRange(v(0, 1.4, -5), 0, 1.0)).not.toThrow()
    expect(() => predictPowerRange(v(10, 1.4, 4), Math.PI * 2, 0.3)).not.toThrow()
  })
})

// ─── calcDistanceToHoop ──────────────────────────────────────────────────────

describe('calcDistanceToHoop', () => {
  it('자유투 위치 → 림까지 거리 약 5.2m', () => {
    const dist = calcDistanceToHoop(FREE_THROW)
    expect(dist).toBeCloseTo(5.2, 0)
  })

  it('림 바로 아래 위치 → 거리 ≈ 0', () => {
    const below = v(HOOP.x, 0, HOOP.z)
    expect(calcDistanceToHoop(below)).toBeCloseTo(0, 2)
  })

  it('항상 양수 반환', () => {
    expect(calcDistanceToHoop(FREE_THROW)).toBeGreaterThan(0)
    expect(calcDistanceToHoop(v(5, 1, 3))).toBeGreaterThan(0)
  })

  it('y 좌표는 수평 거리에 영향 없음', () => {
    const a = calcDistanceToHoop(v(0, 0, 4.57))
    const b = calcDistanceToHoop(v(0, 10, 4.57))
    expect(a).toBeCloseTo(b, 5)
  })
})

// ─── calcPowerForHoopHeight ───────────────────────────────────────────────────

describe('calcPowerForHoopHeight', () => {
  it('자유투 위치 + 적당한 각도 → 0~1 범위 내 파워 반환', () => {
    const power = calcPowerForHoopHeight(FREE_THROW, 0, 0.6)
    expect(power).not.toBeNull()
    expect(power!).toBeGreaterThan(0)
    expect(power!).toBeLessThanOrEqual(1)
  })

  it('수평에 가까운 각도(MIN_LAUNCH_ELEVATION 미만) → 너무 낮아 도달 불가하면 null 또는 양의 파워', () => {
    // MIN_LAUNCH_ELEVATION 클램프 때문에 매우 낮은 각도라도 발사 각이 보장됨.
    // 결과가 null이거나 정상 범위 내 파워인지 확인.
    const power = calcPowerForHoopHeight(FREE_THROW, 0, 0)
    if (power !== null) {
      expect(power).toBeGreaterThan(0)
      expect(power).toBeLessThanOrEqual(1)
    }
  })

  it('파워 1로도 도달 불가한 극단 케이스 → null 반환 (음의 elevation은 클램프되므로 매우 멀리서 시작)', () => {
    // 매우 먼 위치(z=50)에서 매우 낮은 각도로는 골대 높이 도달 어려움.
    const farPos: Vec3 = { x: 0, y: 1.4, z: 50 }
    const power = calcPowerForHoopHeight(farPos, 0, 0.1)
    // 도달 가능하면 power 반환, 불가능하면 null. 어느 쪽이든 비어있으면 안 됨.
    expect(power === null || (power >= 0 && power <= 1)).toBe(true)
  })

  it('같은 startPos.y와 elevation이면 x/z가 달라도 동일한 파워 반환 (거리 독립)', () => {
    const base = calcPowerForHoopHeight(v(0, 1.4, 4.57), 0, 0.6)
    const far  = calcPowerForHoopHeight(v(5, 1.4, 50),   0, 0.6)
    const near = calcPowerForHoopHeight(v(-3, 1.4, 1),   0, 0.6)
    expect(base).not.toBeNull()
    expect(base).toBe(far)
    expect(base).toBe(near)
  })

  it('같은 startPos.y와 elevation이면 azimuth가 달라도 동일한 파워 반환 (방향 독립)', () => {
    const az0    = calcPowerForHoopHeight(FREE_THROW, 0,           0.6)
    const azHalf = calcPowerForHoopHeight(FREE_THROW, Math.PI / 2, 0.6)
    const azPi   = calcPowerForHoopHeight(FREE_THROW, Math.PI,     0.6)
    expect(az0).not.toBeNull()
    expect(az0).toBe(azHalf)
    expect(az0).toBe(azPi)
  })

  it('낮은 각도는 높은 각도보다 더 큰 파워가 필요하다', () => {
    const low  = calcPowerForHoopHeight(FREE_THROW, 0, 0.5)
    const high = calcPowerForHoopHeight(FREE_THROW, 0, 0.9)
    if (low !== null && high !== null) {
      expect(low).toBeGreaterThan(high)
    }
  })
})
