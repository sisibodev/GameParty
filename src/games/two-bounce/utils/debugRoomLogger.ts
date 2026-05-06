/**
 * 2 Bounce 멀티플레이 — 개발 전용 room 상태 스냅샷 로거
 *
 * import.meta.env.DEV에서만 동작한다. 프로덕션 빌드에는 영향 없음.
 */

const _isDev = import.meta.env.DEV

export interface RoomLogEntry {
  event: string
  roomId?: string | null
  currentTurnUid?: string | null
  currentShotId?: string | null
  currentShotResult?: string | null
  currentShotShooter?: string | null
  lastResolvedId?: string | null
  lastResolvedResult?: string | null
  startPos?: { x: number; y: number; z: number } | null
  players?: Record<string, { goals: number; totalShots: number; connected: boolean }>
  localShotId?: string | null
  localPhase?: string
  ctx?: string
}

/** 멀티플레이 room 상태 스냅샷을 console.debug로 기록한다. DEV 전용. */
export function logRoomEvent(entry: RoomLogEntry): void {
  if (!_isDev) return
  const ts = new Date().toISOString().slice(11, 23)
  const shot = entry.currentShotId
    ? `${entry.currentShotId.slice(-6)}(${entry.currentShotResult ?? '?'}/${entry.currentShotShooter?.slice(-4) ?? '?'})`
    : 'null'
  const last = entry.lastResolvedId
    ? `${entry.lastResolvedId.slice(-6)}(${entry.lastResolvedResult ?? '?'})`
    : 'null'
  const pos = entry.startPos
    ? `(${entry.startPos.x.toFixed(1)},${entry.startPos.z.toFixed(1)})`
    : 'null'
  const players = entry.players
    ? Object.entries(entry.players)
        .map(([uid, p]) => `${uid.slice(-4)}:${p.goals}g/${p.totalShots}s/${p.connected ? 'on' : 'off'}`)
        .join(' ')
    : undefined
  // eslint-disable-next-line no-console
  console.debug(
    `[ROOM ${ts}] ${entry.event}`,
    `turn=${entry.currentTurnUid ?? 'null'}`,
    `shot=${shot}`,
    `last=${last}`,
    `pos=${pos}`,
    `local=${entry.localShotId?.slice(-6) ?? 'null'}/${entry.localPhase ?? '?'}`,
    ...(entry.ctx ? [`ctx=${entry.ctx}`] : []),
    ...(players ? [`players=[${players}]`] : []),
  )
}
