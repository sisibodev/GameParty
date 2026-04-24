import { openDB, type IDBPDatabase } from 'idb'
import type { MatchResult } from '../types'

const DB_NAME    = 'battle-grandprix'
const STORE_NAME = 'match-logs'
const DB_VERSION = 3

export interface MatchLogRecord {
  tournamentId: string
  matches:      MatchResult[]
  savedAt:      number
}

async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'tournamentId' })
      }
    },
  })
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
