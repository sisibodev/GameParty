import { create } from 'zustand'
import type {
  CharacterDef,
  GachaResult,
  GrowthStatKey,
  GrowthStats,
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
  | 'char_select'
  | 'stat_alloc'
  | 'gacha'
  | 'tournament'
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
}

interface GameActions {
  initSlots:        () => Promise<void>
  startNewGame:     (slotId: SlotId, charId: number, seed: number) => Promise<void>
  removeSlot:       (slotId: SlotId) => Promise<void>
  allocateStat:     (key: GrowthStatKey) => void
  confirmStatAlloc: () => Promise<void>
  runGachaPhase:    (seed: number) => Promise<GachaResult>
  startTournament:  (seed: number) => Promise<TournamentResult>
  claimReward:      () => Promise<void>
  acquireSkill:     (skillId: string, replaceId?: string) => Promise<void>
  setPhase:         (phase: GamePhase) => void
}

// ─── Static data ──────────────────────────────────────────────────────────────

const characters = charactersRaw as CharacterDef[]
const allCharIds = characters.map(c => c.id)
const allSkillIds = (skillsRaw as Array<{ id: string }>).map(s => s.id)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyGrowth(): GrowthStats {
  return { hp: 0, str: 0, agi: 0, int: 0, luk: 0 }
}

function npcGrowth(round: number): GrowthStats {
  const b = round - 1
  return { hp: b, str: b, agi: b, int: b, luk: b }
}

function npcSkills(charId: number, round: number): string[] {
  const rng = new SeededRng(charId * 1000 + round)
  return pickN(allSkillIds, INITIAL_SKILL_COUNT, rng)
}

// 16명 브래킷 기준: round 4 탈락 = 결승 패배(준우승)
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

// ─── Store ────────────────────────────────────────────────────────────────────

export const useGameStore = create<GameState & GameActions>((set, get) => ({
  phase:             'slot_select',
  slots:             [],
  activeSlot:        null,
  lastTournament:    null,
  pendingReward:     null,
  statPointsLeft:    0,
  lastRandomStatKey: null,

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

  confirmStatAlloc: async () => {
    const { activeSlot, pendingReward } = get()
    if (!activeSlot) return
    await saveSlot(activeSlot)
    // 라운드 루프 중 스탯 배분 후: 대기 스킬이 있으면 skill_select, 아니면 gacha
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
    set({ activeSlot: updated, phase: 'tournament' })
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

    const plResult    = derivePlayerResult(activeSlot, result)
    const rewardSeed  = seed ^ activeSlot.characterId
    const reward      = calcReward(
      plResult,
      result.darkhorses.includes(activeSlot.characterId),
      allSkillIds,
      [...activeSlot.initialSkills, ...activeSlot.acquiredSkills],
      rewardSeed,
    )

    set({ lastTournament: result, pendingReward: reward, phase: 'reward' })
    return result
  },

  claimReward: async () => {
    const { activeSlot, pendingReward, lastTournament } = get()
    if (!activeSlot || !pendingReward) return

    // 랜덤 스탯 자동 배정
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

    const updated: SaveSlot = {
      ...activeSlot,
      growthStats:    newGrowth,
      currentRound:   newRound,
      bestClearRound: bestClear,
    }
    await saveSlot(updated)

    // 추가 포인트 있으면 stat_alloc → confirmStatAlloc에서 skill_select/gacha 결정
    const extraPoints = pendingReward.playerExtraPoints
    const nextPhase: GamePhase =
      extraPoints > 0
        ? 'stat_alloc'
        : pendingReward.skillChoices.length > 0
          ? 'skill_select'
          : 'gacha'

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
    }
    await saveSlot(updated)
    set({ activeSlot: updated, pendingReward: null, phase: 'gacha' })
  },

  setPhase: (phase) => set({ phase }),
}))

export { GROWTH_STAT_KEYS }
