import type { Vec2, SafeState, TileMap } from '../types'
import {
  SAFE_INTERACT_RADIUS,
  ESCAPE_ZONE_POS,
  COP_BOT_ATTACK_RADIUS,
  TILE_SIZE,
} from '../constants'

// ── A* 경로 탐색 ─────────────────────────────────────────────────────────────

type TileCoord = { col: number; row: number }

const DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [-1, 0, 10], [1, 0, 10], [0, -1, 10], [0, 1, 10],
  [-1, -1, 14], [1, -1, 14], [-1, 1, 14], [1, 1, 14],
]

function findPath(map: TileMap, sc: number, sr: number, gc: number, gr: number): TileCoord[] {
  const { cols, rows, tiles } = map
  const N = cols * rows
  const startIdx = sr * cols + sc
  const goalIdx = gr * cols + gc
  if (startIdx === goalIdx) return []
  if (tiles[goalIdx] === 'wall') return []

  const g = new Int32Array(N).fill(0x7fffffff)
  const parent = new Int32Array(N).fill(-1)
  const closed = new Uint8Array(N)

  const heap: Array<[number, number]> = []
  const push = (f: number, idx: number) => {
    heap.push([f, idx])
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p][0] <= heap[i][0]) break
      ;[heap[p], heap[i]] = [heap[i], heap[p]]
      i = p
    }
  }
  const pop = (): [number, number] | undefined => {
    if (!heap.length) return undefined
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1, r = i * 2 + 2
        let s = i
        if (l < heap.length && heap[l][0] < heap[s][0]) s = l
        if (r < heap.length && heap[r][0] < heap[s][0]) s = r
        if (s === i) break
        ;[heap[s], heap[i]] = [heap[i], heap[s]]
        i = s
      }
    }
    return top
  }

  const h = (c: number, r: number) => Math.max(Math.abs(c - gc), Math.abs(r - gr)) * 10
  g[startIdx] = 0
  push(h(sc, sr), startIdx)

  while (heap.length) {
    const node = pop()!
    const idx = node[1]
    if (closed[idx]) continue
    closed[idx] = 1
    if (idx === goalIdx) {
      const path: TileCoord[] = []
      let k = idx
      while (k !== startIdx) {
        path.push({ col: k % cols, row: Math.floor(k / cols) })
        k = parent[k]
      }
      path.reverse()
      return path
    }
    const cc = idx % cols
    const cr = Math.floor(idx / cols)
    const cg = g[idx]
    for (const [dc, dr, cost] of DIRS) {
      const nc = cc + dc, nr = cr + dr
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue
      if (tiles[nr * cols + nc] === 'wall') continue
      if (dc !== 0 && dr !== 0) {
        if (tiles[cr * cols + (cc + dc)] === 'wall') continue
        if (tiles[(cr + dr) * cols + cc] === 'wall') continue
      }
      const nIdx = nr * cols + nc
      if (closed[nIdx]) continue
      const ng = cg + cost
      if (ng < g[nIdx]) {
        g[nIdx] = ng
        parent[nIdx] = idx
        push(ng + h(nc, nr), nIdx)
      }
    }
  }
  return []
}

const PATH_ARRIVE_SQ = (TILE_SIZE * 0.6) ** 2
const PATH_RECOMPUTE_MS = 400

function worldToTile(x: number, y: number): TileCoord {
  return { col: Math.floor(x / TILE_SIZE), row: Math.floor(y / TILE_SIZE) }
}

// ── 경로 추적기 ───────────────────────────────────────────────────────────────

class PathTracker {
  path: TileCoord[] = []
  goal: TileCoord | null = null
  recomputeMs = 0

  clear() {
    this.path = []
    this.goal = null
    this.recomputeMs = 0
  }

  navigate(pos: Vec2, target: Vec2, map: TileMap, dtMs: number): Vec2 | null {
    const dx = target.x - pos.x
    const dy = target.y - pos.y
    const dist = Math.hypot(dx, dy)
    if (dist < 4) return null

    this.recomputeMs += dtMs
    const goalTile = worldToTile(target.x, target.y)
    const needRecompute =
      !this.goal ||
      this.recomputeMs >= PATH_RECOMPUTE_MS ||
      Math.abs(goalTile.col - this.goal.col) + Math.abs(goalTile.row - this.goal.row) >= 2

    if (needRecompute) {
      const myTile = worldToTile(pos.x, pos.y)
      this.path = findPath(map, myTile.col, myTile.row, goalTile.col, goalTile.row)
      this.goal = goalTile
      this.recomputeMs = 0
    }

    while (this.path.length > 0) {
      const next = this.path[0]
      const wx = next.col * TILE_SIZE + TILE_SIZE / 2
      const wy = next.row * TILE_SIZE + TILE_SIZE / 2
      const ndx = wx - pos.x
      const ndy = wy - pos.y
      if (ndx * ndx + ndy * ndy < PATH_ARRIVE_SQ) {
        this.path.shift()
        continue
      }
      const len = Math.hypot(ndx, ndy)
      return { x: ndx / len, y: ndy / len }
    }

    return { x: dx / dist, y: dy / dist }
  }
}

