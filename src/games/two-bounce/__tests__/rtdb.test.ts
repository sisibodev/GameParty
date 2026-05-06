/**
 * rtdb.ts 단위 테스트 — 순수 함수 부분만 검증
 *
 * Firebase SDK를 직접 호출하는 함수(createTwoBounceRoom, joinTwoBounceRoom 등)는
 * Firebase Emulator가 필요하므로 이 파일에서 제외한다.
 * 네트워크 없이 실행 가능한 path helper / 스냅샷 파서만 테스트한다.
 *
 * Task013 기준.
 */

import { describe, it, expect, vi } from 'vitest'

// firebase/config 는 브라우저 전용 API를 초기화하므로 Node.js 환경에서 모킹한다.
// 순수 함수 테스트에는 실제 Firebase 연결이 불필요하다.
vi.mock('../../../firebase/config', () => ({ rtdb: null, db: null, auth: null }))

import { roomPath, roomPlayerPath, generateRoomCode, parseRoom, filterOpenRooms } from '../utils/rtdb'
import type { TwoBounceRoom } from '../types.multi'

// ─── roomPath ─────────────────────────────────────────────────────────────────

describe('roomPath', () => {
  it('roomId로 올바른 RTDB 경로를 반환한다', () => {
    expect(roomPath('ABC123')).toBe('twoBounceRooms/ABC123')
  })

  it('다른 roomId도 정상 처리한다', () => {
    expect(roomPath('XYZ999')).toBe('twoBounceRooms/XYZ999')
  })
})

// ─── roomPlayerPath ───────────────────────────────────────────────────────────

describe('roomPlayerPath', () => {
  it('roomId와 uid로 플레이어 RTDB 경로를 반환한다', () => {
    expect(roomPlayerPath('ABC123', 'user1')).toBe(
      'twoBounceRooms/ABC123/players/user1',
    )
  })

  it('uid가 다른 값일 때도 정상 처리한다', () => {
    expect(roomPlayerPath('ROOM01', 'uid_abc')).toBe(
      'twoBounceRooms/ROOM01/players/uid_abc',
    )
  })
})

// ─── generateRoomCode ─────────────────────────────────────────────────────────

describe('generateRoomCode', () => {
  it('6자리 문자열을 반환한다', () => {
    expect(generateRoomCode()).toHaveLength(6)
  })

  it('대문자 알파뉴메릭만 포함한다', () => {
    const code = generateRoomCode()
    expect(code).toMatch(/^[A-Z0-9]{6}$/)
  })

  it('반복 호출 시 다양한 코드를 생성한다', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateRoomCode()))
    expect(codes.size).toBeGreaterThan(10)
  })
})

// ─── parseRoom ────────────────────────────────────────────────────────────────

const VALID_ROOM: TwoBounceRoom = {
  id: 'room1',
  status: 'waiting',
  hostUid: 'host',
  targetGoals: 5,
  maxPlayers: 4,
  createdAt: 1000,
  updatedAt: 1000,
  players: {},
  turnOrder: [],
  currentTurnUid: null,
  currentShot: null,
  currentStartPosition: null,
  lastResolvedShot: null,
  winnerUid: null,
}

