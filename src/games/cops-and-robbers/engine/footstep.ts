import { Container, Graphics } from 'pixi.js'
import { FOOTSTEP_SPRINT_RADIUS, FOOTSTEP_WALK_RADIUS } from '../constants'
import type { Vec2 } from '../types'

interface CopInfo {
  pos: Vec2
  sprinting: boolean
}

export interface FootstepIndicatorHandle {
  container: Container
  /** 도둑 위치와 경찰 목록을 받아 방향 화살표 갱신 */
  update: (thiefPos: Vec2, cops: CopInfo[]) => void
}

/** 도둑 화면에서 경찰 발소리 방향을 보여주는 인디케이터 */
export function createFootstepIndicator(): FootstepIndicatorHandle {
  const container = new Container()
  container.label = 'footstep-indicator'

  // 화살표 최대 4개 (동시에 여러 경찰 감지 가능)
  const MAX_ARROWS = 4
  const arrows: Graphics[] = []

  for (let i = 0; i < MAX_ARROWS; i++) {
    const g = new Graphics()
    // 위를 가리키는 삼각형 화살표
    g.moveTo(0, -10)
      .lineTo(-7, 4)
      .lineTo(7, 4)
      .closePath()
      .fill({ color: 0xef4444, alpha: 0.85 })
    g.visible = false
    container.addChild(g)
    arrows.push(g)
  }

  return {
    container,
    update(thiefPos: Vec2, cops: CopInfo[]) {
      // 반경 내 경찰 추출 (가까운 순 정렬)
      const nearby = cops
        .map((cop) => {
          const maxR = cop.sprinting ? FOOTSTEP_SPRINT_RADIUS : FOOTSTEP_WALK_RADIUS
          const dist = Math.hypot(cop.pos.x - thiefPos.x, cop.pos.y - thiefPos.y)
          return { cop, dist, maxR }
        })
        .filter(({ dist, maxR }) => dist <= maxR)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, MAX_ARROWS)

      for (let i = 0; i < MAX_ARROWS; i++) {
        const entry = nearby[i]
        const arrow = arrows[i]
        if (!entry) {
          arrow.visible = false
          continue
        }
        arrow.visible = true

        const dx = entry.cop.pos.x - thiefPos.x
        const dy = entry.cop.pos.y - thiefPos.y
        // atan2(dy, dx): 오른쪽이 0, 아래가 π/2. 화살표는 "위(0,-1)"가 0°이므로 +π/2 보정
        const angle = Math.atan2(dy, dx) + Math.PI / 2
        arrow.rotation = angle

        // 플레이어 주변 28px 거리에 배치
        const r = 28
        arrow.position.set(
          Math.cos(angle - Math.PI / 2) * r,
          Math.sin(angle - Math.PI / 2) * r,
        )
      }
    },
  }
}

/** 경찰 플레이어 자신의 발소리 반경 링 */
export function createCopFootprintRing(): Graphics {
  return new Graphics()
}

export function updateCopFootprintRing(ring: Graphics, pos: Vec2, sprinting: boolean) {
  const radius = sprinting ? FOOTSTEP_SPRINT_RADIUS : FOOTSTEP_WALK_RADIUS
  ring.clear()
  ring.circle(pos.x, pos.y, radius).stroke({ color: 0xef4444, width: 1.2, alpha: 0.18 })
}
