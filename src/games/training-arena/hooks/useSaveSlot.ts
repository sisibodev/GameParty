import { openDB, type IDBPDatabase } from 'idb'
import type { SaveSlot, SlotId } from '../types'

const DB_NAME    = 'battle-grandprix'
const STORE_NAME = 'save-slots'
const DB_VERSION = 1

async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'slotId' })
      }
    },
  })
}

export async function listSlots(): Promise<SaveSlot[]> {
  const db = await getDb()
  return db.getAll(STORE_NAME)
}

export async function loadSlot(slotId: SlotId): Promise<SaveSlot | undefined> {
  const db = await getDb()
  return db.get(STORE_NAME, slotId)
}

export async function saveSlot(slot: SaveSlot): Promise<void> {
  const db = await getDb()
  await db.put(STORE_NAME, { ...slot, updatedAt: Date.now() })
}

export async function deleteSlot(slotId: SlotId): Promise<void> {
  const db = await getDb()
  await db.delete(STORE_NAME, slotId)
}