describe('parseRoom', () => {
  it('유효한 room 데이터를 그대로 반환한다', () => {
    expect(parseRoom(VALID_ROOM)).toEqual(VALID_ROOM)
  })

  it('null이면 null을 반환한다', () => {
    expect(parseRoom(null)).toBeNull()
  })

  it('undefined이면 null을 반환한다', () => {
    expect(parseRoom(undefined)).toBeNull()
  })

  it('빈 객체이면 null을 반환한다', () => {
    expect(parseRoom({})).toBeNull()
  })

  it('문자열이면 null을 반환한다', () => {
    expect(parseRoom('room')).toBeNull()
  })

  it('숫자이면 null을 반환한다', () => {
    expect(parseRoom(42)).toBeNull()
  })

  it('id 필드가 없으면 null을 반환한다', () => {
    const { id: _id, ...rest } = VALID_ROOM
    expect(parseRoom(rest)).toBeNull()
  })

  it('id가 숫자이면 null을 반환한다', () => {
    expect(parseRoom({ ...VALID_ROOM, id: 123 })).toBeNull()
  })

  it('status 필드가 없으면 null을 반환한다', () => {
    const { status: _s, ...rest } = VALID_ROOM
    expect(parseRoom(rest)).toBeNull()
  })

  it('hostUid 필드가 없으면 null을 반환한다', () => {
    const { hostUid: _h, ...rest } = VALID_ROOM
    expect(parseRoom(rest)).toBeNull()
  })

  it('targetGoals가 문자열이면 null을 반환한다', () => {
    expect(parseRoom({ ...VALID_ROOM, targetGoals: '5' })).toBeNull()
  })

  it('maxPlayers가 문자열이면 null을 반환한다', () => {
    expect(parseRoom({ ...VALID_ROOM, maxPlayers: '4' })).toBeNull()
  })

  it('players 필드가 없으면 null을 반환한다', () => {
    const { players: _p, ...rest } = VALID_ROOM
    expect(parseRoom(rest)).toBeNull()
  })

  it('turnOrder가 배열이 아니면 null을 반환한다', () => {
    expect(parseRoom({ ...VALID_ROOM, turnOrder: 'bad' })).toBeNull()
  })

  it('turnOrder가 null이면 null을 반환한다', () => {
    expect(parseRoom({ ...VALID_ROOM, turnOrder: null })).toBeNull()
  })

  it('playing 상태 방도 정상 파싱된다', () => {
    const playing = { ...VALID_ROOM, status: 'playing', currentTurnUid: 'host' }
    const result = parseRoom(playing) as TwoBounceRoom
    expect(result).not.toBeNull()
    expect(result.status).toBe('playing')
  })

  it('finished 상태 방도 정상 파싱된다', () => {
    const finished = { ...VALID_ROOM, status: 'finished', winnerUid: 'host' }
    const result = parseRoom(finished) as TwoBounceRoom
    expect(result).not.toBeNull()
    expect(result.winnerUid).toBe('host')
  })
})

// ─── filterOpenRooms ──────────────────────────────────────────────────────────

const NOW = 10_000_000 // 고정 기준 시각 (TTL 테스트용)
const FRESH = NOW - 60_000 // 1분 전 updatedAt — TTL 미초과

const connectedPlayer = (uid: string) => ({
  uid,
  displayName: uid,
  goals: 0,
  totalShots: 0,
  connected: true,
  joinedAt: FRESH,
})

const makeRoom = (overrides: Partial<TwoBounceRoom>): TwoBounceRoom => {
  const turnOrder = overrides.turnOrder ?? ['host']
  const basePlayers: TwoBounceRoom['players'] = {}
  for (const uid of turnOrder) {
    basePlayers[uid] = connectedPlayer(uid)
  }
  const players = overrides.players !== undefined ? overrides.players : basePlayers
  const { players: _p, ...rest } = overrides
  return {
    ...VALID_ROOM,
    id: 'ROOM01',
    turnOrder,
    maxPlayers: 4,
    createdAt: FRESH,
    updatedAt: FRESH,
    players,
    ...rest,
  }
}

