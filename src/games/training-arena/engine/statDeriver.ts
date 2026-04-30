import type { GrowthStats, CharacterBaseCombat, CombatStats } from '../types'
import {
  CRIT_BASE_MULTIPLIER,
  CRIT_LUK_COEFF,
  CRIT_MULTIPLIER_CAP,
  ARCHETYPE_GROWTH_COEFFS,
} from '../constants'

// v0.7.0: 12 전투 스탯 산출 — 1차 변환 + 보조 (보조는 영점, Phase 4 부여)
export function deriveStats(
  base: CharacterBaseCombat,
  growth: GrowthStats,
  archetype = 'warrior',
): CombatStats {
  const c = ARCHETYPE_GROWTH_COEFFS[archetype] ?? ARCHETYPE_GROWTH_COEFFS['warrior']

  const maxHp =
    base.maxHp +
    growth.vit * c.vit_to_maxHp

  const maxMana =
    base.maxMana +
    growth.int * c.int_to_maxMana

  const pAtk =
    base.pAtk +
    growth.str * c.str_to_pAtk +
    growth.vit * c.vit_to_pAtk +
    growth.agi * c.agi_to_pAtk +
    growth.int * c.int_to_pAtk

  const mAtk =
    base.mAtk +
    growth.int * c.int_to_mAtk +
    growth.vit * c.vit_to_mAtk +
    growth.str * c.str_to_mAtk

  const pDef =
    base.pDef +
    growth.vit * c.vit_to_pDef +
    growth.str * c.str_to_pDef +
    growth.int * c.int_to_pDef

  const mDef =
    base.mDef +
    growth.int * c.int_to_mDef +
    growth.vit * c.vit_to_mDef

  const spd =
    base.spd +
    growth.agi * c.agi_to_spd +
    growth.str * c.str_to_spd +
    growth.int * c.int_to_spd

  const acc = Math.min(
    base.acc +
      growth.agi * c.agi_to_acc +
      growth.luk * c.luk_to_acc,
    100,
  )

  const eva = Math.min(
    base.eva +
      growth.agi * c.agi_to_eva +
      growth.luk * c.luk_to_eva,
    100,
  )

  const crit = Math.min(
    base.crit +
      growth.luk * c.luk_to_crit +
      growth.str * c.str_to_crit,
    100,
  )

  const critDmg = Math.min(
    CRIT_BASE_MULTIPLIER +
      growth.luk * (c.luk_to_critDmg || CRIT_LUK_COEFF) +
      growth.agi * c.agi_to_critDmg,
    CRIT_MULTIPLIER_CAP,
  )

  return {
    maxHp,
    maxMana,
    pAtk,
    mAtk,
    pDef,
    mDef,
    spd,
    acc,
    eva,
    crit,
    critDmg,
    pen: 0, // 패시브·아이템에서만 부여 (성장 0)
    aggression: base.aggression,
  }
}
