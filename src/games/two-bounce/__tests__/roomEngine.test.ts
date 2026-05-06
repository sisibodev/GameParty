import { describe, it, expect, beforeEach } from 'vitest'
import {
  createRoom,
  joinRoom,
  leaveRoom,
  setPlayerConnected,
  startRoomGame,
  getNextTurnUid,
  startShot,
  resolveShot,
  skipDisconnectedTurn,
  setRematchReady,
  canStartRematch,
  startRematch,
} from '../engine/roomEngine'
import type { TwoBounceRoom } from '../types.multi'
import type { Vec3 } from '../types'

// ─── 공통 픽스처 ──────────────────────────────────────────────────────────────

const NOW = 1000
const POS: Vec3 = { x: 0, y: 1.4, z: 4.57 }
const BOUNCE_POS: Vec3 = { x: 1, y: 1.4, z: 3 }

const HOST = { uid: 'host', displayName: 'Host' }
const P2   = { uid: 'p2',   displayName: 'Player2' }
const P3   = { uid: 'p3',   displayName: 'Player3' }

function makeWaitingRoom(): TwoBounceRoom {
  return createRoom({ roomId: 'room1', host: HOST, targetGoals: 5, maxPlayers: 4, now: NOW })
}

function makePlayingRoom(): TwoBounceRoom {
  let room = makeWaitingRoom()
  room = joinRoom(room, P2, NOW)
  return startRoomGame(room, HOST.uid, NOW)
}

function makeShotParams(overrides: Partial<{
  shotId: string; shooterUid: string; aimYaw: number; aimPitch: number; power: number; now: number
}> = {}) {
  return {
    shotId: 'shot1',
    shooterUid: HOST.uid,
    startPosition: POS,
    aimYaw: 0,
    aimPitch: 0.5,
    power: 0.6,
    now: NOW + 100,
    ...overrides,
  }
}

// ─── createRoom ───────────────────────────────────────────────────────────────

describe('createRoom', () => {
  it('초기 상태가 waiting이다', () => {
    expect(makeWaitingRoom().status).toBe('waiting')
  })

  it('host가 players와 turnOrder에 등록된다', () => {
    const room = makeWaitingRoom()
    expect(room.players[HOST.uid]).toBeDefined()
    expect(room.turnOrder).toContain(HOST.uid)
    expect(room.hostUid).toBe(HOST.uid)
  })

  it('초기 goals/totalShots/currentTurnUid/winnerUid 는 0 또는 null이다', () => {
    const room = makeWaitingRoom()
    expect(room.players[HOST.uid].goals).toBe(0)
    expect(room.players[HOST.uid].totalShots).toBe(0)
    expect(room.currentTurnUid).toBeNull()
    expect(room.winnerUid).toBeNull()
    expect(room.currentShot).toBeNull()
    expect(room.currentStartPosition).toBeNull()
    expect(room.lastResolvedShot).toBeNull()
  })

  it('targetGoals 가 3/5/10 외의 값이면 에러를 던진다', () => {
    expect(() =>
      createRoom({ roomId: 'r', host: HOST, targetGoals: 7 as never, maxPlayers: 2, now: NOW }),
    ).toThrow()
  })

  it('maxPlayers 가 1이면 에러를 던진다', () => {
    expect(() =>
      createRoom({ roomId: 'r', host: HOST, targetGoals: 5, maxPlayers: 1, now: NOW }),
    ).toThrow()
  })

  it('maxPlayers 가 9이면 에러를 던진다', () => {
    expect(() =>
      createRoom({ roomId: 'r', host: HOST, targetGoals: 5, maxPlayers: 9, now: NOW }),
    ).toThrow()
  })
})

// ─── joinRoom ─────────────────────────────────────────────────────────────────

