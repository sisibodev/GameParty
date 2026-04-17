import { BatterProfile, BatterHeight, BatterBuild, StanceHeight } from '../types'
import { SeededRng } from './rng'

/** 스트라이크존 크기 상수 (Three.js 단위, 1 ≈ 1m) */
const HEIGHTS: Record<BatterHeight, number> = { short: 1.65, medium: 1.78, tall: 1.90 }
const BUILDS: Record<BatterBuild, number> = { slim: 0.95, normal: 1.0, stocky: 1.05 }
const STANCES: Record<StanceHeight, number> = { low: -0.08, mid: 0, high: 0.08 }

/**
 * 2026 KBSA ABS 스트라이크존 기준
 *  - 상한: 신장의 87.7%
 *  - 하한: 신장의 27.68%
 *  - 폭:   64.87cm (홈플레이트 43.18cm + 양쪽 버퍼 포함)
 */
export const HOME_PLATE_HALF_WIDTH = 0.215        // 홈플레이트 실물 반폭 (3D 모델용)
export const ABS_ZONE_HALF_WIDTH   = 0.32435      // ABS 판정 반폭 (64.87cm / 2)

export function generateBatterProfile(rng: SeededRng, index: number): BatterProfile {
  const heights: BatterHeight[]  = ['short', 'medium', 'tall']
  const builds: BatterBuild[]    = ['slim', 'normal', 'stocky']
  const stances: StanceHeight[]  = ['low', 'mid', 'high']

  const height = rng.pick(heights)
  const build  = rng.pick(builds)
  const stance = rng.pick(stances)
  const isLefty = rng.next() < 0.3  // 30% 왼손잡이

  const totalHeight = HEIGHTS[height] * BUILDS[build]
  const stanceOffset = STANCES[stance]

  // 2026 KBSA ABS 기준: 상단 = 신장 × 87.7%, 하단 = 신장 × 27.68%
  // 타자는 타석에서 구부정하게 서므로 실제 존 높이를 2/3로 적용 (하단 고정, 상단 축소)
  const zoneBottom  = totalHeight * 0.2768 + stanceOffset
  const absZoneTop  = totalHeight * 0.8770 + stanceOffset
  const zoneTop     = zoneBottom + (absZoneTop - zoneBottom) * (2 / 3)
  const zoneHalfWidth = ABS_ZONE_HALF_WIDTH

  return { index, height, build, stance, isLefty, zoneBottom, zoneTop, zoneHalfWidth }
}

export function generateBatters(rng: SeededRng, count = 6): BatterProfile[] {
  return Array.from({ length: count }, (_, i) => generateBatterProfile(rng, i))
}
