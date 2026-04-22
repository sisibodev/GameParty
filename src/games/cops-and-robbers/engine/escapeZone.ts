import { Container, Graphics, Text } from 'pixi.js'
import type { Vec2 } from '../types'
import { ESCAPE_ZONE_POS, ESCAPE_ZONE_RADIUS } from '../constants'

export interface EscapeZoneHandle {
  view: Container
  isInZone: (pos: Vec2) => boolean
  /** 보물 목표 미달성 시 locked=true, 달성 시 false */
  setLocked: (locked: boolean) => void
}

export function createEscapeZone(): EscapeZoneHandle {
  const pos = ESCAPE_ZONE_POS
  const view = new Container()
  view.label = 'escape-zone'

  // ── 잠김 상태 (회색) ─────────────────────────────────────────────────────────
  const fillLocked = new Graphics()
    .circle(pos.x, pos.y, ESCAPE_ZONE_RADIUS)
    .fill({ color: 0x6b7280, alpha: 0.08 })
  const ringLocked = new Graphics()
    .circle(pos.x, pos.y, ESCAPE_ZONE_RADIUS)
    .stroke({ color: 0x6b7280, width: 2, alpha: 0.45 })
  const labelLocked = new Text({
    text: '잠김',
    style: { fontSize: 11, fill: 0x6b7280, fontWeight: 'bold' as const },
  })
  labelLocked.anchor.set(0.5, 0.5)
  labelLocked.position.set(pos.x, pos.y)

  // ── 해제 상태 (녹색) ─────────────────────────────────────────────────────────
  const fillUnlocked = new Graphics()
    .circle(pos.x, pos.y, ESCAPE_ZONE_RADIUS)
    .fill({ color: 0x34d399, alpha: 0.12 })
  const ringUnlocked = new Graphics()
    .circle(pos.x, pos.y, ESCAPE_ZONE_RADIUS)
    .stroke({ color: 0x34d399, width: 2, alpha: 0.7 })
  const innerRing = new Graphics()
    .circle(pos.x, pos.y, ESCAPE_ZONE_RADIUS * 0.6)
    .stroke({ color: 0x34d399, width: 1, alpha: 0.4 })
  const labelUnlocked = new Text({
    text: '탈출',
    style: { fontSize: 11, fill: 0x34d399, fontWeight: 'bold' as const },
  })
  labelUnlocked.anchor.set(0.5, 0.5)
  labelUnlocked.position.set(pos.x, pos.y + ESCAPE_ZONE_RADIUS * 0.25)

  // 초기: 잠김 상태
  fillUnlocked.visible = false
  ringUnlocked.visible = false
  innerRing.visible = false
  labelUnlocked.visible = false

  view.addChild(
    fillLocked, ringLocked, labelLocked,
    fillUnlocked, ringUnlocked, innerRing, labelUnlocked,
  )

  function setLocked(locked: boolean) {
    fillLocked.visible = locked
    ringLocked.visible = locked
    labelLocked.visible = locked
    fillUnlocked.visible = !locked
    ringUnlocked.visible = !locked
    innerRing.visible = !locked
    labelUnlocked.visible = !locked
  }

  return {
    view,
    isInZone: (thiefPos: Vec2) =>
      Math.hypot(thiefPos.x - pos.x, thiefPos.y - pos.y) < ESCAPE_ZONE_RADIUS,
    setLocked,
  }
}
