export type GamePhase = 'goal-select' | 'playing' | 'result'
export type ShotPhase = 'aiming' | 'charging' | 'flying' | 'settled'

export type TargetGoals = 3 | 5 | 10

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface GameState {
  targetGoals: TargetGoals
  goals: number
  shots: number
  shotPosition: Vec3
}

export interface ShotResult {
  success: boolean
  secondBouncePos: Vec3 | null
}

/** 한 판 결과 데이터 — 나중에 Firestore 저장 시 동일 구조 사용 */
export interface TwoBounceRunResult {
  targetGoals: TargetGoals
  goals: number
  totalShots: number
  madeShots: number
  accuracy: number      // 0~100 정수 (%)
  elapsedMs: number
  completedAt: string   // ISO 8601
}

/** localStorage에 저장되는 목표 골별 최고 기록 */
export interface TwoBounceBestRecord {
  targetGoals: TargetGoals
  totalShots: number
  madeShots: number
  accuracy: number      // 0~100 정수 (%)
  elapsedMs: number
  completedAt: string   // ISO 8601
}

export type TwoBounceBestRecords = Record<TargetGoals, TwoBounceBestRecord | null>
