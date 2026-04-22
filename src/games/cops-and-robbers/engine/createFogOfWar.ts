import { Graphics } from 'pixi.js'
import type { TileMap } from '../types'
import { raycastDist } from './createMap'

const HALF_CONE = Math.PI / 4
const NEAR_RADIUS = 28
const CONE_STEPS = 64

export interface FogOfWarHandle {
  visibilityMask: Graphics
  update: (cx: number, cy: number, radius: number, facingAngle?: number, map?: TileMap) => void
  dispose: () => void
}

export function createFogOfWar(): FogOfWarHandle {
  const visibilityMask = new Graphics()

  function update(cx: number, cy: number, radius: number, facingAngle?: number, map?: TileMap) {
    visibilityMask.clear()

    if (facingAngle !== undefined) {
      const a0 = facingAngle - HALF_CONE
      const a1 = facingAngle + HALF_CONE
      const pts: number[] = [cx, cy]
      for (let i = 0; i <= CONE_STEPS; i++) {
        const a = a0 + (a1 - a0) * (i / CONE_STEPS)
        const d = map ? raycastDist(map, cx, cy, a, radius) : radius
        pts.push(cx + Math.cos(a) * d, cy + Math.sin(a) * d)
      }
      visibilityMask.poly(pts).fill(0xffffff)
      visibilityMask.circle(cx, cy, NEAR_RADIUS).fill(0xffffff)
    } else {
      visibilityMask.circle(cx, cy, radius).fill(0xffffff)
    }
  }

  function dispose() {
    visibilityMask.destroy()
  }

  return { visibilityMask, update, dispose }
}
