import type { Vec3 } from '../types'

export const BALL_HOLD_HEIGHT = 1.4
export const NEXT_SHOT_DELAY_MS = 150

export const PHYSICS = {
  GRAVITY: 9.8,
  BALL_RADIUS: 0.12,
  BALL_HOLD_HEIGHT,
  NEXT_SHOT_DELAY_MS,
  HOOP_HEIGHT: 3.05,
  HOOP_RADIUS: 0.27,
  FREE_THROW_POS: { x: 0, y: BALL_HOLD_HEIGHT, z: 4.57 } as Vec3,
  MAX_SPEED: 14,
  MIN_POWER_RATIO: 0.25,
  MIN_LAUNCH_ELEVATION: Math.PI / 12,
  FLOOR_RESTITUTION: 0.55,   // 0.45 → 0.55: 바닥 바운스 더 살아있게
  FLOOR_FRICTION: 0.72,
  AIR_DAMPING: 0.995,
  BACKBOARD: {
    z: -0.9,
    yMin: 2.9,
    yMax: 3.65,
    xMin: -0.9,
    xMax: 0.9,
  },
  BACKBOARD_THICKNESS: 0.05,
  BACKBOARD_RESTITUTION: 0.42, // 0.40 → 0.42: 백보드 반응 약간 개선
  HOOP_CENTER: { x: 0, y: 3.05, z: -0.63 } as Vec3,
  OUT_OF_BOUNDS_Z: 10,
  OUT_OF_BOUNDS_Y: -1,
  SETTLE_SPEED: 0.05,
  BACK_WALL_Z: -2.5,
  BACK_WALL_RESTITUTION: 0.5,
  RIM_TUBE_RADIUS: 0.025,
  RIM_RESTITUTION: 0.45,  // 0.35 → 0.45: 림 반발력 강화
  MIN_FLIGHT_SEC: 0.5,
}

export interface BallState {
  pos: Vec3
  vel: Vec3
}

export function stepBall(pos: Vec3, vel: Vec3, dt: number): BallState {
  const damp = PHYSICS.AIR_DAMPING ** dt
  return {
    pos: {
      x: pos.x + vel.x * dt,
      y: pos.y + vel.y * dt,
      z: pos.z + vel.z * dt,
    },
    vel: {
      x: vel.x * damp,
      y: vel.y - PHYSICS.GRAVITY * dt,
      z: vel.z * damp,
    },
  }
}

export interface FloorResult extends BallState {
  bounced: boolean
}

export function checkFloor(pos: Vec3, vel: Vec3): FloorResult {
  if (pos.y <= PHYSICS.BALL_RADIUS && vel.y < 0) {
    return {
      pos: { ...pos, y: PHYSICS.BALL_RADIUS },
      vel: {
        x: vel.x * PHYSICS.FLOOR_FRICTION,
        y: -vel.y * PHYSICS.FLOOR_RESTITUTION,
        z: vel.z * PHYSICS.FLOOR_FRICTION,
      },
      bounced: true,
    }
  }
  return { pos, vel, bounced: false }
}

export interface BackboardResult extends BallState {
  bounced: boolean
}

export function checkBackboard(pos: Vec3, vel: Vec3): BackboardResult {
  const bb = PHYSICS.BACKBOARD
  const br = PHYSICS.BALL_RADIUS
  // Box spans: x ∈ [xMin, xMax], y ∈ [yMin, yMax], z ∈ [zBack, zFront]
  const zFront = bb.z
  const zBack = bb.z - PHYSICS.BACKBOARD_THICKNESS

  // Closest point on box surface to ball centre
  const cx = Math.max(bb.xMin, Math.min(pos.x, bb.xMax))
  const cy = Math.max(bb.yMin, Math.min(pos.y, bb.yMax))
  const cz = Math.max(zBack, Math.min(pos.z, zFront))

  const dx = pos.x - cx
  const dy = pos.y - cy
  const dz = pos.z - cz
  const distSq = dx * dx + dy * dy + dz * dz

  // No overlap, or ball centre exactly on surface (guard div-by-zero)
  if (distSq >= br * br || distSq < 1e-8) return { pos, vel, bounced: false }

  const dist = Math.sqrt(distSq)
  const nx = dx / dist
  const ny = dy / dist
  const nz = dz / dist

  // Only bounce if the ball is moving toward the box
  const dot = vel.x * nx + vel.y * ny + vel.z * nz
  if (dot >= 0) return { pos, vel, bounced: false }

  return {
    pos: { x: cx + nx * br, y: cy + ny * br, z: cz + nz * br },
    vel: {
      x: vel.x - (1 + PHYSICS.BACKBOARD_RESTITUTION) * dot * nx,
      y: vel.y - (1 + PHYSICS.BACKBOARD_RESTITUTION) * dot * ny,
      z: vel.z - (1 + PHYSICS.BACKBOARD_RESTITUTION) * dot * nz,
    },
    bounced: true,
  }
}

