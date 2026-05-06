import { describe, it, expect } from 'vitest'
import {
  PHYSICS,
  stepBall,
  checkFloor,
  checkBackboard,
  checkBackWall,
  checkRim,
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

  it('vx, vz는 중력 영향 없음 (에어 댐핑만 적용)', () => {
    const dt = 0.5
    const damp = PHYSICS.AIR_DAMPING ** dt
    const result = stepBall(v(0, 0, 0), v(3, 0, -5), dt)
    expect(result.vel.x).toBeCloseTo(3 * damp)
    expect(result.vel.z).toBeCloseTo(-5 * damp)
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

  it('수평 속도는 바운스 후 마찰 적용', () => {
    const result = checkFloor(v(0, 0, 0), v(3, -5, -2))
    expect(result.vel.x).toBeCloseTo(3 * PHYSICS.FLOOR_FRICTION)
    expect(result.vel.z).toBeCloseTo(-2 * PHYSICS.FLOOR_FRICTION)
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
  const above = (x = HOOP.x, z = HOOP.z) => v(x, HOOP.y + 0.15, z)
  const below = (x = HOOP.x, z = HOOP.z) => v(x, HOOP.y - 0.05, z)

  it('링 중심 위→아래 교차 + 하강 중 → 골', () => {
    expect(checkGoal(above(), below(), -1)).toBe(true)
  })

  it('링 반지름 내 교차 → 골', () => {
    const offset = PHYSICS.HOOP_RADIUS - PHYSICS.BALL_RADIUS - 0.01
    expect(checkGoal(above(HOOP.x + offset), below(HOOP.x + offset), -1)).toBe(true)
  })

  it('링 반지름 밖 교차 → 미스', () => {
    const x = HOOP.x + PHYSICS.HOOP_RADIUS + 0.1
    expect(checkGoal(above(x), below(x), -1)).toBe(false)
  })

  it('상승 중 → 미스', () => {
    expect(checkGoal(above(), below(), 1)).toBe(false)
  })

  it('vy = 0 → 미스', () => {
    expect(checkGoal(above(), below(), 0)).toBe(false)
  })

  it('이미 아래에서 시작 (교차 없음) → 미스', () => {
    expect(checkGoal(below(), v(HOOP.x, HOOP.y - 0.2, HOOP.z), -1)).toBe(false)
  })

  it('위에서 위로 끝남 (교차 없음) → 미스', () => {
    expect(checkGoal(above(), v(HOOP.x, HOOP.y + 0.05, HOOP.z), -1)).toBe(false)
  })
})

// ─── checkBackboard ────────────────────────────────────────────────────────

describe('checkBackboard', () => {
  const bb = PHYSICS.BACKBOARD
  const midY = (bb.yMin + bb.yMax) / 2
  // Ball slightly in front of the board so it overlaps the front face (AABB)
  const inBoundsPos = v(0, midY, bb.z + 0.05)

  it('백보드 정면 충돌 → 바운스', () => {
    expect(checkBackboard(inBoundsPos, v(0, 0, -3)).bounced).toBe(true)
  })

  it('반사 vz = -(입사 vz) * BACKBOARD_RESTITUTION', () => {
    const inVz = -6
    const result = checkBackboard(inBoundsPos, v(0, 0, inVz))
    expect(result.vel.z).toBeCloseTo(-inVz * PHYSICS.BACKBOARD_RESTITUTION)
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

  it('백보드 뒤에서 접근 (vel.z > 0) → 바운스', () => {
    // Ball slightly behind the back face so it overlaps (AABB)
    const behindPos = v(0, midY, bb.z - PHYSICS.BACKBOARD_THICKNESS - 0.05)
    expect(checkBackboard(behindPos, v(0, 0, 3)).bounced).toBe(true)
  })

  it('백보드 뒤에서 맞은 후 vz 반전 + BACKBOARD_RESTITUTION 적용', () => {
    const behindPos = v(0, midY, bb.z - PHYSICS.BACKBOARD_THICKNESS - 0.05)
    const result = checkBackboard(behindPos, v(0, 0, 4))
    expect(result.vel.z).toBeCloseTo(-4 * PHYSICS.BACKBOARD_RESTITUTION)
  })

  it('백보드 뒤에서 맞은 후 z 위치 = bb.z - BACKBOARD_THICKNESS - BALL_RADIUS', () => {
    const behindPos = v(0, midY, bb.z - PHYSICS.BACKBOARD_THICKNESS - 0.05)
    const result = checkBackboard(behindPos, v(0, 0, 3))
    expect(result.pos.z).toBeCloseTo(bb.z - PHYSICS.BACKBOARD_THICKNESS - PHYSICS.BALL_RADIUS)
  })
})

// ─── checkBackWall ─────────────────────────────────────────────────────────

describe('checkBackWall', () => {
  const wallZ = PHYSICS.BACK_WALL_Z + PHYSICS.BALL_RADIUS

  it('벽 접촉 + 음수 vz → 바운스', () => {
    expect(checkBackWall(v(0, 2, wallZ - 0.001), v(0, 0, -4)).bounced).toBe(true)
  })

  it('벽 접촉 + 양수 vz → 바운스 없음', () => {
    expect(checkBackWall(v(0, 2, wallZ - 0.001), v(0, 0, 4)).bounced).toBe(false)
  })

  it('반사 vz = -(입사 vz) * BACK_WALL_RESTITUTION', () => {
    const inVz = -5
    const result = checkBackWall(v(0, 2, wallZ - 0.001), v(0, 0, inVz))
    expect(result.vel.z).toBeCloseTo(-inVz * PHYSICS.BACK_WALL_RESTITUTION)
  })

  it('벽에서 멀리 있을 때 → 바운스 없음', () => {
    expect(checkBackWall(v(0, 2, 2), v(0, 0, -4)).bounced).toBe(false)
  })

  it('바운스 후 z 위치 = BACK_WALL_Z + BALL_RADIUS', () => {
    const result = checkBackWall(v(0, 2, wallZ - 0.05), v(0, 0, -4))
    expect(result.pos.z).toBeCloseTo(PHYSICS.BACK_WALL_Z + PHYSICS.BALL_RADIUS)
  })

  it('vx, vy는 벽 충돌 후 유지', () => {
    const result = checkBackWall(v(0, 2, wallZ - 0.001), v(1.5, -2, -3))
    expect(result.vel.x).toBeCloseTo(1.5)
    expect(result.vel.y).toBeCloseTo(-2)
  })

  it('결과는 새 객체 반환 (불변)', () => {
    const pos = v(0, 2, wallZ - 0.001)
    const vel = v(0, 0, -4)
    const result = checkBackWall(pos, vel)
    expect(result.pos).not.toBe(pos)
    expect(result.vel).not.toBe(vel)
  })
})

// ─── checkRim ──────────────────────────────────────────────────────────────

describe('checkRim', () => {
  const contactDist = PHYSICS.BALL_RADIUS + PHYSICS.RIM_TUBE_RADIUS

  // 림 튜브 표면에 딱 닿는 위치 계산 (림 앞쪽, 수평)
  const rimFrontContact = () => {
    const hoop = PHYSICS.HOOP_CENTER
    // 림 고리의 앞쪽 점 (dz = HOOP_RADIUS)에서 공 중심이 contactDist 거리에 위치
    const cx = hoop.x
    const cy = hoop.y
    const cz = hoop.z + PHYSICS.HOOP_RADIUS
    return v(cx, cy + contactDist * 0.9, cz)
  }

  it('림 튜브와 겹침 + 접근 중 → 바운스', () => {
    const pos = rimFrontContact()
    const vel = v(0, -3, 0)
    expect(checkRim(pos, vel).bounced).toBe(true)
  })

  it('림 튜브와 멀리 떨어짐 → 바운스 없음', () => {
    const hoop = PHYSICS.HOOP_CENTER
    const farPos = v(hoop.x, hoop.y + 1.0, hoop.z + PHYSICS.HOOP_RADIUS + 1.0)
    expect(checkRim(farPos, v(0, -3, 0)).bounced).toBe(false)
  })

  it('림 중심 정확히 위치 (distXZ=0) → 바운스 없음 (guard)', () => {
    const hoop = PHYSICS.HOOP_CENTER
    expect(checkRim(v(hoop.x, hoop.y, hoop.z), v(0, -3, 0)).bounced).toBe(false)
  })

  it('바운스 후 속도 방향 반전 (법선 방향)', () => {
    const pos = rimFrontContact()
    const result = checkRim(pos, v(0, -3, 0))
    if (result.bounced) {
      expect(result.vel.y).toBeGreaterThan(0)
    }
  })

  it('림에서 멀어지는 방향 → 바운스 없음', () => {
    const pos = rimFrontContact()
    // 이미 튜브에서 벗어나는 방향
    const vel = v(0, 5, 3)
    expect(checkRim(pos, vel).bounced).toBe(false)
  })

  it('결과는 새 객체 반환 (불변)', () => {
    const pos = rimFrontContact()
    const vel = v(0, -3, 0)
    const result = checkRim(pos, vel)
    expect(result.pos).not.toBe(pos)
    expect(result.vel).not.toBe(vel)
  })

  it('바운스 후 공-튜브 거리 = contactDist', () => {
    const pos = rimFrontContact()
    const result = checkRim(pos, v(0, -4, 0))
    if (!result.bounced) return
    const hoop = PHYSICS.HOOP_CENTER
    const dx = result.pos.x - hoop.x
    const dz = result.pos.z - hoop.z
    const distXZ = Math.sqrt(dx * dx + dz * dz)
    const cx = hoop.x + (dx / distXZ) * PHYSICS.HOOP_RADIUS
    const cy = hoop.y
    const cz = hoop.z + (dz / distXZ) * PHYSICS.HOOP_RADIUS
    const ex = result.pos.x - cx
    const ey = result.pos.y - cy
    const ez = result.pos.z - cz
    const dist = Math.sqrt(ex * ex + ey * ey + ez * ez)
    expect(dist).toBeCloseTo(contactDist, 4)
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

  it('파워 0 → MIN_POWER_RATIO * MAX_SPEED 크기의 속도', () => {
    const result = calcLaunchVelocity(0, 0.5, 0)
    const speed = Math.sqrt(result.x ** 2 + result.y ** 2 + result.z ** 2)
    expect(speed).toBeCloseTo(PHYSICS.MIN_POWER_RATIO * PHYSICS.MAX_SPEED)
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

  it('파워 0.5 → effective power (MIN + 0.5*(1-MIN)) 비율의 속도', () => {
    const full = calcLaunchVelocity(0, Math.PI / 4, 1)
    const half = calcLaunchVelocity(0, Math.PI / 4, 0.5)
    const fullSpeed = Math.sqrt(full.x ** 2 + full.y ** 2 + full.z ** 2)
    const halfSpeed = Math.sqrt(half.x ** 2 + half.y ** 2 + half.z ** 2)
    const expectedRatio = PHYSICS.MIN_POWER_RATIO + (1 - PHYSICS.MIN_POWER_RATIO) * 0.5
    expect(halfSpeed).toBeCloseTo(fullSpeed * expectedRatio)
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
