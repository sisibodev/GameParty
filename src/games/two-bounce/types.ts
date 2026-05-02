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
