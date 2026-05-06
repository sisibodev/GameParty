/**
 * 2 Bounce 온라인 멀티플레이 타입 정의 (v0.2 설계)
 *
 * 싱글플레이 타입(types.ts)과 분리하여 관리한다.
 * Firebase Realtime Database 동기화 기반.
 * Task011 설계 문서 기준.
 */

import type { TargetGoals, Vec3 } from './types'

// ─── 방 상태 ──────────────────────────────────────────────────────────────────

export type RoomStatus = 'waiting' | 'playing' | 'finished'

export interface TwoBounceRoom {
  id: string
  status: RoomStatus
  hostUid: string
  targetGoals: TargetGoals
  maxPlayers: number
  createdAt: number        // Unix ms
  updatedAt: number        // Unix ms
  players: Record<string, TwoBounceRoomPlayer>
  /** 입장 순서 기준 uid 배열 */
  turnOrder: string[]
  /** 현재 슛을 진행 중인 플레이어 uid. 대기/종료 시 null */
  currentTurnUid: string | null
  /** 진행 중인 슛 상태. 슛이 없으면 null */
  currentShot: TwoBounceShotState | null
  /** 다음 턴 슛 시작 위치. 게임 시작 또는 슛 확정 후 갱신 */
  currentStartPosition: Vec3 | null
  /** 마지막으로 완료된 슛 결과. 결과 표시 및 히스토리용 */
  lastResolvedShot: TwoBounceShotState | null
  winnerUid: string | null
  /** 다시 하기 요청 상태 — uid → ready 여부 */
  rematchReady?: Record<string, boolean>
  /** 같은 방에서 진행된 누적 게임 수 (0 = 첫 게임) */
  rematchCount?: number
}

// ─── 플레이어 상태 ─────────────────────────────────────────────────────────────

export interface TwoBounceRoomPlayer {
  uid: string
  displayName: string
  photoURL?: string
  goals: number
  totalShots: number
  /** Firebase onDisconnect 연동 */
  connected: boolean
  joinedAt: number         // Unix ms
}

// ─── 슛 상태 (방 내부) ────────────────────────────────────────────────────────

export type MultiShotResult = 'pending' | 'goal' | 'miss'

export interface TwoBounceShotState {
  shotId: string
  shooterUid: string
  startPosition: Vec3
  result: MultiShotResult
  /** 다음 턴 시작 위치 (확정 후 설정) */
  nextStartPosition: Vec3 | null
  /** 실패 시 두 번째 바운스 위치 */
  bouncePosition?: Vec3
  createdAt: number        // Unix ms
  resolvedAt?: number      // Unix ms
  /** 관전자 리플레이용 — 수평 조준각 (rad) */
  aimYaw?: number
  /** 관전자 리플레이용 — 수직 조준각 (rad) */
  aimPitch?: number
  /** 관전자 리플레이용 — 충전 파워 0~1 */
  power?: number
}

// ─── 슛 이벤트 — 관전 리플레이용 ──────────────────────────────────────────────

/**
 * 현재 턴 플레이어가 슛을 발사할 때 DB에 기록.
 * 다른 클라이언트는 이 데이터로 입력 기반 리플레이를 재생한다.
 */
export interface TwoBounceShotStarted {
  shotId: string
  shooterUid: string
  startPosition: Vec3
  /** 수평 조준각 (rad) */
  aimYaw: number
  /** 수직 조준각 (rad) */
  aimPitch: number
  /** 충전 파워 0~1 */
  power: number
  startedAt: number        // Unix ms
}

/**
 * 슛 결과가 확정되면 DB에 기록.
 * 모든 클라이언트는 이 값을 게임 상태의 최종 진실로 사용한다.
 * 리플레이 물리 결과보다 이 값이 우선한다.
 */
export interface TwoBounceShotResolved {
  shotId: string
  shooterUid: string
  result: 'goal' | 'miss'
  nextStartPosition: Vec3
  /** 실패 시 두 번째 바운스 위치 */
  bouncePosition?: Vec3
  /** 슛 확정 후 각 플레이어의 골 수 스냅샷 */
  goalsAfterShot: Record<string, number>
  /** null이면 게임 종료 */
  nextTurnUid: string | null
  /** 승자가 있으면 설정. 없으면 null */
  winnerUid: string | null
  resolvedAt: number       // Unix ms
}

// ─── 유틸리티 타입 ─────────────────────────────────────────────────────────────

/** 방 생성/참가 시 플레이어 식별 정보 입력 (goals/totalShots/connected/joinedAt 제외) */
export interface TwoBounceRoomPlayerInput {
  uid: string
  displayName: string
  photoURL?: string
}

// ─── 공개 방 인덱스 ────────────────────────────────────────────────────────────

/**
 * 공개 방 목록 전용 경량 인덱스 엔트리.
 * RTDB 경로: twoBounceRoomIndex/{roomId}
 * 방 전체 데이터 대신 목록 표시에 필요한 필드만 포함한다.
 */
export interface TwoBounceRoomIndexEntry {
  roomId: string
  status: RoomStatus
  hostUid: string
  hostName: string
  targetGoals: TargetGoals
  playerCount: number
  connectedCount: number
  maxPlayers: number
  createdAt: number   // Unix ms
  updatedAt: number   // Unix ms
  /** waiting + 인원 여유 + connected 실제 사용자 있음 + dev-guest-only 아님 */
  isOpen: boolean
  hasDevGuest?: boolean
}

/** 방 생성 시 필요한 최소 입력 */
export interface CreateRoomInput {
  targetGoals: TargetGoals
  maxPlayers: 2 | 3 | 4
}

/** 방 참가 시 필요한 최소 입력 */
export interface JoinRoomInput {
  roomId: string
}

// ─── 멀티 경기 기록 ────────────────────────────────────────────────────────────

/**
 * 한 경기에서 개별 플레이어의 결과.
 * TwoBounceMultiMatchResult의 players 배열 요소로 사용.
 */
export interface TwoBounceMultiPlayerResult {
  uid: string
  displayName: string
  goals: number
  totalShots: number
  /** 0~100 정수 (%) */
  accuracy: number
  /** 승자 여부 */
  isWinner: boolean
}

/**
 * 멀티 경기 한 판 결과.
 * 싱글의 TwoBounceRunResult에 대응하는 멀티 버전.
 * 추후 Firestore 저장 시 동일 구조 사용 예정.
 */
export interface TwoBounceMultiMatchResult {
  roomId: string
  targetGoals: TargetGoals
  playerCount: number
  /** 경기 시작부터 종료까지 소요 시간 (ms) */
  elapsedMs: number
  /** ISO 8601 — 경기 종료 시각 */
  completedAt: string
  players: TwoBounceMultiPlayerResult[]
  /** 승자 uid. 무승부(예외 종료)이면 null */
  winnerUid: string | null
}
