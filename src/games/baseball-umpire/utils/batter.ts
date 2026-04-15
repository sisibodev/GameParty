import { BatterProfile, BatterHeight, BatterBuild, StanceHeight } from '../types'
import { SeededRng } from './rng'

/** 스트라이크존 크기 상수 (Three.js 단위, 1 ≈ 1m) */
const HEIGHTS: Record<BatterHeight, number> = { short: 1.65, medium: 1.78, tall: 1.90 }
const BUILDS: Record<BatterBuild, number> = { slim: 0.95, normal: 1.0, stocky: 1.05 }
const STANCES: Record<StanceHeight, number> = { low: -0.08, mid: 0, high: 0.08 }

/** 홈플레이트 폭 (17인치 ≈ 0.43m) */
export const HOME_PLATE_HALF_WIDTH = 0.215

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

  // KBO ABS 기준: 상단 = 신장 × 56.35%, 하단 = 신장 × 27.64%
  const zoneBottom = totalHeight * 0.2764 + stanceOffset
  const zoneTop    = totalHeight * 0.5635 + stanceOffset
  const zoneHalfWidth = HOME_PLATE_HALF_WIDTH

  return { index, height, build, stance, isLefty, zoneBottom, zoneTop, zoneHalfWidth }
}

export function generateBatters(rng: SeededRng, count = 6): BatterProfile[] {
  return Array.from({ length: count }, (_, i) => generateBatterProfile(rng, i))
}
