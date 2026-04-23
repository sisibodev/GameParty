import type { GrowthStats, CharacterBaseCombat, CombatStats } from '../types'
import {
  CRIT_BASE_MULTIPLIER,
  CRIT_LUK_COEFF,
  CRIT_MULTIPLIER_CAP,
  ARCHETYPE_GROWTH_COEFFS,
} from '../constants'

export function deriveStats(
  base: CharacterBaseCombat,
  growth: GrowthStats,
  archetype = 'warrior',
): CombatStats {
  const c = ARCHETYPE_GROWTH_COEFFS[archetype] ?? ARCHETYPE_GROWTH_COEFFS['warrior']

  const maxHp   = base.maxHp   + growth.hp  * c.hp_to_maxHp + growth.int * c.int_to_maxHp
  const atk     = base.atk     + growth.str * c.str_to_atk   + growth.int * c.int_to_atk
  const def     = base.def     + growth.str * c.str_to_def   + growth.hp  * c.hp_to_def
  const spd     = base.spd     + growth.agi * c.agi_to_spd   + growth.int * c.int_to_spd + growth.str * c.str_to_spd
  const crit    = Math.min(
    base.crit + growth.luk * c.luk_to_crit + growth.str * c.str_to_crit,
    100,
  )
  const eva     = Math.min(
    base.eva  + growth.agi * c.agi_to_eva   + growth.luk * c.luk_to_eva,
    100,
  )
  const maxMana = base.maxMana + growth.int * c.int_to_mana

  const critMultiplier = Math.min(
    CRIT_BASE_MULTIPLIER + growth.luk * CRIT_LUK_COEFF,
    CRIT_MULTIPLIER_CAP,
  )

  return { maxHp, atk, def, spd, crit, eva, maxMana, aggression: base.aggression, critMultiplier }
}
