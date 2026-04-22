import { collection, addDoc, getDocs, orderBy, limit, query, serverTimestamp } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import type { ResultStats, PlayerResult } from '../types'

export async function saveGameResult(stats: ResultStats): Promise<void> {
  await addDoc(collection(db, 'cops_robbers_results'), {
    winner: stats.winner,
    timeMs: stats.timeMs,
    treasureCount: stats.treasureCount,
    roomId: stats.roomId,
    playerResults: stats.playerResults,
    createdAt: serverTimestamp(),
  })
}

export interface RankingEntry {
  id: string
  winner: 'thieves' | 'cops'
  timeMs: number
  treasureCount: number
  roomId: string | null
  playerResults: PlayerResult[]
}

export async function getRanking(): Promise<RankingEntry[]> {
  const q = query(
    collection(db, 'cops_robbers_results'),
    orderBy('timeMs', 'asc'),
    limit(10),
  )
  const snap = await getDocs(q)
  return snap.docs.map((doc) => {
    const d = doc.data()
    return {
      id: doc.id,
      winner: d.winner,
      timeMs: d.timeMs,
      treasureCount: d.treasureCount,
      roomId: d.roomId ?? null,
      playerResults: d.playerResults ?? [],
    }
  })
}
