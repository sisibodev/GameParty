import { Container, Graphics, AnimatedSprite } from 'pixi.js'
import type { CopBotState, SmokeCloud, TileMap, Vec2 } from '../types'
import { type CharFrames, createCharSprite, updateCharDir } from './charSprites'
import {
  COLORS,
  COP_BOT_ATTACK_RADIUS,
  COP_BOT_CHASE_SPEED,
  COP_BOT_DETECT_RADIUS,
  COP_BOT_HIT_COOLDOWN_MS,
  COP_BOT_PATROL_SPEED,
  COP_BOT_SCAN_ACTIVE_MS,
  COP_BOT_SCAN_COOLDOWN_MS,
  COP_BOT_SCAN_RADIUS,
  COP_BOT_WAYPOINT_ARRIVE_DIST,
  PLAYER_RADIUS,
  SMOKE_RADIUS,
  TILE_SIZE,
} from '../constants'
import { circleCollidesWall, isWallAt } from './createMap'

// ── A* 경로 탐색 ────────────────────────────────────────────────────────────

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
const PATH_RECOMPUTE_MS = 300
const PATH_RECOMPUTE_TILES = 2

function worldToTile(pos: Vec2): TileCoord {
  return { col: Math.floor(pos.x / TILE_SIZE), row: Math.floor(pos.y / TILE_SIZE) }
}

// ── 핸들 정의 ────────────────────────────────────────────────────────────────

export interface CopBotHandle {
  state: CopBotState
  view: Container
  scanRing: Graphics
  footprintRing: Graphics
  _path: TileCoord[]
  _pathGoal: TileCoord | null
  _pathRecomputeMs: number
  sprite?: AnimatedSprite
  frames?: CharFrames
  _lastDir: Vec2
}

function pickWaypoint(map: TileMap, avoid: Vec2): Vec2 {
  for (let i = 0; i < 80; i++) {
    const col = 2 + Math.floor(Math.random() * (map.cols - 4))
    const row = 2 + Math.floor(Math.random() * (map.rows - 4))
    const x = col * TILE_SIZE + TILE_SIZE / 2
    const y = row * TILE_SIZE + TILE_SIZE / 2
    if (isWallAt(map, x, y)) continue
    if (Math.hypot(x - avoid.x, y - avoid.y) < TILE_SIZE * 4) continue
    return { x, y }
  }
  return { x: (map.cols / 2) * TILE_SIZE, y: (map.rows / 2) * TILE_SIZE }
}

export function createCopBot(spawn: Vec2, frames?: CharFrames): CopBotHandle {
  const view = new Container()
  view.label = 'cop-bot'

  const shadow = new Graphics()
    .ellipse(0, PLAYER_RADIUS * 0.6, PLAYER_RADIUS * 0.9, PLAYER_RADIUS * 0.35)
    .fill({ color: 0x000000, alpha: 0.35 })
  view.addChild(shadow)

  let sprite: AnimatedSprite | undefined
  if (frames) {
    sprite = createCharSprite(frames, 4)
    view.addChild(sprite)
  } else {
    const body = new Graphics()
      .circle(0, 0, PLAYER_RADIUS)
      .fill(COLORS.cop)
      .stroke({ color: 0xffffff, width: 2, alpha: 0.85 })
    const dirArrow = new Graphics()
      .moveTo(PLAYER_RADIUS - 2, 0)
      .lineTo(PLAYER_RADIUS + 6, -4)
      .lineTo(PLAYER_RADIUS + 6, 4)
      .closePath()
      .fill({ color: 0xffffff, alpha: 0.9 })
    view.addChild(body, dirArrow)
  }

  view.position.set(spawn.x, spawn.y)

  const scanRing = new Graphics()
  const footprintRing = new Graphics()

  const state: CopBotState = {
    pos: { x: spawn.x, y: spawn.y },
    behavior: 'patrol',
    waypoint: null,
    scanCooldownMs: 0,
    scanActiveMs: 0,
    lastHitMs: -COP_BOT_HIT_COOLDOWN_MS,
  }

  return {
    state, view, scanRing, footprintRing,
    _path: [], _pathGoal: null, _pathRecomputeMs: 0,
    sprite, frames, _lastDir: { x: 0, y: 1 },
  }
}

function isSmokeBlocking(smokeList: SmokeCloud[], target: Vec2): boolean {
  for (const cloud of smokeList) {
    if (Math.hypot(cloud.pos.x - target.x, cloud.pos.y - target.y) < SMOKE_RADIUS) {
      return true
    }
  }
  return false
}

