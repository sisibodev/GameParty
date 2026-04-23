import type {
  BattleCharState,
  CharacterDef,
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

// ─── Group Stage (32 → 16) ────────────────────────────────────────────────────

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
  const wins: Record<number, number> = { [a]: 0, [b]: 0, [c]: 0, [d]: 0 }

  // 5 matches: match1(a-b), match2(c-d), winners(w1-w2), losers(l1-l2), final(wLoser-lWinner)
  const pairs: [number, number][] = [[a, b], [c, d], [a, c], [b, d], [a, d]]
  for (const [id1, id2] of pairs) {
    const seed   = rng.int(0, 1_000_000)
    const result = simulateMatch(
      makeCharState(charById[id1], growthMap[id1], skillMap[id1]),
      makeCharState(charById[id2], growthMap[id2], skillMap[id2]),
      seed,
    )
    allMatches.push(result)
    wins[result.winnerId] = (wins[result.winnerId] ?? 0) + 1
  }

  const ranked = [...memberIds].sort((x, y) => (wins[y] ?? 0) - (wins[x] ?? 0))
  return {
    groupId,
    players:    memberIds,
    rank1:      ranked[0],
    rank2:      ranked[1],
    eliminated: [ranked[2], ranked[3]],
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
): number {
  let pool = shuffle(finalists, rng)

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
      allMatches.push(result)
      next.push(result.winnerId)
    }
    pool = next
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

  const winner     = runBracket(finalists, charById, growthMap, skillMap, rng, allMatches)

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
    winner,
    darkhorses,
    allMatches,
  }
}
