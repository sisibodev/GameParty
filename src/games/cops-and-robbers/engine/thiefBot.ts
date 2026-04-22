import type { Vec2, SafeState } from '../types'
import {
  SAFE_INTERACT_RADIUS,
  ESCAPE_ZONE_POS,
  COP_BOT_ATTACK_RADIUS,
  TILE_SIZE,
} from '../constants'

export interface ThiefBotResult {
  /** Normalized direction to move (null = stay still) */
  dir: Vec2 | null
  /** Safe ID to auto-crack this tick (emitted once when crack timer fires) */
  crackedSafeId: string | null
}

const FLEE_RADIUS = COP_BOT_ATTACK_RADIUS * 3.5
const ARRIVE_DIST = SAFE_INTERACT_RADIUS * 0.75
const CRACK_DELAY_MS = 2400
const WANDER_DIST = TILE_SIZE * 2

export function createThiefBot() {
  let crackingId: string | null = null
  let crackTimerMs = 0
  let wanderOffset: Vec2 = { x: 0, y: 0 }

  function tick(
    dtMs: number,
    pos: Vec2,
    safes: SafeState[],
    copPos: Vec2,
    treasureCount: number,
    treasureGoal: number,
  ): ThiefBotResult {
    const copDist = Math.hypot(copPos.x - pos.x, copPos.y - pos.y)

    // Escape phase
    if (treasureCount >= treasureGoal) {
      crackingId = null
      crackTimerMs = 0
      const ex = ESCAPE_ZONE_POS.x - pos.x
      const ey = ESCAPE_ZONE_POS.y - pos.y
      const ed = Math.hypot(ex, ey)
      if (ed < 4) return { dir: null, crackedSafeId: null }
      return { dir: { x: ex / ed, y: ey / ed }, crackedSafeId: null }
    }

    // Flee from cop
    if (copDist < FLEE_RADIUS) {
      crackingId = null
      crackTimerMs = 0
      const dx = pos.x - copPos.x
      const dy = pos.y - copPos.y
      const d = Math.hypot(dx, dy) || 1
      return { dir: { x: dx / d, y: dy / d }, crackedSafeId: null }
    }

    // Find nearest crackable safe
    const crackable = safes.filter(
      (s) => s.status === 'locked' || s.status === 'alarmed',
    )
    if (crackable.length === 0) {
      return { dir: null, crackedSafeId: null }
    }

    let target = crackable[0]
    let best = Infinity
    for (const s of crackable) {
      const d = Math.hypot(s.pos.x - pos.x, s.pos.y - pos.y)
      if (d < best) { best = d; target = s }
    }

    // Reset wander offset when switching target
    if (crackingId !== null && crackingId !== target.id) {
      wanderOffset = {
        x: (Math.random() - 0.5) * WANDER_DIST,
        y: (Math.random() - 0.5) * WANDER_DIST,
      }
    }

    const goalX = target.pos.x + wanderOffset.x
    const goalY = target.pos.y + wanderOffset.y
    const dx = goalX - pos.x
    const dy = goalY - pos.y
    const dist = Math.hypot(dx, dy)

    // Within interact range → crack
    if (dist <= ARRIVE_DIST) {
      if (crackingId !== target.id) {
        crackingId = target.id
        crackTimerMs = 0
        wanderOffset = { x: 0, y: 0 }
      }
      crackTimerMs += dtMs
      if (crackTimerMs >= CRACK_DELAY_MS) {
        const id = crackingId
        crackingId = null
        crackTimerMs = 0
        return { dir: null, crackedSafeId: id }
      }
      return { dir: null, crackedSafeId: null }
    }

    // Move toward safe
    crackingId = null
    crackTimerMs = 0
    return {
      dir: dist > 0 ? { x: dx / dist, y: dy / dist } : null,
      crackedSafeId: null,
    }
  }

  return { tick }
}