describe('joinRoom', () => {
  it('새 플레이어가 players와 turnOrder에 추가된다', () => {
    const room = joinRoom(makeWaitingRoom(), P2, NOW)
    expect(room.players[P2.uid]).toBeDefined()
    expect(room.turnOrder).toContain(P2.uid)
  })

  it('중복 참가 시 정보가 갱신되고 turnOrder 는 중복 추가되지 않는다', () => {
    let room = joinRoom(makeWaitingRoom(), P2, NOW)
    const updated = { uid: 'p2', displayName: 'P2 Updated' }
    room = joinRoom(room, updated, NOW + 1)
    expect(room.players[P2.uid].displayName).toBe('P2 Updated')
    expect(room.turnOrder.filter((u) => u === P2.uid).length).toBe(1)
  })

  it('최대 인원 초과 시 에러를 던진다', () => {
    let room = createRoom({ roomId: 'r', host: HOST, targetGoals: 5, maxPlayers: 2, now: NOW })
    room = joinRoom(room, P2, NOW)
    expect(() => joinRoom(room, P3, NOW)).toThrow('room is full')
  })

  it('playing 상태에서는 참가할 수 없다', () => {
    expect(() => joinRoom(makePlayingRoom(), P3, NOW)).toThrow()
  })
})

// ─── leaveRoom ────────────────────────────────────────────────────────────────

describe('leaveRoom', () => {
  it('일반 플레이어 퇴장 시 players와 turnOrder에서 제거된다', () => {
    let room = joinRoom(makeWaitingRoom(), P2, NOW)
    room = leaveRoom(room, P2.uid, NOW)
    expect(room.players[P2.uid]).toBeUndefined()
    expect(room.turnOrder).not.toContain(P2.uid)
  })

  it('방장 퇴장 시 다음 플레이어가 방장이 된다', () => {
    let room = joinRoom(makeWaitingRoom(), P2, NOW)
    room = leaveRoom(room, HOST.uid, NOW)
    expect(room.hostUid).toBe(P2.uid)
  })

  it('모든 플레이어 퇴장 시 status 가 finished 가 된다', () => {
    const room = leaveRoom(makeWaitingRoom(), HOST.uid, NOW)
    expect(room.status).toBe('finished')
  })

  it('존재하지 않는 uid 퇴장 시 room 을 그대로 반환한다', () => {
    const room = makeWaitingRoom()
    expect(leaveRoom(room, 'nobody', NOW)).toBe(room)
  })
})

// ─── startRoomGame ────────────────────────────────────────────────────────────

describe('startRoomGame', () => {
  it('host가 게임을 시작하면 status 가 playing 이 된다', () => {
    expect(makePlayingRoom().status).toBe('playing')
  })

  it('첫 turnOrder 의 connected 플레이어가 currentTurnUid 로 설정된다', () => {
    expect(makePlayingRoom().currentTurnUid).toBe(HOST.uid)
  })

  it('host 가 아닌 플레이어가 시작하면 에러를 던진다', () => {
    const room = joinRoom(makeWaitingRoom(), P2, NOW)
    expect(() => startRoomGame(room, P2.uid, NOW)).toThrow()
  })

  it('1명뿐일 때 시작하면 에러를 던진다', () => {
    expect(() => startRoomGame(makeWaitingRoom(), HOST.uid, NOW)).toThrow()
  })

  it('게임 시작 시 모든 플레이어의 goals/totalShots 가 0으로 초기화된다', () => {
    for (const p of Object.values(makePlayingRoom().players)) {
      expect(p.goals).toBe(0)
      expect(p.totalShots).toBe(0)
    }
  })

  it('disconnected 플레이어는 첫 턴에서 스킵된다', () => {
    let room = joinRoom(makeWaitingRoom(), P2, NOW)
    room = joinRoom(room, P3, NOW)
    // HOST는 disconnected, P2·P3는 connected → 2명 이상 충족
    room = setPlayerConnected(room, HOST.uid, false, NOW)
    room = startRoomGame(room, HOST.uid, NOW)
    expect(room.currentTurnUid).toBe(P2.uid)
  })
})

// ─── getNextTurnUid ───────────────────────────────────────────────────────────

