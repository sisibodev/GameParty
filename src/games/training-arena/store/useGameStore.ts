import { create } from 'zustand'
import type {
  CharacterDef,
  GachaResult,
  GrowthStatKey,
  GrowthStats,
  PlayerMatchInfo,
  PlayerTournamentResult,
  RewardPackage,
  SaveSlot,
  SlotId,
  TournamentResult,
} from '../types'
import {
  GROWTH_STAT_KEYS,
  INITIAL_PLAYER_STAT_POINTS,
  INITIAL_SKILL_COUNT,
  INITIAL_UNLOCKED_CHAR_IDS,
  NPC_BASE_GROWTH,
} from '../constants'
import { runTournament } from '../engine/tournamentEngine'
import { runGacha }      from '../engine/gachaEngine'
import { calcReward }    from '../engine/rewardEngine'
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

// ─── Types ────────────────────────────────────────────────────────────────────

export type GamePhase =
  | 'slot_select'
  | 'encyclopedia'
  | 'ranking'
  | 'simulation'
  | 'char_select'
  | 'stat_alloc'
  | 'gacha'
  | 'match_preview'
  | 'battle'
  | 'match_result'
  | 'tournament'
  | 'bracket'
  | 'reward'
  | 'skill_select'
  | 'replay'

interface GameState {
  phase:             GamePhase
  slots:             SaveSlot[]
  activeSlot:        SaveSlot | null
  lastTournament:    TournamentResult | null
  pendingReward:     RewardPackage | null
  statPointsLeft:    number
  lastRandomStatKey: GrowthStatKey | null
  unlockedCharIds:   number[]
  newCharIds:        number[]
  playerMatches:     PlayerMatchInfo[]
  playerMatchIndex:  number
}

interface GameActions {
  initSlots:               () => Promise<void>
  startNewGame:            (slotId: SlotId, charId: number, seed: number) => Promise<void>
  removeSlot:              (slotId: SlotId) => Promise<void>
  allocateStat:            (key: GrowthStatKey) => void
  allocateStatBy:          (key: GrowthStatKey, n: number) => void
  resetStat:               (key: GrowthStatKey) => void
  resetAllStats:           () => void
  confirmStatAlloc:        () => Promise<void>
  runGachaPhase:           (seed: number) => Promise<GachaResult>
  startTournament:         (seed: number) => Promise<TournamentResult>
  startTournamentAndBattle:(seed: number) => Promise<void>
  advancePlayerMatch:      () => void
  claimReward:             () => Promise<void>
  acquireSkill:            (skillId: string, replaceId?: string) => Promise<void>
  setPhase:                (phase: GamePhase) => void
  clearNewChars:           () => void
}

// ─── Static data ──────────────────────────────────────────────────────────────

const characters    = (charactersRaw as CharacterDef[]).filter(c => c.ipId == null)
const allCharIds    = characters.map(c => c.id)
const allSkillIds   = (skillsRaw as Array<{ id: string }>).map(s => s.id)

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyGrowth(): GrowthStats {
  return { hp: 0, str: 0, agi: 0, int: 0, luk: 0 }
}

function npcGrowth(round: number): GrowthStats {
  const b = NPC_BASE_GROWTH + (round - 1)
  return { hp: b, str: b, agi: b, int: b, luk: b }
}

function npcSkills(charId: number, round: number): string[] {
  const rng = new SeededRng(charId * 1000 + round)
  return pickN(allSkillIds, INITIAL_SKILL_COUNT, rng)
}

const FINALIST_BRACKET_ROUND = 4

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

function extractPlayerMatches(result: TournamentResult, playerCharId: number): PlayerMatchInfo[] {
  const pid = playerCharId
  let qualCount = 0
  const groupMatchCounts: Record<string, number> = {}
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

      return { matchResult: m, stageLabel, opponentId, playerWon }
    })
}

