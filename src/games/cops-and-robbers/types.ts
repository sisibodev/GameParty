export type Role = 'thief' | 'cop'

export type Phase = 'select' | 'solo' | 'lobby' | 'playing' | 'result' | 'ranking'

export type PlayerRole = 'thief' | 'cop'

export interface PlayerResult {
  name: string
  role: PlayerRole
  hitStack: number
  captured: boolean
}

export interface ResultStats {
  winner: 'thieves' | 'cops'
  timeMs: number
  treasureCount: number
  roomId: string | null
  playerResults: PlayerResult[]
}

export interface Vec2 {
  x: number
  y: number
}

export type TileKind = 'floor' | 'wall'

export interface TileMap {
  cols: number
  rows: number
  tiles: TileKind[]
}

export interface PlayerState {
  pos: Vec2
  role: Role
  speed: number
  visionRadius: number
}

export type SafeStatus =
  | 'locked'
  | 'cracking'
  | 'opened_treasure'
  | 'opened_empty'
  | 'alarmed'

export interface SafeState {
  id: string
  pos: Vec2
  hasTreasure: boolean
  status: SafeStatus
  attemptsUsed: number
  secret: string
}

export interface NumberBaseballAttempt {
  guess: string
  strikes: number
  balls: number
}

export interface NumberBaseballSession {
  safeId: string
  digits: number
  maxAttempts: number
  attempts: NumberBaseballAttempt[]
  solved: boolean
  failed: boolean
}

export interface TeamStats {
  treasureCount: number
  treasureGoal: number
}

export type BotBehavior = 'patrol' | 'chase' | 'attack'

export interface CopBotState {
  pos: Vec2
  behavior: BotBehavior
  waypoint: Vec2 | null
  scanCooldownMs: number
  scanActiveMs: number
  lastHitMs: number
}

export type AbilityState = 'ready' | 'active' | 'cooldown'

export interface ThiefAbility {
  state: AbilityState
  remainingMs: number
}

export interface ThiefAbilities {
  stealth: ThiefAbility
  smoke: ThiefAbility
}

export interface SmokeCloud {
  id: string
  pos: Vec2
  remainingMs: number
}

export type CapturePhase = 'playing' | 'jailed' | 'captured' | 'escaped'
