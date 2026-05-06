/**
 * 공개 방 인덱스 — twoBounceRoomIndex RTDB 경로 관리
 *
 * 방 전체 데이터(twoBounceRooms) 대신 목록 표시에 필요한
 * 경량 인덱스(twoBounceRoomIndex)를 별도로 유지한다.
 * 방 상태가 변경될 때마다 rtdb.ts에서 이 파일의 함수를 호출해 인덱스를 갱신한다.
 */

import { ref, set, onValue, off } from 'firebase/database'
import { rtdb } from '../../../firebase/config'
import { isDevGuestUid } from './devGuest'
import type { TwoBounceRoom, TwoBounceRoomIndexEntry } from '../types.multi'

const INDEX_PATH = 'twoBounceRoomIndex'

// 공개 방 목록에서 허용하는 최대 방 나이 (updatedAt 기준)
export const OPEN_ROOM_TTL_MS = import.meta.env.DEV
  ? 30 * 60 * 1000      // 개발: 30분
  : 2 * 60 * 60 * 1000  // 운영: 2시간

function getDb() {
  if (!rtdb) throw new Error('Realtime Database가 초기화되지 않았습니다.')
  return rtdb
}

function indexEntryPath(roomId: string): string {
  return `${INDEX_PATH}/${roomId}`
}

// ─── 순수 함수 (단위 테스트 가능) ─────────────────────────────────────────────

/**
 * room이 공개 방 목록에 노출될 수 있는지 판단한다.
 * - waiting 상태
 * - 인원 여유 있음
 * - connected 실제 사용자 1명 이상
 * - dev guest only 방 아님
 */
export function isRoomOpenForIndex(room: TwoBounceRoom): boolean {
  if (room.status !== 'waiting') return false
  if (room.turnOrder.length === 0) return false
  if (room.turnOrder.length >= room.maxPlayers) return false
  if (room.turnOrder.every((uid) => isDevGuestUid(uid))) return false
  return room.turnOrder.some(
    (uid) => !isDevGuestUid(uid) && room.players[uid]?.connected === true,
  )
}

/**
 * room에서 인덱스 엔트리를 생성한다 (순수 함수).
 */
export function buildRoomIndexEntry(room: TwoBounceRoom): TwoBounceRoomIndexEntry {
  const hostPlayer = room.players[room.hostUid]
  const playerCount = room.turnOrder.length
  const connectedCount = room.turnOrder.filter(
    (uid) => room.players[uid]?.connected === true,
  ).length
  const hasDevGuest = room.turnOrder.some((uid) => isDevGuestUid(uid))

  return {
    roomId: room.id,
    status: room.status,
    hostUid: room.hostUid,
    hostName: hostPlayer?.displayName ?? '알 수 없음',
    targetGoals: room.targetGoals,
    playerCount,
    connectedCount,
    maxPlayers: room.maxPlayers,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    isOpen: isRoomOpenForIndex(room),
    ...(hasDevGuest ? { hasDevGuest: true } : {}),
  }
}

// ─── Firebase 함수 ─────────────────────────────────────────────────────────────

/**
 * room 상태를 기반으로 인덱스 엔트리를 갱신한다.
 * 방 상태가 변경되는 모든 RTDB 작업 후 호출한다.
 */
export async function writeRoomIndex(room: TwoBounceRoom): Promise<void> {
  const entry = buildRoomIndexEntry(room)
  await set(ref(getDb(), indexEntryPath(room.id)), entry)
}

/**
 * 인덱스 엔트리를 삭제한다.
 * 방이 RTDB에서 삭제될 때 호출한다.
 */
export async function removeRoomIndex(roomId: string): Promise<void> {
  await set(ref(getDb(), indexEntryPath(roomId)), null)
}

/**
 * twoBounceRoomIndex를 실시간 구독해 공개 방 목록을 반환한다.
 * isOpen=true이고 TTL 미초과인 엔트리만 반환하며, createdAt 내림차순으로 정렬한다.
 */
export function subscribeTwoBounceOpenRoomIndex(
  callback: (entries: TwoBounceRoomIndexEntry[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const indexRef = ref(getDb(), INDEX_PATH)
  onValue(
    indexRef,
    (snap) => {
      if (!snap.exists()) {
        callback([])
        return
      }
      const all = snap.val() as Record<string, unknown>
      const now = Date.now()
      const open = Object.values(all)
        .filter((v): v is TwoBounceRoomIndexEntry =>
          v !== null &&
          typeof v === 'object' &&
          (v as TwoBounceRoomIndexEntry).isOpen === true &&
          now - (v as TwoBounceRoomIndexEntry).updatedAt < OPEN_ROOM_TTL_MS,
        )
        .sort((a, b) => b.createdAt - a.createdAt)
      callback(open)
    },
    (error) => {
      if (onError) onError(error)
    },
  )
  return () => off(indexRef)
}
