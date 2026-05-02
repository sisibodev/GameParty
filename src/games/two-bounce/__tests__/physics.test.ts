import { describe, it, expect } from 'vitest'
import {
  PHYSICS,
  stepBall,
  checkFloor,
  checkBackboard,
  checkGoal,
  isOutOfBounds,
  calcLaunchVelocity,
} from '../utils/physics'
import type { Vec3 } from '../types'

function v(x: number, y: number, z: number): Vec3 {
  return { x, y, z }
}

const HOOP = PHYSICS.HOOP_CENTER

// ─── stepBall ──────────────────────────────────────────────────────────────

describe('stepBall', () => {
  it('매 프레임 vy에 중력 적용', () => {
    const result = stepBall(v(0, 5, 0), v(0, 0, 0), 1)
    expect(result.vel.y).toBeCloseTo(-PHYSICS.GRAVITY)
  })

  it('1초 누적 후 vy = -9.8', () => {
    let state = { pos: v(0, 10, 0), vel: v(0, 0, 0) }
    for (let i = 0; i < 10; i++) {
      state = stepBall(state.pos, state.vel, 0.1)
    }
    expect(state.vel.y).toBeCloseTo(-PHYSICS.GRAVITY, 1)
  })

  it('속도만큼 위치 이동', () => {
    const result = stepBall(v(0, 0, 0), v(2, 0, -4), 1)
    expect(result.pos.x).toBeCloseTo(2)
    expect(result.pos.z).toBeCloseTo(-4)
  })

  it('입력 벡터 불변 (순수 함수)', () => {
    const pos = v(1, 2, 3)
    const vel = v(4, 5, 6)
    stepBall(pos, vel, 0.1)
    expect(pos).toEqual(v(1, 2, 3))
    expect(vel).toEqual(v(4, 5, 6))
  })

  it('vx, vz는 중력 영향 없음', () => {
    const result = stepBall(v(0, 0, 0), v(3, 0, -5), 0.5)
    expect(result.vel.x).toBeCloseTo(3)
    expect(result.vel.z).toBeCloseTo(-5)
  })
})

// ─── checkFloor ────────────────────────────────────────────────────────────

describe('checkFloor', () => {
  it('바닥 위에서 하강 중 — 바운스 없음', () => {
    const result = checkFloor(v(0, 2, 0), v(0, -5, 0))
    expect(result.bounced).toBe(false)
  })

  it('바닥 접촉 + 하강 중 — 바운스 발생', () => {
    const result = checkFloor(v(0, PHYSICS.BALL_RADIUS - 0.001, 0), v(0, -5, 0))
    expect(result.bounced).toBe(true)
  })

  it('바닥 접촉이지만 상승 중 — 바운스 없음', () => {
    const result = checkFloor(v(0, 0, 0), v(0, 2, 0))
    expect(result.bounced).toBe(false)
  })

  it('반사 vy = 입사 vy * restitution (부호 반전)', () => {
    const inVy = -8
    const result = checkFloor(v(0, 0, 0), v(0, inVy, 0))
    expect(result.vel.y).toBeCloseTo(-inVy * PHYSICS.FLOOR_RESTITUTION)
  })

  it('바운스 후 y 위치 = 공 반지름', () => {
    const result = checkFloor(v(0, -0.5, 0), v(0, -3, 0))
    expect(result.pos.y).toBeCloseTo(PHYSICS.BALL_RADIUS)
  })

  it('수평 속도는 바운스 후 유지', () => {
    const result = checkFloor(v(0, 0, 0), v(3, -5, -2))
    expect(result.vel.x).toBeCloseTo(3)
    expect(result.vel.z).toBeCloseTo(-2)
  })

  it('결과는 새 객체 반환 (불변)', () => {
    const pos = v(0, 0, 0)
    const vel = v(0, -5, 0)
    const result = checkFloor(pos, vel)
    expect(result.pos).not.toBe(pos)
    expect(result.vel).not.toBe(vel)
  })
})

