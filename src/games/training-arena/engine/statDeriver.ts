import type { GrowthStats, CharacterBaseCombat, CombatStats } from '../types'
import {
  CRIT_BASE_MULTIPLIER,
  CRIT_LUK_COEFF,
  CRIT_MULTIPLIER_CAP,
} from '../constants'

/**
 * Derives live CombatStats from base values + growth stats.
 * maxHp    = base.maxHp   + hp  × 10
 * atk      = base.atk     + str × 3
 * def      = base.def     + str × 1
 * spd      = base.spd     + agi × 2
 * crit     = base.crit    + luk × 0.5  (capped at 100)
 * eva      = base.eva     + agi × 0.5  (capped at 100)
 * maxMana  = base.maxMana + int × 5
 * aggression = base.aggression (fixed)
 */
export function deriveStats(
  base: CharacterBaseCombat,
  growth: GrowthStats,
): CombatStats {
  const critMultiplier = Math.min(
    CRIT_BASE_MULTIPLIER + growth.luk * CRIT_LUK_COEFF,
    CRIT_MULTIPLIER_CAP,
  )

  return {
    maxHp:        base.maxHp    + growth.hp  * 10,
    atk:          base.atk      + growth.str * 3,
    def:          base.def      + growth.str * 1,
    spd:          base.spd      + growth.agi * 2,
    crit:         Math.min(base.crit  + growth.luk * 0.5, 100),
    eva:          Math.min(base.eva   + growth.agi * 0.5, 100),
    maxMana:      base.maxMana  + growth.int * 5,
    aggression:   base.aggression,
    critMultiplier,
  }
}
