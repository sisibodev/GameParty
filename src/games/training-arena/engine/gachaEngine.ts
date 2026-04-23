import type { GachaCard, GachaGrade, GachaResult, GrowthStatKey } from '../types'
import {
  GACHA_GRADES,
  GACHA_PROBABILITIES,
  GACHA_PULL_COUNT,
  GACHA_STAT_GAINS,
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

export function runGacha(
  playerCharId: number,
  allCharIds: number[],
  seed: number,
): GachaResult {
  const rng = new SeededRng(seed)
  const cards: GachaCard[] = []

  for (let i = 0; i < GACHA_PULL_COUNT; i++) {
    const grade        = rollGrade(rng)
    const targetCharId = rng.pick(allCharIds)
    const statKey      = rng.pick(GROWTH_STAT_KEYS) as GrowthStatKey
    const statGain     = GACHA_STAT_GAINS[grade]
    cards.push({ grade, targetCharId, statKey, statGain })
  }

  const playerGains = cards.filter(c => c.targetCharId === playerCharId)
  return { cards, playerGains }
}