// ─── checkGoal ─────────────────────────────────────────────────────────────

describe('checkGoal', () => {
  it('링 중심 통과 + 하강 중 → 골', () => {
    expect(checkGoal(v(HOOP.x, HOOP.y, HOOP.z), -1)).toBe(true)
  })

  it('링 반지름 내 + 하강 중 → 골', () => {
    const offset = PHYSICS.HOOP_RADIUS - PHYSICS.BALL_RADIUS - 0.01
    expect(checkGoal(v(HOOP.x + offset, HOOP.y, HOOP.z), -1)).toBe(true)
  })

  it('링 반지름 밖 → 미스', () => {
    expect(checkGoal(v(HOOP.x + PHYSICS.HOOP_RADIUS + 0.1, HOOP.y, HOOP.z), -1)).toBe(false)
  })

  it('상승 중 링 통과 → 미스 (아래에서 위로)', () => {
    expect(checkGoal(v(HOOP.x, HOOP.y, HOOP.z), 1)).toBe(false)
  })

  it('vy = 0 → 미스', () => {
    expect(checkGoal(v(HOOP.x, HOOP.y, HOOP.z), 0)).toBe(false)
  })

  it('링보다 y 너무 높음 → 미스', () => {
    expect(checkGoal(v(HOOP.x, HOOP.y + PHYSICS.GOAL_Y_TOLERANCE + 0.1, HOOP.z), -1)).toBe(false)
  })

  it('링보다 y 너무 낮음 → 미스', () => {
    expect(checkGoal(v(HOOP.x, HOOP.y - PHYSICS.GOAL_Y_TOLERANCE - 0.1, HOOP.z), -1)).toBe(false)
  })

  it('y 허용 범위 경계 안쪽 → 골', () => {
    expect(checkGoal(v(HOOP.x, HOOP.y + PHYSICS.GOAL_Y_TOLERANCE - 0.01, HOOP.z), -1)).toBe(true)
  })
})

// ─── checkBackboard ────────────────────────────────────────────────────────

describe('checkBackboard', () => {
  const bb = PHYSICS.BACKBOARD
  const midY = (bb.yMin + bb.yMax) / 2
  const inBoundsPos = v(0, midY, bb.z)

  it('백보드 정면 충돌 → 바운스', () => {
    expect(checkBackboard(inBoundsPos, v(0, 0, -3)).bounced).toBe(true)
  })

  it('반사 vz = -(입사 vz) * 0.5', () => {
    const inVz = -6
    const result = checkBackboard(inBoundsPos, v(0, 0, inVz))
    expect(result.vel.z).toBeCloseTo(-inVz * 0.5)
  })

  it('공이 백보드에서 멀어지는 방향 → 바운스 없음', () => {
    expect(checkBackboard(inBoundsPos, v(0, 0, 3)).bounced).toBe(false)
  })

  it('x 범위 밖 → 바운스 없음', () => {
    const outPos = v(bb.xMax + 0.5, midY, bb.z)
    expect(checkBackboard(outPos, v(0, 0, -3)).bounced).toBe(false)
  })

  it('y 범위 아래 → 바운스 없음', () => {
    expect(checkBackboard(v(0, bb.yMin - 0.5, bb.z), v(0, 0, -3)).bounced).toBe(false)
  })

  it('y 범위 위 → 바운스 없음', () => {
    expect(checkBackboard(v(0, bb.yMax + 0.5, bb.z), v(0, 0, -3)).bounced).toBe(false)
  })

  it('vx, vy는 백보드 충돌 후 유지', () => {
    const result = checkBackboard(inBoundsPos, v(2, -1, -5))
    expect(result.vel.x).toBeCloseTo(2)
    expect(result.vel.y).toBeCloseTo(-1)
  })
})

