import type {
  BattleCharState,
  CharacterDef,
  GroupMatchType,
  GrowthStats,
  GroupResult,
  MatchResult,
  TournamentResult,
} from '../types'
import {
  DARKHORSE_RATIO,
  GROUP_COUNT,
  GROUP_SIZE,
  INTER_MATCH_HP_REGEN_RATIO,
  QUALIFIER_TARGET,
} from '../constants'
import { SeededRng } from '../utils/rng'
import { shuffle, pickN } from '../utils/fisherYates'
import { simulateMatch, regenHpBetweenMatches } from './battleEngine'
import { deriveStats } from './statDeriver'

// ─── State Factory ────────────────────────────────────────────────────────────

function makeCharState(
  char: CharacterDef,
  growth: GrowthStats,
  skills: string[],
): BattleCharState {
  return {
    charId:      char.id,
    currentHp:   deriveStats(char.baseCombat, growth).maxHp,
    currentMana: 0,
    gauge:       0,
    buffs:       [],
    debuffs:     [],
    cooldowns:   {},
    skills,
    growthStats: growth,
    baseCombat:  char.baseCombat,
  }
}

// ─── Qualifier (survival rounds → QUALIFIER_TARGET advance) ──────────────────

function runQualifier(
  participants: CharacterDef[],
  growthMap: Record<number, GrowthStats>,
  skillMap:  Record<number, string[]>,
  rng: SeededRng,
  allMatches: MatchResult[],
): number[] {
  let pool     = participants.map(c => c.id)
  const charById = Object.fromEntries(participants.map(c => [c.id, c]))
  const hpMap: Record<number, number> = {}
  for (const c of participants) {
    hpMap[c.id] = deriveStats(c.baseCombat, growthMap[c.id]).maxHp
  }

  while (pool.length > QUALIFIER_TARGET) {
    const matchCount = Math.min(pool.length - QUALIFIER_TARGET, Math.floor(pool.length / 2))
    const shuffled   = shuffle(pool, rng)
    const losers: number[] = []

    for (let i = 0; i < matchCount; i++) {
      const id1  = shuffled[i * 2]
      const id2  = shuffled[i * 2 + 1]
      const seed = rng.int(0, 1_000_000)

      const s1 = { ...makeCharState(charById[id1], growthMap[id1], skillMap[id1]), currentHp: hpMap[id1] }
      const s2 = { ...makeCharState(charById[id2], growthMap[id2], skillMap[id2]), currentHp: hpMap[id2] }

      const result = simulateMatch(s1, s2, seed)
      result.stage = 'qualifier'
      allMatches.push(result)

      const winnerLastHp = result.log.at(-1)?.hpAfter[result.winnerId] ?? hpMap[result.winnerId]
      hpMap[result.winnerId] = regenHpBetweenMatches(
        winnerLastHp,
        deriveStats(charById[result.winnerId].baseCombat, growthMap[result.winnerId]).maxHp,
        INTER_MATCH_HP_REGEN_RATIO,
      )
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
  rng: SeededRng,
  allMatches: MatchResult[],
): MatchResult {
  const result = simulateMatch(
    makeCharState(charById[id1], growthMap[id1], skillMap[id1]),
    makeCharState(charById[id2], growthMap[id2], skillMap[id2]),
    rng.int(0, 1_000_000),
  )
  result.stage          = 'group'
  result.groupId        = groupId
  result.groupMatchType = type
  allMatches.push(result)
  return result
}

function runGroup(
  groupId: string,
  memberIds: [number, number, number, number],
  charById: Record<number, CharacterDef>,
  growthMap: Record<number, GrowthStats>,
  skillMap:  Record<number, string[]>,
  rng: SeededRng,
  allMatches: MatchResult[],
): GroupResult {
  const [a, b, c, d] = memberIds
  const play = (id1: number, id2: number, type: GroupMatchType) =>
    playGroupMatch(id1, id2, type, groupId, charById, growthMap, skillMap, rng, allMatches)

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
  rng: SeededRng,
  allMatches: MatchResult[],
  bracketEliminations: Record<number, number>,
): number {
  let pool = shuffle(finalists, rng)
  let bracketRound = 1

  while (pool.length > 1) {
    const next: number[] = []
    for (let i = 0; i < pool.length; i += 2) {
      if (i + 1 >= pool.length) { next.push(pool[i]); continue }
      const seed   = rng.int(0, 1_000_000)
      const result = simulateMatch(
        makeCharState(charById[pool[i]],     growthMap[pool[i]],     skillMap[pool[i]]),
        makeCharState(charById[pool[i + 1]], growthMap[pool[i + 1]], skillMap[pool[i + 1]]),
        seed,
      )
      result.stage        = 'bracket'
      result.bracketRound = bracketRound
      allMatches.push(result)
      bracketEliminations[result.loserId] = bracketRound
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
): TournamentResult {
  const rng        = new SeededRng(seed)
  const allMatches: MatchResult[] = []
  const charById   = Object.fromEntries(participants.map(c => [c.id, c]))

  const qualifiers = runQualifier(participants, growthMap, skillMap, rng, allMatches)

  const shuffledQ  = shuffle(qualifiers, rng)
  const groups: GroupResult[] = []
  const finalists: number[] = []
  const groupLabels = 'ABCDEFGH'

  for (let g = 0; g < GROUP_COUNT; g++) {
    const memberIds = shuffledQ.slice(g * GROUP_SIZE, g * GROUP_SIZE + GROUP_SIZE) as [number, number, number, number]
    const result    = runGroup(groupLabels[g], memberIds, charById, growthMap, skillMap, rng, allMatches)
    groups.push(result)
    finalists.push(result.rank1, result.rank2)
  }

  const bracketEliminations: Record<number, number> = {}
  const winner     = runBracket(finalists, charById, growthMap, skillMap, rng, allMatches, bracketEliminations)

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