describe('getNextTurnUid', () => {
  it('2명 순환 턴이 정상 동작한다', () => {
    const room = makePlayingRoom()
    expect(getNextTurnUid(room, HOST.uid)).toBe(P2.uid)
    expect(getNextTurnUid(room, P2.uid)).toBe(HOST.uid)
  })

  it('disconnected 플레이어를 스킵한다', () => {
    let room = makeWaitingRoom()
    room = joinRoom(room, P2, NOW)
    room = joinRoom(room, P3, NOW)
    room = startRoomGame(room, HOST.uid, NOW)
    room = setPlayerConnected(room, P2.uid, false, NOW)
    expect(getNextTurnUid(room, HOST.uid)).toBe(P3.uid)
  })

  it('turnOrder 에 없는 uid 이면 첫 connected 플레이어를 반환한다', () => {
    expect(getNextTurnUid(makePlayingRoom(), 'unknown')).toBe(HOST.uid)
  })

  it('모두 disconnected 이면 null 을 반환한다', () => {
    let room = makePlayingRoom()
    room = setPlayerConnected(room, HOST.uid, false, NOW)
    room = setPlayerConnected(room, P2.uid, false, NOW)
    expect(getNextTurnUid(room, HOST.uid)).toBeNull()
  })
})

// ─── startShot ────────────────────────────────────────────────────────────────

describe('startShot', () => {
  it('현재 턴 플레이어가 슛을 시작하면 currentShot 이 pending 이 된다', () => {
    const room = startShot(makePlayingRoom(), makeShotParams())
    expect(room.currentShot?.result).toBe('pending')
    expect(room.currentShot?.shooterUid).toBe(HOST.uid)
  })

  it('현재 턴이 아닌 플레이어의 슛 시작은 에러를 던진다', () => {
    expect(() =>
      startShot(makePlayingRoom(), makeShotParams({ shooterUid: P2.uid })),
    ).toThrow('Not your turn')
  })

  it('pending shot 이 있을 때 새 슛 시작은 에러를 던진다', () => {
    const room = startShot(makePlayingRoom(), makeShotParams())
    expect(() => startShot(room, makeShotParams({ shotId: 'shot2' }))).toThrow('already in progress')
  })

  it('playing 상태가 아닐 때 에러를 던진다', () => {
    expect(() => startShot(makeWaitingRoom(), makeShotParams())).toThrow()
  })

  it('power > 1 이면 에러를 던진다', () => {
    expect(() => startShot(makePlayingRoom(), makeShotParams({ power: 1.1 }))).toThrow()
  })

  it('power < 0 이면 에러를 던진다', () => {
    expect(() => startShot(makePlayingRoom(), makeShotParams({ power: -0.1 }))).toThrow()
  })

  it('startPosition/shotId 가 currentShot 에 저장된다', () => {
    const room = startShot(makePlayingRoom(), makeShotParams())
    expect(room.currentShot?.startPosition).toEqual(POS)
    expect(room.currentShot?.shotId).toBe('shot1')
  })
})

// ─── resolveShot goal ────────────────────────────────────────────────────────

