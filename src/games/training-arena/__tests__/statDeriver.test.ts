import { describe, it, expect } from 'vitest'
import { deriveStats } from '../engine/statDeriver'
import type { CharacterBaseCombat, GrowthStats } from '../types'
import { ARCHETYPE_GROWTH_COEFFS, CRIT_BASE_MULTIPLIER, CRIT_MULTIPLIER_CAP } from '../constants'

const base: CharacterBaseCombat = {
  maxHp: 100, maxMana: 10, pAtk: 20, mAtk: 8, pDef: 10, mDef: 6,
  spd: 5, acc: 80, crit: 10, eva: 5, aggression: 50,
}
const zero: GrowthStats = { vit: 0, str: 0, agi: 0, int: 0, luk: 0 }

describe('deriveStats', () => {
  it('returns base stats unchanged when all growth is zero', () => {
    const r = deriveStats(base, zero, 'warrior')
    expect(r.maxHp).toBe(100)
    expect(r.pAtk).toBe(20)
    expect(r.pDef).toBe(10)
    expect(r.spd).toBe(5)
    expect(r.maxMana).toBe(10)
    expect(r.aggression).toBe(50)
  })

  it('str growth adds pAtk via str_to_pAtk (3)', () => {
    const c = ARCHETYPE_GROWTH_COEFFS['warrior']
    const r = deriveStats(base, { ...zero, str: 10 }, 'warrior')
    expect(r.pAtk).toBeCloseTo(20 + 10 * c.str_to_pAtk)
  })

  it('int growth adds mAtk via int_to_mAtk (3)', () => {
    const c = ARCHETYPE_GROWTH_COEFFS['mage']
    const r = deriveStats(base, { ...zero, int: 10 }, 'mage')
    expect(r.mAtk).toBeCloseTo(8 + 10 * c.int_to_mAtk)
  })

  it('vit growth adds maxHp via vit_to_maxHp (10)', () => {
    const c = ARCHETYPE_GROWTH_COEFFS['warrior']
    const r = deriveStats(base, { ...zero, vit: 10 }, 'warrior')
    expect(r.maxHp).toBeCloseTo(100 + 10 * c.vit_to_maxHp)
  })

  it('vit growth adds pDef via vit_to_pDef (0.5)', () => {
    const c = ARCHETYPE_GROWTH_COEFFS['warrior']
    const r = deriveStats(base, { ...zero, vit: 10 }, 'warrior')
    expect(r.pDef).toBeCloseTo(10 + 10 * c.vit_to_pDef)
  })

  it('agi growth adds spd and eva', () => {
    const c = ARCHETYPE_GROWTH_COEFFS['assassin']
    const r = deriveStats(base, { ...zero, agi: 10 }, 'assassin')
    expect(r.spd).toBeCloseTo(5 + 10 * c.agi_to_spd)
    expect(r.eva).toBeCloseTo(5 + 10 * c.agi_to_eva)
  })

  it('int growth adds maxMana via int_to_maxMana (5)', () => {
    const c = ARCHETYPE_GROWTH_COEFFS['warrior']
    const r = deriveStats(base, { ...zero, int: 10 }, 'warrior')
    expect(r.maxMana).toBeCloseTo(10 + 10 * c.int_to_maxMana)
  })

  it('crit is capped at 100', () => {
    const r = deriveStats(base, { ...zero, luk: 9999 }, 'warrior')
    expect(r.crit).toBeLessThanOrEqual(100)
  })

  it('eva is capped at 100', () => {
    const r = deriveStats(base, { ...zero, agi: 9999 }, 'assassin')
    expect(r.eva).toBeLessThanOrEqual(100)
  })

  it('critDmg is capped at CRIT_MULTIPLIER_CAP (3.0)', () => {
    const r = deriveStats(base, { ...zero, luk: 9999 }, 'warrior')
    expect(r.critDmg).toBeLessThanOrEqual(CRIT_MULTIPLIER_CAP)
  })

  it('critDmg equals CRIT_BASE_MULTIPLIER (1.5) with zero luk', () => {
    const r = deriveStats(base, zero, 'warrior')
    expect(r.critDmg).toBe(CRIT_BASE_MULTIPLIER)
  })

  it('aggression is passed through unchanged from base', () => {
    const r = deriveStats({ ...base, aggression: 75 }, zero, 'warrior')
    expect(r.aggression).toBe(75)
  })

  it('unknown archetype falls back to warrior coefficients', () => {
    const unknown = deriveStats(base, { ...zero, str: 5 }, 'unknown_archetype')
    const warrior = deriveStats(base, { ...zero, str: 5 }, 'warrior')
    expect(unknown.pAtk).toBe(warrior.pAtk)
    expect(unknown.pDef).toBe(warrior.pDef)
  })

  it('str growth is proportional: doubling str doubles the str contribution to pAtk', () => {
    const r10 = deriveStats(base, { ...zero, str: 10 }, 'warrior')
    const r20 = deriveStats(base, { ...zero, str: 20 }, 'warrior')
    expect(r20.pAtk - base.pAtk).toBeCloseTo(2 * (r10.pAtk - base.pAtk))
  })

  it('all 8 archetypes produce valid positive stats with growth 10', () => {
    const archetypes = ['warrior', 'mage', 'assassin', 'tank', 'support', 'ranger', 'berserker', 'paladin']
    const g: GrowthStats = { vit: 10, str: 10, agi: 10, int: 10, luk: 10 }
    for (const archetype of archetypes) {
      const r = deriveStats(base, g, archetype)
      expect(r.maxHp).toBeGreaterThan(0)
      expect(r.pAtk).toBeGreaterThan(0)
      expect(r.spd).toBeGreaterThan(0)
    }
  })
})
