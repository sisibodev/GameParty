import { Assets, AnimatedSprite, Texture, Rectangle } from 'pixi.js'

const CELL_W = 144
const CELL_H = 261
const DIR_COUNT = 8
const FRAME_COUNT = 4

// 스프라이트 시트 컬럼: 위, 위오른쪽, 오른쪽, 아래오른쪽, 아래, 아래왼쪽, 왼쪽, 위왼쪽
const SECTOR_TO_COL = [2, 3, 4, 5, 6, 7, 0, 1] as const

// CharFrames[col 0-7][frame 0-3]
export type CharFrames = Texture[][]

export function dirToCol(dx: number, dy: number): number {
  const angle = Math.atan2(dy, dx) // -π~π, 0=right
  const sector = Math.round(((angle / (Math.PI / 4)) + 8)) % 8
  return SECTOR_TO_COL[sector]
}

export async function loadCharFrames(role: 'thief' | 'cop'): Promise<CharFrames> {
  const tex = await Assets.load<Texture>(`${import.meta.env.BASE_URL}assets/cops-and-robbers/${role}.png`)
  const frames: CharFrames = []
  for (let col = 0; col < DIR_COUNT; col++) {
    frames[col] = []
    for (let row = 0; row < FRAME_COUNT; row++) {
      frames[col][row] = new Texture({
        source: tex.source,
        frame: new Rectangle(col * CELL_W, row * CELL_H, CELL_W, CELL_H),
      })
    }
  }
  return frames
}

// PLAYER_RADIUS=12 기준 sprite 높이 ≈ 2.5×radius
const SPRITE_SCALE = (12 * 2.5) / CELL_H

export function createCharSprite(frames: CharFrames, col = 4): AnimatedSprite {
  const sprite = new AnimatedSprite(frames[col])
  sprite.anchor.set(0.5, 0.8)
  sprite.scale.set(SPRITE_SCALE)
  sprite.animationSpeed = 0.15
  sprite.play()
  return sprite
}

export function updateCharDir(
  sprite: AnimatedSprite,
  frames: CharFrames,
  dx: number,
  dy: number,
  moving: boolean,
) {
  const col = dirToCol(dx, dy)
  if (sprite.textures !== frames[col]) sprite.textures = frames[col]
  if (moving && !sprite.playing) sprite.play()
  else if (!moving) { sprite.stop(); sprite.currentFrame = 0 }
}
