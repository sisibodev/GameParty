/**
 * 2 Bounce 멀티플레이 — Firebase Realtime Database 서비스 레이어
 *
 * UI가 Firebase SDK를 직접 다루지 않도록 모든 RTDB 호출을 이 파일에 집중한다.
 * 순수 엔진(roomEngine.ts)으로 새 room 상태를 계산한 뒤 RTDB에 저장한다.
 *
 * RTDB 경로:
 *   twoBounceRooms/{roomId}  — 방 전체 상태
 *
 * Task013 기준.
 */

import {
  ref, get, set, onValue, off, runTransaction, onDisconnect,
} from 'firebase/database'
import { rtdb } from '../../../firebase/config'
import type {
  TwoBounceRoom,
  TwoBounceRoomPlayerInput,
  TwoBounceShotStarted,
  TwoBounceShotResolved,
} from '../types.multi'
import type { TargetGoals } from '../types'
import {
  createRoom,
  joinRoom,
  leaveRoom,
  setPlayerConnected,
  startRoomGame,
  startShot,
  resolveShot,
  setRematchReady,
  canStartRematch,
  startRematch,
} from '../engine/roomEngine'
import { isDevGuestUid } from './devGuest'
import { writeRoomIndex, removeRoomIndex, OPEN_ROOM_TTL_MS } from './roomIndex'

// ─── 내부 헬퍼 ────────────────────────────────────────────────────────────────

function getDb() {
  if (!rtdb) throw new Error('Realtime Database가 초기화되지 않았습니다.')
  return rtdb
}

const _isDev = import.meta.env.DEV
function devLog(...args: unknown[]) {
  // eslint-disable-next-line no-console
  if (_isDev) console.debug('[RTDB]', ...args)
}

// ─── 방 코드 생성 ─────────────────────────────────────────────────────────────

/** 6자리 알파뉴메릭 방 코드를 생성한다. */
export function generateRoomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

// ─── 경로 헬퍼 (순수 함수 — 단위 테스트 가능) ───────────────────────────────

/** `twoBounceRooms/{roomId}` */
export function roomPath(roomId: string): string {
  return `twoBounceRooms/${roomId}`
}

/** `twoBounceRooms/{roomId}/players/{uid}` */
export function roomPlayerPath(roomId: string, uid: string): string {
  return `twoBounceRooms/${roomId}/players/${uid}`
}

// ─── 스냅샷 파서 (순수 함수 — 단위 테스트 가능) ─────────────────────────────

/**
 * RTDB 스냅샷 값을 TwoBounceRoom으로 변환한다.
 * 필수 필드가 없거나 타입이 맞지 않으면 null을 반환한다.
 */
export function parseRoom(val: unknown): TwoBounceRoom | null {
  if (!val || typeof val !== 'object') return null
  const v = val as Record<string, unknown>
  if (
    typeof v.id !== 'string' ||
    typeof v.status !== 'string' ||
    typeof v.hostUid !== 'string' ||
    typeof v.targetGoals !== 'number' ||
    typeof v.maxPlayers !== 'number' ||
    !v.players ||
    !Array.isArray(v.turnOrder)
  ) {
    return null
  }
  return val as TwoBounceRoom
}

// ─── 방 생성 ─────────────────────────────────────────────────────────────────

/**
 * 새 대기방을 생성하고 RTDB에 저장한다.
 * @returns 생성된 방 코드(roomId)
 */
export async function createTwoBounceRoom(params: {
  host: TwoBounceRoomPlayerInput
  targetGoals: TargetGoals
  maxPlayers: number
}): Promise<string> {
  const roomId = generateRoomCode()
  const now = Date.now()
  const room = createRoom({
    roomId,
    host: params.host,
    targetGoals: params.targetGoals,
    maxPlayers: params.maxPlayers,
    now,
  })
  await set(ref(getDb(), roomPath(roomId)), room)
  await writeRoomIndex(room)
  return roomId
}

