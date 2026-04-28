import { describe, it, expect } from 'vitest'
import { SeededRng, randomSeed } from '../utils/rng'

describe('SeededRng', () => {
  it('same seed produces same sequence', () => {
    const r1 = new SeededRng(12345)
    const r2 = new SeededRng(12345)
    for (let i = 0; i < 20; i++) {
      expect(r1.next()).toBe(r2.next())
    }
  })

  it('next() returns values in [0, 1)', () => {
    const rng = new SeededRng(99)
    for (let i = 0; i < 200; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('different seeds produce different sequences', () => {
    const seq1 = Array.from({ length: 10 }, (_, i) => new SeededRng(100 + i).next())
    const seq2 = Array.from({ length: 10 }, (_, i) => new SeededRng(200 + i).next())
    expect(seq1).not.toEqual(seq2)
  })

  describe('int(min, max)', () => {
    it('returns values in [min, max)', () => {
      const rng = new SeededRng(42)
      for (let i = 0; i < 200; i++) {
        const v = rng.int(5, 10)
        expect(v).toBeGreaterThanOrEqual(5)
        expect(v).toBeLessThan(10)
      }
    })

    it('covers all integer values in range across many samples', () => {
      const rng = new SeededRng(1)
      const seen = new Set<number>()
      for (let i = 0; i < 2000; i++) seen.add(rng.int(0, 5))
      expect(seen.size).toBe(5)
    })

    it('always returns min when range is 1 (min === max - 1)', () => {
      const rng = new SeededRng(7)
      for (let i = 0; i < 20; i++) {
        expect(rng.int(3, 4)).toBe(3)
      }
    })
  })

  describe('chance(probability)', () => {
    it('chance(0) always returns false', () => {
      const rng = new SeededRng(7)
      for (let i = 0; i < 100; i++) expect(rng.chance(0)).toBe(false)
    })

    it('chance(1) always returns true', () => {
      const rng = new SeededRng(7)
      for (let i = 0; i < 100; i++) expect(rng.chance(1)).toBe(true)
    })

    it('chance(0.5) is roughly 50% over many samples', () => {
      const rng = new SeededRng(333)
      let trueCount = 0
      const N = 2000
      for (let i = 0; i < N; i++) if (rng.chance(0.5)) trueCount++
      expect(trueCount).toBeGreaterThan(N * 0.40)
      expect(trueCount).toBeLessThan(N * 0.60)
    })

    it('higher probability produces more true results', () => {
      const rng90 = new SeededRng(1)
      const rng10 = new SeededRng(1)
      let count90 = 0, count10 = 0
      for (let i = 0; i < 1000; i++) {
        if (rng90.chance(0.9)) count90++
        if (rng10.chance(0.1)) count10++
      }
      expect(count90).toBeGreaterThan(count10)
    })
  })

  describe('pick(arr)', () => {
    it('returns an element from the array', () => {
      const rng = new SeededRng(10)
      const arr = ['a', 'b', 'c', 'd', 'e']
      for (let i = 0; i < 50; i++) expect(arr).toContain(rng.pick(arr))
    })

    it('covers all elements across many calls', () => {
      const rng = new SeededRng(1)
      const arr = [1, 2, 3, 4, 5]
      const seen = new Set<number>()
      for (let i = 0; i < 500; i++) seen.add(rng.pick(arr))
      expect(seen.size).toBe(5)
    })
  })
})

describe('randomSeed', () => {
  it('returns a non-negative integer below 1_000_000', () => {
    for (let i = 0; i < 20; i++) {
      const s = randomSeed()
      expect(Number.isInteger(s)).toBe(true)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThan(1_000_000)
    }
  })
})
