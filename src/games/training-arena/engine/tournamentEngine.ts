import type {
  BattleCharState,
  CharacterDef,
  GroupMatchType,
  GrowthStats,
  GroupResult,
  MatchResult,
  NpcRunState,
  TacticCardId,
  TournamentResult,
} from '../types'
import {
  DARKHORSE_RATIO,
  GROUP_COUNT,
  GROUP_SIZE,
  INTER_MATCH_HP_REGEN_RATIO,
  MAX_PASSIVE_SLOTS,
  MAX_SKILL_ENHANCE_LEVEL,

  NPC_ENHANCE_GOLD_THRESHOLD,
  QUALIFIER_TARGET,
  SKILL_ENHANCE_COSTS,
} from '../constants'
import { SeededRng } from '../utils/rng'
import { shuffle, pickN } from '../utils/fisherYates'
import { simulateMatch, regenHpBetweenMatches } from './battleEngine'
import { deriveStats } from './statDeriver'

// ─── NPC Gold Helpers ─────────────────────────────────────────────────────────

function npcGoldForWin(stage: string, bracketRound?: number): number {
  if (stage === 'qualifier') return 15
  if (stage === 'group') return 30
  if (stage === 'bracket') {
    if (bracketRound === 1) return 60
    if (bracketRound === 2) return 100
    if (bracketRound === 3) return 150
    return 200
  }
  return 0
}

function npcSpendGold(
  npcState: NpcRunState,
  skills: string[],
  rng: SeededRng,
  threshold: number,
): NpcRunState {
  if (npcState.gold < threshold || skills.length === 0) return npcState
  const enhanceable = skills.filter(
    id => (npcState.skillEnhancements[id] ?? 0) < MAX_SKILL_ENHANCE_LEVEL
  )
  if (enhanceable.length === 0) return npcState
  const target = rng.pick(enhanceable)
  const currentLevel = npcState.skillEnhancements[target] ?? 0
  const cost = SKILL_ENHANCE_COSTS[currentLevel]
  if (npcState.gold < cost) return npcState
  return {
    ...npcState,
    gold: npcState.gold - cost,
    skillEnhancements: {
      ...npcState.skillEnhancements,
      [target]: currentLevel + 1,
    },
  }
}

function npcPickPassive(
  npcState: NpcRunState,
  loserPassives: string[],
  rng: SeededRng,
  maxSlots: number,
): NpcRunState {
  if (npcState.passiveSkills.length >= maxSlots) return npcState
  const candidates = loserPassives.filter(id => !npcState.passiveSkills.includes(id))
  if (candidates.length === 0) return npcState
  const picked = rng.pick(candidates)
  return { ...npcState, passiveSkills: [...npcState.passiveSkills, picked] }
}

// ─── State Factory ────────────────────────────────────────────────────────────

function makeCharState(
  char: CharacterDef,
  growth: GrowthStats,
  skills: string[],
  items: string[] = [],
  tacticCardId?: TacticCardId,
  passives: string[] = [],
  skillEnhancements: Record<string, number> = {},
): BattleCharState {
  return {
    charId:      char.id,
    currentHp:   deriveStats(char.baseCombat, growth, char.archetype).maxHp,
    currentMana: 0,
    gauge:       0,
    buffs:       [],
    debuffs:     [],
    cooldowns:   {},
    skills,
    growthStats: growth,
    baseCombat:  char.baseCombat,
    archetype:   char.archetype,
    items,
    tactic:      tacticCardId ? { cardId: tacticCardId } : undefined,
    passives,
    skillEnhancements,
    ironWillUsed: false,
  }
}

// 플레이어 캐릭터에만 전술 카드 적용 (playerId + cardId 주어질 때)
function tacticFor(id: number, playerCharId?: number, tacticId?: TacticCardId): TacticCardId | undefined {
  return playerCharId !== undefined && id === playerCharId ? tacticId : undefined
}

function getCharPassives(
  id: number,
  playerCharId?: number,
  playerPassives?: string[],
  npcStates?: Record<number, NpcRunState>,
): string[] {
  if (id === playerCharId) return playerPassives ?? []
  return npcStates?.[id]?.passiveSkills ?? []
}

function getCharEnhancements(
  id: number,
  playerCharId?: number,
  playerEnhancements?: Record<string, number>,
  npcStates?: Record<number, NpcRunState>,
): Record<string, number> {
  if (id === playerCharId) return playerEnhancements ?? {}
  return npcStates?.[id]?.skillEnhancements ?? {}
}

// ─── NPC state update after match ─────────────────────────────────────────────

