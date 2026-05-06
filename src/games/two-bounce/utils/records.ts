import type { TargetGoals, TwoBounceBestRecord, TwoBounceBestRecords, TwoBounceRunResult } from '../types'

const STORAGE_KEY = 'two-bounce:best-records:v1'
const TARGET_GOALS: TargetGoals[] = [3, 5, 10]

function emptyRecords(): TwoBounceBestRecords {
  return { 3: null, 5: null, 10: null }
}

function isValidRecord(val: unknown): val is TwoBounceBestRecord {
  if (typeof val !== 'object' || val === null) return false
  const r = val as Record<string, unknown>
  return (
    (r.targetGoals === 3 || r.targetGoals === 5 || r.targetGoals === 10) &&
    typeof r.totalShots === 'number' &&
    typeof r.madeShots === 'number' &&
    typeof r.accuracy === 'number' &&
    typeof r.elapsedMs === 'number' &&
    typeof r.completedAt === 'string'
  )
}

/**
 * localStorage에서 목표 골별 최고 기록을 불러온다.
 * 데이터가 없거나 손상된 경우 빈 기록을 반환한다.
 */
export function loadBestRecords(): TwoBounceBestRecords {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyRecords()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const result = emptyRecords()
    for (const key of TARGET_GOALS) {
      const entry = parsed[String(key)]
      result[key] = isValidRecord(entry) ? entry : null
    }
    return result
  } catch {
    return emptyRecords()
  }
}

/**
 * a가 b보다 좋은 기록인지 판단한다.
 * 기준: 총 슛 수 적을수록 > 소요 시간 짧을수록 > 성공률 높을수록
 */
export function isBetterRecord(a: TwoBounceRunResult, b: TwoBounceBestRecord): boolean {
  if (a.totalShots < b.totalShots) return true
  if (a.totalShots > b.totalShots) return false
  if (a.elapsedMs < b.elapsedMs) return true
  if (a.elapsedMs > b.elapsedMs) return false
  return a.accuracy > b.accuracy
}

/**
 * 게임 결과를 저장한다. 신기록일 때만 localStorage를 갱신한다.
 * @returns 저장 후 전체 기록, 신기록 여부, 이전 최고 기록
 */
export function saveBestRecord(result: TwoBounceRunResult): {
  records: TwoBounceBestRecords
  isNewBest: boolean
  previousBest: TwoBounceBestRecord | null
} {
  const records = loadBestRecords()
  const previousBest = records[result.targetGoals]
  const isNewBest = previousBest === null || isBetterRecord(result, previousBest)

  if (isNewBest) {
    const newRecord: TwoBounceBestRecord = {
      targetGoals: result.targetGoals,
      totalShots: result.totalShots,
      madeShots: result.madeShots,
      accuracy: result.accuracy,
      elapsedMs: result.elapsedMs,
      completedAt: result.completedAt,
    }
    records[result.targetGoals] = newRecord
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
    } catch {
      // localStorage 용량 초과 등 — 무시
    }
  }

  return { records, isNewBest, previousBest }
}

/**
 * 전체 최고 기록을 초기화한다.
 */
export function clearBestRecords(): TwoBounceBestRecords {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 무시
  }
  return emptyRecords()
}