// ── 결과 타입 ─────────────────────────────────────────────────────────────────

export interface ThiefBotResult {
  dir: Vec2 | null
  crackedSafeId: string | null
  rescued: boolean
}

// ── 상수 ─────────────────────────────────────────────────────────────────────

const FLEE_RADIUS = COP_BOT_ATTACK_RADIUS * 3.5
const ARRIVE_DIST = SAFE_INTERACT_RADIUS * 0.75
const CRACK_DELAY_MS = 2400
const RESCUE_ARRIVE_DIST = TILE_SIZE * 2
const FLEE_WAYPOINT_REFRESH_MS = 1200

// ── 도주 목적지 선택 ──────────────────────────────────────────────────────────

function pickFleePoint(pos: Vec2, copPos: Vec2, map: TileMap): Vec2 {
  const awayAngle = Math.atan2(pos.y - copPos.y, pos.x - copPos.x)
  let best: Vec2 = { x: pos.x + (pos.x - copPos.x), y: pos.y + (pos.y - copPos.y) }
  let bestScore = -Infinity
  for (let i = 0; i < 28; i++) {
    const a = awayAngle + (Math.random() - 0.5) * Math.PI
    const r = FLEE_RADIUS * (1.2 + Math.random() * 1.2)
    const tx = pos.x + Math.cos(a) * r
    const ty = pos.y + Math.sin(a) * r
    const col = Math.floor(tx / TILE_SIZE)
    const row = Math.floor(ty / TILE_SIZE)
    if (col < 1 || col >= map.cols - 1 || row < 1 || row >= map.rows - 1) continue
    if (map.tiles[row * map.cols + col] === 'wall') continue
    const score = (tx - copPos.x) ** 2 + (ty - copPos.y) ** 2
    if (score > bestScore) {
      bestScore = score
      best = { x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + TILE_SIZE / 2 }
    }
  }
  return best
}

// ── 팩토리 ────────────────────────────────────────────────────────────────────

