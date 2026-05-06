/**
 * 2 Bounce 멀티플레이 방/턴/슛 엔진 — 순수 함수
 *
 * Firebase / UI 의존성 없음. 모든 함수는 입력을 변경하지 않고 새 상태를 반환한다.
 * 잘못된 입력은 Error를 throw한다.
 * Task012 기준.
 */

import type { Vec3, TargetGoals } from '../types'
import type {
  TwoBounceRoom,
  TwoBounceRoomPlayer,
  TwoBounceRoomPlayerInput,
  TwoBounceShotState,
} from '../types.multi'

// ─── 내부 헬퍼 ────────────────────────────────────────────────────────────────

const VALID_GOALS: TargetGoals[] = [3, 5, 10]

function getFirstConnectedUid(
  turnOrder: string[],
  players: Record<string, TwoBounceRoomPlayer>,
): string | null {
  return turnOrder.find((uid) => players[uid]?.connected) ?? null
}

function countConnected(players: Record<string, TwoBounceRoomPlayer>): number {
  return Object.values(players).filter((p) => p.connected).length
}

function toRoomPlayer(
  player: TwoBounceRoomPlayerInput,
  now: number,
): TwoBounceRoomPlayer {
  return {
    uid: player.uid,
    displayName: player.displayName,
    ...(player.photoURL ? { photoURL: player.photoURL } : {}),
    goals: 0,
    totalShots: 0,
    connected: true,
    joinedAt: now,
  }
}

// ─── 방 생성 ─────────────────────────────────────────────────────────────────

export function createRoom(params: {
  roomId: string
  host: TwoBounceRoomPlayerInput
  targetGoals: TargetGoals
  maxPlayers: number
  now: number
}): TwoBounceRoom {
  const { roomId, host, targetGoals, maxPlayers, now } = params
  if (!VALID_GOALS.includes(targetGoals)) {
    throw new Error(`Invalid targetGoals: ${targetGoals}. Must be 3, 5, or 10.`)
  }
  if (maxPlayers < 2 || maxPlayers > 8) {
    throw new Error(`Invalid maxPlayers: ${maxPlayers}. Must be 2–8.`)
  }
  const hostPlayer = toRoomPlayer(host, now)
  return {
    id: roomId,
    status: 'waiting',
    hostUid: host.uid,
    targetGoals,
    maxPlayers,
    createdAt: now,
    updatedAt: now,
    players: { [host.uid]: hostPlayer },
    turnOrder: [host.uid],
    currentTurnUid: null,
    currentShot: null,
    currentStartPosition: null,
    lastResolvedShot: null,
    winnerUid: null,
  }
}

// ─── 플레이어 참가 / 퇴장 / 연결 상태 ────────────────────────────────────────

export function joinRoom(
  room: TwoBounceRoom,
  player: TwoBounceRoomPlayerInput,
  now: number,
): TwoBounceRoom {
  if (room.status !== 'waiting') {
    throw new Error('Cannot join: room is not in waiting state')
  }
  // 이미 참가 중 → 정보 갱신
  if (room.players[player.uid]) {
    return {
      ...room,
      updatedAt: now,
      players: {
        ...room.players,
        [player.uid]: {
          ...room.players[player.uid],
          displayName: player.displayName,
          ...(player.photoURL ? { photoURL: player.photoURL } : {}),
          connected: true,
        },
      },
    }
  }
  if (Object.keys(room.players).length >= room.maxPlayers) {
    throw new Error('Cannot join: room is full')
  }
  const newPlayer = toRoomPlayer(player, now)
  return {
    ...room,
    updatedAt: now,
    players: { ...room.players, [player.uid]: newPlayer },
    turnOrder: [...room.turnOrder, player.uid],
  }
}