describe('resolveShot — goal', () => {
  let withShot: TwoBounceRoom

  beforeEach(() => {
    withShot = startShot(makePlayingRoom(), makeShotParams())
  })

  it('goal 시 shooter.goals 가 +1 된다', () => {
    const room = resolveShot(withShot, {
      shotId: 'shot1', shooterUid: HOST.uid, result: 'goal',
      nextStartPosition: POS, now: NOW + 200,
    })
    expect(room.players[HOST.uid].goals).toBe(1)
  })

  it('goal 시 totalShots 가 +1 된다', () => {
    const room = resolveShot(withShot, {
      shotId: 'shot1', shooterUid: HOST.uid, result: 'goal',
      nextStartPosition: POS, now: NOW + 200,
    })
    expect(room.players[HOST.uid].totalShots).toBe(1)
  })

  it('goal 후 currentTurnUid 가 슛 성공자(HOST)로 유지된다 — 2 Bounce 룰', () => {
    const room = resolveShot(withShot, {
      shotId: 'shot1', shooterUid: HOST.uid, result: 'goal',
      nextStartPosition: POS, now: NOW + 200,
    })
    expect(room.currentTurnUid).toBe(HOST.uid)
  })

  it('goal 후 currentStartPosition 이 nextStartPosition(자유투 위치)으로 설정된다', () => {
    const FREE_THROW: Vec3 = { x: 0, y: 1.4, z: 4.57 }
    const room = resolveShot(withShot, {
      shotId: 'shot1', shooterUid: HOST.uid, result: 'goal',
      nextStartPosition: FREE_THROW, now: NOW + 200,
    })
    expect(room.currentStartPosition).toEqual(FREE_THROW)
  })

  it('goal → 다음 슛 miss → P2 턴으로 전환된다', () => {
    let room = resolveShot(withShot, {
      shotId: 'shot1', shooterUid: HOST.uid, result: 'goal',
      nextStartPosition: POS, now: NOW + 200,
    })
    expect(room.currentTurnUid).toBe(HOST.uid)

    room = startShot(room, makeShotParams({ shotId: 'shot2', now: NOW + 300 }))
    room = resolveShot(room, {
      shotId: 'shot2', shooterUid: HOST.uid, result: 'miss',
      nextStartPosition: BOUNCE_POS, bouncePosition: BOUNCE_POS, now: NOW + 400,
    })
    expect(room.currentTurnUid).toBe(P2.uid)
  })

  it('A 골 성공 후 B 골 성공 시 각자 공격권 유지', () => {
    // HOST 골: HOST 턴 유지
    let room = resolveShot(withShot, {
      shotId: 'shot1', shooterUid: HOST.uid, result: 'goal',
      nextStartPosition: POS, now: NOW + 200,
    })
    // HOST miss: P2 턴 전환
    room = startShot(room, makeShotParams({ shotId: 'shot2', now: NOW + 300 }))
    room = resolveShot(room, {
      shotId: 'shot2', shooterUid: HOST.uid, result: 'miss',
      nextStartPosition: BOUNCE_POS, now: NOW + 400,
    })
    // P2 골: P2 턴 유지
    room = startShot(room, makeShotParams({ shotId: 'shot3', shooterUid: P2.uid, now: NOW + 500 }))
    room = resolveShot(room, {
      shotId: 'shot3', shooterUid: P2.uid, result: 'goal',
      nextStartPosition: POS, now: NOW + 600,
    })
    expect(room.currentTurnUid).toBe(P2.uid)
  })

  it('goal 후 currentShot 이 null 이 되고 lastResolvedShot 에 저장된다', () => {
    const room = resolveShot(withShot, {
      shotId: 'shot1', shooterUid: HOST.uid, result: 'goal',
      nextStartPosition: POS, now: NOW + 200,
    })
    expect(room.currentShot).toBeNull()
    expect(room.lastResolvedShot?.result).toBe('goal')
    expect(room.lastResolvedShot?.shotId).toBe('shot1')
  })

  it('goal 후 currentStartPosition 이 nextStartPosition 으로 설정된다', () => {
    const room = resolveShot(withShot, {
      shotId: 'shot1', shooterUid: HOST.uid, result: 'goal',
      nextStartPosition: POS, now: NOW + 200,
    })
    expect(room.currentStartPosition).toEqual(POS)
  })

  it('goal 성공 후 목표 골 미달이면 status 가 playing 으로 유지된다', () => {
    const room = resolveShot(withShot, {
      shotId: 'shot1', shooterUid: HOST.uid, result: 'goal',
      nextStartPosition: POS, now: NOW + 200,
    })
    expect(room.status).toBe('playing')
    expect(room.winnerUid).toBeNull()
  })

  it('목표 골 달성 시 status 가 finished, winnerUid 가 설정된다', () => {
    let room = makePlayingRoom() // targetGoals = 5
    // HOST 는 goal, P2 는 miss — HOST 가 5골 먼저 달성
    for (let i = 0; i < 20; i++) {
      if (room.status === 'finished') break
      const shooterUid = room.currentTurnUid!
      room = startShot(room, { ...makeShotParams({ shotId: `s${i}`, now: NOW + i * 10 }), shooterUid })
      const result = shooterUid === HOST.uid ? 'goal' : 'miss'
      room = resolveShot(room, {
        shotId: `s${i}`, shooterUid, result,
        nextStartPosition: POS, now: NOW + i * 10 + 5,
      })
    }
    expect(room.status).toBe('finished')
    expect(room.winnerUid).toBe(HOST.uid)
    expect(room.currentTurnUid).toBeNull()
  })
})

// ─── resolveShot miss ────────────────────────────────────────────────────────

