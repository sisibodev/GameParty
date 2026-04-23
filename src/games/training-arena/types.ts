// ─── Growth Stats ────────────────────────────────────────────────────────────

export interface GrowthStats {
  hp: number   // 체력
  str: number  // 힘
  agi: number  // 민첩
  int: number  // 지력
  luk: number  // 행운
}

export type GrowthStatKey = keyof GrowthStats

// ─── Combat Stats (derived from growth) ──────────────────────────────────────

export interface CombatStats {
  maxHp: number
  atk: number
  def: number
  spd: number
  crit: number
  eva: number
  maxMana: number
  aggression: number
  critMultiplier: number
}

// ─── Skill ────────────────────────────────────────────────────────────────────

export type SkillTier = 'common' | 'rare' | 'hero' | 'legend'
export type SkillCategory = 'attack' | 'defense' | 'buff' | 'debuff' | 'heal' | 'special'
export type SkillTarget = 'self' | 'single' | 'all_enemies'

export interface SkillDef {
  id: string
  name: string
  tier: SkillTier
  category: SkillCategory
  target: SkillTarget
  cost: number
  cooldown: number
  priority: number
  description: string
}

// ─── Character ────────────────────────────────────────────────────────────────

export type Archetype =
  | 'warrior' | 'mage' | 'assassin' | 'tank'
  | 'support' | 'ranger' | 'berserker' | 'paladin'

export interface CharacterBaseCombat {
  maxHp: number
  atk: number
  def: number
  spd: number
  crit: number
  eva: number
  maxMana: number
  aggression: number
}

export interface CharacterDef {
  id: number
  name: string
  description: string
  archetype: Archetype
  baseCombat: CharacterBaseCombat
  ipId?: number  // undefined = original character
}

// ─── Gacha ────────────────────────────────────────────────────────────────────

export type GachaGrade = 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS'

export interface GachaCard {
  grade: GachaGrade
  targetCharId: number
  statKey: GrowthStatKey
  statGain: number
}

export interface GachaResult {
  cards: GachaCard[]
  playerGains: GachaCard[]  // cards that targeted the player's character
}

// ─── Battle ───────────────────────────────────────────────────────────────────

export type MatchStage = 'qualifier' | 'group' | 'bracket'

export interface BuffEntry {
  id: string
  effectType: string
  value: number
  turnsLeft: number
}

export interface BattleCharState {
  charId: number
  currentHp: number
  currentMana: number
  gauge: number           // ATB gauge 0–100
  buffs: BuffEntry[]
  debuffs: BuffEntry[]
  cooldowns: Record<string, number>  // skillId → turns remaining
  skills: string[]
  growthStats: GrowthStats
  baseCombat: CharacterBaseCombat
}

export type ActionType = 'normal_attack' | 'skill' | 'evade'

export interface MatchLogEntry {
  turn: number
  actorId: number
  action: ActionType
  skillId?: string
  targetId: number
  damage: number
  critical: boolean
  evaded: boolean
  hpAfter: Record<number, number>
  manaAfter: Record<number, number>
}

export type GroupMatchType = 'initial' | 'winners' | 'losers' | 'decider'

export interface MatchResult {
  matchId: string
  seed: number
  char1Id: number
  char2Id: number
  winnerId: number
  loserId: number
  totalTurns: number
  log: MatchLogEntry[]
  initialHp: Record<number, number>
  initialMana: Record<number, number>
  char1Skills: string[]
  char2Skills: string[]
  stage?: MatchStage
  groupId?: string
  groupMatchType?: GroupMatchType
  bracketRound?: number
}

export interface PlayerMatchInfo {
  matchResult: MatchResult
  stageLabel: string
  opponentId: number
  playerWon: boolean
}

// ─── Tournament ───────────────────────────────────────────────────────────────

export interface GroupResult {
  groupId: string  // 'A'–'H'
  players: [number, number, number, number]
  rank1: number
  rank2: number
  eliminated: [number, number]
}

export interface TournamentResult {
  tournamentId: string
  round: number
  seed: number
  participants: number[]
  qualifiers: number[]        // 32명
  groups: GroupResult[]       // 8개 조
  finalists: number[]         // 16명
  bracketEliminations: Record<number, number>  // charId → 탈락 라운드 (1=16강, 2=8강, 3=4강, 4=결승)
  winner: number
  darkhorses: number[]
  allMatches: MatchResult[]
}

// ─── Save Slot ────────────────────────────────────────────────────────────────

export type SlotId = 1 | 2 | 3

export interface SaveSlot {
  slotId: SlotId
  characterId: number
  initialSkills: string[]     // 3개, 게임 시작 시 고정
  growthStats: GrowthStats
  acquiredSkills: string[]    // 우승 후 습득 스킬 누적
  currentRound: number
  bestClearRound: number | null
  savedPhase?: string         // 마지막으로 저장된 게임 페이즈
  createdAt: number
  updatedAt: number
}

// 전투용 스킬 목록 (initialSkills + acquiredSkills, 최대 8개)
export function mergePlayerSkills(slot: SaveSlot): string[] {
  const all = [...slot.initialSkills, ...slot.acquiredSkills]
  return Array.from(new Set(all)).slice(0, 8)
}

// ─── Reward ───────────────────────────────────────────────────────────────────

export type PlayerTournamentResult =
  | 'winner'
  | 'finalist'        // 준우승·4강
  | 'tournament_out'  // 토너먼트 탈락 (16강·8강)
  | 'group_out'       // 본선 탈락
  | 'qualifier_out'   // 예선 탈락

export interface RewardPackage {
  randomStatGain: number      // 랜덤 스탯 보상
  playerExtraPoints: number   // 플레이어 직접 분배 포인트
  skillChoices: string[]      // 습득 후보 스킬 IDs
}