function updateNpcStateAfterMatch(
  result: MatchResult,
  npcStates: Record<number, NpcRunState>,
  skillMap: Record<number, string[]>,
  rng: SeededRng,
  playerCharId?: number,
  playerPassives?: string[],
): void {
  if (result.winnerId === playerCharId) return
  const winGold = npcGoldForWin(result.stage ?? 'qualifier', result.bracketRound)
  let winnerState = npcStates[result.winnerId] ?? { gold: 0, skillEnhancements: {}, passiveSkills: [] }
  winnerState = { ...winnerState, gold: winnerState.gold + winGold }
  if (winnerState.gold >= NPC_ENHANCE_GOLD_THRESHOLD) {
    winnerState = npcSpendGold(winnerState, skillMap[result.winnerId] ?? [], rng, NPC_ENHANCE_GOLD_THRESHOLD)
  }
  const loserPassives = result.loserId === playerCharId
    ? (playerPassives ?? [])
    : (npcStates[result.loserId]?.passiveSkills ?? [])
  winnerState = npcPickPassive(winnerState, loserPassives, rng, MAX_PASSIVE_SLOTS)
  npcStates[result.winnerId] = winnerState
}

// ─── Qualifier (survival rounds → QUALIFIER_TARGET advance) ──────────────────

function runQualifier(
  participants: CharacterDef[],
  growthMap: Record<number, GrowthStats>,
  skillMap:  Record<number, string[]>,
  itemsMap:  Record<number, string[]>,
  rng: SeededRng,
  allMatches: MatchResult[],
  npcStates: Record<number, NpcRunState>,
  playerCharId?: number,
  tacticCardId?: TacticCardId,
  playerPassives?: string[],
  playerEnhancements?: Record<string, number>,
): number[] {
  let pool     = participants.map(c => c.id)
  const charById = Object.fromEntries(participants.map(c => [c.id, c]))
  const hpMap: Record<number, number> = {}
  for (const c of participants) {
    hpMap[c.id] = deriveStats(c.baseCombat, growthMap[c.id], c.archetype).maxHp
  }

  while (pool.length > QUALIFIER_TARGET) {
    const matchCount = Math.min(pool.length - QUALIFIER_TARGET, Math.floor(pool.length / 2))
    const shuffled   = shuffle(pool, rng)
    const losers: number[] = []

    for (let i = 0; i < matchCount; i++) {
      const id1  = shuffled[i * 2]
      const id2  = shuffled[i * 2 + 1]
      const seed = rng.int(0, 1_000_000)

      const s1 = {
        ...makeCharState(
          charById[id1], growthMap[id1], skillMap[id1], itemsMap[id1] ?? [],
          tacticFor(id1, playerCharId, tacticCardId),
          getCharPassives(id1, playerCharId, playerPassives, npcStates),
          getCharEnhancements(id1, playerCharId, playerEnhancements, npcStates),
        ),
        currentHp: hpMap[id1],
      }
      const s2 = {
        ...makeCharState(
          charById[id2], growthMap[id2], skillMap[id2], itemsMap[id2] ?? [],
          tacticFor(id2, playerCharId, tacticCardId),
          getCharPassives(id2, playerCharId, playerPassives, npcStates),
          getCharEnhancements(id2, playerCharId, playerEnhancements, npcStates),
        ),
        currentHp: hpMap[id2],
      }

      const result = simulateMatch(s1, s2, seed)
      result.stage = 'qualifier'
      allMatches.push(result)

      const winnerLastHp = result.log.at(-1)?.hpAfter[result.winnerId] ?? hpMap[result.winnerId]
      hpMap[result.winnerId] = regenHpBetweenMatches(
        winnerLastHp,
        deriveStats(charById[result.winnerId].baseCombat, growthMap[result.winnerId], charById[result.winnerId].archetype).maxHp,
        INTER_MATCH_HP_REGEN_RATIO,
      )
      updateNpcStateAfterMatch(result, npcStates, skillMap, rng, playerCharId, playerPassives)
      losers.push(result.loserId)
    }

    pool = pool.filter(id => !losers.includes(id))
  }

  return pool
}

// ─── Group Stage (32 → 16) — double-elimination format ───────────────────────
// Match 1 (initial): a vs b
// Match 2 (initial): c vs d
// Match 3 (winners): w1 vs w2  → winner = rank1 (direct advance, skips match5)
// Match 4 (losers):  l1 vs l2  → loser = eliminated
// Match 5 (decider): losers3 vs winners4 → winner = rank2

