import {
  ref, set, get, update, onValue, off, serverTimestamp,
} from 'firebase/database'
import type { DatabaseReference } from 'firebase/database'
import { rtdb } from '../../../firebase/config'
import type { Difficulty } from '../types'

function db() {
  if (!rtdb) throw new Error('Realtime Database가 초기화되지 않았습니다.')
  return rtdb
}

export function generateRoomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

// ── 타입 ─────────────────────────────────────────────────────────────────────
export interface PitchResult {
  call: 'strike' | 'ball' | null
  correct: boolean
}

export interface MultiPlayer {
  uid: string
  email: string
  ready: boolean
  finished: boolean
  score: number
  correctCount: number
  totalPitches: number
  maxCombo: number
  grade: string
  accuracy: number
  pitchResults?: PitchResult[]
}

export interface MultiRoom {
  roomId: string
  hostUid: string
  status: 'waiting' | 'playing' | 'finished'
  seed: number
  difficulty: Difficulty
  createdAt: object | null
  players: Record<string, MultiPlayer>
}

function calcGrade(accuracy: number): string {
  if (accuracy >= 95) return 'S'
  if (accuracy >= 85) return 'A'
  if (accuracy >= 70) return 'B'
  if (accuracy >= 55) return 'C'
  return 'D'
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

/** 방 생성 (방장) */
export async function createMultiRoom(
  uid: string,
  email: string,
  difficulty: Difficulty,
): Promise<string> {
  const roomId = generateRoomCode()
  const seed = Math.floor(Math.random() * 2 ** 32)

  const hostPlayer: MultiPlayer = {
    uid, email,
    ready: true,      // 방장은 자동 준비 완료
    finished: false,
    score: 0, correctCount: 0, totalPitches: 0, maxCombo: 0,
    grade: '-', accuracy: 0,
  }

  const room: MultiRoom = {
    roomId,
    hostUid: uid,
    status: 'waiting',
    seed,
    difficulty,
    createdAt: serverTimestamp(),
    players: { [uid]: hostPlayer },
  }

  await set(ref(db(), `umpire_rooms/${roomId}`), room)
  return roomId
}

/** 방 참가 */
export async function joinMultiRoom(
  roomId: string,
  uid: string,
  email: string,
): Promise<void> {
  const snap = await get(ref(db(), `umpire_rooms/${roomId}`))
  if (!snap.exists()) throw new Error('존재하지 않는 방입니다.')

  const room = snap.val() as MultiRoom
  if (room.status !== 'waiting') throw new Error('이미 게임이 시작된 방입니다.')
  if (Object.keys(room.players ?? {}).length >= 10) throw new Error('방이 가득 찼습니다 (최대 10인).')

  const player: MultiPlayer = {
    uid, email,
    ready: false,
    finished: false,
    score: 0, correctCount: 0, totalPitches: 0, maxCombo: 0,
    grade: '-', accuracy: 0,
  }

  await update(ref(db(), `umpire_rooms/${roomId}/players`), { [uid]: player })
}

/** 방 조회 (1회) */
export async function getMultiRoom(roomId: string): Promise<MultiRoom | null> {
  const snap = await get(ref(db(), `umpire_rooms/${roomId}`))
  return snap.exists() ? (snap.val() as MultiRoom) : null
}

/** 준비 상태 토글 */
export async function setPlayerReady(
  roomId: string,
  uid: string,
  ready: boolean,
): Promise<void> {
  await update(ref(db(), `umpire_rooms/${roomId}/players/${uid}`), { ready })
}

/** 게임 시작 (방장) */
export async function startMultiGame(roomId: string): Promise<void> {
  await update(ref(db(), `umpire_rooms/${roomId}`), { status: 'playing' })
}

/** 내 결과 제출 (게임 종료 시) */
export async function submitMultiResult(
  roomId: string,
  uid: string,
  result: {
    score: number
    correctCount: number
    totalPitches: number
    maxCombo: number
    pitchResults?: PitchResult[]
  },
): Promise<void> {
  const accuracy = result.totalPitches > 0
    ? Math.round((result.correctCount / result.totalPitches) * 1000) / 10
    : 0
  const grade = calcGrade(accuracy)

  await update(ref(db(), `umpire_rooms/${roomId}/players/${uid}`), {
    finished: true,
    score: result.score,
    correctCount: result.correctCount,
    totalPitches: result.totalPitches,
    maxCombo: result.maxCombo,
    accuracy,
    grade,
    ...(result.pitchResults ? { pitchResults: result.pitchResults } : {}),
  })
}

/** 게임 중 내 점수 실시간 업데이트 */
export async function updateLiveScore(
  roomId: string,
  uid: string,
  score: number,
): Promise<void> {
  await update(ref(db(), `umpire_rooms/${roomId}/players/${uid}`), { score })
}

/** 방 종료 상태로 변경 (모든 플레이어 완료 시) */
export async function finishMultiRoom(roomId: string): Promise<void> {
  await update(ref(db(), `umpire_rooms/${roomId}`), { status: 'finished' })
}

/** 방 구독 */
export function subscribeMultiRoom(
  roomId: string,
  callback: (room: MultiRoom | null) => void,
): DatabaseReference {
  const roomRef = ref(db(), `umpire_rooms/${roomId}`)
  onValue(roomRef, snap => {
    callback(snap.exists() ? (snap.val() as MultiRoom) : null)
  })
  return roomRef
}

/** 방 구독 해제 */
export function unsubscribeMultiRoom(roomRef: DatabaseReference): void {
  off(roomRef)
}
