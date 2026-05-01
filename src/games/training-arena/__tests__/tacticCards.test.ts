import { describe, expect, it } from 'vitest'
import type { Archetype, TacticEffectKind } from '../types'
import { TACTIC_CARDS, getTacticCard, getTacticCardsForArchetype } from '../data/tacticCards'

const ARCHETYPES: Archetype[] = [
  'warrior',
  'mage',
  'assassin',
  'tank',
  'support',
  'ranger',
  'berserker',
  'paladin',
]

const EFFECT_KINDS: TacticEffectKind[] = [
  'initiative',
  'barrier',
  'ambush',
  'mana_burst',
  'curse',
  'potion',
  'insight',
  'last_stand',
]

describe('tactic cards', () => {
  it('defines 64 cards', () => {
    expect(TACTIC_CARDS).toHaveLength(64)
  })

  it('defines exactly 8 cards for each archetype', () => {
    for (const archetype of ARCHETYPES) {
      expect(getTacticCardsForArchetype(archetype)).toHaveLength(8)
    }
  })

  it('covers each effect kind once per archetype', () => {
    for (const archetype of ARCHETYPES) {
      const kinds = getTacticCardsForArchetype(archetype).map(card => card.effect.kind)
      expect(kinds.sort()).toEqual([...EFFECT_KINDS].sort())
    }
  })

  it('gives every card two valid recommended matchups', () => {
    for (const card of TACTIC_CARDS) {
      expect(card.goodAgainst).toHaveLength(2)
      expect(card.goodAgainst.every(archetype => ARCHETYPES.includes(archetype))).toBe(true)
    }
  })

  it('can look up every card by id', () => {
    for (const card of TACTIC_CARDS) {
      expect(getTacticCard(card.id)).toBe(card)
    }
  })
})
