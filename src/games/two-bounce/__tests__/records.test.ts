import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadBestRecords,
  saveBestRecord,
  clearBestRecords,
  isBetterRecord,
} from '../utils/records'
import type { TwoBounceRunResult, TwoBounceBestRecord } from '../types'

// ─── localStorage mock ────────────────────────────────────────────────────────

function makeLocalStorageMock() {
  const store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { for (const k in store) delete store[k] }),
  }
}

let mockStorage = makeLocalStorageMock()

beforeEach(() => {
  mockStorage = makeLocalStorageMock()
  vi.stubGlobal('localStorage', mockStorage)
})

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<TwoBounceRunResult> = {}): TwoBounceRunResult {
  return {
    targetGoals: 5,
    goals: 5,
    totalShots: 8,
    madeShots: 5,
    accuracy: 63,
    elapsedMs: 90000,
    completedAt: '2026-05-04T11:00:00.000Z',
    ...overrides,
  }
}

function makeBest(overrides: Partial<TwoBounceBestRecord> = {}): TwoBounceBestRecord {
  return {
    targetGoals: 5,
    totalShots: 8,
    madeShots: 5,
    accuracy: 63,
    elapsedMs: 90000,
    completedAt: '2026-05-04T11:00:00.000Z',
    ...overrides,
  }
}

// ─── isBetterRecord ───────────────────────────────────────────────────────────

describe('isBetterRecord', () => {
  it('총 슛 수가 적으면 좋은 기록', () => {
    expect(isBetterRecord(makeResult({ totalShots: 6 }), makeBest({ totalShots: 8 }))).toBe(true)
  })

  it('총 슛 수가 많으면 나쁜 기록', () => {
    expect(isBetterRecord(makeResult({ totalShots: 10 }), makeBest({ totalShots: 8 }))).toBe(false)
  })

  it('총 슛 수 동률 → 소요 시간 짧으면 좋은 기록', () => {
    expect(isBetterRecord(
      makeResult({ totalShots: 8, elapsedMs: 70000 }),
      makeBest({ totalShots: 8, elapsedMs: 90000 }),
    )).toBe(true)
  })

  it('총 슛 수 동률 → 소요 시간 길면 나쁜 기록', () => {
    expect(isBetterRecord(
      makeResult({ totalShots: 8, elapsedMs: 100000 }),
      makeBest({ totalShots: 8, elapsedMs: 90000 }),
    )).toBe(false)
  })

  it('총 슛 수 + 시간 동률 → 성공률 높으면 좋은 기록', () => {
    expect(isBetterRecord(
      makeResult({ totalShots: 8, elapsedMs: 90000, accuracy: 75 }),
      makeBest({ totalShots: 8, elapsedMs: 90000, accuracy: 63 }),
    )).toBe(true)
  })

  it('모두 동률 → false (갱신하지 않음)', () => {
    expect(isBetterRecord(
      makeResult({ totalShots: 8, elapsedMs: 90000, accuracy: 63 }),
      makeBest({ totalShots: 8, elapsedMs: 90000, accuracy: 63 }),
    )).toBe(false)
  })
})

// ─── loadBestRecords ──────────────────────────────────────────────────────────

describe('loadBestRecords', () => {
  it('저장된 기록 없으면 { 3: null, 5: null, 10: null } 반환', () => {
    expect(loadBestRecords()).toEqual({ 3: null, 5: null, 10: null })
  })

  it('손상된 JSON이면 빈 기록 반환', () => {
    mockStorage.getItem.mockReturnValueOnce('NOT_VALID_JSON{{')
    expect(loadBestRecords()).toEqual({ 3: null, 5: null, 10: null })
  })

  it('필드가 일부 누락된 항목은 null로 처리', () => {
    const corrupt = JSON.stringify({ 5: { totalShots: 8 } })
    mockStorage.getItem.mockReturnValueOnce(corrupt)
    expect(loadBestRecords()[5]).toBeNull()
  })

  it('유효한 기록은 정상 반환', () => {
    const valid = JSON.stringify({
      5: { targetGoals: 5, totalShots: 8, madeShots: 5, accuracy: 63, elapsedMs: 90000, completedAt: '2026-05-04T11:00:00.000Z' },
    })
    mockStorage.getItem.mockReturnValueOnce(valid)
    const records = loadBestRecords()
    expect(records[5]?.totalShots).toBe(8)
    expect(records[3]).toBeNull()
    expect(records[10]).toBeNull()
  })
})

// ─── saveBestRecord ───────────────────────────────────────────────────────────

describe('saveBestRecord', () => {
  it('기록이 없으면 첫 기록으로 저장 + isNewBest=true', () => {
    const { isNewBest, previousBest, records } = saveBestRecord(makeResult())
    expect(isNewBest).toBe(true)
    expect(previousBest).toBeNull()
    expect(records[5]?.totalShots).toBe(8)
  })

  it('더 좋은 기록이면 갱신 + isNewBest=true', () => {
    saveBestRecord(makeResult({ totalShots: 8 }))
    const { isNewBest, previousBest, records } = saveBestRecord(makeResult({ totalShots: 6 }))
    expect(isNewBest).toBe(true)
    expect(previousBest?.totalShots).toBe(8)
    expect(records[5]?.totalShots).toBe(6)
  })

  it('나쁜 기록이면 갱신하지 않음 + isNewBest=false', () => {
    saveBestRecord(makeResult({ totalShots: 6 }))
    const { isNewBest, records } = saveBestRecord(makeResult({ totalShots: 10 }))
    expect(isNewBest).toBe(false)
    expect(records[5]?.totalShots).toBe(6)
  })

  it('3/5/10 기록이 서로 분리됨', () => {
    saveBestRecord(makeResult({ targetGoals: 3, totalShots: 4 }))
    saveBestRecord(makeResult({ targetGoals: 5, totalShots: 8 }))
    const records = loadBestRecords()
    expect(records[3]?.totalShots).toBe(4)
    expect(records[5]?.totalShots).toBe(8)
    expect(records[10]).toBeNull()
  })

  it('신기록 시 localStorage.setItem 호출됨', () => {
    saveBestRecord(makeResult())
    expect(mockStorage.setItem).toHaveBeenCalledOnce()
  })

  it('신기록 아닐 때 setItem 호출 안 됨', () => {
    saveBestRecord(makeResult({ totalShots: 6 }))
    mockStorage.setItem.mockClear()
    saveBestRecord(makeResult({ totalShots: 10 }))
    expect(mockStorage.setItem).not.toHaveBeenCalled()
  })
})

// ─── clearBestRecords ─────────────────────────────────────────────────────────

describe('clearBestRecords', () => {
  it('초기화 후 빈 기록 반환', () => {
    saveBestRecord(makeResult())
    expect(clearBestRecords()).toEqual({ 3: null, 5: null, 10: null })
  })

  it('초기화 후 loadBestRecords도 빈 기록 반환', () => {
    saveBestRecord(makeResult())
    clearBestRecords()
    expect(loadBestRecords()).toEqual({ 3: null, 5: null, 10: null })
  })

  it('localStorage.removeItem이 호출됨', () => {
    clearBestRecords()
    expect(mockStorage.removeItem).toHaveBeenCalledOnce()
  })
})
