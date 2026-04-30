import { describe, it, expect } from 'vitest'
import { rollShopItems, rollNpcItems } from '../engine/shopEngine'
import { SHOP_SIZE } from '../constants'
import { ITEMS } from '../data/items'

const validIds = new Set(ITEMS.map(i => i.id))
const validTiers = new Set(['common', 'rare', 'hero', 'legend'])

describe('rollShopItems', () => {
  it(`returns exactly SHOP_SIZE (${SHOP_SIZE}) items`, () => {
    expect(rollShopItems(42)).toHaveLength(SHOP_SIZE)
  })

  it('all returned items are from the ITEMS catalog', () => {
    const result = rollShopItems(42)
    for (const item of result) expect(validIds.has(item.id)).toBe(true)
  })

  it('all items have a valid tier', () => {
    const result = rollShopItems(42)
    for (const item of result) expect(validTiers.has(item.tier)).toBe(true)
  })

  it('is deterministic with the same seed', () => {
    const r1 = rollShopItems(99)
    const r2 = rollShopItems(99)
    expect(r1.map(i => i.id)).toEqual(r2.map(i => i.id))
  })

  it('different seeds produce different results', () => {
    const sets = new Set<string>()
    for (let seed = 0; seed < 20; seed++) {
      sets.add(JSON.stringify(rollShopItems(seed).map(i => i.id)))
    }
    expect(sets.size).toBeGreaterThan(1)
  })

  it('produces legend-tier items across many seeds', () => {
    let found = false
    for (let seed = 0; seed < 500 && !found; seed++) {
      if (rollShopItems(seed).some(i => i.tier === 'legend')) found = true
    }
    expect(found).toBe(true)
  })

  it('produces hero-tier items across many seeds', () => {
    let found = false
    for (let seed = 0; seed < 200 && !found; seed++) {
      if (rollShopItems(seed).some(i => i.tier === 'hero')) found = true
    }
    expect(found).toBe(true)
  })
})

describe('rollNpcItems', () => {
  it('returns empty array for count 0', () => {
    expect(rollNpcItems(0, 1, 42)).toHaveLength(0)
  })

  it('returns empty array for negative count', () => {
    expect(rollNpcItems(-5, 1, 42)).toHaveLength(0)
  })

  it('returns exactly count items', () => {
    expect(rollNpcItems(3, 1, 42)).toHaveLength(3)
  })

  it('all returned IDs are valid item IDs', () => {
    const result = rollNpcItems(5, 3, 42)
    for (const id of result) expect(validIds.has(id)).toBe(true)
  })

  it('is deterministic with the same seed', () => {
    const r1 = rollNpcItems(4, 2, 77)
    const r2 = rollNpcItems(4, 2, 77)
    expect(r1).toEqual(r2)
  })

  it('higher round produces more hero/legend items', () => {
    const N = 500
    let lowCount = 0
    let highCount = 0
    for (let seed = 0; seed < N; seed++) {
      if (rollNpcItems(1, 1, seed).length > 0) {
        const idLow = rollNpcItems(1, 1, seed)[0]
        const tierLow = ITEMS.find(i => i.id === idLow)?.tier
        if (tierLow === 'hero' || tierLow === 'legend') lowCount++
      }
      if (rollNpcItems(1, 7, seed).length > 0) {
        const idHigh = rollNpcItems(1, 7, seed)[0]
        const tierHigh = ITEMS.find(i => i.id === idHigh)?.tier
        if (tierHigh === 'hero' || tierHigh === 'legend') highCount++
      }
    }
    expect(highCount).toBeGreaterThan(lowCount)
  })
})
