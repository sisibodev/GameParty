import { describe, it, expect } from 'vitest'
import { simulateMatch, regenHpBetweenMatches } from '../engine/battleEngine'
import type { BattleCharState } from '../types'

function makeState(id: number, hp = 100): BattleCharState {
  return {
    charId: id, currentHp: hp, currentMana: 5, gauge: 0,
    buffs: [], debuffs: [], cooldowns: {},
    skills: ['atk_01'],
    passives: [],
    items: [],
    skillEnhancements: {},
    growthStats: { vit: 0, str: 0, agi: 0, int: 0, luk: 0 },
    baseCombat: { maxHp: hp, pAtk: 20, mAtk: 8, pDef: 10, mDef: 6, spd: 5, crit: 10, eva: 5, acc: 80, maxMana: 10, aggression: 50 },
    archetype: 'warrior',
  }
}

describe('simulateMatch', () => {
  it('same seed produces same winner (determinism)', () => {
    const r1 = simulateMatch(makeState(1), makeState(2), 42)
    const r2 = simulateMatch(makeState(1), makeState(2), 42)
    expect(r1.winnerId).toBe(r2.winnerId)
    expect(r1.totalTurns).toBe(r2.totalTurns)
  })

  it('different seeds can produce different outcomes', () => {
    const results = new Set<number>()
    for (let seed = 0; seed < 20; seed++) {
      results.add(simulateMatch(makeState(1), makeState(2), seed).winnerId)
    }
    expect(results.size).toBeGreaterThan(1)
  })

  it('result has winnerId set to one of the two charIds', () => {
    const r = simulateMatch(makeState(10), makeState(20), 7)
    expect([10, 20]).toContain(r.winnerId)
  })

  it('result has loserId set to the other charId', () => {
    const r = simulateMatch(makeState(10), makeState(20), 7)
    expect([10, 20]).toContain(r.loserId)
    expect(r.loserId).not.toBe(r.winnerId)
  })

  it('winnerId and loserId together equal both participants', () => {
    const r = simulateMatch(makeState(5), makeState(6), 99)
    expect(new Set([r.winnerId, r.loserId])).toEqual(new Set([5, 6]))
  })

  it('log entries reference only the two participant charIds', () => {
    const r = simulateMatch(makeState(1), makeState(2), 3)
    for (const entry of r.log) {
      expect([1, 2]).toContain(entry.actorId)
      expect([1, 2]).toContain(entry.targetId)
    }
  })

  it('totalTurns is at least 1', () => {
    const r = simulateMatch(makeState(1), makeState(2), 0)
    expect(r.totalTurns).toBeGreaterThanOrEqual(1)
  })
})

describe('regenHpBetweenMatches', () => {
  it('30 hp + 30% of 100 maxHp = 60', () => {
    expect(regenHpBetweenMatches(30, 100, 0.30)).toBe(60)
  })

  it('80 hp + 30% of 100 maxHp is capped at maxHp 100', () => {
    expect(regenHpBetweenMatches(80, 100, 0.30)).toBe(100)
  })

  it('0 hp + 50% of 200 maxHp = 100', () => {
    expect(regenHpBetweenMatches(0, 200, 0.50)).toBe(100)
  })

  it('already at maxHp stays at maxHp', () => {
    expect(regenHpBetweenMatches(100, 100, 0.30)).toBe(100)
  })
})