function buildTournamentState(
  activeSlot: SaveSlot,
  seed: number,
  result: TournamentResult,
  reward: RewardPackage,
  currentUnlocked: number[],
): {
  slotWithPhase: SaveSlot
  playerMatches: PlayerMatchInfo[]
  newUnlocked: number[]
  newlyUnlocked: number[]
} {
  const pid        = activeSlot.characterId
  const opponents  = result.allMatches
    .filter(m => m.char1Id === pid || m.char2Id === pid)
    .map(m => m.char1Id === pid ? m.char2Id : m.char1Id)
  const newlyUnlocked = opponents.filter(id => !currentUnlocked.includes(id))
  const newUnlocked   = newlyUnlocked.length > 0 ? [...currentUnlocked, ...newlyUnlocked] : currentUnlocked

  const slotWithPhase: SaveSlot = { ...activeSlot, savedPhase: 'reward', updatedAt: Date.now() }
  const playerMatches = extractPlayerMatches(result, pid)

  return { slotWithPhase, playerMatches, newUnlocked, newlyUnlocked }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useGameStore = create<GameState & GameActions>((set, get) => ({
  phase:             'slot_select',
  slots:             [],
  activeSlot:        null,
  lastTournament:    null,
  pendingReward:     null,
  statPointsLeft:    0,
  lastRandomStatKey: null,
  unlockedCharIds:   loadUnlocked(),
  newCharIds:        loadNewChars(),
  playerMatches:     [],
  playerMatchIndex:  0,

  initSlots: async () => {
    const slots = await listSlots()
    set({ slots })
  },

  startNewGame: async (slotId, charId, seed) => {
    const rng           = new SeededRng(seed)
    const initialSkills = pickN(allSkillIds, INITIAL_SKILL_COUNT, rng)
    const now           = Date.now()
    const slot: SaveSlot = {
      slotId,
      characterId:    charId,
      initialSkills,
      growthStats:    emptyGrowth(),
      acquiredSkills: [],
      currentRound:   1,
      bestClearRound: null,
      createdAt:      now,
      updatedAt:      now,
    }
    await saveSlot(slot)
    const slots = await listSlots()
    set({
      slots,
      activeSlot:        slot,
      statPointsLeft:    INITIAL_PLAYER_STAT_POINTS,
      lastRandomStatKey: null,
      phase:             'stat_alloc',
    })
  },

  removeSlot: async (slotId) => {
    await deleteSlot(slotId)
    const slots = await listSlots()
    set({ slots })
  },

  allocateStat: (key) => {
    const { activeSlot, statPointsLeft } = get()
    if (!activeSlot || statPointsLeft <= 0) return
    set({
      activeSlot: {
        ...activeSlot,
        growthStats: {
          ...activeSlot.growthStats,
          [key]: activeSlot.growthStats[key] + 1,
        },
      },
      statPointsLeft: statPointsLeft - 1,
    })
  },

  allocateStatBy: (key, n) => {
    const { activeSlot, statPointsLeft } = get()
    if (!activeSlot || statPointsLeft <= 0) return
    const actual = Math.min(n, statPointsLeft)
    set({
      activeSlot: {
        ...activeSlot,
        growthStats: {
          ...activeSlot.growthStats,
          [key]: activeSlot.growthStats[key] + actual,
        },
      },
      statPointsLeft: statPointsLeft - actual,
    })
  },

  resetStat: (key) => {
    const { activeSlot, statPointsLeft } = get()
    if (!activeSlot) return
    const current = activeSlot.growthStats[key]
    if (current <= 0) return
    set({
      activeSlot: {
        ...activeSlot,
        growthStats: { ...activeSlot.growthStats, [key]: 0 },
      },
      statPointsLeft: statPointsLeft + current,
    })
  },

  resetAllStats: () => {
    const { activeSlot, statPointsLeft } = get()
    if (!activeSlot) return
    const g = activeSlot.growthStats
    const returned = g.hp + g.str + g.agi + g.int + g.luk
    set({
      activeSlot: {
        ...activeSlot,
        growthStats: { hp: 0, str: 0, agi: 0, int: 0, luk: 0 },
      },
      statPointsLeft: statPointsLeft + returned,
    })
  },

  confirmStatAlloc: async () => {
    const { activeSlot, pendingReward } = get()
    if (!activeSlot) return
    await saveSlot(activeSlot)
    const nextPhase: GamePhase =
      (pendingReward?.skillChoices.length ?? 0) > 0 ? 'skill_select' : 'gacha'
    set({ phase: nextPhase })
  },

  runGachaPhase: async (seed) => {
    const { activeSlot } = get()
    if (!activeSlot) throw new Error('No active slot')

    const result    = runGacha(activeSlot.characterId, allCharIds, seed)
    const newGrowth = { ...activeSlot.growthStats }

    for (const card of result.playerGains) {
      newGrowth[card.statKey] = newGrowth[card.statKey] + card.statGain
    }

    const updated: SaveSlot = { ...activeSlot, growthStats: newGrowth }
    await saveSlot(updated)
    set({ activeSlot: updated })
    return result
  },

  startTournament: async (seed) => {
    const { activeSlot } = get()
    if (!activeSlot) throw new Error('No active slot')

    const round      = activeSlot.currentRound
    const growthMap: Record<number, GrowthStats> = {}
    const skillMap:  Record<number, string[]>    = {}

    for (const c of characters) {
      if (c.id === activeSlot.characterId) {
        growthMap[c.id] = activeSlot.growthStats
        skillMap[c.id]  = [
          ...activeSlot.initialSkills,
          ...activeSlot.acquiredSkills,
        ].slice(0, 8)
      } else {
        growthMap[c.id] = npcGrowth(round)
        skillMap[c.id]  = npcSkills(c.id, round)
      }
    }

    const result = runTournament(characters, growthMap, skillMap, seed, round)
    await appendMatchLog(result.tournamentId, result.allMatches)

    const plResult   = derivePlayerResult(activeSlot, result)
    const rewardSeed = seed ^ activeSlot.characterId
    const reward     = calcReward(
      plResult,
      result.darkhorses.includes(activeSlot.characterId),
      allSkillIds,
      [...activeSlot.initialSkills, ...activeSlot.acquiredSkills],
      rewardSeed,
    )

    const { unlockedCharIds } = get()
    const { slotWithPhase, newUnlocked, newlyUnlocked } =
      buildTournamentState(activeSlot, seed, result, reward, unlockedCharIds)

    await saveSlot(slotWithPhase)

    if (newlyUnlocked.length > 0) {
      saveUnlocked(newUnlocked)
      saveNewChars(newlyUnlocked)
      set({ unlockedCharIds: newUnlocked, newCharIds: newlyUnlocked })
    }

    set({ activeSlot: slotWithPhase, lastTournament: result, pendingReward: reward })
    return result
  },

  startTournamentAndBattle: async (seed) => {
    const { activeSlot } = get()
    if (!activeSlot) throw new Error('No active slot')

    const round      = activeSlot.currentRound
    const growthMap: Record<number, GrowthStats> = {}
    const skillMap:  Record<number, string[]>    = {}

    for (const c of characters) {
      if (c.id === activeSlot.characterId) {
        growthMap[c.id] = activeSlot.growthStats
        skillMap[c.id]  = [
          ...activeSlot.initialSkills,
          ...activeSlot.acquiredSkills,
        ].slice(0, 8)
      } else {
        growthMap[c.id] = npcGrowth(round)
        skillMap[c.id]  = npcSkills(c.id, round)
      }
    }

    const result = runTournament(characters, growthMap, skillMap, seed, round)
    await appendMatchLog(result.tournamentId, result.allMatches)

    const plResult   = derivePlayerResult(activeSlot, result)
    const rewardSeed = seed ^ activeSlot.characterId
    const reward     = calcReward(
      plResult,
      result.darkhorses.includes(activeSlot.characterId),
      allSkillIds,
      [...activeSlot.initialSkills, ...activeSlot.acquiredSkills],
      rewardSeed,
    )

    const { unlockedCharIds } = get()
    const { slotWithPhase, playerMatches, newUnlocked, newlyUnlocked } =
      buildTournamentState(activeSlot, seed, result, reward, unlockedCharIds)

    await saveSlot(slotWithPhase)

    if (newlyUnlocked.length > 0) {
      saveUnlocked(newUnlocked)
      saveNewChars(newlyUnlocked)
      set({ unlockedCharIds: newUnlocked, newCharIds: newlyUnlocked })
    }

    set({
      activeSlot:       slotWithPhase,
      lastTournament:   result,
      pendingReward:    reward,
      playerMatches,
      playerMatchIndex: 0,
      phase:            'match_preview',
    })
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

  claimReward: async () => {
    const { activeSlot, pendingReward, lastTournament } = get()
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

    const extraPoints = pendingReward.playerExtraPoints
    const nextPhase: GamePhase =
      extraPoints > 0
        ? 'stat_alloc'
        : pendingReward.skillChoices.length > 0
          ? 'skill_select'
          : 'gacha'

    const updated: SaveSlot = {
      ...activeSlot,
      growthStats:    newGrowth,
      currentRound:   newRound,
      bestClearRound: bestClear,
      savedPhase:     nextPhase,
      updatedAt:      Date.now(),
    }
    await saveSlot(updated)

    set({
      activeSlot:        updated,
      statPointsLeft:    extraPoints,
      lastRandomStatKey: randomStatKey,
      phase:             nextPhase,
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

    const updated: SaveSlot = {
      ...activeSlot,
      initialSkills,
      acquiredSkills: [...acquiredSkills, skillId],
      savedPhase:     'gacha',
      updatedAt:      Date.now(),
    }
    await saveSlot(updated)
    set({ activeSlot: updated, pendingReward: null, phase: 'gacha' })
  },

  setPhase: (phase) => set({ phase }),

  clearNewChars: () => {
    saveNewChars([])
    set({ newCharIds: [] })
  },
}))

export { GROWTH_STAT_KEYS }