export interface BackWallResult extends BallState {
  bounced: boolean
}

export function checkBackWall(pos: Vec3, vel: Vec3): BackWallResult {
  if (pos.z <= PHYSICS.BACK_WALL_Z + PHYSICS.BALL_RADIUS && vel.z < 0) {
    return {
      pos: { ...pos, z: PHYSICS.BACK_WALL_Z + PHYSICS.BALL_RADIUS },
      vel: { ...vel, z: -vel.z * PHYSICS.BACK_WALL_RESTITUTION },
      bounced: true,
    }
  }
  return { pos, vel, bounced: false }
}

export interface RimResult extends BallState {
  bounced: boolean
}

export function checkRim(pos: Vec3, vel: Vec3): RimResult {
  const hoop = PHYSICS.HOOP_CENTER
  const dx = pos.x - hoop.x
  const dz = pos.z - hoop.z
  const distXZ = Math.sqrt(dx * dx + dz * dz)
  if (distXZ < 0.001) return { pos, vel, bounced: false }

  const contactDist = PHYSICS.BALL_RADIUS + PHYSICS.RIM_TUBE_RADIUS

  // Closest point on the rim ring circle
  const cx = hoop.x + (dx / distXZ) * PHYSICS.HOOP_RADIUS
  const cy = hoop.y
  const cz = hoop.z + (dz / distXZ) * PHYSICS.HOOP_RADIUS

  const ex = pos.x - cx
  const ey = pos.y - cy
  const ez = pos.z - cz
  const dist = Math.sqrt(ex * ex + ey * ey + ez * ez)

  if (dist >= contactDist || dist < 0.001) return { pos, vel, bounced: false }

  const nx = ex / dist
  const ny = ey / dist
  const nz = ez / dist

  const dot = vel.x * nx + vel.y * ny + vel.z * nz
  if (dot >= 0) return { pos, vel, bounced: false } // already moving away

  return {
    pos: {
      x: cx + nx * contactDist,
      y: cy + ny * contactDist,
      z: cz + nz * contactDist,
    },
    vel: {
      x: vel.x - (1 + PHYSICS.RIM_RESTITUTION) * dot * nx,
      y: vel.y - (1 + PHYSICS.RIM_RESTITUTION) * dot * ny,
      z: vel.z - (1 + PHYSICS.RIM_RESTITUTION) * dot * nz,
    },
    bounced: true,
  }
}

export function checkGoal(prevPos: Vec3, currPos: Vec3, velY: number): boolean {
  if (velY >= 0) return false
  const hoop = PHYSICS.HOOP_CENTER
  if (!(prevPos.y >= hoop.y && currPos.y < hoop.y)) return false
  const t = (hoop.y - prevPos.y) / (currPos.y - prevPos.y)
  const crossX = prevPos.x + (currPos.x - prevPos.x) * t
  const crossZ = prevPos.z + (currPos.z - prevPos.z) * t
  const dx = crossX - hoop.x
  const dz = crossZ - hoop.z
  return Math.sqrt(dx * dx + dz * dz) <= PHYSICS.HOOP_RADIUS - PHYSICS.BALL_RADIUS
}

export function isOutOfBounds(pos: Vec3, vel: Vec3): boolean {
  if (pos.y < PHYSICS.OUT_OF_BOUNDS_Y) return true
  if (Math.abs(pos.z) > PHYSICS.OUT_OF_BOUNDS_Z) return true
  if (Math.abs(pos.x) > 12) return true
  const speed = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2)
  return pos.y <= PHYSICS.BALL_RADIUS + 0.01 && speed < PHYSICS.SETTLE_SPEED
}

export function isFreeThrowPos(pos: Vec3 | null): boolean {
  if (!pos) return true
  const ft = PHYSICS.FREE_THROW_POS
  return Math.abs(pos.x - ft.x) < 0.3 && Math.abs(pos.z - ft.z) < 0.3
}

export function calcLaunchVelocity(
  azimuth: number,
  elevation: number,
  power: number,
): Vec3 {
  const effective = PHYSICS.MIN_POWER_RATIO + (1 - PHYSICS.MIN_POWER_RATIO) * power
  const speed = effective * PHYSICS.MAX_SPEED
  const el = Math.max(elevation, PHYSICS.MIN_LAUNCH_ELEVATION)
  return {
    x: Math.sin(azimuth) * Math.cos(el) * speed,
    y: Math.sin(el) * speed,
    z: -Math.cos(azimuth) * Math.cos(el) * speed,
  }
}
