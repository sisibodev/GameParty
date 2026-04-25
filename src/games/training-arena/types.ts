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

// 스킬 학습 대기 (v0.4.3): 전투 횟수 기반 카운트다운
export interface PendingSkill {
  skillId:        string
  turnsRemaining: number // 0이 되면 acquiredSkills로 이동
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
  archetype: string
  items?: string[]  // v0.4.2 Phase 2.5: 전투 발동 아이템 ID 목록
  tactic?: TacticState  // v0.4.2 Phase 3: 전술 카드 (플레이어 전용)
}

// ─── Tactic Card (v0.4.2 Phase 3) ────────────────────────────────────────────

export type TacticCardId =
  | 'first_strike'   // 1. 선제 공격
  | 'barrier'        // 2. 방벽 전개
  | 'ambush'         // 3. 기습
  | 'mana_burst'     // 4. 마나 폭주
  | 'curse'          // 5. 저주
  | 'potion'         // 6. 회복 물약
  | 'insight'        // 7. 간파
  | 'last_stand'     // 8. 최후의 일격

export interface TacticCard {
  id: TacticCardId
  name: string
  description: string
  hint: string       // 변수 포인트
}

// 전투 중 1회성 카드의 발동 여부를 기록
export interface TacticState {
  cardId: TacticCardId
  barrierUsed?: boolean    // 방벽 전개: 첫 피격 -70%
  ambushUsed?: boolean     // 기습: 첫 공격 크리 확정 + ×1.3
  potionUsed?: boolean     // 회복 물약: HP 30% 이하 시 50% 회복
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
  opponentItems: string[]
  opponentSkills: string[]
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

// ─── Item ─────────────────────────────────────────────────────────────────────

export type ItemTier = 'common' | 'rare' | 'hero' | 'legend'
export type ItemKind = 'stat' | 'combat' | 'utility'

// v0.4.2 Phase 2.5 — 전투 발동 아이템 효과
export interface CombatEffect {
  poisonDot?: number         // 내 턴 시작 시 상대에게 고정 피해
  vampireHealPct?: number    // 가한 피해의 % 회복
  indomitableDefPct?: number // HP ≤20%일 때 DEF% 증가
  manaSealTurns?: number     // 경기 시작 시 상대 스킬 봉인 (턴)
}

export interface ItemDef {
  id: string
  name: string
  tier: ItemTier
  kind: ItemKind
  price: number
  description: string
  // stat 아이템: 영구 성장 스탯 보너스
  statBonus?: Partial<GrowthStats>
  // combat 아이템: 전투 발동 효과
  combatEffect?: CombatEffect
  // utility 아이템: 보상 배율 등 비전투 효과
  goldMultiplier?: number
}

export interface InventoryItem {
  itemId: string
  acquiredRound: number
}

// ─── NPC Stat Tracking ────────────────────────────────────────────────────────

export interface NpcStat {
  totalWins:      number
  totalLosses:    number
  bestStage:      string  // '우승' | '준우승' | '4강' | '8강' | '16강' | '본선 그룹 탈락' | '예선 탈락'
  bestStageCount: number
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
  gold?: number               // v0.4.2+: 보유 골드 (legacy undefined → 0)
  inventory?: InventoryItem[] // v0.4.2+: 구매 아이템 (legacy undefined → [])
  rivalIds?: number[]         // v0.4.3+: 라이벌 NPC 3명 (legacy undefined → [])
  pendingSkills?: PendingSkill[] // v0.4.3+: 학습 대기 스킬 (legacy undefined → [])
  runRecords?: RunRecord[]    // v0.4.3+: 라운드별 기록 (최대 20건, 점수 내림차순)
  createdAt: number
  updatedAt: number
  npcStats?: Record<number, NpcStat>
}

// 전투용 스킬 목록 (initialSkills + acquiredSkills, 최대 5개)
export function mergePlayerSkills(slot: SaveSlot): string[] {
  const all = [...slot.initialSkills, ...slot.acquiredSkills]
  return Array.from(new Set(all)).slice(0, 5)
}

// ─── Run Record (v0.4.3) ─────────────────────────────────────────────────────

export interface RunRecord {
  score:           number
  endRound:        number
  finishedAt:      number      // timestamp
  characterId:     number
  growthStats:     GrowthStats
  skills:          string[]    // initialSkills + acquiredSkills at time of record
  items:           string[]    // inventory itemIds
  wins:            number
  losses:          number
  rivalsDefeated:  number
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
  skillChoices: string[]      // 습득 후보 스킬 IDs
  goldEarned: number          // v0.4.2+: 결과별 골드 보상
}
