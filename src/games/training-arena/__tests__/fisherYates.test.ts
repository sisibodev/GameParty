import { describe, it, expect } from 'vitest'
import { shuffle, pickN } from '../utils/fisherYates'
import { SeededRng } from '../utils/rng'

describe('shuffle', () => {
  it('preserves all elements', () => {
    const arr = [1, 2, 3, 4, 5]
    const result = shuffle(arr, new SeededRng(42))
    expect([...result].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
  })

  it('does not mutate the original array', () => {
    const arr = [1, 2, 3, 4, 5]
    shuffle(arr, new SeededRng(42))
    expect(arr).toEqual([1, 2, 3, 4, 5])
  })

  it('same seed produces identical shuffle', () => {
    const arr = [1, 2, 3, 4, 5]
    expect(shuffle(arr, new SeededRng(99))).toEqual(shuffle(arr, new SeededRng(99)))
  })

  it('produces multiple distinct orderings across seeds', () => {
    const arr = [1, 2, 3, 4]
    const orderings = new Set<string>()
    for (let seed = 0; seed < 200; seed++) {
      orderings.add(JSON.stringify(shuffle(arr, new SeededRng(seed))))
    }
    expect(orderings.size).toBeGreaterThan(10)
  })

  it('handles empty array', () => {
    expect(shuffle([], new SeededRng(0))).toEqual([])
  })

  it('handles single element', () => {
    expect(shuffle([42], new SeededRng(0))).toEqual([42])
  })

  it('result has same length as input', () => {
    const arr = [10, 20, 30, 40, 50, 60]
    expect(shuffle(arr, new SeededRng(7))).toHaveLength(arr.length)
  })
})

describe('pickN', () => {
  it('returns exactly N elements', () => {
    expect(pickN([1, 2, 3, 4, 5], 3, new SeededRng(7))).toHaveLength(3)
  })

  it('returned elements have no duplicates when input has none', () => {
    const result = pickN([1, 2, 3, 4, 5], 5, new SeededRng(7))
    expect(new Set(result).size).toBe(5)
  })

  it('all returned elements are from the source array', () => {
    const arr = ['a', 'b', 'c', 'd', 'e']
    const result = pickN(arr, 3, new SeededRng(100))
    for (const item of result) expect(arr).toContain(item)
  })

  it('returns all elements when n >= arr.length', () => {
    const arr = [1, 2, 3]
    const result = pickN(arr, 10, new SeededRng(7))
    expect(result).toHaveLength(3)
    expect([...result].sort((a, b) => a - b)).toEqual([1, 2, 3])
  })

  it('returns empty array when n = 0', () => {
    expect(pickN([1, 2, 3], 0, new SeededRng(0))).toHaveLength(0)
  })

  it('same seed produces same selection', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(pickN(arr, 4, new SeededRng(55))).toEqual(pickN(arr, 4, new SeededRng(55)))
  })

  it('covers all elements across different seeds', () => {
    const arr = [1, 2, 3, 4, 5]
    const seen = new Set<number>()
    for (let seed = 0; seed < 100; seed++) {
      for (const v of pickN(arr, 2, new SeededRng(seed))) seen.add(v)
    }
    expect(seen.size).toBe(5)
  })
})