describe('resolveShot — miss', () => {
  it('miss 후 currentShot 이 null 이 되고 lastResolvedShot 에 저장된다', () => {
    let room = startShot(makePlayingRoom(), makeShotParams())
    room = resolveShot(room, {
      shotId: 'shot1', shooterUid: HOST.uid, result: 'miss',
      nextStartPosition: BOUNCE_POS, bouncePosition: BOUNCE_POS, now: NOW + 200,
    })
    expect(room.currentShot).toBeNull()
    expect(room.lastResolvedShot?.result).toBe('miss')
    expect(room.currentStartPosition).toEqual(BOUNCE_POS)
  })

  it('miss 시 totalShots 만 +1 되고 goals 는 유지된다', () => {
    let room = startShot(makePlayingRoom(), makeShotParams())
    room = resolveShot(room, {
      shotId: 'shot1', shooterUid: HOST.uid, result: 'miss',
      nextStartPosition: BOUNCE_POS, bouncePosition: BOUNCE_POS, now: NOW + 200,
    })
    expect(room.players[HOST.uid].goals).toBe(0)
    expect(room.players[HOST.uid].totalShots).toBe(1)
  })

  it('miss 후 다음 턴이 P2 로 넘어간다', () => {
    let room = startShot(makePlayingRoom(), makeShotParams())
    room = resolveShot(room, {
      shotId: 'shot1', shooterUid: HOST.uid, result: 'miss',
      nextStartPosition: BOUNCE_POS, now: NOW + 200,
    })
    expect(room.currentTurnUid).toBe(P2.uid)
  })

  it('shotId 불일치 시 에러를 던진다', () => {
    const room = startShot(makePlayingRoom(), makeShotParams())
    expect(() =>
      resolveShot(room, {
        shotId: 'wrong', shooterUid: HOST.uid, result: 'miss',
        nextStartPosition: POS, now: NOW + 200,
      }),
    ).toThrow('shotId does not match')
  })

  it('shooterUid 불일치 시 에러를 던진다', () => {
    const room = startShot(makePlayingRoom(), makeShotParams())
    expect(() =>
      resolveShot(room, {
        shotId: 'shot1', shooterUid: 'intruder', result: 'miss',
        nextStartPosition: POS, now: NOW + 200,
      }),
    ).toThrow('shooterUid does not match')
  })

  it('currentShot이 null이어도 shooterUid가 currentTurnUid이면 resolve를 허용한다 (경쟁 조건 대응)', () => {
    // writeShotStarted가 실패해도 writeShotResolved가 성공해야 하는 경우
    const room = makePlayingRoom() // currentShot: null, currentTurnUid: HOST.uid
    const result = resolveShot(room, {
      shotId: 'shot1', shooterUid: HOST.uid, result: 'miss',
      nextStartPosition: POS, now: NOW + 200,
    })
    expect(result.players[HOST.uid].totalShots).toBe(1)
    expect(result.currentTurnUid).not.toBe(HOST.uid) // 턴이 P2로 넘어감
  })

  it('currentShot이 null이고 shooterUid가 currentTurnUid가 아니면 에러를 던진다', () => {
    expect(() =>
      resolveShot(makePlayingRoom(), {
        shotId: 'shot1', shooterUid: 'intruder', result: 'miss',
        nextStartPosition: POS, now: NOW + 200,
      }),
    ).toThrow('No pending shot and shooterUid does not match currentTurnUid')
  })

  it('3인 방에서 실패 시 턴 순서가 정상 순환한다', () => {
    let room = makeWaitingRoom()
    room = joinRoom(room, P2, NOW)
    room = joinRoom(room, P3, NOW)
    room = startRoomGame(room, HOST.uid, NOW)
    // HOST miss → P2
    room = startShot(room, makeShotParams({ shotId: 's1', now: NOW + 10 }))
    room = resolveShot(room, { shotId: 's1', shooterUid: HOST.uid, result: 'miss', nextStartPosition: BOUNCE_POS, now: NOW + 20 })
    expect(room.currentTurnUid).toBe(P2.uid)
    // P2 miss → P3
    room = startShot(room, makeShotParams({ shotId: 's2', shooterUid: P2.uid, now: NOW + 30 }))
    room = resolveShot(room, { shotId: 's2', shooterUid: P2.uid, result: 'miss', nextStartPosition: BOUNCE_POS, now: NOW + 40 })
    expect(room.currentTurnUid).toBe(P3.uid)
    // P3 miss → HOST
    room = startShot(room, makeShotParams({ shotId: 's3', shooterUid: P3.uid, now: NOW + 50 }))
    room = resolveShot(room, { shotId: 's3', shooterUid: P3.uid, result: 'miss', nextStartPosition: BOUNCE_POS, now: NOW + 60 })
    expect(room.currentTurnUid).toBe(HOST.uid)
  })

  it('동일 shotId가 lastResolvedShot에 있으면 중복 resolve를 거부한다', () => {
    // 첫 resolve 성공
    const room1 = makePlayingRoom()
    const resolved = resolveShot(room1, {
      shotId: 'shot1', shooterUid: HOST.uid, result: 'miss',
      nextStartPosition: POS, now: NOW + 200,
    })
    // 같은 shotId로 다시 resolve 시도 → 중복 방지
    expect(() =>
      resolveShot({ ...resolved, currentShot: null }, {
        shotId: 'shot1', shooterUid: HOST.uid, result: 'miss',
        nextStartPosition: POS, now: NOW + 300,
      }),
    ).toThrow('Shot already resolved')
  })
})

