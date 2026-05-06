/**
 * 2 Bounce 멀티플레이 — 개발 전용 게스트 플레이어 유틸
 *
 * import.meta.env.DEV 환경에서만 사용한다.
 * 프로덕션 빌드에서는 런타임 호출 시 에러를 던진다.
 *
 * Task016 기준.
 */

import { ref, runTransaction } from 'firebase/database'
import { rtdb } from '../../../firebase/config'
import { roomPath, parseRoom } from './rtdb'

// ─── 상수 ──────────────────────────────────────────────────────────────────────

/** 개발용 게스트 uid prefix. 실제 Firebase uid와 충돌하지 않는다. */
export const DEV_GUEST_PREFIX = 'dev-guest-'

// ─── 순수 함수 (단위 테스트 가능) ─────────────────────────────────────────────

/** uid가 개발용 게스트 uid인지 확인한다. */
export function isDevGuestUid(uid: string): boolean {
  return uid.startsWith(DEV_GUEST_PREFIX)
}

/** turnOrder에서 사용 중인 게스트 인덱스 배열을 구한다. */
export function usedGuestIndices(turnOrder: string[]): number[] {
  return turnOrder
    .filter(isDevGuestUid)
    .map((uid) => parseInt(uid.slice(DEV_GUEST_PREFIX.length), 10))
    .filter((n) => !isNaN(n))
}

/** 다음으로 사용 가능한 게스트 인덱스를 구한다 (1부터 시작). */
export function nextGuestIndex(turnOrder: string[]): number {
  const used = usedGuestIndices(turnOrder)
  let n = 1
  while (used.includes(n)) n++
  return n
}

// ─── 내부 헬퍼 ────────────────────────────────────────────────────────────────

function assertDev(): void {
  if (!import.meta.env.DEV) {
    throw new Error('[devGuest] 개발 환경에서만 사용 가능합니다.')
  }
}

function getDb() {
  if (!rtdb) throw new Error('Realtime Database가 초기화되지 않았습니다.')
  return rtdb
}

// ─── RTDB API ─────────────────────────────────────────────────────────────────

/**
 * 대기방에 dev guest 플레이어를 추가한다.
 * 최대 인원 초과 또는 이미 해당 uid가 존재하면 무시한다.
 * 개발 환경에서만 동작한다.
 */
export async function addDevGuestPlayer(roomId: string): Promise<void> {
  assertDev()
  await runTransaction(ref(getDb(), roomPath(roomId)), (current) => {
    if (!current) return current
    const room = parseRoom(current)
    if (!room || room.status !== 'waiting') return current
    if (room.turnOrder.length >= room.maxPlayers) return current

    const n = nextGuestIndex(room.turnOrder)
    const guestUid = `${DEV_GUEST_PREFIX}${n}`
    if (room.players[guestUid]) return current // 중복 방지

    const now = Date.now()
    const guestPlayer = {
      uid: guestUid,
      displayName: `Guest ${n}`,
      connected: true,
      goals: 0,
      totalShots: 0,
      joinedAt: now,
    }

    return {
      ...room,
      players: { ...room.players, [guestUid]: guestPlayer },
      turnOrder: [...room.turnOrder, guestUid],
      updatedAt: now,
    }
  })
}

/**
 * 대기방에서 dev guest 플레이어를 제거한다.
 * 개발 환경에서만 동작한다.
 */
export async function removeDevGuestPlayer(
  roomId: string,
  guestUid: string,
): Promise<void> {
  assertDev()
  if (!isDevGuestUid(guestUid)) {
    throw new Error('[devGuest] dev guest uid가 아닙니다.')
  }
  await runTransaction(ref(getDb(), roomPath(roomId)), (current) => {
    if (!current) return current
    const room = parseRoom(current)
    if (!room || room.status !== 'waiting') return current

    const { [guestUid]: _removed, ...restPlayers } = room.players
    return {
      ...room,
      players: restPlayers,
      turnOrder: room.turnOrder.filter((uid) => uid !== guestUid),
      updatedAt: Date.now(),
    }
  })
}