export function updateCopBot(
  handle: CopBotHandle,
  map: TileMap,
  thiefPos: Vec2,
  thiefStealthed: boolean,
  smokeList: SmokeCloud[],
  dtMs: number,
  nowMs: number,
): { hitRegistered: boolean; scanFired: boolean } {
  const { state } = handle
  const dt = dtMs / 1000

  let hitRegistered = false
  let scanFired = false

  if (state.scanCooldownMs > 0) state.scanCooldownMs = Math.max(0, state.scanCooldownMs - dtMs)
  if (state.scanActiveMs > 0) state.scanActiveMs = Math.max(0, state.scanActiveMs - dtMs)

  const distToThief = Math.hypot(thiefPos.x - state.pos.x, thiefPos.y - state.pos.y)
  const smokeBlock = isSmokeBlocking(smokeList, thiefPos)
  const canDetect = !thiefStealthed && !smokeBlock

  const prevBehavior = state.behavior
  if (canDetect && distToThief <= COP_BOT_DETECT_RADIUS) {
    state.behavior = distToThief <= COP_BOT_ATTACK_RADIUS ? 'attack' : 'chase'
    if (state.behavior === 'chase') state.waypoint = null
  } else if (state.behavior !== 'patrol') {
    state.behavior = 'patrol'
    state.waypoint = null
  }
  if (state.behavior !== prevBehavior) {
    handle._path = []
    handle._pathGoal = null
    handle._pathRecomputeMs = 0
  }

  if (state.behavior === 'attack') {
    const timeSinceHit = nowMs - state.lastHitMs
    if (timeSinceHit >= COP_BOT_HIT_COOLDOWN_MS) {
      state.lastHitMs = nowMs
      hitRegistered = true
    }
    if (distToThief > COP_BOT_ATTACK_RADIUS) {
      state.behavior = canDetect ? 'chase' : 'patrol'
    }
  }

  if (state.behavior === 'patrol') {
    if (!state.waypoint) state.waypoint = pickWaypoint(map, state.pos)
    const wp = state.waypoint
    if (Math.hypot(wp.x - state.pos.x, wp.y - state.pos.y) < COP_BOT_WAYPOINT_ARRIVE_DIST) {
      state.waypoint = pickWaypoint(map, state.pos)
      handle._path = []
      handle._pathGoal = null
    } else {
      const wpTile = worldToTile(wp)
      if (!handle._pathGoal || handle._pathGoal.col !== wpTile.col || handle._pathGoal.row !== wpTile.row) {
        const botTile = worldToTile(state.pos)
        handle._path = findPath(map, botTile.col, botTile.row, wpTile.col, wpTile.row)
        handle._pathGoal = wpTile
      }
      if (!followPath(handle, map, COP_BOT_PATROL_SPEED, dt))
        moveToward(handle, map, wp.x, wp.y, COP_BOT_PATROL_SPEED, dt)
    }
  }

  if (state.behavior === 'chase') {
    handle._pathRecomputeMs += dtMs
    const thiefTile = worldToTile(thiefPos)
    const needRecompute = !handle._pathGoal
      || handle._pathRecomputeMs >= PATH_RECOMPUTE_MS
      || Math.abs(thiefTile.col - handle._pathGoal.col) + Math.abs(thiefTile.row - handle._pathGoal.row) >= PATH_RECOMPUTE_TILES
    if (needRecompute) {
      const botTile = worldToTile(state.pos)
      handle._path = findPath(map, botTile.col, botTile.row, thiefTile.col, thiefTile.row)
      handle._pathGoal = thiefTile
      handle._pathRecomputeMs = 0
    }
    if (!followPath(handle, map, COP_BOT_CHASE_SPEED, dt))
      moveToward(handle, map, thiefPos.x, thiefPos.y, COP_BOT_CHASE_SPEED, dt)
  }

  if (state.scanCooldownMs === 0 && canDetect && distToThief <= COP_BOT_SCAN_RADIUS * 1.5) {
    state.scanCooldownMs = COP_BOT_SCAN_COOLDOWN_MS
    state.scanActiveMs = COP_BOT_SCAN_ACTIVE_MS
    scanFired = true
  }

  handle.view.position.set(state.pos.x, state.pos.y)
  drawScanRing(handle.scanRing, state)
  drawFootprintRing(handle.footprintRing, state)

  if (handle.sprite && handle.frames) {
    const moving = state.behavior !== 'attack'
    updateCharDir(handle.sprite, handle.frames, handle._lastDir.x, handle._lastDir.y, moving)
  }

  return { hitRegistered, scanFired }
}

function followPath(handle: CopBotHandle, map: TileMap, speed: number, dt: number): boolean {
  while (handle._path.length > 0) {
    const next = handle._path[0]
    const wx = next.col * TILE_SIZE + TILE_SIZE / 2
    const wy = next.row * TILE_SIZE + TILE_SIZE / 2
    const dx = wx - handle.state.pos.x
    const dy = wy - handle.state.pos.y
    if (dx * dx + dy * dy < PATH_ARRIVE_SQ) {
      handle._path.shift()
      continue
    }
    moveToward(handle, map, wx, wy, speed, dt)
    return true
  }
  return false
}

function moveToward(
  handle: CopBotHandle,
  map: TileMap,
  tx: number,
  ty: number,
  speed: number,
  dt: number,
) {
  const { state } = handle
  const dx = tx - state.pos.x
  const dy = ty - state.pos.y
  const dist = Math.hypot(dx, dy)
  if (dist < 1) return
  const step = speed * dt
  const nx = dx / dist
  const ny = dy / dist

  handle._lastDir = { x: nx, y: ny }

  const nextX = state.pos.x + nx * step
  if (!circleCollidesWall(map, nextX, state.pos.y, PLAYER_RADIUS - 1)) state.pos.x = nextX

  const nextY = state.pos.y + ny * step
  if (!circleCollidesWall(map, state.pos.x, nextY, PLAYER_RADIUS - 1)) state.pos.y = nextY
}

function drawScanRing(ring: Graphics, state: CopBotState) {
  ring.clear()
  if (state.scanActiveMs <= 0) return
  const alpha = (state.scanActiveMs / COP_BOT_SCAN_ACTIVE_MS) * 0.6
  ring.circle(state.pos.x, state.pos.y, COP_BOT_SCAN_RADIUS).stroke({
    color: 0xff6b6b,
    width: 2,
    alpha,
  })
}

function drawFootprintRing(ring: Graphics, state: CopBotState) {
  ring.clear()
  const radius = state.behavior === 'patrol' ? TILE_SIZE * 3 : TILE_SIZE * 6
  ring.circle(state.pos.x, state.pos.y, radius).stroke({ color: 0xef4444, width: 1, alpha: 0.18 })
}