// ─── 방 참가 ─────────────────────────────────────────────────────────────────

/**
 * 대기방에 참가한다.
 * 방이 존재하지 않거나 playing/finished 상태이면 에러를 던진다.
 */
export async function joinTwoBounceRoom(
  roomId: string,
  player: TwoBounceRoomPlayerInput,
): Promise<void> {
  const snap = await get(ref(getDb(), roomPath(roomId)))
  if (!snap.exists()) throw new Error('방을 찾을 수 없습니다.')
  const room = parseRoom(snap.val())
  if (!room) throw new Error('방 데이터가 올바르지 않습니다.')
  // joinRoom 영어 에러 → 한국어 변환
  let updated: TwoBounceRoom
  try {
    updated = joinRoom(room, player, Date.now())
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('not in waiting state')) {
      if (room.status === 'playing') throw new Error('이미 게임이 시작된 방입니다.')
      if (room.status === 'finished') throw new Error('종료된 방입니다. 새 방을 만들어 주세요.')
      throw new Error('현재 참가할 수 없는 방입니다.')
    }
    if (msg.includes('room is full')) throw new Error('방 인원이 가득 찼습니다.')
    throw e
  }
  await set(ref(getDb(), roomPath(roomId)), updated)
  await writeRoomIndex(updated)
}

// ─── 방 나가기 ────────────────────────────────────────────────────────────────

/**
 * 방에서 나간다. transaction으로 동시 퇴장 충돌을 방지한다.
 * 대기방: players/turnOrder에서 제거하고 방장 위임 처리.
 * 마지막 플레이어 퇴장 시 null 반환 → Firebase가 방 노드를 삭제한다.
 */
export async function leaveTwoBounceRoom(
  roomId: string,
  uid: string,
): Promise<void> {
  await runTransaction(ref(getDb(), roomPath(roomId)), (current) => {
    if (!current) return current
    const room = parseRoom(current)
    if (!room) return current
    const updated = leaveRoom(room, uid, Date.now())
    // 아무도 없으면 null 반환 → Firebase RTDB가 노드를 삭제한다
    if (updated.turnOrder.length === 0) return null
    return updated
  })
  const snap = await get(ref(getDb(), roomPath(roomId)))
  if (snap.exists()) {
    const room = parseRoom(snap.val())
    if (room) await writeRoomIndex(room)
  } else {
    await removeRoomIndex(roomId)
  }
}

/**
 * 방을 Firebase RTDB에서 완전히 삭제한다.
 */
export async function deleteRoom(roomId: string): Promise<void> {
  await set(ref(getDb(), roomPath(roomId)), null)
}

// ─── 방 구독 ─────────────────────────────────────────────────────────────────

/**
 * roomId 기준으로 방 상태를 실시간 구독한다.
 * 반환된 함수를 호출하면 구독이 해제된다.
 *
 * @param onError Firebase 권한 거부·연결 실패 시 호출되는 에러 콜백 (선택)
 */
export function subscribeTwoBounceRoom(
  roomId: string,
  callback: (room: TwoBounceRoom | null) => void,
  onError?: (error: Error) => void,
): () => void {
  const roomRef = ref(getDb(), roomPath(roomId))
  onValue(
    roomRef,
    (snap) => {
      callback(snap.exists() ? parseRoom(snap.val()) : null)
    },
    (error) => {
      if (onError) onError(error)
    },
  )
  return () => off(roomRef)
}

// ─── 게임 시작 ────────────────────────────────────────────────────────────────

/**
 * 방장이 대기방을 playing 상태로 전환한다.
 * host가 아닌 uid이거나 최소 인원 미달이면 엔진이 에러를 던진다.
 */
export async function startTwoBounceRoomGame(
  roomId: string,
  requesterUid: string,
): Promise<void> {
  await runTransaction(ref(getDb(), roomPath(roomId)), (current) => {
    if (!current) return current
    const room = parseRoom(current)
    if (!room) return current
    return startRoomGame(room, requesterUid, Date.now())
  })
  const snap = await get(ref(getDb(), roomPath(roomId)))
  if (snap.exists()) {
    const room = parseRoom(snap.val())
    if (room) await writeRoomIndex(room)
  }
}

