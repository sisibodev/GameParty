import { create } from 'zustand'
import type {
  BattleCharState,
  CharacterDef,
  GachaResult,
  GrowthStatKey,
  GrowthStats,
  InventoryItem,
  ItemDef,
  MatchResult,
  NpcStat,
  PendingSkill,
  PlayerMatchInfo,
  PlayerTournamentResult,
  RewardPackage,
  SaveSlot,
  SkillTier,
  SlotId,
  TacticCardId,
  TournamentResult,
} from '../types'
import {
  GROWTH_STAT_KEYS,
  INITIAL_PLAYER_STAT,
  INITIAL_SKILL_COUNT,
  INITIAL_UNLOCKED_CHAR_IDS,
  MATCH_BONUS_GOLD_LOSS,
  MATCH_BONUS_GOLD_WIN,
  MAX_INVENTORY_SIZE,
  MAX_PASSIVE_SLOTS,
  MAX_SKILL_ENHANCE_LEVEL,
  MAX_SKILL_SLOTS,
  NPC_BASE_GROWTH,
  RIVAL_COUNT,
  RIVAL_GOLD_MULTIPLIER,
  RIVAL_STAT_PER_ROUND,
  SHOP_REROLL_COST,
  SKILL_ENHANCE_COSTS,
  SKILL_LEARN_TURNS,
} from '../constants'
import { runTournament } from '../engine/tournamentEngine'
import { simulateMatch } from '../engine/battleEngine'
import { deriveStats }   from '../engine/statDeriver'
import { runGacha }      from '../engine/gachaEngine'
import { calcReward, calcNpcQualifierLoserBonus } from '../engine/rewardEngine'
import { rollShopItems, rollNpcItems } from '../engine/shopEngine'
import { buildRunRecord, addRunRecord } from '../engine/scoreEngine'
import { getItemById } from '../data/items'
import {
  listSlots,
  saveSlot,
  deleteSlot,
} from '../hooks/useSaveSlot'
import { appendMatchLog } from '../hooks/useMatchLog'
import { SeededRng }  from '../utils/rng'
import { pickN }      from '../utils/fisherYates'
import charactersRaw  from '../data/characters.json'
import skillsRaw      from '../data/skills.json'
import passiveSkillsRaw from '../data/passiveSkills.json'

// ─── Types ────────────────────────────────────────────────────────────────────

export type GamePhase =
  | 'slot_select'
  | 'encyclopedia'
  | 'ranking'
  | 'simulation'
  | 'char_select'
  | 'gacha'
  | 'stage_overview'
  | 'match_preview'
  | 'battle'
  | 'match_result'
  | 'skill_learn'
  | 'tournament'
  | 'bracket'
  | 'reward'
  | 'shop'
  | 'skill_enhance'
  | 'passive_reward'
  | 'replay'
  | 'my_records'

interface GameState {
  phase:                    GamePhase
  slots:                    SaveSlot[]
  activeSlot:               SaveSlot | null
  lastTournament:           TournamentResult | null
  pendingReward:            RewardPackage | null
  lastRandomStatKey:        GrowthStatKey | null
  unlockedCharIds:          number[]
  newCharIds:               number[]
  playerMatches:            PlayerMatchInfo[]
  playerMatchIndex:         number
  shopItems:                ItemDef[]
  selectedTacticCardId:     TacticCardId | null
  playedCharIds:            number[]
  pendingPassiveOpts:       string[] | null  // 매치 승리 후 상대 패시브 선택지
  pendingPassiveRewardOpts: string[] | null  // 라운드 종료 후 3개 랜덤 패시브
  pendingSkillOpts:         string[] | null  // 매치 승리 후 상대 스킬 선택지
}

interface GameActions {
  initSlots:               () => Promise<void>
  startNewGame:            (slotId: SlotId, charId: number, seed: number) => Promise<void>
  removeSlot:              (slotId: SlotId) => Promise<void>
  runGachaPhase:           (seed: number) => Promise<GachaResult>
  startTournament:          (seed: number) => Promise<TournamentResult>
  startTournamentAndBattle: (seed: number) => Promise<void>
  startBattleForCurrentMatch: (tactic: TacticCardId | null) => Promise<void>
  advancePlayerMatch:       () => void
  completeMatchAndAdvance:  (won: boolean, skillId?: string, replaceSkillId?: string) => Promise<void>
  claimReward:             () => Promise<void>
  acquireSkill:            (skillId: string, replaceId?: string) => Promise<void>
  enterShopPhase:          (seed: number) => void
  buyItem:                 (itemId: string) => Promise<void>
  rerollShop:              (seed: number) => Promise<void>
  leaveShop:               () => void
  initMatchPassives:       () => void
  initMatchSkills:         () => void
  acquireBattlePassive:    (passiveId: string | null, replaceId?: string) => Promise<void>
  acquireBattleSkill:      (skillId: string | null, replaceId?: string) => Promise<void>
  acquirePassiveReward:    (passiveId: string | null, replaceId?: string) => Promise<void>
  enhanceSkill:            (skillId: string) => Promise<void>
  setPhase:                (phase: GamePhase) => void
  clearNewChars:           () => void
  clearPlayedChars:        () => void
  setTacticCard:           (cardId: TacticCardId | null) => void
}

// ─── Static data ──────────────────────────────────────────────────────────────

const characters    = (charactersRaw as CharacterDef[]).filter(c => c.ipId == null)
const allCharIds    = characters.map(c => c.id)
const allSkillIds   = (skillsRaw as Array<{ id: string }>).map(s => s.id)
const allPassiveIds = (passiveSkillsRaw as Array<{ id: string }>).map(p => p.id)

// ─── Unlock helpers (localStorage) ───────────────────────────────────────────

