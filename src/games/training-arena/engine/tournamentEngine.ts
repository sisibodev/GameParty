import type {
  BattleCharState,
  CharacterDef,
  GroupMatchType,
  GrowthStats,
  GroupResult,
  MatchResult,
  TacticCardId,
  TournamentResult,
} from '../types'
import {
  DARKHORSE_RATIO,
  GROUP_COUNT,
  GROUP_SIZE,
  INTER_MATCH_HP_REGEN_RATIO,
  MAX_SKILL_SLOTS,
  QUALIFIER_TARGET,
} from '../constants'
import { SeededRng } from '../utils/rng'
import { shuffle, pickN } from '../utils/fisherYates'
import { simulateMatch, regenHpBetweenMatches } from './battleEngine'
import { deriveStats } from './statDeriver'
import skillsRaw from '../data/skills.json'

// ─── Skill Learning Helper ────────────────────────────────────────────────────

const TIER_RANK: Record<string, number> = { common: 1, rare: 2, hero: 3, legend: 4 }
const _skillMap = Object.fromEntries(
  (skillsRaw as Array<{ id: string; tier: string }>).map(s => [s.id, s])
)

function pickSkillToLearn(
  winnerSkills: string[],
  loserSkills:  string[],
  maxSlots:     number,
): string | null {
  if (winnerSkills.length >= maxSlots) return null
  const candidates = loserSkills.filter(id => !winnerSkills.includes(id))
  if (candidates.length === 0) return null
  candidates.sort(
    (a, b) =>
      (TIER_RANK[_skillMap[b]?.tier ?? 'common'] ?? 1) -
      (TIER_RANK[_skillMap[a]?.tier ?? 'common'] ?? 1),
  )
  return candidates[0]
}

// ─── State Factory ────────────────────────────────────────────────────────────

function makeCharState(
  char: CharacterDef,
  growth: GrowthStats,
  skills: string[],
  items: string[] = [],
  tacticCardId?: TacticCardId,
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
  }
}

// 플레이어 캐릭터에만 전술 카드 적용 (playerId + cardId 주어질 때)
function tacticFor(id: number, playerCharId?: number, tacticId?: TacticCardId): TacticCardId | undefined {
  return playerCharId !== undefined && id === playerCharId ? tacticId : undefined
}

// ─── Qualifier (survival rounds → QUALIFIER_TARGET advance) ──────────────────

function runQualifier(
  participants: CharacterDef[],
  growthMap: Record<number, GrowthStats>,
  skillMap:  Record<number, string[]>,
  itemsMap:  Record<number, string[]>,
  rng: SeededRng,
  allMatches: MatchResult[],
  playerCharId?: number,
  tacticCardId?: TacticCardId,
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

      const s1 = { ...makeCharState(charById[id1], growthMap[id1], skillMap[id1], itemsMap[id1] ?? [], tacticFor(id1, playerCharId, tacticCardId)), currentHp: hpMap[id1] }
      const s2 = { ...makeCharState(charById[id2], growthMap[id2], skillMap[id2], itemsMap[id2] ?? [], tacticFor(id2, playerCharId, tacticCardId)), currentHp: hpMap[id2] }

      const result = simulateMatch(s1, s2, seed)
      result.stage = 'qualifier'
      allMatches.push(result)

      const winnerLastHp = result.log.at(-1)?.hpAfter[result.winnerId] ?? hpMap[result.winnerId]
      hpMap[result.winnerId] = regenHpBetweenMatches(
        winnerLastHp,
        deriveStats(charById[result.winnerId].baseCombat, growthMap[result.winnerId], charById[result.winnerId].archetype).maxHp,
        INTER_MATCH_HP_REGEN_RATIO,
      )
      const learned = pickSkillToLearn(skillMap[result.winnerId], skillMap[result.loserId], MAX_SKILL_SLOTS)
      if (learned) skillMap[result.winnerId] = [...skillMap[result.winnerId], learned]
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
  playerCharId?: number,
  tacticCardId?: TacticCardId,
): MatchResult {
  const result = simulateMatch(
    makeCharState(charById[id1], growthMap[id1], skillMap[id1], itemsMap[id1] ?? [], tacticFor(id1, playerCharId, tacticCardId)),
    makeCharState(charById[id2], growthMap[id2], skillMap[id2], itemsMap[id2] ?? [], tacticFor(id2, playerCharId, tacticCardId)),
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
  // Skill learning for winner
  const learned = pickSkillToLearn(skillMap[result.winnerId], skillMap[result.loserId], MAX_SKILL_SLOTS)
  if (learned) skillMap[result.winnerId] = [...skillMap[result.winnerId], learned]
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
  playerCharId?: number,
  tacticCardId?: TacticCardId,
): GroupResult {
  const [a, b, c, d] = memberIds
  const hpMap: Record<number, number> = {}
  for (const id of memberIds) {
    hpMap[id] = deriveStats(charById[id].baseCombat, growthMap[id], charById[id].archetype).maxHp
  }
  const play = (id1: number, id2: number, type: GroupMatchType) =>
    playGroupMatch(id1, id2, type, groupId, charById, growthMap, skillMap, itemsMap, rng, allMatches, hpMap, playerCharId, tacticCardId)

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
  playerCharId?: number,
  tacticCardId?: TacticCardId,
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
        makeCharState(charById[pool[i]],     growthMap[pool[i]],     skillMap[pool[i]],     itemsMap[pool[i]]     ?? [], tacticFor(pool[i],     playerCharId, tacticCardId)),
        makeCharState(charById[pool[i + 1]], growthMap[pool[i + 1]], skillMap[pool[i + 1]], itemsMap[pool[i + 1]] ?? [], tacticFor(pool[i + 1], playerCharId, tacticCardId)),
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
      // Skill learning for winner
      const learned = pickSkillToLearn(skillMap[result.winnerId], skillMap[result.loserId], MAX_SKILL_SLOTS)
      if (learned) skillMap[result.winnerId] = [...skillMap[result.winnerId], learned]
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
): TournamentResult {
  const rng        = new SeededRng(seed)
  const allMatches: MatchResult[] = []
  const charById   = Object.fromEntries(participants.map(c => [c.id, c]))

  const qualifiers = runQualifier(participants, growthMap, skillMap, itemsMap, rng, allMatches, playerCharId, tacticCardId)

  const shuffledQ  = shuffle(qualifiers, rng)
  const groups: GroupResult[] = []
  const finalists: number[] = []
  const groupLabels = 'ABCDEFGH'

  for (let g = 0; g < GROUP_COUNT; g++) {
    const memberIds = shuffledQ.slice(g * GROUP_SIZE, g * GROUP_SIZE + GROUP_SIZE) as [number, number, number, number]
    const result    = runGroup(groupLabels[g], memberIds, charById, growthMap, skillMap, itemsMap, rng, allMatches, playerCharId, tacticCardId)
    groups.push(result)
    finalists.push(result.rank1, result.rank2)
  }

  const bracketEliminations: Record<number, number> = {}
  const winner     = runBracket(finalists, charById, growthMap, skillMap, itemsMap, rng, allMatches, bracketEliminations, playerCharId, tacticCardId)

  const eliminated = qualifiers.filter(id => !finalists.includes(id))
  const darkhorseCount = Math.floor(finalists.length * DARKHORSE_RATIO)
  const darkhorses = pickN(eliminated, darkhorseCount, rng)

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