export function createThiefBot() {
  let crackingId: string | null = null
  let crackTimerMs = 0

  const mainPath = new PathTracker()
  const rescuePath = new PathTracker()
  const fleePath = new PathTracker()
  let _rescueTarget: Vec2 | null = null
  let _fleeWaypoint: Vec2 | null = null
  let fleeWaypointMs = 0
  // 현재 목표 금고 (다른 봇이 같은 금고를 피하도록 노출)
  let _targetSafeId: string | null = null

  function getTargetSafeId(): string | null {
    return _targetSafeId
  }

  function setRescueTarget(pos: Vec2 | null) {
    if (pos === null && _rescueTarget === null) return
    _rescueTarget = pos
    if (!pos) rescuePath.clear()
  }

  function tick(
    dtMs: number,
    pos: Vec2,
    safes: SafeState[],
    copPos: Vec2,
    treasureCount: number,
    treasureGoal: number,
    map: TileMap | null = null,
    occupiedSafeIds: ReadonlySet<string> = new Set(),
  ): ThiefBotResult {
    const copDist = Math.hypot(copPos.x - pos.x, copPos.y - pos.y)

    // 탈출 페이즈
    if (treasureCount >= treasureGoal) {
      crackingId = null; crackTimerMs = 0; _rescueTarget = null; _targetSafeId = null
      const dir = map
        ? mainPath.navigate(pos, ESCAPE_ZONE_POS, map, dtMs)
        : directDir(pos, ESCAPE_ZONE_POS)
      return { dir, crackedSafeId: null, rescued: false }
    }

    // 도주 (최우선 — 구출도 취소)
    if (copDist < FLEE_RADIUS) {
      crackingId = null; crackTimerMs = 0
      _rescueTarget = null; _targetSafeId = null
      rescuePath.clear(); mainPath.clear()
      fleeWaypointMs += dtMs
      if (map && (!_fleeWaypoint || fleeWaypointMs >= FLEE_WAYPOINT_REFRESH_MS)) {
        _fleeWaypoint = pickFleePoint(pos, copPos, map)
        fleeWaypointMs = 0
      }
      const fallback: Vec2 = { x: 2 * pos.x - copPos.x, y: 2 * pos.y - copPos.y }
      let dir = (map && _fleeWaypoint)
        ? fleePath.navigate(pos, _fleeWaypoint, map, dtMs)
        : directDir(pos, fallback)
      // 목적지 도착 시 즉시 새 목적지 선택
      if (!dir && map) {
        _fleeWaypoint = pickFleePoint(pos, copPos, map)
        fleeWaypointMs = 0
        dir = fleePath.navigate(pos, _fleeWaypoint, map, dtMs)
      }
      return { dir, crackedSafeId: null, rescued: false }
    }
    // 도주 상태 해제
    if (_fleeWaypoint) { _fleeWaypoint = null; fleeWaypointMs = 0; fleePath.clear() }

    // 구출 페이즈
    if (_rescueTarget) {
      _targetSafeId = null
      const dist = Math.hypot(_rescueTarget.x - pos.x, _rescueTarget.y - pos.y)
      if (dist < RESCUE_ARRIVE_DIST) {
        _rescueTarget = null; rescuePath.clear()
        return { dir: null, crackedSafeId: null, rescued: true }
      }
      const dir = map
        ? rescuePath.navigate(pos, _rescueTarget, map, dtMs)
        : directDir(pos, _rescueTarget)
      return { dir, crackedSafeId: null, rescued: false }
    }

    // 금고 해킹
    const crackable = safes.filter((s) => s.status === 'locked' || s.status === 'alarmed')
    if (crackable.length === 0) {
      _targetSafeId = null; crackingId = null; crackTimerMs = 0
      // 열 금고가 없으면 탈출구로 이동
      const dir = map
        ? mainPath.navigate(pos, ESCAPE_ZONE_POS, map, dtMs)
        : directDir(pos, ESCAPE_ZONE_POS)
      return { dir, crackedSafeId: null, rescued: false }
    }

    // 이미 해킹 중인 금고가 있으면 끝까지 진행
    if (crackingId) {
      const crackSafe = crackable.find((s) => s.id === crackingId)
      if (crackSafe) {
        _targetSafeId = crackingId
        const dist = Math.hypot(crackSafe.pos.x - pos.x, crackSafe.pos.y - pos.y)
        if (dist <= ARRIVE_DIST) {
          crackTimerMs += dtMs
          if (crackTimerMs >= CRACK_DELAY_MS) {
            const id = crackingId
            crackingId = null; crackTimerMs = 0; _targetSafeId = null
            return { dir: null, crackedSafeId: id, rescued: false }
          }
          return { dir: null, crackedSafeId: null, rescued: false }
        }
        const dir = map
          ? mainPath.navigate(pos, crackSafe.pos, map, dtMs)
          : directDir(pos, crackSafe.pos)
        return { dir, crackedSafeId: null, rescued: false }
      }
      crackingId = null; crackTimerMs = 0
    }

    // 새 금고 선택: 다른 봇이 안 간 금고 우선
    const unoccupied = crackable.filter((s) => !occupiedSafeIds.has(s.id))
    const pool = unoccupied.length > 0 ? unoccupied : crackable

    let target = pool[0]; let best = Infinity
    for (const s of pool) {
      const d = Math.hypot(s.pos.x - pos.x, s.pos.y - pos.y)
      if (d < best) { best = d; target = s }
    }
    _targetSafeId = target.id

    const dist = Math.hypot(target.pos.x - pos.x, target.pos.y - pos.y)
    if (dist <= ARRIVE_DIST) {
      crackingId = target.id; crackTimerMs = dtMs; mainPath.clear()
      if (crackTimerMs >= CRACK_DELAY_MS) {
        const id = crackingId
        crackingId = null; crackTimerMs = 0; _targetSafeId = null
        return { dir: null, crackedSafeId: id, rescued: false }
      }
      return { dir: null, crackedSafeId: null, rescued: false }
    }

    const dir = map
      ? mainPath.navigate(pos, target.pos, map, dtMs)
      : directDir(pos, target.pos)
    return { dir, crackedSafeId: null, rescued: false }
  }

  return { tick, setRescueTarget, getTargetSafeId }
}

function directDir(pos: Vec2, target: Vec2): Vec2 | null {
  const dx = target.x - pos.x
  const dy = target.y - pos.y
  const d = Math.hypot(dx, dy)
  return d < 4 ? null : { x: dx / d, y: dy / d }
}
