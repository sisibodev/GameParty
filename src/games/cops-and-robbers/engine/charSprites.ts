import { Assets, AnimatedSprite, Texture, Rectangle } from 'pixi.js'

const DIR_COUNT = 8
const FRAME_COUNT = 4

// 스프라이트 시트 컬럼 순서 (사용자 확인):
// col 0=위  col 1=위오른쪽  col 2=오른쪽  col 3=아래오른쪽
// col 4=아래  col 5=아래왼쪽  col 6=왼쪽  col 7=위왼쪽
//
// atan2 sector → col 매핑 (sector 0=오른쪽, 시계방향):
// sector 0(0°,right)→2  sector 1(45°,SE)→3  sector 2(90°,down)→4
// sector 3(135°,SW)→5  sector 4(180°,left)→6  sector 5(225°,NW)→7
// sector 6(270°,up)→0  sector 7(315°,NE)→1
const SECTOR_TO_COL = [2, 3, 4, 5, 6, 7, 0, 1] as const

// CharFrames[col 0-7][frame 0-3]
export type CharFrames = Texture[][]

export function dirToCol(dx: number, dy: number): number {
  const angle = Math.atan2(dy, dx) // -π~π, 0=오른쪽
  const sector = Math.round(((angle / (Math.PI / 4)) + 8)) % 8
  return SECTOR_TO_COL[sector]
}

export async function loadCharFrames(role: 'thief' | 'cop'): Promise<CharFrames> {
  const tex = await Assets.load<Texture>(`${import.meta.env.BASE_URL}assets/cops-and-robbers/${role}.png`)
  const cellW = Math.round(tex.width / DIR_COUNT)
  const cellH = Math.round(tex.height / FRAME_COUNT)
  const frames: CharFrames = []
  for (let col = 0; col < DIR_COUNT; col++) {
    frames[col] = []
    for (let row = 0; row < FRAME_COUNT; row++) {
      frames[col][row] = new Texture({
        source: tex.source,
        frame: new Rectangle(col * cellW, row * cellH, cellW, cellH),
      })
    }
  }
  return frames
}

export function createCharSprite(frames: CharFrames, col = 4): AnimatedSprite {
  const sprite = new AnimatedSprite(frames[col])
  sprite.anchor.set(0.5, 0.8)
  // PLAYER_RADIUS=12 기준 sprite 높이 ≈ 2.5×radius
  const cellH = frames[col][0]?.height ?? 230
  sprite.scale.set((12 * 2.5) / cellH)
  sprite.animationSpeed = 0.15
  sprite.play()
  return sprite
}

// _dirCol 을 sprite 에 직접 부착해서 reference 비교 오류를 피함
type TrackedSprite = AnimatedSprite & { _dirCol?: number }

export function updateCharDir(
  sprite: AnimatedSprite,
  frames: CharFrames,
  dx: number,
  dy: number,
  moving: boolean,
) {
  const s = sprite as TrackedSprite
  const col = dirToCol(dx, dy)
  if (s._dirCol !== col) {
    s._dirCol = col
    sprite.textures = frames[col]
    if (moving) sprite.play()
  }
  if (moving && !sprite.playing) sprite.play()
  else if (!moving) { sprite.stop(); sprite.currentFrame = 0 }
}