export function leaveRoom(
  room: TwoBounceRoom,
  uid: string,
  now: number,
): TwoBounceRoom {
  if (!room.players[uid]) return room

  const newPlayers = { ...room.players }
  delete newPlayers[uid]
  const newTurnOrder = room.turnOrder.filter((u) => u !== uid)

  // 남은 플레이어 없음
  if (newTurnOrder.length === 0) {
    return {
      ...room,
      updatedAt: now,
      status: 'finished',
      players: newPlayers,
      turnOrder: [],
      hostUid: '',
      currentTurnUid: null,
    }
  }

  // 방장 위임: 퇴장자가 방장이면 다음 turnOrder 첫 번째로 위임
  const newHostUid = uid === room.hostUid ? newTurnOrder[0] : room.hostUid

  const partialRoom: TwoBounceRoom = {
    ...room,
    updatedAt: now,
    hostUid: newHostUid,
    players: newPlayers,
    turnOrder: newTurnOrder,
  }

  // 게임 중 퇴장자가 현재 턴이면 다음 connected 플레이어로 넘김
  let newCurrentTurnUid = room.currentTurnUid
  if (room.status === 'playing' && room.currentTurnUid === uid) {
    newCurrentTurnUid = getNextTurnUid(partialRoom, uid)
  }

  // 게임 중 connected 플레이어가 1명 이하면 종료
  if (room.status === 'playing' && countConnected(newPlayers) <= 1) {
    return { ...partialRoom, status: 'finished', currentTurnUid: null }
  }

  return { ...partialRoom, currentTurnUid: newCurrentTurnUid }
}

export function setPlayerConnected(
  room: TwoBounceRoom,
  uid: string,
  connected: boolean,
  now: number,
): TwoBounceRoom {
  if (!room.players[uid]) return room
  return {
    ...room,
    updatedAt: now,
    players: {
      ...room.players,
      [uid]: { ...room.players[uid], connected },
    },
  }
}

// ─── 게임 시작 / 턴 순서 ──────────────────────────────────────────────────────

export function startRoomGame(
  room: TwoBounceRoom,
  requesterUid: string,
  now: number,
): TwoBounceRoom {
  if (requesterUid !== room.hostUid) {
    throw new Error('Only the host can start the game')
  }
  if (room.status !== 'waiting') {
    throw new Error('Room is not in waiting state')
  }
  if (countConnected(room.players) < 2) {
    throw new Error('Need at least 2 connected players to start')
  }

  // 모든 플레이어 점수 초기화
  const resetPlayers: Record<string, TwoBounceRoomPlayer> = {}
  for (const [id, player] of Object.entries(room.players)) {
    resetPlayers[id] = { ...player, goals: 0, totalShots: 0 }
  }

  const firstTurnUid = getFirstConnectedUid(room.turnOrder, resetPlayers)

  return {
    ...room,
    updatedAt: now,
    status: 'playing',
    players: resetPlayers,
    currentTurnUid: firstTurnUid,
    currentShot: null,
    currentStartPosition: null,
    lastResolvedShot: null,
    winnerUid: null,
  }
}

/**
 * currentUid 다음 connected 플레이어 uid를 순환 구조로 반환한다.
 * connected 플레이어가 없으면 null을 반환한다.
 */
export function getNextTurnUid(
  room: TwoBounceRoom,
  currentUid: string,
): string | null {
  const { turnOrder, players } = room
  const currentIndex = turnOrder.indexOf(currentUid)
  if (currentIndex === -1) {
    return getFirstConnectedUid(turnOrder, players)
  }
  const len = turnOrder.length
  for (let i = 1; i <= len; i++) {
    const nextUid = turnOrder[(currentIndex + i) % len]
    if (players[nextUid]?.connected) return nextUid
  }
  return null
}

// ─── 슛 시작 ─────────────────────────────────────────────────────────────────

