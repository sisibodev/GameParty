import { useEffect, useRef } from 'react'
import type { TileMap, SafeState, Vec2 } from '../types'
import type { RoomPlayer } from '../utils/copsRtdb'
import {
  MAP_COLS, MAP_ROWS, TILE_SIZE,
  ESCAPE_ZONE_POS, ESCAPE_ZONE_RADIUS,
  JAIL_POS, JAIL_RADIUS,
} from '../constants'

// World → minimap scale: 1 tile = 4px
const SCALE = 4
const MM_W = MAP_COLS * SCALE   // 160
const MM_H = MAP_ROWS * SCALE   // 112

function wx(worldX: number) { return (worldX / TILE_SIZE) * SCALE }
function wy(worldY: number) { return (worldY / TILE_SIZE) * SCALE }

interface MinimapProps {
  tileMap: TileMap
  myPos: Vec2
  myRole: 'thief' | 'cop'
  myUid: string
  remotePlayers: Record<string, RoomPlayer>
  botPos: Vec2 | null
  safes: SafeState[]
  highlightSafeIds?: Set<string>
}

export default function Minimap({
  tileMap,
  myPos,
  myRole,
  myUid,
  remotePlayers,
  botPos,
  safes,
  highlightSafeIds,
}: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, MM_W, MM_H)

    // Tiles
    for (let r = 0; r < tileMap.rows; r++) {
      for (let c = 0; c < tileMap.cols; c++) {
        const kind = tileMap.tiles[r * tileMap.cols + c]
        ctx.fillStyle = kind === 'wall' ? '#0f1218' : ((c + r) % 2 === 0 ? '#2a2f3a' : '#242830')
        ctx.fillRect(c * SCALE, r * SCALE, SCALE, SCALE)
      }
    }

    // Jail ring
    ctx.beginPath()
    ctx.arc(wx(JAIL_POS.x), wy(JAIL_POS.y), (JAIL_RADIUS / TILE_SIZE) * SCALE, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(239,68,68,0.5)'
    ctx.lineWidth = 1
    ctx.stroke()

    // Escape zone ring
    ctx.beginPath()
    ctx.arc(wx(ESCAPE_ZONE_POS.x), wy(ESCAPE_ZONE_POS.y), (ESCAPE_ZONE_RADIUS / TILE_SIZE) * SCALE, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(52,211,153,0.6)'
    ctx.lineWidth = 1
    ctx.stroke()

    // Safes
    for (const safe of safes) {
      if (safe.status === 'opened_treasure' || safe.status === 'opened_empty') continue
      const highlight = highlightSafeIds?.has(safe.id)
      ctx.fillStyle = highlight ? '#fbbf24' : (safe.hasTreasure ? '#d4af37' : '#6b7280')
      ctx.fillRect(wx(safe.pos.x) - 1.5, wy(safe.pos.y) - 1.5, 3, 3)
    }

    // Remote players
    for (const [uid, p] of Object.entries(remotePlayers)) {
      if (uid === myUid || p.captured) continue
      ctx.beginPath()
      ctx.arc(wx(p.pos.x), wy(p.pos.y), 2, 0, Math.PI * 2)
      ctx.fillStyle = p.role === 'cop' ? '#ef4444' : '#7dd3fc'
      ctx.fill()
    }

    // Bot
    if (botPos) {
      ctx.beginPath()
      ctx.arc(wx(botPos.x), wy(botPos.y), 2, 0, Math.PI * 2)
      ctx.fillStyle = '#f97316'
      ctx.fill()
    }

    // Self (white outline)
    ctx.beginPath()
    ctx.arc(wx(myPos.x), wy(myPos.y), 2.5, 0, Math.PI * 2)
    ctx.fillStyle = myRole === 'cop' ? '#ef4444' : '#7dd3fc'
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 0.8
    ctx.stroke()
  })

  return (
    <canvas
      ref={canvasRef}
      width={MM_W}
      height={MM_H}
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 4,
        background: '#0f1218',
        imageRendering: 'pixelated',
        opacity: 0.85,
        pointerEvents: 'none',
        zIndex: 20,
      }}
    />
  )
}