// ─── isOutOfBounds ─────────────────────────────────────────────────────────

describe('isOutOfBounds', () => {
  it('y < OUT_OF_BOUNDS_Y → 아웃', () => {
    expect(isOutOfBounds(v(0, PHYSICS.OUT_OF_BOUNDS_Y - 0.1, 0), v(0, -1, 0))).toBe(true)
  })

  it('z > 전방 경계 → 아웃', () => {
    expect(isOutOfBounds(v(0, 1, PHYSICS.OUT_OF_BOUNDS_Z + 1), v(0, 0, 1))).toBe(true)
  })

  it('z < 후방 경계 → 아웃', () => {
    expect(isOutOfBounds(v(0, 1, -(PHYSICS.OUT_OF_BOUNDS_Z + 1)), v(0, 0, -1))).toBe(true)
  })

  it('x > 측면 경계 → 아웃', () => {
    expect(isOutOfBounds(v(13, 1, 0), v(1, 0, 0))).toBe(true)
  })

  it('바닥 위에서 정지 → 아웃 (settled)', () => {
    expect(isOutOfBounds(v(0, PHYSICS.BALL_RADIUS, 0), v(0, 0, 0))).toBe(true)
  })

  it('비행 중 코트 안 → 아웃 아님', () => {
    expect(isOutOfBounds(v(0, 3, 2), v(2, -3, -4))).toBe(false)
  })

  it('프리스로 위치 + 초기 속도 → 아웃 아님', () => {
    const ft = PHYSICS.FREE_THROW_POS
    expect(isOutOfBounds(ft, v(0, 5, -8))).toBe(false)
  })
})

// ─── calcLaunchVelocity ────────────────────────────────────────────────────

describe('calcLaunchVelocity', () => {
  it('풀파워 = MAX_SPEED 크기의 속도 벡터', () => {
    const result = calcLaunchVelocity(0, Math.PI / 4, 1)
    const speed = Math.sqrt(result.x ** 2 + result.y ** 2 + result.z ** 2)
    expect(speed).toBeCloseTo(PHYSICS.MAX_SPEED)
  })

  it('파워 0 → 속도 0', () => {
    const result = calcLaunchVelocity(0, 0.5, 0)
    expect(result.x).toBeCloseTo(0)
    expect(result.y).toBeCloseTo(0)
    expect(result.z).toBeCloseTo(0)
  })

  it('정면(azimuth=0) 발사 → vx ≈ 0', () => {
    const result = calcLaunchVelocity(0, 0.5, 1)
    expect(Math.abs(result.x)).toBeLessThan(0.01)
  })

  it('양의 elevation → vy > 0', () => {
    expect(calcLaunchVelocity(0, 0.5, 1).y).toBeGreaterThan(0)
  })

  it('정면 발사 → 골대 방향(vz < 0)', () => {
    expect(calcLaunchVelocity(0, 0.5, 1).z).toBeLessThan(0)
  })

  it('파워 0.5 = 풀파워 속도의 절반', () => {
    const full = calcLaunchVelocity(0, Math.PI / 4, 1)
    const half = calcLaunchVelocity(0, Math.PI / 4, 0.5)
    const fullSpeed = Math.sqrt(full.x ** 2 + full.y ** 2 + full.z ** 2)
    const halfSpeed = Math.sqrt(half.x ** 2 + half.y ** 2 + half.z ** 2)
    expect(halfSpeed).toBeCloseTo(fullSpeed / 2)
  })

  it('azimuth 90°(오른쪽) → vx > 0', () => {
    expect(calcLaunchVelocity(Math.PI / 2, 0.3, 1).x).toBeGreaterThan(0)
  })

  it('매 호출마다 새 객체 반환 (불변)', () => {
    const a = calcLaunchVelocity(0, 0.5, 1)
    const b = calcLaunchVelocity(0, 0.5, 1)
    expect(a).not.toBe(b)
  })
})