export function startShot(
  room: TwoBounceRoom,
  params: {
    shotId: string
    shooterUid: string
    startPosition: Vec3
    aimYaw: number
    aimPitch: number
    power: number
    now: number
  },
): TwoBounceRoom {
  if (room.status !== 'playing') {
    throw new Error('Room is not in playing state')
  }
  if (params.shooterUid !== room.currentTurnUid) {
    throw new Error('Not your turn')
  }
  if (room.currentShot?.result === 'pending') {
    throw new Error('A shot is already in progress')
  }
  if (params.power < 0 || params.power > 1) {
    throw new Error('Power must be between 0 and 1')
  }

  const shot: TwoBounceShotState = {
    shotId: params.shotId,
    shooterUid: params.shooterUid,
    startPosition: params.startPosition,
    result: 'pending',
    nextStartPosition: null,
    aimYaw: params.aimYaw,
    aimPitch: params.aimPitch,
    power: params.power,
    createdAt: params.now,
  }

  return {
    ...room,
    updatedAt: params.now,
    currentShot: shot,
  }
}

// ─── 슛 결과 확정 ──────────────────────────────────────────────────────────────

export function resolveShot(
  room: TwoBounceRoom,
  params: {
    shotId: string
    shooterUid: string
    result: 'goal' | 'miss'
    nextStartPosition: Vec3
    bouncePosition?: Vec3
    now: number
  },
): TwoBounceRoom {
  if (room.status !== 'playing') {
    throw new Error('Room is not in playing state')
  }

  if (room.currentShot && room.currentShot.result === 'pending') {
    // 정상 경로: pending 슛이 있으면 shotId / shooterUid 검증
    if (room.currentShot.shotId !== params.shotId) {
      throw new Error('shotId does not match current shot')
    }
    if (room.currentShot.shooterUid !== params.shooterUid) {
      throw new Error('shooterUid does not match current shot')
    }
  } else if (!room.currentShot) {
    // 허용 경로: writeShotStarted 경쟁 조건으로 currentShot이 null인 경우
    // 같은 shotId가 이미 lastResolvedShot에 있으면 중복 resolve 방지
    if (room.lastResolvedShot?.shotId === params.shotId) {
      throw new Error('Shot already resolved')
    }
    // shooterUid가 현재 턴 플레이어와 일치해야 허용
    if (params.shooterUid !== room.currentTurnUid) {
      throw new Error('No pending shot and shooterUid does not match currentTurnUid')
    }
  } else {
    // currentShot이 있지만 result가 pending이 아닌 상태
    throw new Error('No pending shot to resolve')
  }

  const shooter = room.players[params.shooterUid]
  if (!shooter) throw new Error('Shooter not found in room')

  const isGoal = params.result === 'goal'
  const updatedShooter: TwoBounceRoomPlayer = {
    ...shooter,
    goals: isGoal ? shooter.goals + 1 : shooter.goals,
    totalShots: shooter.totalShots + 1,
  }
  const updatedPlayers = {
    ...room.players,
    [params.shooterUid]: updatedShooter,
  }

  // currentShot이 null인 경쟁 조건 경로: params에서 필수 필드를 직접 채운다
  const baseShot = room.currentShot ?? {
    shotId: params.shotId,
    shooterUid: params.shooterUid,
    startPosition: room.currentStartPosition ?? params.nextStartPosition,
    result: 'pending' as const,
    nextStartPosition: null,
    createdAt: params.now,
  }
  const resolvedShot: TwoBounceShotState = {
    ...baseShot,
    result: params.result,
    nextStartPosition: params.nextStartPosition,
    ...(params.bouncePosition !== undefined ? { bouncePosition: params.bouncePosition } : {}),
    resolvedAt: params.now,
  }

  // 승리 판정 — 목표 골 달성 시 게임 종료
  if (isGoal && updatedShooter.goals >= room.targetGoals) {
    return {
      ...room,
      updatedAt: params.now,
      status: 'finished',
      players: updatedPlayers,
      currentShot: null,
      lastResolvedShot: resolvedShot,
      currentStartPosition: params.nextStartPosition,
      currentTurnUid: null,
      winnerUid: params.shooterUid,
    }
  }

  // 골 성공: 2 Bounce 룰 — 성공한 플레이어 턴 유지, 자유투 위치에서 연속 공격
  if (isGoal) {
    return {
      ...room,
      updatedAt: params.now,
      players: updatedPlayers,
      currentShot: null,
      lastResolvedShot: resolvedShot,
      currentStartPosition: params.nextStartPosition,
      currentTurnUid: params.shooterUid,
    }
  }

  // 실패: 다음 connected 플레이어로 턴 전환
  const nextTurnUid = getNextTurnUid(
    { ...room, players: updatedPlayers },
    params.shooterUid,
  )

  return {
    ...room,
    updatedAt: params.now,
    players: updatedPlayers,
    currentShot: null,
    lastResolvedShot: resolvedShot,
    currentStartPosition: params.nextStartPosition,
    currentTurnUid: nextTurnUid,
  }
}

