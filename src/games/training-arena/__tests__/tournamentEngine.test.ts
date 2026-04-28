import { describe, it, expect } from 'vitest'
import { runTournament } from '../engine/tournamentEngine'
import type { CharacterDef, GrowthStats } from '../types'
import { GROUP_COUNT } from '../constants'

const ZERO_GROWTH: GrowthStats = { hp: 0, str: 0, agi: 0, int: 0, luk: 0 }

function makeChar(id: number): CharacterDef {
  return {
    id,
    name: `char_${id}`,
    description: '',
    archetype: 'warrior',
    baseCombat: { maxHp: 50, atk: 20, def: 10, spd: 5, crit: 20, eva: 5, maxMana: 20, aggression: 10 },
  }
}

// 32 participants → skip qualifier, run groups + bracket
const CHARS_32 = Array.from({ length: 32 }, (_, i) => makeChar(i + 1))
const GROWTH_MAP_32 = Object.fromEntries(CHARS_32.map(c => [c.id, ZERO_GROWTH]))
const SKILL_MAP_32  = Object.fromEntries(CHARS_32.map(c => [c.id, [] as string[]]))

// 40 participants → qualifier runs to reduce to 32
const CHARS_40 = Array.from({ length: 40 }, (_, i) => makeChar(i + 1))
const GROWTH_MAP_40 = Object.fromEntries(CHARS_40.map(c => [c.id, ZERO_GROWTH]))
const SKILL_MAP_40  = Object.fromEntries(CHARS_40.map(c => [c.id, [] as string[]]))

describe('runTournament', () => {
  it('winner is one of the participants', () => {
    const ids = new Set(CHARS_32.map(c => c.id))
    const result = runTournament(CHARS_32, GROWTH_MAP_32, SKILL_MAP_32, 42, 1)
    expect(ids.has(result.winner)).toBe(true)
  })

  it('winner is in finalists', () => {
    const result = runTournament(CHARS_32, GROWTH_MAP_32, SKILL_MAP_32, 42, 1)
    expect(result.finalists).toContain(result.winner)
  })

  it(`produces exactly ${GROUP_COUNT} groups`, () => {
    const result = runTournament(CHARS_32, GROWTH_MAP_32, SKILL_MAP_32, 42, 1)
    expect(result.groups).toHaveLength(GROUP_COUNT)
  })

  it('finalists length is GROUP_COUNT * 2', () => {
    const result = runTournament(CHARS_32, GROWTH_MAP_32, SKILL_MAP_32, 42, 1)
    expect(result.finalists).toHaveLength(GROUP_COUNT * 2)
  })

  it('qualifiers length is 32 (no elim when starting with 32)', () => {
    const result = runTournament(CHARS_32, GROWTH_MAP_32, SKILL_MAP_32, 42, 1)
    expect(result.qualifiers).toHaveLength(32)
  })

  it('allMatches is non-empty', () => {
    const result = runTournament(CHARS_32, GROWTH_MAP_32, SKILL_MAP_32, 42, 1)
    expect(result.allMatches.length).toBeGreaterThan(0)
  })

  it('all match participants are valid IDs', () => {
    const ids = new Set(CHARS_32.map(c => c.id))
    const result = runTournament(CHARS_32, GROWTH_MAP_32, SKILL_MAP_32, 42, 1)
    for (const m of result.allMatches) {
      expect(ids.has(m.char1Id)).toBe(true)
      expect(ids.has(m.char2Id)).toBe(true)
    }
  })

  it('is deterministic with same seed', () => {
    const r1 = runTournament(CHARS_32, GROWTH_MAP_32, SKILL_MAP_32, 99, 1)
    const r2 = runTournament(CHARS_32, GROWTH_MAP_32, SKILL_MAP_32, 99, 1)
    expect(r1.winner).toBe(r2.winner)
    expect(r1.finalists.slice().sort()).toEqual(r2.finalists.slice().sort())
  })

  it('different seeds can produce different winners', () => {
    const winners = new Set<number>()
    for (let seed = 0; seed < 30; seed++) {
      winners.add(runTournament(CHARS_32, GROWTH_MAP_32, SKILL_MAP_32, seed, 1).winner)
    }
    expect(winners.size).toBeGreaterThan(1)
  })

  it('bracketEliminations does not include the winner', () => {
    const result = runTournament(CHARS_32, GROWTH_MAP_32, SKILL_MAP_32, 42, 1)
    expect(result.bracketEliminations[result.winner]).toBeUndefined()
  })

  it('bracketEliminations covers all finalists except winner', () => {
    const result = runTournament(CHARS_32, GROWTH_MAP_32, SKILL_MAP_32, 42, 1)
    for (const id of result.finalists) {
      if (id !== result.winner) {
        expect(result.bracketEliminations[id]).toBeDefined()
      }
    }
  })

  it('tournamentId encodes seed and round', () => {
    const result = runTournament(CHARS_32, GROWTH_MAP_32, SKILL_MAP_32, 777, 3)
    expect(result.tournamentId).toContain('777')
    expect(result.tournamentId).toContain('r3')
  })

  it('qualifier stage eliminates extras when participants > 32', () => {
    const result = runTournament(CHARS_40, GROWTH_MAP_40, SKILL_MAP_40, 42, 1)
    expect(result.qualifiers).toHaveLength(32)
  })

  it('allMatches includes qualifier stage when participants > 32', () => {
    const result = runTournament(CHARS_40, GROWTH_MAP_40, SKILL_MAP_40, 42, 1)
    expect(result.allMatches.some(m => m.stage === 'qualifier')).toBe(true)
  })

  it('allMatches includes group and bracket stages', () => {
    const result = runTournament(CHARS_32, GROWTH_MAP_32, SKILL_MAP_32, 42, 1)
    expect(result.allMatches.some(m => m.stage === 'group')).toBe(true)
    expect(result.allMatches.some(m => m.stage === 'bracket')).toBe(true)
  })

  it('finalists are a subset of qualifiers', () => {
    const result = runTournament(CHARS_32, GROWTH_MAP_32, SKILL_MAP_32, 42, 1)
    const qualSet = new Set(result.qualifiers)
    for (const id of result.finalists) expect(qualSet.has(id)).toBe(true)
  })

  it('each group has rank1 and rank2 set and they differ', () => {
    const result = runTournament(CHARS_32, GROWTH_MAP_32, SKILL_MAP_32, 42, 1)
    for (const g of result.groups) {
      expect(g.rank1).toBeDefined()
      expect(g.rank2).toBeDefined()
      expect(g.rank1).not.toBe(g.rank2)
    }
  })

  it('each group has exactly 2 eliminated', () => {
    const result = runTournament(CHARS_32, GROWTH_MAP_32, SKILL_MAP_32, 42, 1)
    for (const g of result.groups) {
      expect(g.eliminated).toHaveLength(2)
    }
  })
})
