import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME    = 'battle-grandprix'
const DB_VERSION = 2

let cached: IDBPDatabase | null = null

export async function getDb(): Promise<IDBPDatabase> {
  if (cached) return cached
  cached = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('save-slots')) {
        db.createObjectStore('save-slots', { keyPath: 'slotId' })
      }
      if (!db.objectStoreNames.contains('match-logs')) {
        db.createObjectStore('match-logs', { keyPath: 'tournamentId' })
      }
    },
  })
  return cached
}