function playGroupMatch(
  id1: number, id2: number,
  type: GroupMatchType,
  groupId: string,
  charById: Record<number, CharacterDef>,
  growthMap: Record<number, GrowthStats>,
  skillMap: Record<number, string[]>,
  itemsMap: Record<number, string[]>,
  rng: SeededRng,
  allMatches: MatchResult[],
  hpMap: Record<number, number>,
  npcStates: Record<number, NpcRunState>,
  playerCharId?: number,
  tacticCardId?: TacticCardId,
  playerPassives?: string[],
  playerEnhancements?: Record<string, number>,
): MatchResult {
  const result = simulateMatch(
    makeCharState(
      charById[id1], growthMap[id1], skillMap[id1], itemsMap[id1] ?? [],
      tacticFor(id1, playerCharId, tacticCardId),
      getCharPassives(id1, playerCharId, playerPassives, npcStates),
      getCharEnhancements(id1, playerCharId, playerEnhancements, npcStates),
    ),
    makeCharState(
      charById[id2], growthMap[id2], skillMap[id2], itemsMap[id2] ?? [],
      tacticFor(id2, playerCharId, tacticCardId),
      getCharPassives(id2, playerCharId, playerPassives, npcStates),
      getCharEnhancements(id2, playerCharId, playerEnhancements, npcStates),
    ),
    rng.int(0, 1_000_000),
  )
  result.stage          = 'group'
  result.groupId        = groupId
  result.groupMatchType = type
  allMatches.push(result)
  // HP regen for winner
  const winnerLastHp = result.log.at(-1)?.hpAfter[result.winnerId] ?? hpMap[result.winnerId]
  hpMap[result.winnerId] = regenHpBetweenMatches(
    winnerLastHp,
    deriveStats(charById[result.winnerId].baseCombat, growthMap[result.winnerId], charById[result.winnerId].archetype).maxHp,
    INTER_MATCH_HP_REGEN_RATIO,
  )
  updateNpcStateAfterMatch(result, npcStates, skillMap, rng, playerCharId, playerPassives)
  return result
}

function runGroup(
  groupId: string,
  memberIds: [number, number, number, number],
  charById: Record<number, CharacterDef>,
  growthMap: Record<number, GrowthStats>,
  skillMap:  Record<number, string[]>,
  itemsMap:  Record<number, string[]>,
  rng: SeededRng,
  allMatches: MatchResult[],
  npcStates: Record<number, NpcRunState>,
  playerCharId?: number,
  tacticCardId?: TacticCardId,
  playerPassives?: string[],
  playerEnhancements?: Record<string, number>,
): GroupResult {
  const [a, b, c, d] = memberIds
  const hpMap: Record<number, number> = {}
  for (const id of memberIds) {
    hpMap[id] = deriveStats(charById[id].baseCombat, growthMap[id], charById[id].archetype).maxHp
  }
  const play = (id1: number, id2: number, type: GroupMatchType) =>
    playGroupMatch(
      id1, id2, type, groupId, charById, growthMap, skillMap, itemsMap,
      rng, allMatches, hpMap, npcStates, playerCharId, tacticCardId, playerPassives, playerEnhancements,
    )

  const m1 = play(a, b, 'initial')
  const m2 = play(c, d, 'initial')

  const [w1, l1] = [m1.winnerId, m1.loserId]
  const [w2, l2] = [m2.winnerId, m2.loserId]

  const m3 = play(w1, w2, 'winners')
  const m4 = play(l1, l2, 'losers')

  const rank1        = m3.winnerId
  const winnersLoser = m3.loserId
  const losersWinner = m4.winnerId
  const eliminated1  = m4.loserId

  const m5   = play(winnersLoser, losersWinner, 'decider')
  const rank2       = m5.winnerId
  const eliminated2 = m5.loserId

  return {
    groupId,
    players:    memberIds,
    rank1,
    rank2,
    eliminated: [eliminated1, eliminated2],
  }
}

// ─── Bracket (16 → 1) ─────────────────────────────────────────────────────────