// ─── 슛 시작 ─────────────────────────────────────────────────────────────────

/**
 * 현재 턴 플레이어의 슛 시작을 RTDB에 기록한다.
 * 다른 클라이언트는 이 데이터를 보고 입력 기반 리플레이를 재생한다.
 *
 * 트랜잭션 콜백 내부에서 throw하지 않고 undefined를 반환해 안전하게 중단한다.
 * (Firebase retry 시 콜백 throw는 uncaught exception이 될 수 있으므로)
 * 이전 슛이 5초 이상 지나 RTDB에 stuck 상태로 남아 있으면 자동으로 제거 후 시작한다.
 */
export async function writeShotStarted(
  roomId: string,
  shotStarted: TwoBounceShotStarted,
): Promise<void> {
  devLog('writeShotStarted', shotStarted.shotId, 'shooter:', shotStarted.shooterUid)
  const STALE_SHOT_MS = 5000
  let startError: unknown = null
  let txStartAttempt = 0
  const { committed } = await runTransaction(ref(getDb(), roomPath(roomId)), (current) => {
    txStartAttempt++
    if (_isDev && txStartAttempt === 1) {
      const r = current as Record<string, unknown> | null
      devLog('writeShotStarted tx-enter', {
        turn: (r?.currentTurnUid as string | null) ?? null,
        pendingShot: ((r?.currentShot as Record<string, unknown> | null)?.shotId as string | null) ?? null,
      })
    }
    if (!current) return current
    const room = parseRoom(current)
    if (!room) return current

    // stuck pending 슛이 있고, 다른 shotId이며, 5초 이상 지났으면 강제 제거
    const existingShot = room.currentShot
    const isStale =
      existingShot?.result === 'pending' &&
      existingShot.shotId !== shotStarted.shotId &&
      shotStarted.startedAt - (existingShot.createdAt ?? 0) > STALE_SHOT_MS
    const cleanRoom = isStale ? { ...room, currentShot: null } : room

    try {
      return startShot(cleanRoom, {
        shotId: shotStarted.shotId,
        shooterUid: shotStarted.shooterUid,
        startPosition: shotStarted.startPosition,
        aimYaw: shotStarted.aimYaw,
        aimPitch: shotStarted.aimPitch,
        power: shotStarted.power,
        now: shotStarted.startedAt,
      })
    } catch (e) {
      startError = e
      return undefined // 트랜잭션 중단 — committed=false
    }
  })
  if (!committed && startError) {
    throw startError
  }
}

// ─── 슛 확정 ─────────────────────────────────────────────────────────────────

/**
 * 슛 결과를 확정하고 점수·다음 턴·승자를 RTDB에 반영한다.
 * 모든 클라이언트는 이 값을 리플레이 결과보다 우선하는 최종 진실로 사용한다.
 *
 * 트랜잭션 콜백 내부에서 throw하지 않고 undefined를 반환해 안전하게 중단한다.
 */
