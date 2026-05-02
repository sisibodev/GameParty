import type { Vec3 } from '../types'

export const BALL_HOLD_HEIGHT = 1.4
export const NEXT_SHOT_DELAY_MS = 150

export const PHYSICS = {
  GRAVITY: 9.8,
  BALL_RADIUS: 0.12,
  BALL_HOLD_HEIGHT,
  NEXT_SHOT_DELAY_MS,
  HOOP_HEIGHT: 3.05,
  HOOP_RADIUS: 0.225,
  FREE_THROW_POS: { x: 0, y: BALL_HOLD_HEIGHT, z: 4.57 } as Vec3,
  MAX_SPEED: 12,
  FLOOR_RESTITUTION: 0.6,
  BACKBOARD: {
    z: -0.9,
    yMin: 2.9,
    yMax: 3.65,
    xMin: -0.9,
    xMax: 0.9,
  },
  HOOP_CENTER: { x: 0, y: 3.05, z: 0 } as Vec3,
  GOAL_Y_TOLERANCE: 0.15,
  OUT_OF_BOUNDS_Z: 10,
  OUT_OF_BOUNDS_Y: -1,
  SETTLE_SPEED: 0.05,
}

export interface BallState {
  pos: Vec3
  vel: Vec3
}

export function stepBall(pos: Vec3, vel: Vec3, dt: number): BallState {
  return {
    pos: {
      x: pos.x + vel.x * dt,
      y: pos.y + vel.y * dt,
      z: pos.z + vel.z * dt,
    },
    vel: {
      x: vel.x,
      y: vel.y - PHYSICS.GRAVITY * dt,
      z: vel.z,
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
      vel: { ...vel, y: -vel.y * PHYSICS.FLOOR_RESTITUTION },
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
  const hitZ =
    pos.z <= bb.z + PHYSICS.BALL_RADIUS &&
    pos.z >= bb.z - PHYSICS.BALL_RADIUS &&
    vel.z < 0
  const inBounds =
    pos.x >= bb.xMin && pos.x <= bb.xMax &&
    pos.y >= bb.yMin && pos.y <= bb.yMax

  if (hitZ && inBounds) {
    return {
      pos: { ...pos, z: bb.z + PHYSICS.BALL_RADIUS },
      vel: { ...vel, z: -vel.z * 0.5 },
      bounced: true,
    }
  }
  return { pos, vel, bounced: false }
}

export function checkGoal(ballPos: Vec3, ballVelY: number): boolean {
  if (ballVelY >= 0) return false
  const hoop = PHYSICS.HOOP_CENTER
  const dy = Math.abs(ballPos.y - hoop.y)
  if (dy > PHYSICS.GOAL_Y_TOLERANCE) return false
  const dx = ballPos.x - hoop.x
  const dz = ballPos.z - hoop.z
  const dist = Math.sqrt(dx * dx + dz * dz)
  return dist <= PHYSICS.HOOP_RADIUS - PHYSICS.BALL_RADIUS
}

export function isOutOfBounds(pos: Vec3, vel: Vec3): boolean {
  if (pos.y < PHYSICS.OUT_OF_BOUNDS_Y) return true
  if (Math.abs(pos.z) > PHYSICS.OUT_OF_BOUNDS_Z) return true
  if (Math.abs(pos.x) > 12) return true
  const speed = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2)
  return pos.y <= PHYSICS.BALL_RADIUS + 0.01 && speed < PHYSICS.SETTLE_SPEED
}

export function calcLaunchVelocity(
  azimuth: number,
  elevation: number,
  power: number,
): Vec3 {
  const speed = power * PHYSICS.MAX_SPEED
  return {
    x: Math.sin(azimuth) * Math.cos(elevation) * speed,
    y: Math.sin(elevation) * speed,
    z: -Math.cos(azimuth) * Math.cos(elevation) * speed,
  }
}
