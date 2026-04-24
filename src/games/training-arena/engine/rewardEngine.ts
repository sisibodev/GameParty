import type { PlayerTournamentResult, RewardPackage } from '../types'
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

const SKILL_CHOICE_COUNT = 3

const BASE_STAT_GAINS: Record<PlayerTournamentResult, number> = {
  winner:         REWARD_WINNER,
  finalist:       REWARD_FINALIST,
  tournament_out: REWARD_TOURNAMENT_OUT,
  group_out:      2,
  qualifier_out:  1,
}

export function calcReward(
  result: PlayerTournamentResult,
  isDarkhorse: boolean,
  availableSkillIds: string[],
  acquiredSkillIds: string[],
  seed: number,
  playerItems: readonly string[] = [],
): RewardPackage {
  const rng = new SeededRng(seed)

  const randomStatGain =
    BASE_STAT_GAINS[result] + (isDarkhorse ? REWARD_DARKHORSE : 0)

  const unowned      = availableSkillIds.filter(id => !acquiredSkillIds.includes(id))
  const skillChoices = pickN(unowned, Math.min(SKILL_CHOICE_COUNT, unowned.length), rng)

  const goldMult   = sumGoldMultiplier(playerItems)
  const goldEarned = Math.floor(GOLD_BY_RESULT[result] * goldMult)

  return {
    randomStatGain,
    skillChoices,
    goldEarned,
  }
}