// ─── Rematch ──────────────────────────────────────────────────────────────────

/**
 * finished 방에서 uid의 다시 하기 준비 상태를 설정한다.
 */
export function setRematchReady(
  room: TwoBounceRoom,
  uid: string,
  ready: boolean,
  now: number,
): TwoBounceRoom {
  if (room.status !== 'finished') {
    throw new Error('Can only set rematch ready in finished state')
  }
  if (!room.players[uid]) {
    throw new Error('Player not found in room')
  }
  return {
    ...room,
    updatedAt: now,
    rematchReady: { ...(room.rematchReady ?? {}), [uid]: ready },
  }
}

/**
 * 모든 connected 플레이어가 다시 하기 준비를 완료했는지 확인한다.
 */
export function canStartRematch(room: TwoBounceRoom): boolean {
  if (room.status !== 'finished') return false
  const connected = room.turnOrder.filter((uid) => room.players[uid]?.connected)
  if (connected.length < 2) return false
  return connected.every((uid) => room.rematchReady?.[uid] === true)
}

/**
 * 같은 방에서 새 게임을 시작한다. 점수/슛/결과 상태를 초기화한다.
 */
export function startRematch(room: TwoBounceRoom, now: number): TwoBounceRoom {
  if (room.status !== 'finished') {
    throw new Error('Can only start rematch from finished state')
  }
  if (countConnected(room.players) < 2) {
    throw new Error('Need at least 2 connected players to rematch')
  }

  const resetPlayers: Record<string, TwoBounceRoomPlayer> = {}
  for (const [id, player] of Object.entries(room.players)) {
    resetPlayers[id] = { ...player, goals: 0, totalShots: 0 }
  }

  const firstTurnUid = getFirstConnectedUid(room.turnOrder, resetPlayers)

  return {
    ...room,
    updatedAt: now,
    status: 'playing',
    players: resetPlayers,
    currentTurnUid: firstTurnUid,
    currentShot: null,
    currentStartPosition: null,
    lastResolvedShot: null,
    winnerUid: null,
    rematchReady: {},
    rematchCount: (room.rematchCount ?? 0) + 1,
  }
}

// ─── 연결 끊김 턴 스킵 ────────────────────────────────────────────────────────

/**
 * currentTurnUid 플레이어가 disconnected 상태이면 다음 connected 플레이어로 턴을 넘긴다.
 * pending shot 중에는 스킵하지 않는다 (별도 timeout 정책으로 처리).
 * connected 플레이어가 1명 이하이면 방을 finished로 전환한다.
 */
export function skipDisconnectedTurn(
  room: TwoBounceRoom,
  now: number,
): TwoBounceRoom {
  if (room.status !== 'playing') return room
  if (!room.currentTurnUid) return room

  const currentPlayer = room.players[room.currentTurnUid]
  if (currentPlayer?.connected) return room  // 현재 플레이어 정상 연결 중

  // pending shot 중이면 스킵하지 않음
  if (room.currentShot?.result === 'pending') return room

  // connected 플레이어 1명 이하 → 방 종료
  if (countConnected(room.players) <= 1) {
    return { ...room, updatedAt: now, status: 'finished', currentTurnUid: null }
  }

  const nextUid = getNextTurnUid(room, room.currentTurnUid)
  if (nextUid === null) {
    return { ...room, updatedAt: now, status: 'finished', currentTurnUid: null }
  }

  return { ...room, updatedAt: now, currentTurnUid: nextUid }
}