// ─── skipDisconnectedTurn ─────────────────────────────────────────────────────

describe('skipDisconnectedTurn', () => {
  it('현재 턴 플레이어가 connected 이면 room 을 그대로 반환한다', () => {
    const room = makePlayingRoom()
    expect(skipDisconnectedTurn(room, NOW)).toBe(room)
  })

  it('현재 턴 플레이어가 disconnected 이면 다음 플레이어로 넘어간다', () => {
    // P2·P3 connected(2명) 유지해야 countConnected > 1 → finish 방지
    let room = makeWaitingRoom()
    room = joinRoom(room, P2, NOW)
    room = joinRoom(room, P3, NOW)
    room = startRoomGame(room, HOST.uid, NOW)
    room = setPlayerConnected(room, HOST.uid, false, NOW)
    const result = skipDisconnectedTurn(room, NOW + 10)
    expect(result.currentTurnUid).toBe(P2.uid)
  })

  it('pending shot 중에는 스킵하지 않는다', () => {
    let room = startShot(makePlayingRoom(), makeShotParams())
    room = setPlayerConnected(room, HOST.uid, false, NOW)
    const result = skipDisconnectedTurn(room, NOW + 10)
    expect(result.currentTurnUid).toBe(HOST.uid)
  })

  it('connected 플레이어가 1명 이하이면 status 가 finished 가 된다', () => {
    let room = makePlayingRoom()
    room = setPlayerConnected(room, HOST.uid, false, NOW)
    room = setPlayerConnected(room, P2.uid, false, NOW)
    expect(skipDisconnectedTurn(room, NOW + 10).status).toBe('finished')
  })

  it('playing 상태가 아닐 때는 room 을 그대로 반환한다', () => {
    const room = makeWaitingRoom()
    expect(skipDisconnectedTurn(room, NOW)).toBe(room)
  })
})

// ─── rematch helpers ──────────────────────────────────────────────────────────

function makeFinishedRoom() {
  return { ...makePlayingRoom(), status: 'finished' as const, winnerUid: HOST.uid }
}

// ─── setRematchReady ──────────────────────────────────────────────────────────

describe('setRematchReady', () => {
  it('finished 방에서 uid 의 rematchReady 를 true 로 설정한다', () => {
    const result = setRematchReady(makeFinishedRoom(), HOST.uid, true, NOW + 100)
    expect(result.rematchReady?.[HOST.uid]).toBe(true)
  })

  it('ready=false 로도 설정할 수 있다', () => {
    let room = setRematchReady(makeFinishedRoom(), HOST.uid, true, NOW + 100)
    room = setRematchReady(room, HOST.uid, false, NOW + 200)
    expect(room.rematchReady?.[HOST.uid]).toBe(false)
  })

  it('playing 상태에서 호출하면 에러를 던진다', () => {
    expect(() => setRematchReady(makePlayingRoom(), HOST.uid, true, NOW)).toThrow()
  })

  it('존재하지 않는 uid 이면 에러를 던진다', () => {
    expect(() => setRematchReady(makeFinishedRoom(), 'nobody', true, NOW)).toThrow()
  })

  it('기존 rematchReady 를 유지하며 새 uid 를 추가한다', () => {
    let room = setRematchReady(makeFinishedRoom(), HOST.uid, true, NOW + 100)
    room = setRematchReady(room, P2.uid, true, NOW + 200)
    expect(room.rematchReady?.[HOST.uid]).toBe(true)
    expect(room.rematchReady?.[P2.uid]).toBe(true)
  })
})

