import { ref, set, get, update, onValue, off, serverTimestamp } from 'firebase/database'
import type { DatabaseReference } from 'firebase/database'
import { rtdb } from '../../../firebase/config'
import type { SafeStatus, BotBehavior, Vec2, PlayerRole } from '../types'

function db() {
  if (!rtdb) throw new Error('Realtime Database가 초기화되지 않았습니다.')
  return rtdb
}

export function generateRoomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RoomPlayer {
  uid: string
  name: string
  role: PlayerRole
  pos: Vec2
  facing: Vec2
  stealthed: boolean
  hitStack: number
  captured: boolean
  /** 유치장에 갇힌 시각 (Date.now()), null이면 자유 상태 */
  jailedAt: number | null
  ready: boolean
}

export interface RoomSafe {
  id: string
  pos: Vec2
  hasTreasure: boolean
  status: SafeStatus
  attemptsUsed: number
  secret: string
}

export interface RoomBot {
  pos: Vec2
  behavior: BotBehavior
}

export type RoomStatus = 'waiting' | 'playing' | 'finished'

export interface RoomData {
  roomId: string
  hostUid: string
  status: RoomStatus
  createdAt: object | null
  players: Record<string, RoomPlayer>
  safes: Record<string, RoomSafe> | null
  bot: RoomBot | null
  treasureCount: number
  treasureGoal: number
  winner: 'thieves' | 'cops' | null
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function createRoom(uid: string, name: string): Promise<string> {
  const roomId = generateRoomCode()
  const player: RoomPlayer = {
    uid, name,
    role: 'thief',
    pos: { x: 0, y: 0 },
    facing: { x: 1, y: 0 },
    stealthed: false,
    hitStack: 0,
    captured: false,
    jailedAt: null,
    ready: false,
  }
  const room: RoomData = {
    roomId,
    hostUid: uid,
    status: 'waiting',
    createdAt: serverTimestamp(),
    players: { [uid]: player },
    safes: null,
    bot: null,
    treasureCount: 0,
    treasureGoal: 0,
    winner: null,
  }
  await set(ref(db(), `cops_robbers_rooms/${roomId}`), room)
  return roomId
}

export async function joinRoom(roomId: string, uid: string, name: string): Promise<void> {
  const snap = await get(ref(db(), `cops_robbers_rooms/${roomId}`))
  if (!snap.exists()) throw new Error('존재하지 않는 방입니다.')
  const room = snap.val() as RoomData
  if (room.status !== 'waiting') throw new Error('이미 게임이 시작된 방입니다.')
  if (Object.keys(room.players ?? {}).length >= 4) throw new Error('방이 가득 찼습니다 (최대 4인).')

  const player: RoomPlayer = {
    uid, name,
    role: 'thief',
    pos: { x: 0, y: 0 },
    facing: { x: 1, y: 0 },
    stealthed: false,
    hitStack: 0,
    captured: false,
    jailedAt: null,
    ready: false,
  }
  await update(ref(db(), `cops_robbers_rooms/${roomId}/players`), { [uid]: player })
}

export async function setPlayerReady(roomId: string, uid: string, ready: boolean): Promise<void> {
  await update(ref(db(), `cops_robbers_rooms/${roomId}/players/${uid}`), { ready })
}

export async function setPlayerRole(roomId: string, uid: string, role: PlayerRole): Promise<void> {
  await update(ref(db(), `cops_robbers_rooms/${roomId}/players/${uid}`), { role })
}

export async function leaveRoom(roomId: string, uid: string, isHost: boolean): Promise<void> {
  if (isHost) {
    await set(ref(db(), `cops_robbers_rooms/${roomId}`), null)
  } else {
    await set(ref(db(), `cops_robbers_rooms/${roomId}/players/${uid}`), null)
  }
}

export async function startGame(
  roomId: string,
  safes: RoomSafe[],
  botSpawnPos: Vec2,
  treasureGoal: number,
): Promise<void> {
  const safesRecord: Record<string, RoomSafe> = {}
  for (const s of safes) safesRecord[s.id] = s
  await update(ref(db(), `cops_robbers_rooms/${roomId}`), {
    status: 'playing',
    safes: safesRecord,
    bot: { pos: botSpawnPos, behavior: 'patrol' as BotBehavior },
    treasureCount: 0,
    treasureGoal,
    winner: null,
  })
}

export function subscribeRoom(
  roomId: string,
  onData: (data: RoomData | null) => void,
): DatabaseReference {
  const r = ref(db(), `cops_robbers_rooms/${roomId}`)
  onValue(r, (snap) => onData(snap.exists() ? (snap.val() as RoomData) : null))
  return r
}

export function unsubscribeRoom(r: DatabaseReference): void {
  off(r)
}

export async function updatePlayerPos(
  roomId: string,
  uid: string,
  pos: Vec2,
  facing: Vec2,
  stealthed: boolean,
): Promise<void> {
  await update(ref(db(), `cops_robbers_rooms/${roomId}/players/${uid}`), {
    pos, facing, stealthed,
  })
}

export async function updatePlayerHit(
  roomId: string,
  uid: string,
  hitStack: number,
  captured: boolean,
): Promise<void> {
  await update(ref(db(), `cops_robbers_rooms/${roomId}/players/${uid}`), { hitStack, captured })
}

export async function updateBot(
  roomId: string,
  pos: Vec2,
  behavior: BotBehavior,
): Promise<void> {
  await update(ref(db(), `cops_robbers_rooms/${roomId}/bot`), { pos, behavior })
}

export async function updateSafe(
  roomId: string,
  safeId: string,
  status: SafeStatus,
  attemptsUsed: number,
): Promise<void> {
  await update(ref(db(), `cops_robbers_rooms/${roomId}/safes/${safeId}`), { status, attemptsUsed })
}

export async function updateTreasureCount(roomId: string, count: number): Promise<void> {
  await update(ref(db(), `cops_robbers_rooms/${roomId}`), { treasureCount: count })
}

export async function endGame(roomId: string, winner: 'thieves' | 'cops'): Promise<void> {
  await update(ref(db(), `cops_robbers_rooms/${roomId}`), { status: 'finished', winner })
}

/** 도둑을 유치장으로 이송 — captured=true, jailedAt 기록 */
export async function jailPlayer(roomId: string, uid: string, jailedAt: number): Promise<void> {
  await update(ref(db(), `cops_robbers_rooms/${roomId}/players/${uid}`), {
    captured: true,
    jailedAt,
  })
}

/** 도둑 구출 — captured=false, jailedAt 초기화, hitStack 0 리셋 */
export async function rescuePlayer(roomId: string, uid: string): Promise<void> {
  await update(ref(db(), `cops_robbers_rooms/${roomId}/players/${uid}`), {
    captured: false,
    jailedAt: null,
    hitStack: 0,
  })
}
