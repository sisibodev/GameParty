import { openDB, type IDBPDatabase } from 'idb'
import {
  doc, getDoc, getDocs, setDoc, deleteDoc,
  collection, serverTimestamp,
} from 'firebase/firestore'
import { db, auth } from '../../../firebase/config'
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

function slotsCol(uid: string) {
  return collection(db, 'users', uid, 'bgp_slots')
}

function slotDoc(uid: string, slotId: SlotId) {
  return doc(db, 'users', uid, 'bgp_slots', String(slotId))
}

export async function listSlots(): Promise<SaveSlot[]> {
  const uid = auth.currentUser?.uid
  if (uid) {
    try {
      const snap = await getDocs(slotsCol(uid))
      const slots = snap.docs.map(d => d.data() as SaveSlot)
      const idb = await getDb()
      const tx = idb.transaction(STORE_NAME, 'readwrite')
      await Promise.all([
        ...slots.map(s => tx.store.put(s)),
        tx.done,
      ])
      return slots
    } catch {
      // fall through to IndexedDB
    }
  }
  const idb = await getDb()
  return idb.getAll(STORE_NAME)
}

export async function loadSlot(slotId: SlotId): Promise<SaveSlot | undefined> {
  const uid = auth.currentUser?.uid
  if (uid) {
    try {
      const snap = await getDoc(slotDoc(uid, slotId))
      if (snap.exists()) return snap.data() as SaveSlot
    } catch {
      // fall through
    }
  }
  const idb = await getDb()
  return idb.get(STORE_NAME, slotId)
}

export async function saveSlot(slot: SaveSlot): Promise<void> {
  const updated: SaveSlot = { ...slot, updatedAt: Date.now() }

  const idb = await getDb()
  await idb.put(STORE_NAME, updated)

  const uid = auth.currentUser?.uid
  if (uid) {
    try {
      await setDoc(slotDoc(uid, slot.slotId), {
        ...updated,
        _serverTs: serverTimestamp(),
      })
    } catch {
      // Firestore 실패해도 IndexedDB 데이터는 유지됨
    }
  }
}

export async function deleteSlot(slotId: SlotId): Promise<void> {
  const idb = await getDb()
  await idb.delete(STORE_NAME, slotId)

  const uid = auth.currentUser?.uid
  if (uid) {
    try {
      await deleteDoc(slotDoc(uid, slotId))
    } catch {
      // ignore
    }
  }
}
