import { describe, it, expect } from 'vitest'
import { calcReward } from '../engine/rewardEngine'
import { GOLD_BY_RESULT, REWARD_DARKHORSE, REWARD_FINALIST, REWARD_TOURNAMENT_OUT, REWARD_WINNER } from '../constants'

const ALL_SKILLS = ['sk_a', 'sk_b', 'sk_c', 'sk_d', 'sk_e', 'sk_f']
const SEED = 42

describe('calcReward', () => {
  describe('randomStatGain by result type', () => {
    it('winner gets REWARD_WINNER (10)', () => {
      expect(calcReward('winner', false, ALL_SKILLS, [], SEED).randomStatGain).toBe(REWARD_WINNER)
    })

    it('finalist gets REWARD_FINALIST (7)', () => {
      expect(calcReward('finalist', false, ALL_SKILLS, [], SEED).randomStatGain).toBe(REWARD_FINALIST)
    })

    it('tournament_out gets REWARD_TOURNAMENT_OUT (4)', () => {
      expect(calcReward('tournament_out', false, ALL_SKILLS, [], SEED).randomStatGain).toBe(REWARD_TOURNAMENT_OUT)
    })

    it('group_out gets 2', () => {
      expect(calcReward('group_out', false, ALL_SKILLS, [], SEED).randomStatGain).toBe(2)
    })

    it('qualifier_out gets 1', () => {
      expect(calcReward('qualifier_out', false, ALL_SKILLS, [], SEED).randomStatGain).toBe(1)
    })

    it('darkhorse gets at least REWARD_WINNER bonus', () => {
      const base = calcReward('finalist', false, ALL_SKILLS, [], SEED).randomStatGain
      const dark = calcReward('finalist', true, ALL_SKILLS, [], SEED).randomStatGain
      expect(dark).toBeGreaterThanOrEqual(REWARD_WINNER)
      expect(dark).toBeGreaterThanOrEqual(base)
    })

    it('darkhorse is not less than REWARD_WINNER for every result type', () => {
      const types = ['winner', 'finalist', 'tournament_out', 'group_out', 'qualifier_out'] as const
      for (const type of types) {
        const dark = calcReward(type, true, [], [], SEED).randomStatGain
        expect(dark).toBeGreaterThanOrEqual(REWARD_WINNER)
      }
    })
  })

  describe('skillChoices', () => {
    it('contains at most 3 entries', () => {
      expect(calcReward('winner', false, ALL_SKILLS, [], SEED).skillChoices.length).toBeLessThanOrEqual(3)
    })

    it('does not include already-acquired skills', () => {
      const acquired = ['sk_a', 'sk_b']
      const result = calcReward('winner', false, ALL_SKILLS, acquired, SEED)
      for (const id of result.skillChoices) expect(acquired).not.toContain(id)
    })

    it('all choices are from availableSkillIds', () => {
      const result = calcReward('winner', false, ALL_SKILLS, [], SEED)
      for (const id of result.skillChoices) expect(ALL_SKILLS).toContain(id)
    })

    it('returns fewer choices when fewer unowned skills exist', () => {
      const acquired = ['sk_a', 'sk_b', 'sk_c', 'sk_d', 'sk_e']
      const result = calcReward('winner', false, ALL_SKILLS, acquired, SEED)
      expect(result.skillChoices).toHaveLength(1)
      expect(result.skillChoices[0]).toBe('sk_f')
    })

    it('returns 0 choices when all skills are acquired', () => {
      expect(calcReward('winner', false, ALL_SKILLS, ALL_SKILLS, SEED).skillChoices).toHaveLength(0)
    })
  })

  describe('goldEarned', () => {
    it('winner gold equals GOLD_BY_RESULT.winner with no items', () => {
      expect(calcReward('winner', false, ALL_SKILLS, [], SEED, []).goldEarned).toBe(GOLD_BY_RESULT.winner)
    })

    it('qualifier_out gold equals GOLD_BY_RESULT.qualifier_out with no items', () => {
      expect(calcReward('qualifier_out', false, ALL_SKILLS, [], SEED, []).goldEarned).toBe(GOLD_BY_RESULT.qualifier_out)
    })

    it('higher result tiers earn more gold', () => {
      const winner   = calcReward('winner',   false, [], [], SEED, []).goldEarned
      const finalist = calcReward('finalist', false, [], [], SEED, []).goldEarned
      const groupOut = calcReward('group_out',false, [], [], SEED, []).goldEarned
      expect(winner).toBeGreaterThan(finalist)
      expect(finalist).toBeGreaterThan(groupOut)
    })
  })

  it('same seed produces same skillChoices (deterministic)', () => {
    const r1 = calcReward('winner', false, ALL_SKILLS, [], SEED)
    const r2 = calcReward('winner', false, ALL_SKILLS, [], SEED)
    expect(r1.skillChoices).toEqual(r2.skillChoices)
    expect(r1.goldEarned).toBe(r2.goldEarned)
  })
})