function loadUnlocked(): number[] {
  try { return JSON.parse(localStorage.getItem('bgp_unlocked') ?? 'null') ?? INITIAL_UNLOCKED_CHAR_IDS }
  catch { return INITIAL_UNLOCKED_CHAR_IDS }
}
function saveUnlocked(ids: number[]) {
  localStorage.setItem('bgp_unlocked', JSON.stringify(ids))
}
function loadNewChars(): number[] {
  try { return JSON.parse(localStorage.getItem('bgp_new_chars') ?? '[]') }
  catch { return [] }
}
function saveNewChars(ids: number[]) {
  localStorage.setItem('bgp_new_chars', JSON.stringify(ids))
}
function loadPlayedChars(): number[] {
  try { return JSON.parse(localStorage.getItem('bgp_played_chars') ?? '[]') }
  catch { return [] }
}
function savePlayedChars(ids: number[]) {
  localStorage.setItem('bgp_played_chars', JSON.stringify(ids))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// v0.4.1: 플레이어 초기 성장 스탯 — 전 스탯 1/1/1/1/1
function initialPlayerGrowth(): GrowthStats {
  const v = INITIAL_PLAYER_STAT
  return { vit: v, str: v, agi: v, int: v, luk: v }
}

function npcGrowth(round: number, isRival: boolean = false): GrowthStats {
  const b = NPC_BASE_GROWTH + (round - 1) + (isRival ? RIVAL_STAT_PER_ROUND : 0)
  return { vit: b, str: b, agi: b, int: b, luk: b }
}

// v0.6.0: 게임 시작 시 NPC에게 랜덤 스킬 3개 부여 (gameSeed 기반, 라운드 불변)
function npcRandomSkills(charId: number, gameSeed: number): string[] {
  const rng = new SeededRng(charId * 1337 + gameSeed)
  return pickN(allSkillIds, Math.min(3, allSkillIds.length), rng)
}

// v0.5.0: NPC 초기 패시브 스킬 (결정론적 랜덤, 6개)
function npcInitialPassives(charId: number, round: number): string[] {
  const rng = new SeededRng(charId * 997 + round)
  return pickN(allPassiveIds, Math.min(MAX_PASSIVE_SLOTS, allPassiveIds.length), rng)
}

// v0.4.2 — NPC 아이템 지급: (라운드-1)개, 라운드별 티어 가중치 적용
function npcItems(charId: number, round: number, tournamentSeed: number): string[] {
  if (round <= 1) return []
  const count = Math.min(round - 1, 5)
  const seed  = (tournamentSeed ^ (charId * 7919)) >>> 0
  return rollNpcItems(count, round, seed)
}

const FINALIST_BRACKET_ROUND = 4

// ─── Pending Skill Helpers ────────────────────────────────────────────────────

// 전투 1회 완료 시 대기 스킬 카운트다운. 완료된 스킬은 acquiredSkills로 이동.
function tickPendingSkills(slot: SaveSlot): SaveSlot {
  const pending  = slot.pendingSkills ?? []
  if (pending.length === 0) return slot

  const survived: PendingSkill[] = []
  const graduated: string[]      = []

  for (const ps of pending) {
    const next = ps.turnsRemaining - 1
    if (next <= 0) {
      graduated.push(ps.skillId)
    } else {
      survived.push({ ...ps, turnsRemaining: next })
    }
  }

  if (graduated.length === 0) return { ...slot, pendingSkills: survived }

  const alreadyOwned = new Set([...slot.initialSkills, ...slot.acquiredSkills])
  const newAcquired  = graduated.filter(id => !alreadyOwned.has(id))

  return {
    ...slot,
    pendingSkills:  survived,
    acquiredSkills: [...slot.acquiredSkills, ...newAcquired],
  }
}

// 라이벌 처치 1회당 해당 라운드 골드 ×2 배율 (최대 1회만 적용, MVP).
// 여러 번 이기더라도 중복 적용은 하지 않음 — 라운드 단위 특수 보상.
function applyRivalGoldBonus(
  base: RewardPackage,
  slot: SaveSlot,
  tournament: TournamentResult,
): RewardPackage {
  const rivalIds = slot.rivalIds ?? []
  if (rivalIds.length === 0) return base
  const pid = slot.characterId
  const defeatedRival = tournament.allMatches.some(m =>
    (m.char1Id === pid || m.char2Id === pid) &&
    m.winnerId === pid &&
    rivalIds.includes(m.loserId),
  )
  if (!defeatedRival) return base
  return { ...base, goldEarned: base.goldEarned * RIVAL_GOLD_MULTIPLIER }
}

function derivePlayerResult(
  slot: SaveSlot,
  result: TournamentResult,
): PlayerTournamentResult {
  const id = slot.characterId
  if (result.winner === id) return 'winner'
  if (result.finalists.includes(id)) {
    return result.bracketEliminations[id] === FINALIST_BRACKET_ROUND
      ? 'finalist'
      : 'tournament_out'
  }
  if (result.qualifiers.includes(id)) return 'group_out'
  return 'qualifier_out'
}

function extractPlayerMatches(
  result: TournamentResult,
  playerCharId: number,
  itemsMap: Record<number, string[]>,
): PlayerMatchInfo[] {
  const pid = playerCharId
  let qualCount = 0
  const BRACKET_LABELS: Record<number, string> = { 1: '16강', 2: '8강', 3: '4강', 4: '결승' }

  return result.allMatches
    .filter(m => m.char1Id === pid || m.char2Id === pid)
    .map(m => {
      const opponentId = m.char1Id === pid ? m.char2Id : m.char1Id
      const playerWon  = m.winnerId === pid
      let stageLabel: string

      if (m.stage === 'qualifier') {
        qualCount++
        stageLabel = `예선 ${qualCount}경기`
      } else if (m.stage === 'group') {
        const typeLabel: Record<string, string> = {
          initial: '1경기', winners: '승자전', losers: '패자전', decider: '최종전',
        }
        stageLabel = `본선 ${typeLabel[m.groupMatchType ?? 'initial'] ?? '경기'}`
      } else {
        const round = m.bracketRound ?? 1
        stageLabel = BRACKET_LABELS[round] ?? `${round}라운드`
      }

      const opponentSkills = m.char1Id === opponentId ? m.char1Skills : m.char2Skills
      return { matchResult: m, stageLabel, opponentId, playerWon, opponentItems: itemsMap[opponentId] ?? [], opponentSkills }
    })
}

function matchBonusGoldKey(matchInfo: PlayerMatchInfo): string {
  const stage = matchInfo.matchResult.stage
  const round = matchInfo.matchResult.bracketRound
  if (stage === 'qualifier') return 'qualifier'
  if (stage === 'group')     return 'group'
  if (stage === 'bracket')   return `bracket_r${round ?? 1}`
  return 'qualifier'
}

function buildTournamentState(
  activeSlot: SaveSlot,
  _seed: number,
  result: TournamentResult,
  _reward: RewardPackage,
  currentUnlocked: number[],
  itemsMap: Record<number, string[]>,
): {
  slotWithPhase: SaveSlot
  playerMatches: PlayerMatchInfo[]
  newUnlocked: number[]
  newlyUnlocked: number[]
} {
  const pid = activeSlot.characterId
  // v1.1: 내가 이긴 상대만 해금 (승리 조건)
  const wonOpponents = result.allMatches
    .filter(m => (m.char1Id === pid || m.char2Id === pid) && m.winnerId === pid)
    .map(m => m.char1Id === pid ? m.char2Id : m.char1Id)
  const newlyUnlocked = wonOpponents.filter(id => !currentUnlocked.includes(id))
  const newUnlocked   = newlyUnlocked.length > 0 ? [...currentUnlocked, ...newlyUnlocked] : currentUnlocked

  const slotWithPhase: SaveSlot = { ...activeSlot, savedPhase: 'reward', updatedAt: Date.now() }
  const playerMatches = extractPlayerMatches(result, pid, itemsMap)

  return { slotWithPhase, playerMatches, newUnlocked, newlyUnlocked }
}

// ─── Match Navigation ────────────────────────────────────────────────────────
// 실제 전투 결과(won)에 따라 다음 경기 인덱스와 페이즈를 결정.
// playerMatches는 pre-run 기준이므로 re-sim 결과가 다르면 올바른 경로로 점프.

function determineNextMatch(
  playerMatches: PlayerMatchInfo[],
  currentIdx: number,
  won: boolean,
): { nextIndex: number; nextPhase: GamePhase } {
  const current = playerMatches[currentIdx]
  if (!current) return { nextIndex: currentIdx, nextPhase: 'tournament' }

  const stage     = current.matchResult.stage
  const groupType = current.matchResult.groupMatchType
  const groupId   = current.matchResult.groupId

  // rest 중 조건에 맞는 첫 인덱스 반환
  const findFrom = (pred: (m: PlayerMatchInfo) => boolean): number => {
    for (let i = currentIdx + 1; i < playerMatches.length; i++) {
      if (pred(playerMatches[i])) return i
    }
    return -1
  }

  if (!won) {
    // 예선·브라켓 탈락 → 토너먼트 결과
    if (stage === 'qualifier' || stage === 'bracket') {
      return { nextIndex: currentIdx, nextPhase: 'tournament' }
    }
    if (stage === 'group') {
      // 패자전·결정전 탈락 → 토너먼트 결과
      if (groupType === 'losers' || groupType === 'decider') {
        return { nextIndex: currentIdx, nextPhase: 'tournament' }
      }
      // 조별 1경기 패 → 패자전으로 점프 (없으면 탈락)
      if (groupType === 'initial') {
        const idx = findFrom(m =>
          m.matchResult.stage === 'group' &&
          m.matchResult.groupId === groupId &&
          m.matchResult.groupMatchType === 'losers',
        )
        return idx >= 0
          ? { nextIndex: idx, nextPhase: 'match_preview' }
          : { nextIndex: currentIdx, nextPhase: 'tournament' }
      }
      // 승자전 패 → 결정전으로 점프 (없으면 탈락)
      if (groupType === 'winners') {
        const idx = findFrom(m =>
          m.matchResult.stage === 'group' &&
          m.matchResult.groupId === groupId &&
          m.matchResult.groupMatchType === 'decider',
        )
        return idx >= 0
          ? { nextIndex: idx, nextPhase: 'match_preview' }
          : { nextIndex: currentIdx, nextPhase: 'tournament' }
      }
    }
    return { nextIndex: currentIdx, nextPhase: 'tournament' }
  }

  // 승리 경우
  if (stage === 'group') {
    // 조별 1경기 승 → 승자전으로 점프
    if (groupType === 'initial') {
      const idx = findFrom(m =>
        m.matchResult.stage === 'group' &&
        m.matchResult.groupId === groupId &&
        m.matchResult.groupMatchType === 'winners',
      )
      if (idx >= 0) return { nextIndex: idx, nextPhase: 'match_preview' }
      // 승자전 없음(pre-run에서 패했던 경우) → 브라켓 또는 종료
      const bIdx = findFrom(m => m.matchResult.stage === 'bracket')
      return bIdx >= 0
        ? { nextIndex: bIdx, nextPhase: 'match_preview' }
        : { nextIndex: currentIdx, nextPhase: 'tournament' }
    }
    // 승자전 승 → 그룹 1위 → 브라켓으로 점프
    if (groupType === 'winners') {
      const idx = findFrom(m => m.matchResult.stage === 'bracket')
      return idx >= 0
        ? { nextIndex: idx, nextPhase: 'match_preview' }
        : { nextIndex: currentIdx, nextPhase: 'tournament' }
    }
    // 패자전 승 → 결정전으로 점프
    if (groupType === 'losers') {
      const idx = findFrom(m =>
        m.matchResult.stage === 'group' &&
        m.matchResult.groupId === groupId &&
        m.matchResult.groupMatchType === 'decider',
      )
      if (idx >= 0) return { nextIndex: idx, nextPhase: 'match_preview' }
      const bIdx = findFrom(m => m.matchResult.stage === 'bracket')
      return bIdx >= 0
        ? { nextIndex: bIdx, nextPhase: 'match_preview' }
        : { nextIndex: currentIdx, nextPhase: 'tournament' }
    }
    // 결정전 승 → 그룹 2위 → 브라켓
    if (groupType === 'decider') {
      const idx = findFrom(m => m.matchResult.stage === 'bracket')
      return idx >= 0
        ? { nextIndex: idx, nextPhase: 'match_preview' }
        : { nextIndex: currentIdx, nextPhase: 'tournament' }
    }
  }

  // 기본: 다음 인덱스
  const next = currentIdx + 1
  if (next >= playerMatches.length) {
    return { nextIndex: currentIdx, nextPhase: 'tournament' }
  }
  const nextMatch = playerMatches[next]
  // 예선 → 본선 첫 진입: stage_overview 표시
  if (stage === 'qualifier' && won && nextMatch.matchResult.stage === 'group') {
    return { nextIndex: next, nextPhase: 'stage_overview' }
  }
  return { nextIndex: next, nextPhase: 'match_preview' }
}

// ─── Bracket Path Extension ──────────────────────────────────────────────────
// pre-run에서 플레이어가 패배로 예측된 브래킷 경기를 실제로 이겼을 때,
// lastTournament에서 다음 라운드 상대를 찾아 playerMatches를 연장한다.

function buildExtendedBracketMatch(
  playerMatches: PlayerMatchInfo[],
  currentIdx: number,
  lastTournament: TournamentResult,
  pid: number,
  round: number,
): PlayerMatchInfo | null {
  const currentMatch = playerMatches[currentIdx]
  if (!currentMatch || currentMatch.matchResult.stage !== 'bracket') return null

  const currentRound    = currentMatch.matchResult.bracketRound ?? 0
  const nextRound       = currentRound + 1
  const prerunOpponentId = currentMatch.opponentId

  // pre-run에서 currentRound에 prerunOpponentId가 포함된 경기를 찾아 실제 진출자를 얻는다.
  // 확장 경기(buildExtendedBracketMatch로 만든)의 상대는 pre-run에서 currentRound 이후
  // 탈락했을 수 있으므로, pre-run 승자(advancingId)를 기준으로 nextRound 경기를 찾아야 한다.
  const prerunCurrentMatch = lastTournament.allMatches.find(
    m => m.stage === 'bracket' &&
         m.bracketRound === currentRound &&
         (m.char1Id === prerunOpponentId || m.char2Id === prerunOpponentId),
  )
  const advancingId = prerunCurrentMatch?.winnerId ?? prerunOpponentId

  // pre-run에서 advancingId가 진출한 다음 라운드 경기를 찾는다
  const nextPrerunMatch = lastTournament.allMatches.find(
    m => m.stage === 'bracket' &&
         m.bracketRound === nextRound &&
         (m.char1Id === advancingId || m.char2Id === advancingId),
  )
  if (!nextPrerunMatch) return null

  // 실제 다음 상대 = pre-run 진출자가 아닌 다른 참가자
  const opponentId = nextPrerunMatch.char1Id === advancingId
    ? nextPrerunMatch.char2Id
    : nextPrerunMatch.char1Id

  const BRACKET_LABELS: Record<number, string> = { 1: '16강', 2: '8강', 3: '4강', 4: '결승' }
  const stageLabel = BRACKET_LABELS[nextRound] ?? `${nextRound}라운드`

  const opponentSkills = nextPrerunMatch.char1Id === opponentId
    ? nextPrerunMatch.char1Skills
    : nextPrerunMatch.char2Skills

  // tournamentId = 'tournament_SEED_rROUND' 에서 시드 추출
  const seedMatch      = lastTournament.tournamentId.match(/tournament_(\d+)_r/)
  const tournamentSeed = seedMatch ? parseInt(seedMatch[1], 10) : 0
  const opponentItems  = npcItems(opponentId, round, tournamentSeed)

  const syntheticResult: MatchResult = {
    matchId:      `ext-r${nextRound}-${pid}`,
    seed:         0,
    char1Id:      pid,
    char2Id:      opponentId,
    winnerId:     opponentId,
    loserId:      pid,
    totalTurns:   0,
    log:          [],
    initialHp:    {},
    initialMana:  {},
    char1Skills:  [],
    char2Skills:  opponentSkills,
    stage:        'bracket',
    bracketRound: nextRound,
  }

  return {
    matchResult:    syntheticResult,
    stageLabel,
    opponentId,
    playerWon:      false,
    opponentItems,
    opponentSkills,
    wasPlayed:      false,
  }
}

// ─── NPC Stat Helper ──────────────────────────────────────────────────────────

const STAGE_RANK: Record<string, number> = {
  '우승': 7, '준우승': 6, '4강': 5, '8강': 4,
  '16강': 3, '본선 그룹 탈락': 2, '예선 탈락': 1,
}

function getNpcAchievement(charId: number, result: TournamentResult): string {
  if (result.winner === charId) return '우승'
  const br = result.bracketEliminations[charId]
  if (br !== undefined) {
    const labels: Record<number, string> = { 4: '준우승', 3: '4강', 2: '8강', 1: '16강' }
    return labels[br] ?? '16강'
  }
  if (result.finalists.includes(charId)) return '16강'
  if (result.qualifiers.includes(charId)) return '본선 그룹 탈락'
  return '예선 탈락'
}

function updateNpcStats(
  existing: Record<number, NpcStat> | undefined,
  result: TournamentResult,
): Record<number, NpcStat> {
  const stats: Record<number, NpcStat> = existing ? { ...existing } : {}

  for (const charId of result.participants) {
    const achievement = getNpcAchievement(charId, result)
    const wins   = result.allMatches.filter(m => m.winnerId === charId).length
    const losses = result.allMatches.filter(m => m.loserId  === charId).length

    const prev = stats[charId]
    if (!prev) {
      stats[charId] = { totalWins: wins, totalLosses: losses, bestStage: achievement, bestStageCount: 1 }
    } else {
      const prevRank = STAGE_RANK[prev.bestStage] ?? 0
      const newRank  = STAGE_RANK[achievement]    ?? 0
      let bestStage      = prev.bestStage
      let bestStageCount = prev.bestStageCount
      if (newRank > prevRank) {
        bestStage      = achievement
        bestStageCount = 1
      } else if (newRank === prevRank) {
        bestStageCount = prev.bestStageCount + 1
      }
      stats[charId] = {
        totalWins:      prev.totalWins  + wins,
        totalLosses:    prev.totalLosses + losses,
        bestStage,
        bestStageCount,
      }
    }
  }

  return stats
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useGameStore = create<GameState & GameActions>((set, get) => ({
  phase:                    'slot_select',
  slots:                    [],
  activeSlot:               null,
  lastTournament:           null,
  pendingReward:            null,
  lastRandomStatKey:        null,
  unlockedCharIds:          loadUnlocked(),
  newCharIds:               loadNewChars(),
  playerMatches:            [],
  playerMatchIndex:         0,
  shopItems:                [],
  selectedTacticCardId:     null,
  playedCharIds:            loadPlayedChars(),
  pendingPassiveOpts:       null,
  pendingPassiveRewardOpts: null,
  pendingSkillOpts:         null,

  initSlots: async () => {
    const slots = await listSlots()
    set({ slots })
  },

  startNewGame: async (slotId, charId, seed) => {
    const rng = new SeededRng(seed)
    const char = characters.find(c => c.id === charId)
    const initialSkills = char?.skills ? [...char.skills] : pickN(allSkillIds, INITIAL_SKILL_COUNT, rng)
    const candidateRivalIds = allCharIds.filter(id => id !== charId)
    const rivalIds = pickN(candidateRivalIds, Math.min(RIVAL_COUNT, candidateRivalIds.length), rng)
    const now           = Date.now()
    const slot: SaveSlot = {
      slotId,
      characterId:    charId,
      initialSkills,
      growthStats:    initialPlayerGrowth(),
      acquiredSkills: [],
      currentRound:   1,
      bestClearRound: null,
      gold:           0,
      inventory:      [],
      rivalIds,
      passiveSkills:  [],
      skillEnhancements: {},
      gameSeed:       seed,
      createdAt:      now,
      updatedAt:      now,
    }
    await saveSlot(slot)
    const slots = await listSlots()
    const { playedCharIds } = get()
    const newPlayedCharIds = playedCharIds.includes(charId)
      ? playedCharIds
      : [...playedCharIds, charId]
    if (!playedCharIds.includes(charId)) savePlayedChars(newPlayedCharIds)
    set({
      slots,
      activeSlot:        slot,
      lastRandomStatKey: null,
      phase:             'gacha',
      playedCharIds:     newPlayedCharIds,
    })
  },

  removeSlot: async (slotId) => {
    await deleteSlot(slotId)
    const slots = await listSlots()
    set({ slots })
  },

  runGachaPhase: async (seed) => {
    const { activeSlot } = get()
    if (!activeSlot) throw new Error('No active slot')

    const result    = runGacha(activeSlot.characterId, allCharIds, seed)
    const newGrowth = { ...activeSlot.growthStats }

    for (const card of result.playerGains) {
      newGrowth[card.statKey] = newGrowth[card.statKey] + card.statGain
    }

    const topGain = result.playerGains.length
      ? result.playerGains.reduce((a, b) => a.statGain >= b.statGain ? a : b)
      : null
    const prevHistory = activeSlot.gachaHistory ?? []
    const newHistory = topGain
      ? [...prevHistory, { round: activeSlot.currentRound, grade: topGain.grade, statKey: topGain.statKey, statGain: topGain.statGain }]
      : prevHistory

    const updated: SaveSlot = { ...activeSlot, growthStats: newGrowth, gachaHistory: newHistory }
    await saveSlot(updated)
    set({ activeSlot: updated })
    return result
  },

  startTournament: async (seed) => {
    const { activeSlot } = get()
    if (!activeSlot) throw new Error('No active slot')

    const round      = activeSlot.currentRound
    const gameSeed   = activeSlot.gameSeed ?? activeSlot.createdAt
    const prevQualifierLosers = new Set(activeSlot.prevQualifierLosers ?? [])
    const growthMap: Record<number, GrowthStats> = {}
    const skillMap:  Record<number, string[]>    = {}
    const itemsMap:  Record<number, string[]>    = {}

    for (const c of characters) {
      if (c.id === activeSlot.characterId) {
        growthMap[c.id] = activeSlot.growthStats
        skillMap[c.id]  = [
          ...activeSlot.initialSkills,
          ...activeSlot.acquiredSkills,
        ].slice(0, MAX_SKILL_SLOTS)
        itemsMap[c.id]  = (activeSlot.inventory ?? []).map(it => it.itemId)
      } else {
        const isRival = (activeSlot.rivalIds ?? []).includes(c.id)
        const base = npcGrowth(round, isRival)
        const bonus = prevQualifierLosers.has(c.id) ? 1 : 0
        growthMap[c.id] = bonus > 0
          ? { vit: base.vit + bonus, str: base.str + bonus, agi: base.agi + bonus, int: base.int + bonus, luk: base.luk + bonus }
          : base
        skillMap[c.id]  = npcRandomSkills(c.id, gameSeed)
        itemsMap[c.id]  = npcItems(c.id, round, seed)
      }
    }

    const npcInitialPassivesMap: Record<number, string[]> = {}
    for (const c of characters) {
      if (c.id !== activeSlot.characterId) {
        npcInitialPassivesMap[c.id] = npcInitialPassives(c.id, round)
      }
    }

    const result = runTournament(
      characters, growthMap, skillMap, seed, round, itemsMap,
      activeSlot.characterId, undefined,
      npcInitialPassivesMap, {},
      activeSlot.passiveSkills ?? [],
      activeSlot.skillEnhancements ?? {},
    )
    await appendMatchLog(result.tournamentId, result.allMatches)

    const plResult   = derivePlayerResult(activeSlot, result)
    const rewardSeed = seed ^ activeSlot.characterId
    const baseReward = calcReward(
      plResult,
      result.darkhorses.includes(activeSlot.characterId),
      allSkillIds,
      [...activeSlot.initialSkills, ...activeSlot.acquiredSkills],
      rewardSeed,
      (activeSlot.inventory ?? []).map(it => it.itemId),
      allPassiveIds,
      activeSlot.passiveSkills ?? [],
    )
    const reward     = applyRivalGoldBonus(baseReward, activeSlot, result)

    const { unlockedCharIds } = get()
    const { slotWithPhase, newUnlocked, newlyUnlocked } =
      buildTournamentState(activeSlot, seed, result, reward, unlockedCharIds, itemsMap)

    const npcStats = updateNpcStats(activeSlot.npcStats, result)
    const nextQualifierLosers = Object.keys(calcNpcQualifierLoserBonus(result, activeSlot.characterId)).map(Number)
    const slotWithNpc: SaveSlot = { ...slotWithPhase, npcStats, savedReward: reward, prevQualifierLosers: nextQualifierLosers }
    await saveSlot(slotWithNpc)

    if (newlyUnlocked.length > 0) {
      saveUnlocked(newUnlocked)
      saveNewChars(newlyUnlocked)
      set({ unlockedCharIds: newUnlocked, newCharIds: newlyUnlocked })
    }

    set({ activeSlot: slotWithNpc, lastTournament: result, pendingReward: reward })
    return result
  },

  startTournamentAndBattle: async (seed) => {
    const { activeSlot } = get()
    if (!activeSlot) throw new Error('No active slot')

    const round      = activeSlot.currentRound
    const gameSeed   = activeSlot.gameSeed ?? activeSlot.createdAt
    const prevQualifierLosers2 = new Set(activeSlot.prevQualifierLosers ?? [])
    const growthMap: Record<number, GrowthStats> = {}
    const skillMap:  Record<number, string[]>    = {}
    const itemsMap:  Record<number, string[]>    = {}

    for (const c of characters) {
      if (c.id === activeSlot.characterId) {
        growthMap[c.id] = activeSlot.growthStats
        skillMap[c.id]  = [
          ...activeSlot.initialSkills,
          ...activeSlot.acquiredSkills,
        ].slice(0, MAX_SKILL_SLOTS)
        itemsMap[c.id]  = (activeSlot.inventory ?? []).map(it => it.itemId)
      } else {
        const isRival = (activeSlot.rivalIds ?? []).includes(c.id)
        const base = npcGrowth(round, isRival)
        const bonus = prevQualifierLosers2.has(c.id) ? 1 : 0
        growthMap[c.id] = bonus > 0
          ? { vit: base.vit + bonus, str: base.str + bonus, agi: base.agi + bonus, int: base.int + bonus, luk: base.luk + bonus }
          : base
        skillMap[c.id]  = npcRandomSkills(c.id, gameSeed)
        itemsMap[c.id]  = npcItems(c.id, round, seed)
      }
    }

    const npcInitialPassivesMap: Record<number, string[]> = {}
    for (const c of characters) {
      if (c.id !== activeSlot.characterId) {
        npcInitialPassivesMap[c.id] = npcInitialPassives(c.id, round)
      }
    }

    // 전술카드는 각 전투 직전 MatchPreviewPage에서 선택 → 여기서는 undefined
    const result = runTournament(
      characters, growthMap, skillMap, seed, round, itemsMap,
      activeSlot.characterId, undefined,
      npcInitialPassivesMap, {},
      activeSlot.passiveSkills ?? [],
      activeSlot.skillEnhancements ?? {},
    )
    await appendMatchLog(result.tournamentId, result.allMatches)

    const plResult   = derivePlayerResult(activeSlot, result)
    const rewardSeed = seed ^ activeSlot.characterId
    const baseReward = calcReward(
      plResult,
      result.darkhorses.includes(activeSlot.characterId),
      allSkillIds,
      [...activeSlot.initialSkills, ...activeSlot.acquiredSkills],
      rewardSeed,
      (activeSlot.inventory ?? []).map(it => it.itemId),
      allPassiveIds,
      activeSlot.passiveSkills ?? [],
    )
    const reward     = applyRivalGoldBonus(baseReward, activeSlot, result)

    const { unlockedCharIds } = get()
    const { slotWithPhase, playerMatches, newUnlocked, newlyUnlocked } =
      buildTournamentState(activeSlot, seed, result, reward, unlockedCharIds, itemsMap)

    const npcStats = updateNpcStats(activeSlot.npcStats, result)
    const nextQualifierLosers2 = Object.keys(calcNpcQualifierLoserBonus(result, activeSlot.characterId)).map(Number)
    const slotWithNpc: SaveSlot = { ...slotWithPhase, npcStats, savedReward: reward, prevQualifierLosers: nextQualifierLosers2 }
    await saveSlot(slotWithNpc)

    if (newlyUnlocked.length > 0) {
      saveUnlocked(newUnlocked)
      saveNewChars(newlyUnlocked)
      set({ unlockedCharIds: newUnlocked, newCharIds: newlyUnlocked })
    }

    set({
      activeSlot:             slotWithNpc,
      lastTournament:         result,
      pendingReward:          reward,
      playerMatches,
      playerMatchIndex:       0,
      phase:                  'stage_overview',
    })
  },

  startBattleForCurrentMatch: async (tactic) => {
    const { activeSlot, playerMatches, playerMatchIndex } = get()
    if (!activeSlot) return

    set({ selectedTacticCardId: tactic })

    const matchInfo = playerMatches[playerMatchIndex]
    if (!matchInfo) { set({ phase: 'battle' }); return }

    const pid      = activeSlot.characterId
    const oppId    = matchInfo.opponentId
    const round    = activeSlot.currentRound
    const isRival  = (activeSlot.rivalIds ?? []).includes(oppId)

    const playerChar = characters.find(c => c.id === pid)
    const oppChar    = characters.find(c => c.id === oppId)
    if (!playerChar || !oppChar) { set({ phase: 'battle' }); return }

    const oppGrowthStats = npcGrowth(round, isRival)
    const playerSkillList = [...activeSlot.initialSkills, ...activeSlot.acquiredSkills].slice(0, MAX_SKILL_SLOTS)
    const playerItems     = (activeSlot.inventory ?? []).map(it => it.itemId)

    const oppPassives = npcInitialPassives(oppId, round)

    const playerState: BattleCharState = {
      charId:       pid,
      currentHp:    deriveStats(playerChar.baseCombat, activeSlot.growthStats, playerChar.archetype).maxHp,
      currentMana:  0,
      gauge:        0,
      buffs:        [],
      debuffs:      [],
      cooldowns:    {},
      skills:       playerSkillList,
      growthStats:  activeSlot.growthStats,
      baseCombat:   playerChar.baseCombat,
      archetype:    playerChar.archetype,
      items:        playerItems,
      tactic:       tactic ? { cardId: tactic } : undefined,
      passives:        activeSlot.passiveSkills ?? [],
      skillEnhancements: activeSlot.skillEnhancements ?? {},
      ironWillUsed:    false,
    }

    const oppState: BattleCharState = {
      charId:       oppId,
      currentHp:    deriveStats(oppChar.baseCombat, oppGrowthStats, oppChar.archetype).maxHp,
      currentMana:  0,
      gauge:        0,
      buffs:        [],
      debuffs:      [],
      cooldowns:    {},
      skills:       matchInfo.opponentSkills,
      growthStats:  oppGrowthStats,
      baseCombat:   oppChar.baseCombat,
      archetype:    oppChar.archetype,
      items:        matchInfo.opponentItems,
      passives:        oppPassives,
      skillEnhancements: {},
      ironWillUsed:    false,
    }

    const seed = (Date.now() ^ (pid * 31) ^ playerMatchIndex) >>> 0
    const newMatchResult = simulateMatch(playerState, oppState, seed)

    // 원본 매치의 스테이지/ID 정보 보존 (BracketPage doneMatchIds 매칭에 필요)
    const orig = matchInfo.matchResult
    const updatedResult = {
      ...newMatchResult,
      matchId:        orig.matchId,
      stage:          orig.stage,
      groupId:        orig.groupId,
      groupMatchType: orig.groupMatchType,
      bracketRound:   orig.bracketRound,
    }

    const newMatchInfo: PlayerMatchInfo = {
      ...matchInfo,
      matchResult: updatedResult,
      playerWon:   updatedResult.winnerId === pid,
      wasPlayed:   true,
    }

    const newPlayerMatches: PlayerMatchInfo[] = [
      ...playerMatches.slice(0, playerMatchIndex),
      newMatchInfo,
      ...playerMatches.slice(playerMatchIndex + 1),
    ]

    set({ playerMatches: newPlayerMatches, phase: 'battle' })
  },

  advancePlayerMatch: () => {
    const { playerMatchIndex, playerMatches } = get()
    const nextIndex = playerMatchIndex + 1
    if (nextIndex >= playerMatches.length) {
      set({ phase: 'tournament' })
    } else {
      set({ playerMatchIndex: nextIndex, phase: 'match_preview' })
    }
  },

  completeMatchAndAdvance: async (won, skillId, replaceSkillId) => {
    const { activeSlot, playerMatchIndex, playerMatches } = get()
    if (!activeSlot) return

    // 경기 패배 즉시 보너스 골드
    const matchBonus = won ? 0 : MATCH_BONUS_GOLD_LOSS

    // 교체 대상 스킬 즉시 제거 (슬롯 초과 시 선택)
    let slotWithSkill: SaveSlot = { ...activeSlot, gold: (activeSlot.gold ?? 0) + matchBonus }
    if (replaceSkillId) {
      slotWithSkill = {
        ...slotWithSkill,
        initialSkills:  slotWithSkill.initialSkills.filter(s => s !== replaceSkillId),
        acquiredSkills: slotWithSkill.acquiredSkills.filter(s => s !== replaceSkillId),
      }
    }

    // 선택한 스킬을 대기열에 추가
    if (skillId) {
      const def  = (await import('../data/skills.json')).default.find(
        (s: { id: string }) => s.id === skillId,
      ) as { tier: SkillTier } | undefined
      const turns = def ? SKILL_LEARN_TURNS[def.tier] : 1
      const alreadyPending = (slotWithSkill.pendingSkills ?? []).some(p => p.skillId === skillId)
      const alreadyOwned   = [...slotWithSkill.initialSkills, ...slotWithSkill.acquiredSkills].includes(skillId)
      if (!alreadyPending && !alreadyOwned) {
        slotWithSkill = {
          ...slotWithSkill,
          pendingSkills: [...(slotWithSkill.pendingSkills ?? []), { skillId, turnsRemaining: turns }],
        }
      }
    }

    // 전투 1회 완료 → 대기 카운트다운
    const ticked  = tickPendingSkills(slotWithSkill)
    const updated: SaveSlot = { ...ticked, updatedAt: Date.now() }
    await saveSlot(updated)

    // 실제 승패에 따라 다음 경기 결정 (pre-run과 결과가 다를 수 있음)
    const { nextIndex, nextPhase } = determineNextMatch(playerMatches, playerMatchIndex, won)
    set({
      activeSlot:       updated,
      playerMatchIndex: nextPhase === 'tournament' ? playerMatchIndex : nextIndex,
      phase:            nextPhase,
    })
  },

  claimReward: async () => {
    const { activeSlot, pendingReward, lastTournament, playerMatches } = get()
    if (!activeSlot || !pendingReward) return

    const randomIdx     = Math.floor(Math.random() * GROWTH_STAT_KEYS.length)
    const randomStatKey = GROWTH_STAT_KEYS[randomIdx]

    const isWinner  = lastTournament?.winner === activeSlot.characterId
    const newGrowth = {
      ...activeSlot.growthStats,
      [randomStatKey]:
        activeSlot.growthStats[randomStatKey] + pendingReward.randomStatGain,
    }
    const newRound  = activeSlot.currentRound + 1
    const bestClear = isWinner
      ? Math.min(
          activeSlot.bestClearRound ?? activeSlot.currentRound,
          activeSlot.currentRound,
        )
      : activeSlot.bestClearRound

    // 우승 시 게임 종료, 아니면 패시브 보상 → 상점/가챠
    const nextPhase: GamePhase = isWinner ? 'slot_select' : 'passive_reward'

    const newGold = (activeSlot.gold ?? 0) + pendingReward.goldEarned

    // 이번 라운드 기록 저장
    const playedMatches = playerMatches.filter(m => m.wasPlayed)
    const record = lastTournament
      ? buildRunRecord(activeSlot, lastTournament, playedMatches.length > 0 ? playedMatches : undefined)
      : null
    const newRecords = record
      ? addRunRecord(activeSlot.runRecords ?? [], record)
      : (activeSlot.runRecords ?? [])

    const roundWins   = playerMatches.filter(m => m.wasPlayed && m.playerWon).length
    const roundLosses = playerMatches.filter(m => m.wasPlayed && !m.playerWon).length

    const updated: SaveSlot = {
      ...activeSlot,
      growthStats:    newGrowth,
      currentRound:   newRound,
      bestClearRound: bestClear,
      gold:           newGold,
      runRecords:     newRecords,
      savedPhase:     nextPhase,
      totalWins:      (activeSlot.totalWins ?? 0) + roundWins,
      totalLosses:    (activeSlot.totalLosses ?? 0) + roundLosses,
      savedReward:    undefined,
      updatedAt:      Date.now(),
    }
    await saveSlot(updated)

    // 패시브 보상: pendingReward에서 passiveChoices 사용
    const passiveRewardOpts = isWinner ? null : (pendingReward.passiveChoices ?? [])

    set({
      activeSlot:               updated,
      lastRandomStatKey:        randomStatKey,
      pendingPassiveRewardOpts: passiveRewardOpts,
      phase:                    nextPhase,
    })
  },

  acquireSkill: async (skillId, replaceId) => {
    const { activeSlot } = get()
    if (!activeSlot) return

    let initialSkills  = activeSlot.initialSkills
    let acquiredSkills = activeSlot.acquiredSkills

    if (replaceId) {
      if (initialSkills.includes(replaceId)) {
        initialSkills = initialSkills.filter(s => s !== replaceId)
      } else {
        acquiredSkills = acquiredSkills.filter(s => s !== replaceId)
      }
    }

    // v0.4.2: 라운드 2+에서는 가챠 전에 상점을 거친다
    const nextPhase: GamePhase = activeSlot.currentRound >= 2 ? 'shop' : 'gacha'

    const updated: SaveSlot = {
      ...activeSlot,
      initialSkills,
      acquiredSkills: [...acquiredSkills, skillId],
      savedPhase:     nextPhase,
      updatedAt:      Date.now(),
    }
    await saveSlot(updated)
    set({ activeSlot: updated, pendingReward: null, phase: nextPhase })
  },

  enterShopPhase: (seed) => {
    const items = rollShopItems(seed)
    set({ shopItems: items, phase: 'shop' })
  },

  buyItem: async (itemId) => {
    const { activeSlot, shopItems } = get()
    if (!activeSlot) return

    const item = getItemById(itemId)
    if (!item) return

    const currentGold = activeSlot.gold ?? 0
    if (currentGold < item.price) return

    const currentInventory = activeSlot.inventory ?? []
    if (currentInventory.length >= MAX_INVENTORY_SIZE) return

    // 스탯 아이템이면 growthStats에 영구 합산
    const newGrowth = { ...activeSlot.growthStats }
    if (item.kind === 'stat' && item.statBonus) {
      for (const k of GROWTH_STAT_KEYS) {
        const bonus = item.statBonus[k] ?? 0
        if (bonus) newGrowth[k] = newGrowth[k] + bonus
      }
    }

    const newInventory: InventoryItem[] = [
      ...currentInventory,
      { itemId, acquiredRound: activeSlot.currentRound },
    ]

    const updated: SaveSlot = {
      ...activeSlot,
      growthStats: newGrowth,
      gold:        currentGold - item.price,
      inventory:   newInventory,
      updatedAt:   Date.now(),
    }
    await saveSlot(updated)

    // 구매한 아이템을 진열대에서 1개 제거 (첫 매칭 제거)
    const idx = shopItems.findIndex(it => it.id === itemId)
    const newShop = idx >= 0
      ? [...shopItems.slice(0, idx), ...shopItems.slice(idx + 1)]
      : shopItems

    set({ activeSlot: updated, shopItems: newShop })
  },

  rerollShop: async (seed) => {
    const { activeSlot } = get()
    if (!activeSlot) return
    const currentGold = activeSlot.gold ?? 0
    if (currentGold < SHOP_REROLL_COST) return

    const updated: SaveSlot = {
      ...activeSlot,
      gold:      currentGold - SHOP_REROLL_COST,
      updatedAt: Date.now(),
    }
    await saveSlot(updated)
    set({ activeSlot: updated, shopItems: rollShopItems(seed) })
  },

  leaveShop: () => {
    set({ shopItems: [], phase: 'gacha' })
  },

  initMatchPassives: () => {
    const { activeSlot, playerMatches, playerMatchIndex, pendingPassiveOpts } = get()
    if (pendingPassiveOpts !== null) return
    if (!activeSlot) return
    const matchInfo = playerMatches[playerMatchIndex]
    if (!matchInfo) return
    if (matchInfo.matchResult.winnerId !== activeSlot.characterId) return
    const oppPassives = npcInitialPassives(matchInfo.opponentId, activeSlot.currentRound)
    const myPassives  = activeSlot.passiveSkills ?? []
    const pickable    = oppPassives.filter(id => !myPassives.includes(id))
    set({ pendingPassiveOpts: pickable.length > 0 ? pickable : null })
  },

  initMatchSkills: () => {
    const { activeSlot, playerMatches, playerMatchIndex, pendingSkillOpts } = get()
    if (pendingSkillOpts !== null) return
    if (!activeSlot) return
    const matchInfo = playerMatches[playerMatchIndex]
    if (!matchInfo) return
    if (matchInfo.matchResult.winnerId !== activeSlot.characterId) return
    const mySkills = new Set([
      ...activeSlot.initialSkills,
      ...activeSlot.acquiredSkills,
      ...(activeSlot.pendingSkills ?? []).map(p => p.skillId),
    ])
    const pickable = matchInfo.opponentSkills.filter(id => !mySkills.has(id))
    set({ pendingSkillOpts: pickable.length > 0 ? pickable : null })
  },

  acquireBattleSkill: async (skillId, replaceId) => {
    const { activeSlot, playerMatchIndex, playerMatches } = get()
    if (!activeSlot) return

    // 경기 승리 즉시 보너스 골드
    const matchInfo  = playerMatches[playerMatchIndex]
    const bonusKey   = matchInfo ? matchBonusGoldKey(matchInfo) : 'qualifier'
    const matchBonus = MATCH_BONUS_GOLD_WIN[bonusKey] ?? 30

    let updated: SaveSlot = { ...activeSlot, gold: (activeSlot.gold ?? 0) + matchBonus }

    // 교체: 기존 스킬 제거
    if (replaceId) {
      updated = {
        ...updated,
        initialSkills:  updated.initialSkills.filter(s => s !== replaceId),
        acquiredSkills: updated.acquiredSkills.filter(s => s !== replaceId),
      }
    }

    if (skillId !== null) {
      const mySkills = new Set([...updated.initialSkills, ...updated.acquiredSkills])
      if (!mySkills.has(skillId)) {
        updated = {
          ...updated,
          acquiredSkills: [...updated.acquiredSkills, skillId],
          updatedAt:      Date.now(),
        }
      }
    }

    // tick existing pending skills (from other sources)
    const ticked = tickPendingSkills(updated)
    const saved  = { ...ticked, updatedAt: Date.now() }
    await saveSlot(saved)

    set({ activeSlot: saved, pendingSkillOpts: null, pendingPassiveOpts: null })

    const { nextIndex, nextPhase } = determineNextMatch(playerMatches, playerMatchIndex, true)
    let finalMatches   = playerMatches
    let finalNextIndex = nextIndex
    let finalNextPhase = nextPhase
    if (nextPhase === 'tournament') {
      const { lastTournament } = get()
      if (lastTournament && saved) {
        const ext = buildExtendedBracketMatch(playerMatches, playerMatchIndex, lastTournament, saved.characterId, saved.currentRound)
        if (ext) {
          finalMatches   = [...playerMatches, ext]
          finalNextIndex = finalMatches.length - 1
          finalNextPhase = 'match_preview'
        }
      }
    }
    set({
      playerMatches:    finalMatches,
      playerMatchIndex: finalNextPhase === 'tournament' ? playerMatchIndex : finalNextIndex,
      phase:            finalNextPhase,
    })
  },

  acquireBattlePassive: async (passiveId, replaceId) => {
    const { activeSlot, playerMatchIndex, playerMatches } = get()
    if (!activeSlot) return

    let updatedSlot = activeSlot
    if (passiveId !== null) {
      let current = activeSlot.passiveSkills ?? []
      if (replaceId) {
        current = current.filter(id => id !== replaceId)
      }
      if (!current.includes(passiveId) && (replaceId !== undefined || current.length < MAX_PASSIVE_SLOTS)) {
        updatedSlot = {
          ...activeSlot,
          passiveSkills: [...current, passiveId],
          updatedAt:     Date.now(),
        }
      }
    }

    // 1 battle = 1 tick (win path)
    const ticked = tickPendingSkills(updatedSlot)
    const saved  = { ...ticked, updatedAt: Date.now() }
    await saveSlot(saved)

    set({ activeSlot: saved, pendingPassiveOpts: null, pendingSkillOpts: null })

    const { nextIndex, nextPhase } = determineNextMatch(playerMatches, playerMatchIndex, true)
    let finalMatches   = playerMatches
    let finalNextIndex = nextIndex
    let finalNextPhase = nextPhase
    if (nextPhase === 'tournament') {
      const { lastTournament } = get()
      if (lastTournament && saved) {
        const ext = buildExtendedBracketMatch(playerMatches, playerMatchIndex, lastTournament, saved.characterId, saved.currentRound)
        if (ext) {
          finalMatches   = [...playerMatches, ext]
          finalNextIndex = finalMatches.length - 1
          finalNextPhase = 'match_preview'
        }
      }
    }
    set({
      playerMatches:    finalMatches,
      playerMatchIndex: finalNextPhase === 'tournament' ? playerMatchIndex : finalNextIndex,
      phase:            finalNextPhase,
    })
  },

  acquirePassiveReward: async (passiveId, replaceId) => {
    const { activeSlot } = get()
    if (!activeSlot) return

    let updatedSlot = activeSlot
    if (passiveId !== null) {
      let current = activeSlot.passiveSkills ?? []
      if (replaceId) {
        current = current.filter(id => id !== replaceId)
      }
      if (!current.includes(passiveId) && (replaceId !== undefined || current.length < MAX_PASSIVE_SLOTS)) {
        updatedSlot = {
          ...activeSlot,
          passiveSkills: [...current, passiveId],
          updatedAt:     Date.now(),
        }
        await saveSlot(updatedSlot)
      }
    }

    set({
      activeSlot:               updatedSlot,
      pendingPassiveRewardOpts: null,
      phase:                    activeSlot.currentRound >= 2 ? 'shop' : 'gacha',
    })
  },

  enhanceSkill: async (skillId) => {
    const { activeSlot } = get()
    if (!activeSlot) return

    if (!activeSlot.initialSkills.includes(skillId)) throw new Error('고유 스킬만 강화할 수 있습니다')

    const enhancements = activeSlot.skillEnhancements ?? {}
    const currentLevel = enhancements[skillId] ?? 0
    if (currentLevel >= MAX_SKILL_ENHANCE_LEVEL) throw new Error('최대 강화 레벨에 도달했습니다')

    const cost = SKILL_ENHANCE_COSTS[currentLevel]
    if ((activeSlot.gold ?? 0) < cost) throw new Error('골드가 부족합니다')

    const updated: SaveSlot = {
      ...activeSlot,
      gold: (activeSlot.gold ?? 0) - cost,
      skillEnhancements: {
        ...enhancements,
        [skillId]: currentLevel + 1,
      },
      updatedAt: Date.now(),
    }
    await saveSlot(updated)
    set({ activeSlot: updated })
  },

  setPhase: (phase) => set({ phase }),

  clearNewChars: () => {
    saveNewChars([])
    set({ newCharIds: [] })
  },

  clearPlayedChars: () => {
    savePlayedChars([])
    set({ playedCharIds: [] })
  },

  setTacticCard: (cardId) => set({ selectedTacticCardId: cardId }),
}))

export { GROWTH_STAT_KEYS }
