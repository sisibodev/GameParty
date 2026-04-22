import { Container, Graphics, Text } from 'pixi.js'
import type { SafeState, SafeStatus, TileMap, Vec2 } from '../types'
import {
  COLORS,
  SAFE_EMPTY_RATIO,
  SAFE_INTERACT_RADIUS,
  SAFE_RADIUS,
  SAFE_DIGITS,
  TILE_SIZE,
} from '../constants'
import { generateSecret } from './numberBaseball'
import { isWallAt } from './createMap'

export interface SafeVisual {
  view: Container
  body: Graphics
  icon: Text
  ring: Graphics
}

export interface SafesHandle {
  layer: Container
  safes: SafeState[]
  visuals: Map<string, SafeVisual>
  refresh: (safe: SafeState) => void
  setHighlight: (safeId: string | null) => void
  dispose: () => void
}

function pickSafeSpots(map: TileMap, count: number): Vec2[] {
  const spots: Vec2[] = []
  const tried = new Set<string>()
  let attempts = 0
  while (spots.length < count && attempts < count * 40) {
    attempts++
    const col = 2 + Math.floor(Math.random() * (map.cols - 4))
    const row = 2 + Math.floor(Math.random() * (map.rows - 4))
    const key = `${col},${row}`
    if (tried.has(key)) continue
    tried.add(key)

    const cx = col * TILE_SIZE + TILE_SIZE / 2
    const cy = row * TILE_SIZE + TILE_SIZE / 2
    if (isWallAt(map, cx, cy)) continue
    if (isWallAt(map, cx - SAFE_RADIUS, cy)) continue
    if (isWallAt(map, cx + SAFE_RADIUS, cy)) continue
    if (isWallAt(map, cx, cy - SAFE_RADIUS)) continue
    if (isWallAt(map, cx, cy + SAFE_RADIUS)) continue

    const tooClose = spots.some((p) => Math.hypot(p.x - cx, p.y - cy) < TILE_SIZE * 3)
    if (tooClose) continue

    spots.push({ x: cx, y: cy })
  }
  return spots
}

export function createSafes(map: TileMap, totalCount: number): SafeState[] {
  const spots = pickSafeSpots(map, totalCount)
  const safes: SafeState[] = spots.map((pos, idx) => {
    const hasTreasure = Math.random() > SAFE_EMPTY_RATIO
    return {
      id: `safe-${idx}`,
      pos,
      hasTreasure,
      status: 'locked',
      attemptsUsed: 0,
      secret: generateSecret(SAFE_DIGITS),
    }
  })
  if (safes.every((s) => !s.hasTreasure) && safes.length > 0) {
    safes[0].hasTreasure = true
  }
  return safes
}

function statusColor(status: SafeStatus): number {
  switch (status) {
    case 'locked':
      return COLORS.safeLocked
    case 'cracking':
      return COLORS.safeCracking
    case 'opened_treasure':
      return COLORS.safeTreasure
    case 'opened_empty':
      return COLORS.safeEmpty
    case 'alarmed':
      return COLORS.safeAlarm
  }
}

function statusIcon(status: SafeStatus): string {
  switch (status) {
    case 'locked':
      return '🔒'
    case 'cracking':
      return '⚙'
    case 'opened_treasure':
      return '💎'
    case 'opened_empty':
      return '∅'
    case 'alarmed':
      return '!'
  }
}

function drawSafeVisual(visual: SafeVisual, safe: SafeState, highlighted: boolean) {
  const color = statusColor(safe.status)
  visual.body.clear()
  visual.body
    .roundRect(-SAFE_RADIUS, -SAFE_RADIUS, SAFE_RADIUS * 2, SAFE_RADIUS * 2, 4)
    .fill(COLORS.safeBody)
    .stroke({ color, width: 2 })

  visual.ring.clear()
  if (highlighted && (safe.status === 'locked' || safe.status === 'cracking')) {
    visual.ring
      .circle(0, 0, SAFE_RADIUS + 6)
      .stroke({ color: 0xffffff, width: 2, alpha: 0.8 })
  }

  visual.icon.text = statusIcon(safe.status)
  visual.icon.style.fill = color
}

export function renderSafes(safes: SafeState[]): SafesHandle {
  const layer = new Container()
  layer.label = 'safes'
  const visuals = new Map<string, SafeVisual>()

  for (const safe of safes) {
    const view = new Container()
    view.label = safe.id
    view.position.set(safe.pos.x, safe.pos.y)

    const ring = new Graphics()
    const body = new Graphics()
    const icon = new Text({
      text: '🔒',
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: 14,
        fill: COLORS.safeLocked,
        fontWeight: '700',
      },
    })
    icon.anchor.set(0.5)
    icon.position.set(0, 0)

    view.addChild(ring, body, icon)
    layer.addChild(view)

    const visual: SafeVisual = { view, body, icon, ring }
    drawSafeVisual(visual, safe, false)
    visuals.set(safe.id, visual)
  }

  let highlightedId: string | null = null

  function refresh(safe: SafeState) {
    const visual = visuals.get(safe.id)
    if (!visual) return
    drawSafeVisual(visual, safe, highlightedId === safe.id)
  }

  function setHighlight(safeId: string | null) {
    if (highlightedId === safeId) return
    const prev = highlightedId
    highlightedId = safeId
    if (prev) {
      const prevSafe = safes.find((s) => s.id === prev)
      const prevVisual = visuals.get(prev)
      if (prevSafe && prevVisual) drawSafeVisual(prevVisual, prevSafe, false)
    }
    if (safeId) {
      const safe = safes.find((s) => s.id === safeId)
      const visual = visuals.get(safeId)
      if (safe && visual) drawSafeVisual(visual, safe, true)
    }
  }

  function dispose() {
    for (const v of visuals.values()) {
      v.body.destroy()
      v.icon.destroy()
      v.ring.destroy()
      v.view.destroy()
    }
    visuals.clear()
    layer.removeFromParent()
    layer.destroy({ children: true })
  }

  return { layer, safes, visuals, refresh, setHighlight, dispose }
}

export function findNearestInteractable(
  safes: SafeState[],
  origin: Vec2,
): SafeState | null {
  let best: SafeState | null = null
  let bestDist = SAFE_INTERACT_RADIUS
  for (const safe of safes) {
    if (safe.status !== 'locked' && safe.status !== 'cracking') continue
    const d = Math.hypot(origin.x - safe.pos.x, origin.y - safe.pos.y)
    if (d <= bestDist) {
      bestDist = d
      best = safe
    }
  }
  return best
}
