import { describe, it, expect } from 'vitest'
import { runGacha } from '../engine/gachaEngine'
import { GACHA_GRADES, GACHA_STAT_RANGES, GROWTH_STAT_KEYS } from '../constants'

const ALL_CHAR_IDS = [1, 2, 3, 4, 5, 6, 7, 8]
const PLAYER_ID = 1

describe('runGacha', () => {
  it('returns one card per charId', () => {
    const result = runGacha(PLAYER_ID, ALL_CHAR_IDS, 42)
    expect(result.cards).toHaveLength(ALL_CHAR_IDS.length)
    const ids = result.cards.map(c => c.targetCharId)
    for (const id of ALL_CHAR_IDS) expect(ids).toContain(id)
  })

  it('playerGains only contains cards targeting playerCharId', () => {
    const result = runGacha(PLAYER_ID, ALL_CHAR_IDS, 42)
    for (const card of result.playerGains) {
      expect(card.targetCharId).toBe(PLAYER_ID)
    }
  })

  it('playerGains count matches cards filtered for playerCharId', () => {
    const result = runGacha(PLAYER_ID, ALL_CHAR_IDS, 42)
    const expected = result.cards.filter(c => c.targetCharId === PLAYER_ID).length
    expect(result.playerGains).toHaveLength(expected)
  })

  it('is deterministic with same seed', () => {
    const r1 = runGacha(PLAYER_ID, ALL_CHAR_IDS, 999)
    const r2 = runGacha(PLAYER_ID, ALL_CHAR_IDS, 999)
    expect(r1.cards).toEqual(r2.cards)
  })

  it('each card has a valid grade', () => {
    const result = runGacha(PLAYER_ID, ALL_CHAR_IDS, 100)
    for (const card of result.cards) {
      expect(GACHA_GRADES).toContain(card.grade)
    }
  })

  it('each card has a valid statKey', () => {
    const result = runGacha(PLAYER_ID, ALL_CHAR_IDS, 100)
    for (const card of result.cards) {
      expect(GROWTH_STAT_KEYS).toContain(card.statKey)
    }
  })

  it('each card statGain is within the grade range', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const card of runGacha(PLAYER_ID, ALL_CHAR_IDS, seed).cards) {
        const [min, max] = GACHA_STAT_RANGES[card.grade]
        expect(card.statGain).toBeGreaterThanOrEqual(min)
        expect(card.statGain).toBeLessThanOrEqual(max)
      }
    }
  })

  it('SSS grade statGain is in [13, 18]', () => {
    let found = false
    for (let seed = 0; seed < 2000 && !found; seed++) {
      const sss = runGacha(PLAYER_ID, ALL_CHAR_IDS, seed).cards.find(c => c.grade === 'SSS')
      if (sss) {
        expect(sss.statGain).toBeGreaterThanOrEqual(13)
        expect(sss.statGain).toBeLessThanOrEqual(18)
        found = true
      }
    }
    expect(found).toBe(true)
  })

  it('C grade statGain is in [1, 2]', () => {
    let found = false
    for (let seed = 0; seed < 50 && !found; seed++) {
      const c = runGacha(PLAYER_ID, ALL_CHAR_IDS, seed).cards.find(card => card.grade === 'C')
      if (c) {
        expect(c.statGain).toBeGreaterThanOrEqual(1)
        expect(c.statGain).toBeLessThanOrEqual(2)
        found = true
      }
    }
    expect(found).toBe(true)
  })

  it('all grades appear across many seeds', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 500; seed++) {
      for (const card of runGacha(PLAYER_ID, ALL_CHAR_IDS, seed).cards) seen.add(card.grade)
    }
    for (const grade of GACHA_GRADES) expect(seen.has(grade)).toBe(true)
  })

  it('handles empty allCharIds', () => {
    const result = runGacha(PLAYER_ID, [], 42)
    expect(result.cards).toHaveLength(0)
    expect(result.playerGains).toHaveLength(0)
  })
})