describe('filterOpenRooms', () => {
  it('빈 객체이면 빈 배열을 반환한다', () => {
    expect(filterOpenRooms({}, NOW)).toEqual([])
  })

  it('waiting + connected 플레이어 있는 방을 반환한다', () => {
    const room = makeRoom({ status: 'waiting', turnOrder: ['host'], maxPlayers: 4 })
    const result = filterOpenRooms({ ROOM01: room }, NOW)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('ROOM01')
  })

  it('playing 상태 방은 제외한다', () => {
    const room = makeRoom({ status: 'playing', turnOrder: ['host'], maxPlayers: 4 })
    expect(filterOpenRooms({ ROOM01: room }, NOW)).toHaveLength(0)
  })

  it('finished 상태 방은 제외한다', () => {
    const room = makeRoom({ status: 'finished', turnOrder: ['host'], maxPlayers: 4 })
    expect(filterOpenRooms({ ROOM01: room }, NOW)).toHaveLength(0)
  })

  it('인원이 가득 찬 방은 제외한다', () => {
    const room = makeRoom({ status: 'waiting', turnOrder: ['u1', 'u2'], maxPlayers: 2 })
    expect(filterOpenRooms({ ROOM01: room }, NOW)).toHaveLength(0)
  })

  it('turnOrder가 비어 있는 방은 제외한다', () => {
    const room = makeRoom({ status: 'waiting', turnOrder: [], maxPlayers: 4, players: {} })
    expect(filterOpenRooms({ ROOM01: room }, NOW)).toHaveLength(0)
  })

  it('파싱 불가한 항목은 무시한다', () => {
    const room = makeRoom({ status: 'waiting', turnOrder: ['host'], maxPlayers: 4 })
    expect(filterOpenRooms({ BAD: null, ROOM01: room }, NOW)).toHaveLength(1)
  })

  it('여러 방 중 조건을 만족하는 방만 반환한다', () => {
    const open = makeRoom({ id: 'OPEN01', status: 'waiting', turnOrder: ['host'], maxPlayers: 4, createdAt: FRESH + 1000 })
    const playing = makeRoom({ id: 'PLAY01', status: 'playing', turnOrder: ['host'], maxPlayers: 4 })
    const full = makeRoom({ id: 'FULL01', status: 'waiting', turnOrder: ['u1', 'u2'], maxPlayers: 2 })
    const result = filterOpenRooms({ OPEN01: open, PLAY01: playing, FULL01: full }, NOW)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('OPEN01')
  })

  it('createdAt 내림차순으로 정렬한다', () => {
    const older = makeRoom({ id: 'OLD', status: 'waiting', turnOrder: ['u1'], maxPlayers: 4, createdAt: FRESH })
    const newer = makeRoom({ id: 'NEW', status: 'waiting', turnOrder: ['u2'], maxPlayers: 4, createdAt: FRESH + 1000 })
    const result = filterOpenRooms({ OLD: older, NEW: newer }, NOW)
    expect(result[0].id).toBe('NEW')
    expect(result[1].id).toBe('OLD')
  })

  it('connected 플레이어가 없는 방은 제외한다', () => {
    const disconnectedPlayer = { ...connectedPlayer('host'), connected: false }
    const room = makeRoom({
      status: 'waiting',
      turnOrder: ['host'],
      maxPlayers: 4,
      players: { host: disconnectedPlayer },
    })
    expect(filterOpenRooms({ ROOM01: room }, NOW)).toHaveLength(0)
  })

  it('TTL을 초과한 방은 제외한다', () => {
    const staleUpdatedAt = NOW - 31 * 60 * 1000 // 31분 전 (개발 TTL 30분 초과)
    const room = makeRoom({
      status: 'waiting',
      turnOrder: ['host'],
      maxPlayers: 4,
      updatedAt: staleUpdatedAt,
    })
    expect(filterOpenRooms({ ROOM01: room }, NOW)).toHaveLength(0)
  })

  it('dev guest만 있는 방은 제외한다', () => {
    const guestUid = 'dev-guest-1'
    const room = makeRoom({
      status: 'waiting',
      turnOrder: [guestUid],
      maxPlayers: 4,
      players: { [guestUid]: connectedPlayer(guestUid) },
    })
    expect(filterOpenRooms({ ROOM01: room }, NOW)).toHaveLength(0)
  })

  it('실제 사용자와 dev guest가 혼합된 방은 포함한다', () => {
    const guestUid = 'dev-guest-1'
    const room = makeRoom({
      status: 'waiting',
      turnOrder: ['host', guestUid],
      maxPlayers: 4,
      players: {
        host: connectedPlayer('host'),
        [guestUid]: connectedPlayer(guestUid),
      },
    })
    expect(filterOpenRooms({ ROOM01: room }, NOW)).toHaveLength(1)
  })
})
