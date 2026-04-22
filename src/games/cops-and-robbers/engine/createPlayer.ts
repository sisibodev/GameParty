import { Container, Graphics, AnimatedSprite } from 'pixi.js'
import type { PlayerState, Role } from '../types'
import {
  COLORS,
  COP_SPEED,
  COP_VISION_RADIUS,
  PLAYER_RADIUS,
  THIEF_SPEED,
  THIEF_VISION_RADIUS,
} from '../constants'
import { type CharFrames, createCharSprite, updateCharDir } from './charSprites'

export interface PlayerHandle {
  state: PlayerState
  view: Container
  sprite?: AnimatedSprite
  frames?: CharFrames
}

export function createPlayer(
  role: Role,
  spawn: { x: number; y: number },
  frames?: CharFrames,
): PlayerHandle {
  const view = new Container()
  view.label = `player-${role}`

  const shadow = new Graphics()
    .ellipse(0, PLAYER_RADIUS * 0.6, PLAYER_RADIUS * 0.9, PLAYER_RADIUS * 0.35)
    .fill({ color: 0x000000, alpha: 0.35 })
  view.addChild(shadow)

  let sprite: AnimatedSprite | undefined
  if (frames) {
    sprite = createCharSprite(frames, 4)
    view.addChild(sprite)
  } else {
    const color = role === 'thief' ? COLORS.thief : COLORS.cop
    const body = new Graphics()
      .circle(0, 0, PLAYER_RADIUS)
      .fill(color)
      .stroke({ color: 0xffffff, width: 2, alpha: 0.85 })
    const indicator = new Graphics()
      .moveTo(PLAYER_RADIUS - 2, 0)
      .lineTo(PLAYER_RADIUS + 6, -4)
      .lineTo(PLAYER_RADIUS + 6, 4)
      .closePath()
      .fill({ color: 0xffffff, alpha: 0.9 })
    view.addChild(body, indicator)
  }

  view.position.set(spawn.x, spawn.y)

  const state: PlayerState = {
    pos: { x: spawn.x, y: spawn.y },
    role,
    speed: role === 'thief' ? THIEF_SPEED : COP_SPEED,
    visionRadius: role === 'thief' ? THIEF_VISION_RADIUS : COP_VISION_RADIUS,
  }

  return { state, view, sprite, frames }
}

export function syncPlayerView(handle: PlayerHandle) {
  handle.view.position.set(handle.state.pos.x, handle.state.pos.y)
}

export function setPlayerFacing(handle: PlayerHandle, dx: number, dy: number, moving = true) {
  if (dx === 0 && dy === 0) return
  if (handle.sprite && handle.frames) {
    updateCharDir(handle.sprite, handle.frames, dx, dy, moving)
  } else {
    handle.view.rotation = Math.atan2(dy, dx)
  }
}