function runBracket(
  finalists: number[],
  charById: Record<number, CharacterDef>,
  growthMap: Record<number, GrowthStats>,
  skillMap:  Record<number, string[]>,
  itemsMap:  Record<number, string[]>,
  rng: SeededRng,
  allMatches: MatchResult[],
  bracketEliminations: Record<number, number>,
  npcStates: Record<number, NpcRunState>,
  playerCharId?: number,
  tacticCardId?: TacticCardId,
  playerPassives?: string[],
  playerEnhancements?: Record<string, number>,
): number {
  let pool = shuffle(finalists, rng)
  let bracketRound = 1

  // Initialize HP map at max HP for all finalists
  const hpMap: Record<number, number> = {}
  for (const id of finalists) {
    hpMap[id] = deriveStats(charById[id].baseCombat, growthMap[id], charById[id].archetype).maxHp
  }

  while (pool.length > 1) {
    const next: number[] = []
    for (let i = 0; i < pool.length; i += 2) {
      if (i + 1 >= pool.length) { next.push(pool[i]); continue }
      const seed   = rng.int(0, 1_000_000)
      const result = simulateMatch(
        makeCharState(
          charById[pool[i]], growthMap[pool[i]], skillMap[pool[i]], itemsMap[pool[i]] ?? [],
          tacticFor(pool[i], playerCharId, tacticCardId),
          getCharPassives(pool[i], playerCharId, playerPassives, npcStates),
          getCharEnhancements(pool[i], playerCharId, playerEnhancements, npcStates),
        ),
        makeCharState(
          charById[pool[i + 1]], growthMap[pool[i + 1]], skillMap[pool[i + 1]], itemsMap[pool[i + 1]] ?? [],
          tacticFor(pool[i + 1], playerCharId, tacticCardId),
          getCharPassives(pool[i + 1], playerCharId, playerPassives, npcStates),
          getCharEnhancements(pool[i + 1], playerCharId, playerEnhancements, npcStates),
        ),
        seed,
      )
      result.stage        = 'bracket'
      result.bracketRound = bracketRound
      allMatches.push(result)
      bracketEliminations[result.loserId] = bracketRound
      // HP regen for winner
      const winnerLastHp = result.log.at(-1)?.hpAfter[result.winnerId] ?? hpMap[result.winnerId]
      hpMap[result.winnerId] = regenHpBetweenMatches(
        winnerLastHp,
        deriveStats(charById[result.winnerId].baseCombat, growthMap[result.winnerId], charById[result.winnerId].archetype).maxHp,
        INTER_MATCH_HP_REGEN_RATIO,
      )
      updateNpcStateAfterMatch(result, npcStates, skillMap, rng, playerCharId, playerPassives)
      next.push(result.winnerId)
    }
    pool = next
    bracketRound++
  }

  return pool[0]
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function runTournament(
  participants: CharacterDef[],
  growthMap: Record<number, GrowthStats>,
  skillMap:  Record<number, string[]>,
  seed: number,
  round: number,
  itemsMap:  Record<number, string[]> = {},
  playerCharId?: number,
  tacticCardId?: TacticCardId,
  npcInitialPassives: Record<number, string[]> = {},
  npcInitialEnhancements: Record<number, Record<string, number>> = {},
  playerPassives: string[] = [],
  playerEnhancements: Record<string, number> = {},
): TournamentResult {
  const rng        = new SeededRng(seed)
  const allMatches: MatchResult[] = []
  const charById   = Object.fromEntries(participants.map(c => [c.id, c]))

  // Initialize NPC run states
  const npcStates: Record<number, NpcRunState> = {}
  for (const c of participants) {
    if (c.id === playerCharId) continue
    npcStates[c.id] = {
      gold: 0,
      skillEnhancements: { ...(npcInitialEnhancements[c.id] ?? {}) },
      passiveSkills: [...(npcInitialPassives[c.id] ?? [])],
    }
  }

  const qualifiers = runQualifier(
    participants, growthMap, skillMap, itemsMap, rng, allMatches,
    npcStates, playerCharId, tacticCardId, playerPassives, playerEnhancements,
  )

  const shuffledQ  = shuffle(qualifiers, rng)
  const groups: GroupResult[] = []
  const finalists: number[] = []
  const groupLabels = 'ABCDEFGH'

  for (let g = 0; g < GROUP_COUNT; g++) {
    const memberIds = shuffledQ.slice(g * GROUP_SIZE, g * GROUP_SIZE + GROUP_SIZE) as [number, number, number, number]
    const result    = runGroup(
      groupLabels[g], memberIds, charById, growthMap, skillMap, itemsMap, rng, allMatches,
      npcStates, playerCharId, tacticCardId, playerPassives, playerEnhancements,
    )
    groups.push(result)
    finalists.push(result.rank1, result.rank2)
  }

  const bracketEliminations: Record<number, number> = {}
  const winner     = runBracket(
    finalists, charById, growthMap, skillMap, itemsMap, rng, allMatches,
    bracketEliminations, npcStates, playerCharId, tacticCardId, playerPassives, playerEnhancements,
  )

  const qualifierLosers = participants.map(c => c.id).filter(id => !qualifiers.includes(id))
  const darkhorseCount  = Math.floor(qualifierLosers.length * DARKHORSE_RATIO)
  const darkhorses      = pickN(qualifierLosers, darkhorseCount, rng)

  return {
    tournamentId: `tournament_${seed}_r${round}`,
    round,
    seed,
    participants: participants.map(c => c.id),
    qualifiers,
    groups,
    finalists,
    bracketEliminations,
    winner,
    darkhorses,
    allMatches,
  }
}
