import { Container, Graphics, Text } from 'pixi.js'
import type { Vec2 } from '../types'
import { JAIL_POS, JAIL_RADIUS, JAIL_RESCUE_INTERACT_RADIUS } from '../constants'

export interface JailHandle {
  view: Container
  /** 유치장 반경 안에 있는지 (잡힌 도둑 위치 표시용) */
  isInZone: (pos: Vec2) => boolean
  /** 구출 상호작용 반경 안에 있는지 (자유 도둑이 E를 눌러 구출 가능한 범위) */
  isInRescueZone: (pos: Vec2) => boolean
  /** 구출 가능 상태 표시 토글 */
  setRescuable: (on: boolean) => void
}

export function createJail(): JailHandle {
  const pos = JAIL_POS
  const view = new Container()
  view.label = 'jail'

  const fill = new Graphics()
    .circle(pos.x, pos.y, JAIL_RADIUS)
    .fill({ color: 0xef4444, alpha: 0.08 })

  const ring = new Graphics()
    .circle(pos.x, pos.y, JAIL_RADIUS)
    .stroke({ color: 0xef4444, width: 2, alpha: 0.45 })

  // 구출 상호작용 범위 링 (구출 가능할 때만 표시)
  const rescueRing = new Graphics()
    .circle(pos.x, pos.y, JAIL_RESCUE_INTERACT_RADIUS)
    .stroke({ color: 0xfbbf24, width: 1.5, alpha: 0.6 })
  rescueRing.visible = false

  const label = new Text({
    text: '유치장',
    style: { fontSize: 11, fill: 0xef4444, fontWeight: 'bold' as const },
  })
  label.anchor.set(0.5, 0.5)
  label.position.set(pos.x, pos.y)

  const rescueLabel = new Text({
    text: 'E: 구출',
    style: { fontSize: 10, fill: 0xfbbf24, fontWeight: 'bold' as const },
  })
  rescueLabel.anchor.set(0.5, 0.5)
  rescueLabel.position.set(pos.x, pos.y + JAIL_RADIUS + 10)
  rescueLabel.visible = false

  view.addChild(fill, ring, rescueRing, label, rescueLabel)

  return {
    view,
    isInZone: (p: Vec2) => Math.hypot(p.x - pos.x, p.y - pos.y) < JAIL_RADIUS,
    isInRescueZone: (p: Vec2) => Math.hypot(p.x - pos.x, p.y - pos.y) < JAIL_RESCUE_INTERACT_RADIUS,
    setRescuable: (on: boolean) => {
      rescueRing.visible = on
      rescueLabel.visible = on
    },
  }
}
