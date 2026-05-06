/**
 * roomIndex.ts 단위 테스트 — 순수 함수 부분만 검증
 *
 * isRoomOpenForIndex, buildRoomIndexEntry를 Firebase 없이 테스트한다.
 * Task032 기준.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../firebase/config', () => ({ rtdb: null, db: null, auth: null }))

import { isRoomOpenForIndex, buildRoomIndexEntry } from '../utils/roomIndex'
import type { TwoBounceRoom } from '../types.multi'

// ─── 픽스처 ───────────────────────────────────────────────────────────────────

const FRESH = 10_000_000 - 60_000

const realPlayer = (uid: string) => ({
  uid,
  displayName: uid,
  goals: 0,
  totalShots: 0,
  connected: true,
  joinedAt: FRESH,
})

const VALID_ROOM: TwoBounceRoom = {
  id: 'ROOM01',
  status: 'waiting',
  hostUid: 'host',
  targetGoals: 5,
  maxPlayers: 4,
  createdAt: FRESH,
  updatedAt: FRESH,
  players: { host: realPlayer('host') },
  turnOrder: ['host'],
  currentTurnUid: null,
  currentShot: null,
  currentStartPosition: null,
  lastResolvedShot: null,
  winnerUid: null,
}

function makeRoom(overrides: Partial<TwoBounceRoom>): TwoBounceRoom {
  const turnOrder = overrides.turnOrder ?? ['host']
  const basePlayers: TwoBounceRoom['players'] = {}
  for (const uid of turnOrder) {
    basePlayers[uid] = realPlayer(uid)
  }
  const players = overrides.players !== undefined ? overrides.players : basePlayers
  const { players: _p, ...rest } = overrides
  return { ...VALID_ROOM, turnOrder, players, ...rest }
}

// ─── isRoomOpenForIndex ───────────────────────────────────────────────────────

describe('isRoomOpenForIndex', () => {
  it('waiting + 인원 여유 + connected 실제 사용자 있으면 true', () => {
    expect(isRoomOpenForIndex(VALID_ROOM)).toBe(true)
  })

  it('playing 상태이면 false', () => {
    const room = makeRoom({ status: 'playing', currentTurnUid: 'host' })
    expect(isRoomOpenForIndex(room)).toBe(false)
  })

  it('finished 상태이면 false', () => {
    const room = makeRoom({ status: 'finished', winnerUid: 'host' })
    expect(isRoomOpenForIndex(room)).toBe(false)
  })

  it('turnOrder가 비어 있으면 false', () => {
    const room = makeRoom({ turnOrder: [], players: {} })
    expect(isRoomOpenForIndex(room)).toBe(false)
  })

  it('인원이 가득 차면 false', () => {
    const room = makeRoom({
      turnOrder: ['u1', 'u2'],
      maxPlayers: 2,
      players: { u1: realPlayer('u1'), u2: realPlayer('u2') },
    })
    expect(isRoomOpenForIndex(room)).toBe(false)
  })

  it('connected 플레이어가 없으면 false', () => {
    const disconnected = { ...realPlayer('host'), connected: false }
    const room = makeRoom({ players: { host: disconnected } })
    expect(isRoomOpenForIndex(room)).toBe(false)
  })

  it('dev guest만 있으면 false', () => {
    const guestUid = 'dev-guest-1'
    const room = makeRoom({
      turnOrder: [guestUid],
      players: { [guestUid]: realPlayer(guestUid) },
    })
    expect(isRoomOpenForIndex(room)).toBe(false)
  })

  it('실제 사용자 + dev guest 혼합이면 true', () => {
    const guestUid = 'dev-guest-1'
    const room = makeRoom({
      turnOrder: ['host', guestUid],
      maxPlayers: 4,
      players: {
        host: realPlayer('host'),
        [guestUid]: realPlayer(guestUid),
      },
    })
    expect(isRoomOpenForIndex(room)).toBe(true)
  })
})

// ─── buildRoomIndexEntry ──────────────────────────────────────────────────────

describe('buildRoomIndexEntry', () => {
  it('waiting + connected 방 → isOpen=true', () => {
    const entry = buildRoomIndexEntry(VALID_ROOM)
    expect(entry.isOpen).toBe(true)
  })

  it('playing 방 → isOpen=false', () => {
    const room = makeRoom({ status: 'playing', currentTurnUid: 'host' })
    expect(buildRoomIndexEntry(room).isOpen).toBe(false)
  })

  it('playerCount가 turnOrder 길이와 일치한다', () => {
    const room = makeRoom({
      turnOrder: ['u1', 'u2'],
      players: { u1: realPlayer('u1'), u2: realPlayer('u2') },
    })
    expect(buildRoomIndexEntry(room).playerCount).toBe(2)
  })

  it('connectedCount가 connected=true인 수와 일치한다', () => {
    const disconnected = { ...realPlayer('u2'), connected: false }
    const room = makeRoom({
      turnOrder: ['u1', 'u2'],
      players: { u1: realPlayer('u1'), u2: disconnected },
    })
    expect(buildRoomIndexEntry(room).connectedCount).toBe(1)
  })

  it('hostName이 host 플레이어의 displayName과 일치한다', () => {
    const entry = buildRoomIndexEntry(VALID_ROOM)
    expect(entry.hostName).toBe('host')
  })

  it('dev guest가 있으면 hasDevGuest=true', () => {
    const guestUid = 'dev-guest-1'
    const room = makeRoom({
      turnOrder: ['host', guestUid],
      maxPlayers: 4,
      players: {
        host: realPlayer('host'),
        [guestUid]: realPlayer(guestUid),
      },
    })
    expect(buildRoomIndexEntry(room).hasDevGuest).toBe(true)
  })

  it('dev guest가 없으면 hasDevGuest가 undefined', () => {
    const entry = buildRoomIndexEntry(VALID_ROOM)
    expect(entry.hasDevGuest).toBeUndefined()
  })

  it('roomId, status, hostUid, targetGoals, maxPlayers, createdAt, updatedAt가 room에서 복사된다', () => {
    const entry = buildRoomIndexEntry(VALID_ROOM)
    expect(entry.roomId).toBe(VALID_ROOM.id)
    expect(entry.status).toBe('waiting')
    expect(entry.hostUid).toBe('host')
    expect(entry.targetGoals).toBe(5)
    expect(entry.maxPlayers).toBe(4)
    expect(entry.createdAt).toBe(FRESH)
    expect(entry.updatedAt).toBe(FRESH)
  })

  it('가득 찬 방 → isOpen=false이고 playerCount/maxPlayers가 정확하다', () => {
    const room = makeRoom({
      turnOrder: ['u1', 'u2'],
      maxPlayers: 2,
      players: { u1: realPlayer('u1'), u2: realPlayer('u2') },
    })
    const entry = buildRoomIndexEntry(room)
    expect(entry.isOpen).toBe(false)
    expect(entry.playerCount).toBe(2)
    expect(entry.maxPlayers).toBe(2)
  })
})