// ─── canStartRematch ──────────────────────────────────────────────────────────

describe('canStartRematch', () => {
  it('모든 connected 플레이어가 ready 이면 true 를 반환한다', () => {
    const room = {
      ...makeFinishedRoom(),
      rematchReady: { [HOST.uid]: true, [P2.uid]: true },
    }
    expect(canStartRematch(room)).toBe(true)
  })

  it('일부 플레이어만 ready 이면 false 를 반환한다', () => {
    const room = {
      ...makeFinishedRoom(),
      rematchReady: { [HOST.uid]: true },
    }
    expect(canStartRematch(room)).toBe(false)
  })

  it('connected 플레이어가 1명 이하이면 false 를 반환한다', () => {
    const base = makeFinishedRoom()
    const room = {
      ...setPlayerConnected(base, P2.uid, false, NOW),
      status: 'finished' as const,
      winnerUid: HOST.uid,
      rematchReady: { [HOST.uid]: true },
    }
    expect(canStartRematch(room)).toBe(false)
  })

  it('playing 상태이면 false 를 반환한다', () => {
    expect(canStartRematch(makePlayingRoom())).toBe(false)
  })

  it('rematchReady 가 없으면 false 를 반환한다', () => {
    expect(canStartRematch(makeFinishedRoom())).toBe(false)
  })
})

// ─── startRematch ─────────────────────────────────────────────────────────────

describe('startRematch', () => {
  it('status 가 playing 으로 전환된다', () => {
    expect(startRematch(makeFinishedRoom(), NOW + 200).status).toBe('playing')
  })

  it('점수/시도 수가 0 으로 초기화된다', () => {
    const base = makePlayingRoom()
    const withGoals = {
      ...base,
      status: 'finished' as const,
      winnerUid: HOST.uid,
      players: {
        ...base.players,
        [HOST.uid]: { ...base.players[HOST.uid], goals: 3, totalShots: 5 },
        [P2.uid]: { ...base.players[P2.uid], goals: 2, totalShots: 4 },
      },
    }
    const result = startRematch(withGoals, NOW + 200)
    expect(result.players[HOST.uid].goals).toBe(0)
    expect(result.players[P2.uid].goals).toBe(0)
    expect(result.players[HOST.uid].totalShots).toBe(0)
    expect(result.players[P2.uid].totalShots).toBe(0)
  })

  it('currentShot / lastResolvedShot / winnerUid 가 null 로 초기화된다', () => {
    const room = {
      ...makeFinishedRoom(),
      lastResolvedShot: {
        shotId: 'last', shooterUid: HOST.uid, startPosition: POS,
        result: 'goal' as const, nextStartPosition: POS, createdAt: NOW,
      },
    }
    const result = startRematch(room, NOW + 200)
    expect(result.currentShot).toBeNull()
    expect(result.lastResolvedShot).toBeNull()
    expect(result.winnerUid).toBeNull()
  })

  it('rematchCount 가 1 증가한다', () => {
    const result = startRematch(makeFinishedRoom(), NOW + 200)
    expect(result.rematchCount).toBe(1)
    const result2 = startRematch({ ...result, status: 'finished', winnerUid: P2.uid }, NOW + 400)
    expect(result2.rematchCount).toBe(2)
  })

  it('rematchReady 가 빈 객체로 초기화된다', () => {
    const room = {
      ...makeFinishedRoom(),
      rematchReady: { [HOST.uid]: true, [P2.uid]: true },
    }
    expect(startRematch(room, NOW + 200).rematchReady).toEqual({})
  })

  it('첫 번째 connected 플레이어가 currentTurnUid 가 된다', () => {
    expect(startRematch(makeFinishedRoom(), NOW + 200).currentTurnUid).toBe(HOST.uid)
  })

  it('finished 상태가 아니면 에러를 던진다', () => {
    expect(() => startRematch(makePlayingRoom(), NOW)).toThrow()
  })

  it('connected 플레이어가 1명 이하이면 에러를 던진다', () => {
    const base = makePlayingRoom()
    const room = {
      ...setPlayerConnected(base, P2.uid, false, NOW),
      status: 'finished' as const,
      winnerUid: HOST.uid,
    }
    expect(() => startRematch(room, NOW)).toThrow()
  })
})