export async function writeShotResolved(
  roomId: string,
  shotResolved: TwoBounceShotResolved,
): Promise<void> {
  devLog('writeShotResolved', shotResolved.shotId, 'result:', shotResolved.result)
  let resolveError: unknown = null
  let txResolveAttempt = 0
  const { committed } = await runTransaction(ref(getDb(), roomPath(roomId)), (current) => {
    txResolveAttempt++
    if (_isDev && txResolveAttempt === 1) {
      const r = current as Record<string, unknown> | null
      devLog('writeShotResolved tx-enter', {
        currentShotId: ((r?.currentShot as Record<string, unknown> | null)?.shotId as string | null) ?? null,
        lastResolvedId: ((r?.lastResolvedShot as Record<string, unknown> | null)?.shotId as string | null) ?? null,
        turn: (r?.currentTurnUid as string | null) ?? null,
      })
    }
    if (!current) return current
    const room = parseRoom(current)
    if (!room) return current
    try {
      return resolveShot(room, {
        shotId: shotResolved.shotId,
        shooterUid: shotResolved.shooterUid,
        result: shotResolved.result,
        nextStartPosition: shotResolved.nextStartPosition,
        bouncePosition: shotResolved.bouncePosition,
        now: shotResolved.resolvedAt,
      })
    } catch (e) {
      devLog('writeShotResolved transaction error:', e)
      resolveError = e
      return undefined // 트랜잭션 중단 — committed=false
    }
  })
  if (!committed && resolveError) {
    devLog('writeShotResolved NOT committed — throwing')
    throw resolveError
  }
  if (committed) {
    devLog('writeShotResolved committed ✓', shotResolved.shotId)
    // 게임 종료(winnerUid 설정) 시 인덱스를 closed 상태로 갱신한다
    if (shotResolved.winnerUid !== null) {
      const snap = await get(ref(getDb(), roomPath(roomId)))
      if (snap.exists()) {
        const room = parseRoom(snap.val())
        if (room) await writeRoomIndex(room)
      }
    }
  }
}

// ─── 접속 상태 ────────────────────────────────────────────────────────────────

/**
 * 플레이어 접속 상태를 명시적으로 설정한다.
 */
export async function setTwoBouncePlayerConnected(
  roomId: string,
  uid: string,
  connected: boolean,
): Promise<void> {
  await runTransaction(ref(getDb(), roomPath(roomId)), (current) => {
    if (!current) return current
    const room = parseRoom(current)
    if (!room) return current
    return setPlayerConnected(room, uid, connected, Date.now())
  })
  const snap = await get(ref(getDb(), roomPath(roomId)))
  if (snap.exists()) {
    const room = parseRoom(snap.val())
    if (room) await writeRoomIndex(room)
  }
}

/**
 * 브라우저 종료/연결 끊김 시 자동으로 connected=false를 설정하도록 등록한다.
 * 게임 입장 시 한 번 호출한다.
 */
export function registerOnDisconnect(roomId: string, uid: string): void {
  const playerRef = ref(getDb(), roomPlayerPath(roomId, uid))
  onDisconnect(playerRef).update({ connected: false })
}

// ─── 공개 방 목록 ─────────────────────────────────────────────────────────────

const ROOMS_PATH = 'twoBounceRooms'

/** room에 connected 실제 사용자가 1명 이상인지 확인한다 */
function hasConnectedRealPlayer(room: TwoBounceRoom): boolean {
  return room.turnOrder.some(
    (uid) => !isDevGuestUid(uid) && room.players[uid]?.connected === true,
  )
}

/** room이 dev guest만으로 구성되어 있는지 확인한다 */
function isDevGuestOnlyRoom(room: TwoBounceRoom): boolean {
  return room.turnOrder.length > 0 && room.turnOrder.every((uid) => isDevGuestUid(uid))
}

/**
 * rooms 맵에서 참가 가능한 공개 방만 필터링해 반환한다 (순수 함수).
 * 조건:
 * - status === 'waiting'
 * - connected 실제 플레이어 1명 이상
 * - 인원 미달
 * - updatedAt 기준 TTL 미초과
 * - dev guest only 방 제외
 */
export function filterOpenRooms(
  rooms: Record<string, unknown>,
  now = Date.now(),
): TwoBounceRoom[] {
  return Object.values(rooms)
    .map((v) => parseRoom(v))
    .filter((r): r is TwoBounceRoom =>
      r !== null &&
      r.status === 'waiting' &&
      r.turnOrder.length > 0 &&
      r.turnOrder.length < r.maxPlayers &&
      hasConnectedRealPlayer(r) &&
      !isDevGuestOnlyRoom(r) &&
      now - r.updatedAt < OPEN_ROOM_TTL_MS,
    )
    .sort((a, b) => b.createdAt - a.createdAt)
}

