import type { GachaCard, GachaGrade, GachaResult, GrowthStatKey } from '../types'
import {
  GACHA_GRADES,
  GACHA_PROBABILITIES,
  GACHA_STAT_RANGES,
  GROWTH_STAT_KEYS,
} from '../constants'
import { SeededRng } from '../utils/rng'

function rollGrade(rng: SeededRng): GachaGrade {
  let roll = rng.next()
  for (const grade of GACHA_GRADES) {
    const prob = GACHA_PROBABILITIES[grade]
    if (roll < prob) return grade
    roll -= prob
  }
  return 'C'
}

function rollGain(grade: GachaGrade, rng: SeededRng): number {
  const [min, max] = GACHA_STAT_RANGES[grade]
  return min + Math.floor(rng.next() * (max - min + 1))
}

// v0.4.1 — 라운드 시작 가챠: 모든 캐릭터가 1장씩 (랜덤 스탯 1종 + 등급 범위 내 수치)
export function runGacha(
  playerCharId: number,
  allCharIds: number[],
  seed: number,
): GachaResult {
  const rng = new SeededRng(seed)
  const cards: GachaCard[] = []

  for (const targetCharId of allCharIds) {
    const grade    = rollGrade(rng)
    const statKey  = rng.pick(GROWTH_STAT_KEYS) as GrowthStatKey
    const statGain = rollGain(grade, rng)
    cards.push({ grade, targetCharId, statKey, statGain })
  }

  const playerGains = cards.filter(c => c.targetCharId === playerCharId)
  return { cards, playerGains }
}
