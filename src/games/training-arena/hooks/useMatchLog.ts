import type { MatchResult } from '../types'
import { getDb } from './db'

const STORE_NAME = 'match-logs'

export interface MatchLogRecord {
  tournamentId: string
  matches:      MatchResult[]
  savedAt:      number
}

export async function appendMatchLog(
  tournamentId: string,
  matches: MatchResult[],
): Promise<void> {
  const db    = await getDb()
  const entry: MatchLogRecord = { tournamentId, matches, savedAt: Date.now() }
  await db.put(STORE_NAME, entry)
}

export async function loadMatchLog(
  tournamentId: string,
): Promise<MatchLogRecord | undefined> {
  const db = await getDb()
  return db.get(STORE_NAME, tournamentId)
}

export async function deleteMatchLog(tournamentId: string): Promise<void> {
  const db = await getDb()
  await db.delete(STORE_NAME, tournamentId)
}