// ─── setPlayerConnected ───────────────────────────────────────────────────────

describe('setPlayerConnected', () => {
  it('connected를 false로 변경한다', () => {
    const room = makePlayingRoom()
    const result = setPlayerConnected(room, HOST.uid, false, NOW + 10)
    expect(result.players[HOST.uid].connected).toBe(false)
    expect(result.updatedAt).toBe(NOW + 10)
  })

  it('connected를 true로 복구한다', () => {
    const room = makePlayingRoom()
    const disconnected = setPlayerConnected(room, HOST.uid, false, NOW + 10)
    const reconnected = setPlayerConnected(disconnected, HOST.uid, true, NOW + 20)
    expect(reconnected.players[HOST.uid].connected).toBe(true)
  })

  it('다른 플레이어의 상태는 변경하지 않는다', () => {
    const room = makePlayingRoom()
    const result = setPlayerConnected(room, HOST.uid, false, NOW + 10)
    expect(result.players[P2.uid].connected).toBe(true)
  })

  it('존재하지 않는 uid이면 방을 그대로 반환한다', () => {
    const room = makePlayingRoom()
    const result = setPlayerConnected(room, 'unknown', false, NOW + 10)
    expect(result).toBe(room)
  })

  it('불변성: 원본 room을 변경하지 않는다', () => {
    const room = makePlayingRoom()
    const original = room.players[HOST.uid].connected
    setPlayerConnected(room, HOST.uid, false, NOW + 10)
    expect(room.players[HOST.uid].connected).toBe(original)
  })
})

// ─── leaveRoom — cleanup 시나리오 ─────────────────────────────────────────────

describe('leaveRoom — cleanup 시나리오', () => {
  it('마지막 플레이어 퇴장 시 status가 finished가 된다', () => {
    const room = makeWaitingRoom()
    const result = leaveRoom(room, HOST.uid, NOW + 10)
    expect(result.status).toBe('finished')
    expect(result.turnOrder).toHaveLength(0)
    expect(result.currentTurnUid).toBeNull()
  })

  it('3인 게임에서 현재 턴 플레이어가 나가면 다음 플레이어로 턴이 넘어간다', () => {
    let room = makeWaitingRoom()
    room = joinRoom(room, P2, NOW)
    room = joinRoom(room, P3, NOW)
    room = startRoomGame(room, HOST.uid, NOW)
    expect(room.currentTurnUid).toBe(HOST.uid)
    const result = leaveRoom(room, HOST.uid, NOW + 10)
    expect(result.status).toBe('playing')
    expect(result.currentTurnUid).not.toBeNull()
    expect(result.currentTurnUid).not.toBe(HOST.uid)
  })

  it('게임 중 퇴장 후 connected 플레이어 1명 이하이면 게임이 종료된다', () => {
    const base = makePlayingRoom()
    const disconnected = setPlayerConnected(base, P2.uid, false, NOW + 1)
    const result = leaveRoom(disconnected, HOST.uid, NOW + 10)
    expect(result.status).toBe('finished')
    expect(result.currentTurnUid).toBeNull()
  })

  it('3인 게임에서 1명 퇴장해도 game over가 되지 않는다', () => {
    let room = makeWaitingRoom()
    room = joinRoom(room, P2, NOW)
    room = joinRoom(room, P3, NOW)
    room = startRoomGame(room, HOST.uid, NOW)
    const result = leaveRoom(room, P3.uid, NOW + 10)
    expect(result.status).toBe('playing')
  })

  it('방장이 나가면 다음 플레이어가 방장이 된다', () => {
    const room = makePlayingRoom()
    const result = leaveRoom(room, HOST.uid, NOW + 10)
    expect(result.hostUid).toBe(P2.uid)
  })
})
