import { Container, Graphics } from 'pixi.js'
import type { TileMap, TileKind } from '../types'
import { MAP_COLS, MAP_ROWS, TILE_SIZE, COLORS } from '../constants'

export function buildTileMap(): TileMap {
  const tiles: TileKind[] = new Array(MAP_COLS * MAP_ROWS).fill('floor')

  const setTile = (col: number, row: number, kind: TileKind) => {
    if (col < 0 || col >= MAP_COLS) return
    if (row < 0 || row >= MAP_ROWS) return
    tiles[row * MAP_COLS + col] = kind
  }

  for (let c = 0; c < MAP_COLS; c++) {
    setTile(c, 0, 'wall')
    setTile(c, MAP_ROWS - 1, 'wall')
  }
  for (let r = 0; r < MAP_ROWS; r++) {
    setTile(0, r, 'wall')
    setTile(MAP_COLS - 1, r, 'wall')
  }

  const horizontal = [
    { row: 8, cols: [4, 5, 6, 7, 8, 9, 12, 13, 14, 15] },
    { row: 8, cols: [22, 23, 24, 25, 26, 30, 31, 32, 33, 34] },
    { row: 18, cols: [6, 7, 8, 9, 10, 11, 12] },
    { row: 18, cols: [20, 21, 22, 23, 24, 25, 26, 27, 28] },
  ]
  for (const band of horizontal) {
    for (const col of band.cols) setTile(col, band.row, 'wall')
  }

  const vertical = [
    { col: 10, rows: [3, 4, 5] },
    { col: 18, rows: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
    { col: 28, rows: [13, 14, 15, 16, 17] },
    { col: 33, rows: [18, 19, 20, 21, 22, 23] },
  ]
  for (const col of vertical) {
    for (const row of col.rows) setTile(col.col, row, 'wall')
  }

  return { cols: MAP_COLS, rows: MAP_ROWS, tiles }
}

export function renderTileMap(map: TileMap): Container {
  const layer = new Container()
  layer.label = 'tilemap'

  const floor = new Graphics()
  const walls = new Graphics()
  layer.addChild(floor, walls)

  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const kind = map.tiles[r * map.cols + c]
      const x = c * TILE_SIZE
      const y = r * TILE_SIZE
      if (kind === 'wall') {
        walls.rect(x, y, TILE_SIZE, TILE_SIZE).fill(COLORS.wall)
        walls.rect(x, y, TILE_SIZE, 2).fill(COLORS.wallEdge)
      } else {
        const color = (c + r) % 2 === 0 ? COLORS.floor : COLORS.floorAlt
        floor.rect(x, y, TILE_SIZE, TILE_SIZE).fill(color)
      }
    }
  }

  return layer
}

export function isWallAt(map: TileMap, worldX: number, worldY: number): boolean {
  const col = Math.floor(worldX / TILE_SIZE)
  const row = Math.floor(worldY / TILE_SIZE)
  if (col < 0 || col >= map.cols) return true
  if (row < 0 || row >= map.rows) return true
  return map.tiles[row * map.cols + col] === 'wall'
}

/** DDA 레이캐스트: (ox, oy)에서 angle 방향으로 maxDist까지 첫 번째 벽까지의 거리 반환 */
export function raycastDist(
  map: TileMap,
  ox: number,
  oy: number,
  angle: number,
  maxDist: number,
): number {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)

  let tileX = Math.floor(ox / TILE_SIZE)
  let tileY = Math.floor(oy / TILE_SIZE)

  const stepX = dx >= 0 ? 1 : -1
  const stepY = dy >= 0 ? 1 : -1

  const tDeltaX = Math.abs(TILE_SIZE / (dx || 1e-10))
  const tDeltaY = Math.abs(TILE_SIZE / (dy || 1e-10))

  let tMaxX = dx >= 0
    ? ((tileX + 1) * TILE_SIZE - ox) / (dx || 1e-10)
    : (ox - tileX * TILE_SIZE) / (-dx || 1e-10)
  let tMaxY = dy >= 0
    ? ((tileY + 1) * TILE_SIZE - oy) / (dy || 1e-10)
    : (oy - tileY * TILE_SIZE) / (-dy || 1e-10)

  let dist = 0
  while (dist < maxDist) {
    if (tMaxX < tMaxY) {
      dist = tMaxX
      tileX += stepX
      tMaxX += tDeltaX
    } else {
      dist = tMaxY
      tileY += stepY
      tMaxY += tDeltaY
    }
    if (dist >= maxDist) return maxDist
    if (tileX < 0 || tileX >= map.cols || tileY < 0 || tileY >= map.rows) return dist
    if (map.tiles[tileY * map.cols + tileX] === 'wall') return dist
  }
  return maxDist
}

export function circleCollidesWall(
  map: TileMap,
  x: number,
  y: number,
  radius: number,
): boolean {
  const probes: Array<[number, number]> = [
    [x - radius, y],
    [x + radius, y],
    [x, y - radius],
    [x, y + radius],
    [x - radius * 0.7, y - radius * 0.7],
    [x + radius * 0.7, y - radius * 0.7],
    [x - radius * 0.7, y + radius * 0.7],
    [x + radius * 0.7, y + radius * 0.7],
  ]
  for (const [px, py] of probes) {
    if (isWallAt(map, px, py)) return true
  }
  return false
}