// finished 방 보존 기간 (이 시간이 지나면 cleanup 대상)
const FINISHED_ROOM_TTL_MS = import.meta.env.DEV
  ? 30 * 60 * 1000    // 개발: 30분
  : 24 * 60 * 60 * 1000 // 운영: 24시간

/**
 * 오래된 방을 RTDB에서 일괄 삭제한다. 개발 환경 전용.
 * 삭제 대상:
 * - finished 방 중 FINISHED_ROOM_TTL_MS 초과
 * - waiting/playing 방 중 connected 플레이어가 없고 OPEN_ROOM_TTL_MS 초과
 * - dev guest만 남아 있는 waiting 방
 * @returns 삭제된 방 수
 */
export async function cleanupStaleTwoBounceRooms(): Promise<number> {
  const snap = await get(ref(getDb(), ROOMS_PATH))
  if (!snap.exists()) return 0
  const all = snap.val() as Record<string, unknown>
  const now = Date.now()
  const toDelete: string[] = []

  for (const [roomId, val] of Object.entries(all)) {
    const room = parseRoom(val)
    if (!room) {
      toDelete.push(roomId)
      continue
    }
    const age = now - room.updatedAt
    if (room.status === 'finished' && age > FINISHED_ROOM_TTL_MS) {
      toDelete.push(roomId)
    } else if (
      (room.status === 'waiting' || room.status === 'playing') &&
      age > OPEN_ROOM_TTL_MS &&
      !hasConnectedRealPlayer(room)
    ) {
      toDelete.push(roomId)
    } else if (room.status === 'waiting' && isDevGuestOnlyRoom(room)) {
      toDelete.push(roomId)
    }
  }

  await Promise.all([
    ...toDelete.map((id) => set(ref(getDb(), roomPath(id)), null)),
    ...toDelete.map((id) => removeRoomIndex(id)),
  ])
  return toDelete.length
}

/**
 * 전체 rooms 노드를 실시간 구독해 참가 가능한 공개 방 목록을 콜백으로 전달한다.
 * 반환된 함수를 호출하면 구독이 해제된다.
 */
export function subscribeTwoBounceOpenRooms(
  callback: (rooms: TwoBounceRoom[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const roomsRef = ref(getDb(), ROOMS_PATH)
  onValue(
    roomsRef,
    (snap) => {
      if (!snap.exists()) {
        callback([])
        return
      }
      callback(filterOpenRooms(snap.val() as Record<string, unknown>))
    },
    (error) => {
      if (onError) onError(error)
    },
  )
  return () => off(roomsRef)
}

// ─── Rematch ──────────────────────────────────────────────────────────────────

/**
 * uid의 다시 하기 준비 상태를 true로 설정한다.
 * dev guest는 자동으로 ready 처리하고,
 * 모든 connected 플레이어가 ready이면 즉시 게임을 리셋한다.
 */
export async function setTwoBounceRematchReady(
  roomId: string,
  uid: string,
): Promise<void> {
  await runTransaction(ref(getDb(), roomPath(roomId)), (current) => {
    if (!current) return current
    const room = parseRoom(current)
    if (!room) return current
    if (room.status !== 'finished') return current
    if (!room.players[uid]) return current

    const now = Date.now()
    let updated = setRematchReady(room, uid, true, now)

    // dev guest는 자동 ready — 실제 사용자 혼자 테스트할 수 있게
    for (const guestUid of updated.turnOrder) {
      if (isDevGuestUid(guestUid) && updated.players[guestUid]?.connected) {
        updated = {
          ...updated,
          rematchReady: { ...(updated.rematchReady ?? {}), [guestUid]: true },
        }
      }
    }

    if (canStartRematch(updated)) {
      return startRematch(updated, now)
    }
    return updated
  })
  const snap = await get(ref(getDb(), roomPath(roomId)))
  if (snap.exists()) {
    const room = parseRoom(snap.val())
    if (room) await writeRoomIndex(room)
  }
}
