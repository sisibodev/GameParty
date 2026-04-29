import type { PassiveSkillDef, PlayerTournamentResult, RewardPackage } from '../types'
import {
  GOLD_BY_RESULT,
  REWARD_DARKHORSE,
  REWARD_FINALIST,
  REWARD_TOURNAMENT_OUT,
  REWARD_WINNER,
} from '../constants'
import { SeededRng } from '../utils/rng'
import { pickN } from '../utils/fisherYates'
import { sumGoldMultiplier } from '../data/items'
import passiveSkillsData from '../data/passiveSkills.json'

const SKILL_CHOICE_COUNT = 3
const PASSIVE_CHOICE_COUNT = 3

const BASE_STAT_GAINS: Record<PlayerTournamentResult, number> = {
  winner:         REWARD_WINNER,
  finalist:       REWARD_FINALIST,
  tournament_out: REWARD_TOURNAMENT_OUT,
  group_out:      2,
  qualifier_out:  1,
}

function calcGoldBonusPct(playerPassiveIds: string[]): number {
  const passives = passiveSkillsData as PassiveSkillDef[]
  return playerPassiveIds.reduce((total, id) => {
    const def = passives.find(p => p.id === id)
    if (def && def.effect.type === 'gold_bonus') {
      return total + (def.effect.pct as number)
    }
    return total
  }, 0)
}

export function calcReward(
  result: PlayerTournamentResult,
  isDarkhorse: boolean,
  availableSkillIds: string[],
  acquiredSkillIds: string[],
  seed: number,
  playerItems: readonly string[] = [],
  allPassiveIds: string[] = [],
  playerPassiveIds: string[] = [],
): RewardPackage {
  const rng = new SeededRng(seed)

  const randomStatGain = isDarkhorse
    ? Math.max(BASE_STAT_GAINS[result], REWARD_WINNER)
    : BASE_STAT_GAINS[result]

  const unowned      = availableSkillIds.filter(id => !acquiredSkillIds.includes(id))
  const skillChoices = pickN(unowned, Math.min(SKILL_CHOICE_COUNT, unowned.length), rng)

  const goldMult        = sumGoldMultiplier(playerItems)
  const goldBonusPct    = calcGoldBonusPct(playerPassiveIds)
  const goldEarned      = Math.floor(GOLD_BY_RESULT[result] * goldMult * (1 + goldBonusPct / 100))

  const unownedPassives = allPassiveIds.filter(id => !playerPassiveIds.includes(id))
  const passiveChoices  = pickN(unownedPassives, Math.min(PASSIVE_CHOICE_COUNT, unownedPassives.length), rng)

  return {
    randomStatGain,
    skillChoices,
    goldEarned,
    passiveChoices,
  }
}
