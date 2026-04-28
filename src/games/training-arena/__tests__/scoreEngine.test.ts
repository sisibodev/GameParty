import { describe, it, expect } from 'vitest'
import { calcScore, buildRunRecord, addRunRecord, MAX_RUN_RECORDS } from '../engine/scoreEngine'
import type { MatchResult, RunRecord, SaveSlot, TournamentResult } from '../types'

function makeSlot(overrides: Partial<SaveSlot> = {}): SaveSlot {
  return {
    slotId: 1,
    characterId: 1,
    initialSkills: [],
    acquiredSkills: [],
    growthStats: { hp: 0, str: 0, agi: 0, int: 0, luk: 0 },
    currentRound: 1,
    bestClearRound: null,
    gold: 0,
    inventory: [],
    rivalIds: [],
    runRecords: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function makeMatch(pid: number, winnerId: number, loserId: number): MatchResult {
  return {
    matchId: `${winnerId}_vs_${loserId}`,
    seed: 0,
    char1Id: pid,
    char2Id: winnerId === pid ? loserId : winnerId,
    winnerId,
    loserId,
    totalTurns: 5,
    log: [],
    initialHp: {},
    initialMana: {},
    char1Skills: [],
    char2Skills: [],
  }
}

function makeTournament(pid: number, matches: MatchResult[]): TournamentResult {
  return {
    tournamentId: 'test',
    round: 1,
    seed: 1,
    participants: [pid, 2, 3, 4],
    qualifiers: [pid, 2, 3, 4],
    groups: [],
    finalists: [pid, 2, 3, 4],
    bracketEliminations: {},
    winner: pid,
    darkhorses: [],
    allMatches: matches,
  }
}

function makeRecord(score: number): RunRecord {
  return {
    score,
    endRound: 1,
    finishedAt: 0,
    characterId: 1,
    growthStats: { hp: 0, str: 0, agi: 0, int: 0, luk: 0 },
    skills: [],
    items: [],
    wins: 0,
    losses: 0,
    rivalsDefeated: 0,
  }
}

describe('calcScore', () => {
  it('round 1, no wins/losses, zero growth = 950 (1000 - 1*50)', () => {
    expect(calcScore(makeSlot({ currentRound: 1 }), makeTournament(1, []))).toBe(950)
  })

  it('each win adds 10 points', () => {
    const pid = 1
    const slot = makeSlot({ characterId: pid, currentRound: 1 })
    const matches = [makeMatch(pid, pid, 2), makeMatch(pid, pid, 3)]
    expect(calcScore(slot, makeTournament(pid, matches))).toBe(950 + 20)
  })

  it('each loss deducts 3 points', () => {
    const pid = 1
    const slot = makeSlot({ characterId: pid, currentRound: 1 })
    expect(calcScore(slot, makeTournament(pid, [makeMatch(pid, 2, pid)]))).toBe(950 - 3)
  })

  it('each round deducts 50 points (round 3 = 850)', () => {
    expect(calcScore(makeSlot({ currentRound: 3 }), makeTournament(1, []))).toBe(850)
  })

  it('growth stats add floor(total * 0.5)', () => {
    const slot = makeSlot({
      currentRound: 1,
      growthStats: { hp: 10, str: 10, agi: 10, int: 10, luk: 10 },
    })
    expect(calcScore(slot, makeTournament(1, []))).toBe(950 + 25)
  })

  it('rival defeat adds 50 points', () => {
    const pid = 1
    const slot = makeSlot({ characterId: pid, currentRound: 1, rivalIds: [99] })
    const matches = [makeMatch(pid, pid, 99)]
    expect(calcScore(slot, makeTournament(pid, matches))).toBe(950 + 10 + 50)
  })

  it('defeating non-rival does not add rival bonus', () => {
    const pid = 1
    const slot = makeSlot({ characterId: pid, currentRound: 1, rivalIds: [99] })
    expect(calcScore(slot, makeTournament(pid, [makeMatch(pid, pid, 2)]))).toBe(950 + 10)
  })

  it('score never goes below 0 for high round numbers', () => {
    expect(calcScore(makeSlot({ currentRound: 100 }), makeTournament(1, []))).toBeGreaterThanOrEqual(0)
  })
})

describe('buildRunRecord', () => {
  it('captures wins and losses', () => {
    const pid = 1
    const slot = makeSlot({ characterId: pid })
    const matches = [makeMatch(pid, pid, 2), makeMatch(pid, pid, 3), makeMatch(pid, 4, pid)]
    const record = buildRunRecord(slot, makeTournament(pid, matches))
    expect(record.wins).toBe(2)
    expect(record.losses).toBe(1)
  })

  it('endRound equals slot.currentRound', () => {
    const slot = makeSlot({ currentRound: 5 })
    expect(buildRunRecord(slot, makeTournament(1, [])).endRound).toBe(5)
  })

  it('characterId equals slot.characterId', () => {
    const slot = makeSlot({ characterId: 7 })
    expect(buildRunRecord(slot, makeTournament(7, [])).characterId).toBe(7)
  })

  it('counts rivals defeated correctly', () => {
    const pid = 1
    const slot = makeSlot({ characterId: pid, rivalIds: [99] })
    const record = buildRunRecord(slot, makeTournament(pid, [makeMatch(pid, pid, 99)]))
    expect(record.rivalsDefeated).toBe(1)
  })

  it('skills = initialSkills + acquiredSkills', () => {
    const slot = makeSlot({ initialSkills: ['atk_01'], acquiredSkills: ['heal_01'] })
    expect(buildRunRecord(slot, makeTournament(1, [])).skills).toEqual(['atk_01', 'heal_01'])
  })

  it('score is non-negative', () => {
    expect(buildRunRecord(makeSlot(), makeTournament(1, [])).score).toBeGreaterThanOrEqual(0)
  })
})

describe('addRunRecord', () => {
  it('sorts records by score descending', () => {
    const result = addRunRecord([makeRecord(100), makeRecord(500)], makeRecord(250))
    expect(result.map(r => r.score)).toEqual([500, 250, 100])
  })

  it('keeps at most MAX_RUN_RECORDS entries', () => {
    const existing = Array.from({ length: MAX_RUN_RECORDS }, (_, i) => makeRecord(i))
    const result = addRunRecord(existing, makeRecord(9999))
    expect(result).toHaveLength(MAX_RUN_RECORDS)
    expect(result[0].score).toBe(9999)
  })

  it('lowest score is dropped when at capacity', () => {
    const existing = Array.from({ length: MAX_RUN_RECORDS }, (_, i) => makeRecord(i + 100))
    const result = addRunRecord(existing, makeRecord(0))
    expect(result.some(r => r.score === 0)).toBe(false)
  })

  it('adds new record to existing list', () => {
    const result = addRunRecord([makeRecord(100)], makeRecord(200))
    expect(result).toHaveLength(2)
  })
})
