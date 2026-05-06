import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../../contexts/AuthContext'
import {
  subscribeTwoBounceRoom,
  writeShotStarted,
  writeShotResolved,
  registerOnDisconnect,
  setTwoBouncePlayerConnected,
  leaveTwoBounceRoom,
  deleteRoom,
  setTwoBounceRematchReady,
} from '../../utils/rtdb'
import type { TwoBounceRoom, TwoBounceRoomPlayer } from '../../types.multi'
import type { ShotPhase, Vec3 } from '../../types'
import { PHYSICS } from '../../utils/physics'
import BasketballScene from '../../components/BasketballScene'
import { playBounceSound } from '../../utils/sound'
import { predictPowerRange, calcDistanceToHoop } from '../../utils/aimPredictor'
import { isFreeThrowPos } from '../../utils/physics'
import { isDevGuestUid } from '../../utils/devGuest'
import { logRoomEvent } from '../../utils/debugRoomLogger'
import styles from './multiGame.module.css'

const isDev = import.meta.env.DEV
const TWO_BOUNCE_BASE = '/game/two-bounce'

const MAX_CHARGE_MS = 1500
const AIM_SPEED = 1.8
const AIM_PITCH_MIN = -Math.PI / 18
const AIM_PITCH_MAX = Math.PI / 3

function generateShotId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}


export default function MultiGamePage() {
  const { roomId } = useParams<{ roomId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  // RTDB state
  const [room, setRoom] = useState<TwoBounceRoom | null>(null)
  const [loading, setLoading] = useState(true)
  const [subscribeError, setSubscribeError] = useState<string | null>(null)

  // Local shot state (mirrors BasketballScene props)
  const [localShotPhase, setLocalShotPhase] = useState<ShotPhase>('aiming')
  const [aimAz, setAimAz] = useState(0)
  const [aimEl, setAimEl] = useState(0.6)
  const [power, setPower] = useState(0)
  const [shotPosition, setShotPosition] = useState<Vec3>({ ...PHYSICS.FREE_THROW_POS })
  const [shotCounter, setShotCounter] = useState(0)
  const [flash, setFlash] = useState<'success' | 'miss' | 'gameSet' | null>(null)
  const [devPanelOpen, setDevPanelOpen] = useState(false)
  const [rematchReadied, setRematchReadied] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [resultSnapshot, setResultSnapshot] = useState<{
    winner: TwoBounceRoomPlayer | null
    players: TwoBounceRoomPlayer[]
    targetGoals: number
  } | null>(null)
  const prevStatusRef = useRef<string | undefined>(undefined)

  // Refs for keyboard loop
  const localShotPhaseRef = useRef<ShotPhase>('aiming')
  const powerRef = useRef(0)
  const pressedKeysRef = useRef(new Set<string>())
  const aimAzRef = useRef(0)
  const aimElRef = useRef(0.6)
  const chargeStartRef = useRef(0)
  const lastLoopTimeRef = useRef(0)
  const gameLoopRafRef = useRef(0)
  const roomRef = useRef<TwoBounceRoom | null>(null)
  const shotPositionRef = useRef<Vec3>({ ...PHYSICS.FREE_THROW_POS })

  // Multiplayer tracking refs
  const currentShotIdRef = useRef<string | null>(null)
  const lastReplayShotIdRef = useRef<string | null>(null)
  const lastResolvedShotIdRef = useRef<string | null>(null)
  const resolvingShotIdsRef = useRef(new Set<string>())
  const initializedRef = useRef(false)
  const isMyTurnRef = useRef(false)
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // writeShotStarted promise 추적 — handleGoal/handleMiss에서 await해 경쟁 조건 방지
  const shotStartPromiseRef = useRef<Promise<void>>(Promise.resolve())
  // 슛 발사 시점의 shooterUid 고정 — handleGoal/handleMiss에서 일관되게 사용
  const currentShooterUidRef = useRef<string | null>(null)
  // 이 클라이언트가 슛 결과를 서버에 기록할 권한이 있는지 명시적으로 추적
  const isAuthoritativeShooterRef = useRef(false)

  // Sync refs with state
  useEffect(() => { roomRef.current = room }, [room])
  useEffect(() => { shotPositionRef.current = shotPosition }, [shotPosition])

  const myUid = user?.uid

  // ─── RTDB subscription ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId || !myUid) return
    const unsub = subscribeTwoBounceRoom(
      roomId,
      (r) => {
        setLoading(false)
        setRoom(r)
      },
      () => {
        setLoading(false)
        setSubscribeError('방 정보를 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.')
      },
    )
    return unsub
  }, [roomId, myUid])

  // ─── 플레이어 접속 설정 — room 로드 후 실제 플레이어인 경우에만 ───────────────
  const connectionSetupRef = useRef(false)
  useEffect(() => {
    if (!room || !roomId || !myUid || connectionSetupRef.current) return
    connectionSetupRef.current = true
    if (!room.turnOrder.includes(myUid)) return  // 관전자는 접속 설정 불필요
    try {
      registerOnDisconnect(roomId, myUid)
      // 재연결 시 connected=true 복구 — 연결 끊김 후 재접속해도 턴 전환이 정상 작동하도록
      void setTwoBouncePlayerConnected(roomId, myUid, true)
    } catch {
      // 등록 실패는 치명적이지 않으므로 무시
    }
  }, [room, roomId, myUid])

  // ─── Route guard: still waiting → back to waiting room ─────────────────────
  useEffect(() => {
    if (!room) return
    if (room.status === 'waiting') {
      navigate(`${TWO_BOUNCE_BASE}/multi/room/${roomId}`, { replace: true })
    }
  }, [room, roomId, navigate])

  // ─── Update isMyTurnRef ────────────────────────────────────────────────────
  useEffect(() => {
    const isDevGuestTurn = isDev && isDevGuestUid(room?.currentTurnUid ?? '')
    isMyTurnRef.current = room?.currentTurnUid === myUid || isDevGuestTurn
  }, [room?.currentTurnUid, myUid, room])

  // ─── Spectator replay ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!room?.currentShot) return
    const shot = room.currentShot
    if (shot.result !== 'pending') return
    if (shot.shooterUid === myUid) return
    if (shot.shotId === lastReplayShotIdRef.current) return

    lastReplayShotIdRef.current = shot.shotId
    if (isDev) console.debug('[MULTI] 관전자 리플레이 시작 shotId:', shot.shotId, 'shooter:', shot.shooterUid) // eslint-disable-line no-console
    const replayAz = shot.aimYaw ?? 0
    const replayEl = shot.aimPitch ?? 0.6
    const replayPower = shot.power ?? 0.5

    aimAzRef.current = replayAz
    aimElRef.current = replayEl
    powerRef.current = replayPower
    setAimAz(replayAz)
    setAimEl(replayEl)
    setPower(replayPower)
    setShotPosition({ ...shot.startPosition })
    localShotPhaseRef.current = 'flying'
    setLocalShotPhase('flying')
    setShotCounter(c => c + 1)
  }, [room?.currentShot, myUid])

  // ─── 새로고침 초기화: 서버 상태로 위치 및 처리 마커 복구 ──────────────────────
  useEffect(() => {
    if (!room || initializedRef.current) return
    initializedRef.current = true
    // 서버의 currentStartPosition 기준으로 위치 복구
    const startPos = room.currentStartPosition ?? { ...PHYSICS.FREE_THROW_POS }
    setShotPosition({ ...startPos })
    shotPositionRef.current = { ...startPos }
    // 이미 처리된 슛 마킹 → 새로고침 후 이전 슛 재처리 방지
    lastResolvedShotIdRef.current = room.lastResolvedShot?.shotId ?? null
  }, [room])

  // ─── 게임 종료 전환 / Rematch 감지 ───────────────────────────────────────────
  useEffect(() => {
    if (!room) return
    const prevStatus = prevStatusRef.current
    prevStatusRef.current = room.status

    // ── Rematch 시작: finished → playing ──────────────────────────────────────
    if (room.status === 'playing' && prevStatus === 'finished') {
      setShowResult(false)
      setResultSnapshot(null)
      setRematchReadied(false)
      setFlash(null)
      localShotPhaseRef.current = 'aiming'
      setLocalShotPhase('aiming')
      setPower(0)
      powerRef.current = 0
      currentShotIdRef.current = null
      currentShooterUidRef.current = null
      isAuthoritativeShooterRef.current = false
      lastReplayShotIdRef.current = null
      lastResolvedShotIdRef.current = null
      resolvingShotIdsRef.current.clear()
      const rematchPos = { ...PHYSICS.FREE_THROW_POS }
      setShotPosition(rematchPos)
      shotPositionRef.current = rematchPos
      setShotCounter(c => c + 1)
      initializedRef.current = true
      return
    }

    if (room.status !== 'finished') return

    const snapRoom = roomRef.current ?? room
    const snapWinner = snapRoom.winnerUid ? snapRoom.players[snapRoom.winnerUid] ?? null : null
    const snapPlayers = snapRoom.turnOrder
      .map(uid => snapRoom.players[uid])
      .filter((p): p is TwoBounceRoomPlayer => !!p)
    const snap = { winner: snapWinner, players: snapPlayers, targetGoals: snapRoom.targetGoals }

    if (prevStatus === 'playing' && room.winnerUid) {
      // 게임 중 종료 → GAME SET 플래시 1.6초 후 결과 화면
      setFlash('gameSet')
      const t = setTimeout(() => {
        setFlash(null)
        setResultSnapshot(snap)
        setShowResult(true)
      }, 1600)
      return () => clearTimeout(t)
    } else {
      // 새로고침 등으로 이미 종료된 방에 진입 → 즉시 결과 화면
      setResultSnapshot(snap)
      setShowResult(true)
    }
  }, [room?.status, room?.winnerUid, room?.rematchCount]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── lastResolvedShot 변경 → 결과 플래시 표시 후 다음 턴 준비 ─────────────────
  useEffect(() => {
    if (!room?.lastResolvedShot) return
    const shot = room.lastResolvedShot
    if (shot.shotId === lastResolvedShotIdRef.current) return
    lastResolvedShotIdRef.current = shot.shotId

    const isGameOver = roomRef.current?.status === 'finished'
    if (!isGameOver && shot.shooterUid !== myUid) {
      setFlash(shot.result === 'goal' ? 'success' : 'miss')
    }

    logRoomEvent({
      event: `last-resolved:${shot.result}`,
      roomId: roomRef.current?.id,
      currentTurnUid: roomRef.current?.currentTurnUid,
      currentShotId: roomRef.current?.currentShot?.shotId,
      currentShotResult: roomRef.current?.currentShot?.result,
      lastResolvedId: shot.shotId,
      lastResolvedResult: shot.result,
      startPos: roomRef.current?.currentStartPosition,
      localShotId: currentShotIdRef.current,
      localPhase: localShotPhaseRef.current,
      ctx: shot.shooterUid === myUid ? 'shooter' : 'spectator',
    })

    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
    advanceTimerRef.current = setTimeout(() => {
      // 이미 다음 슛이 비행 중이면 씬을 리셋하지 않는다
      if (localShotPhaseRef.current === 'flying') return
      const nextPos = roomRef.current?.currentStartPosition ?? { ...PHYSICS.FREE_THROW_POS }
      setShotPosition({ ...nextPos })
      setFlash(null)
      localShotPhaseRef.current = 'aiming'
      setLocalShotPhase('aiming')
      setPower(0)
      powerRef.current = 0
      setShotCounter(c => c + 1)
    }, shot.result === 'goal' ? 600 : 1200)
  }, [room?.lastResolvedShot, myUid])

  // ─── Game loop: aim + power charge ─────────────────────────────────────────
  useEffect(() => {
    const loop = (time: number) => {
      gameLoopRafRef.current = requestAnimationFrame(loop)
      const dt = Math.min((time - (lastLoopTimeRef.current || time)) / 1000, 0.05)
      lastLoopTimeRef.current = time

      if (!isMyTurnRef.current) return
      const phase = localShotPhaseRef.current
      if (phase === 'flying' || phase === 'settled') return

      const keys = pressedKeysRef.current
      let az = aimAzRef.current
      let el = aimElRef.current
      let changed = false

      if (keys.has('ArrowLeft'))  { az -= AIM_SPEED * dt; changed = true }
      if (keys.has('ArrowRight')) { az += AIM_SPEED * dt; changed = true }
      if (keys.has('ArrowUp'))    { el = Math.min(AIM_PITCH_MAX, el + AIM_SPEED * dt); changed = true }
      if (keys.has('ArrowDown'))  { el = Math.max(AIM_PITCH_MIN, el - AIM_SPEED * dt); changed = true }

      if (changed) {
        aimAzRef.current = az
        aimElRef.current = el
        setAimAz(az)
        setAimEl(el)
      }

      if (phase === 'charging') {
        const p = Math.min((performance.now() - chargeStartRef.current) / MAX_CHARGE_MS, 1)
        powerRef.current = p
        setPower(p)
      }
    }
    gameLoopRafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(gameLoopRafRef.current)
  }, [])

  // ─── Keyboard handlers ─────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isMyTurnRef.current) return
    if (e.code === 'Space') {
      e.preventDefault()
      if (localShotPhaseRef.current !== 'aiming') return
      // localShotPhaseRef === 'aiming' 이면 이전 슛이 로컬 해결 완료된 것이므로
      // RTDB pending 여부와 무관하게 충전 허용 (forceLocalAdvance 이후 재사용 가능)
      chargeStartRef.current = performance.now()
      localShotPhaseRef.current = 'charging'
      setLocalShotPhase('charging')
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
      e.preventDefault()
      pressedKeysRef.current.add(e.code)
    }
  }, [])

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault()
      if (!isMyTurnRef.current) return
      if (localShotPhaseRef.current !== 'charging') return

      // 이전 슛의 advanceTimer가 남아 있으면 취소 — 비행 중 BasketballScene 리셋 방지
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current)
        advanceTimerRef.current = null
      }

      const finalPower = powerRef.current
      const shotId = generateShotId()
      currentShotIdRef.current = shotId
      lastReplayShotIdRef.current = shotId
      isAuthoritativeShooterRef.current = true

      localShotPhaseRef.current = 'flying'
      setLocalShotPhase('flying')

      if (roomId && user) {
        const startPos = { ...shotPositionRef.current }
        const shooterUid = roomRef.current?.currentTurnUid ?? user.uid
        // 슛 발사 시점 shooterUid 캡처 — 비동기 콜백에서 currentTurnUid가 바뀌어도 일관성 유지
        currentShooterUidRef.current = shooterUid
        // promise 저장 — handleGoal/handleMiss에서 await해 경쟁 조건 방지
        shotStartPromiseRef.current = writeShotStarted(roomId, {
          shotId,
          shooterUid,
          startPosition: startPos,
          aimYaw: aimAzRef.current,
          aimPitch: aimElRef.current,
          power: finalPower,
          startedAt: Date.now(),
        }).catch(() => { /* network error: writeShotResolved에서 처리 */ })
      }
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
      e.preventDefault()
      pressedKeysRef.current.delete(e.code)
    }
  }, [roomId, user])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [handleKeyDown, handleKeyUp])

  // ─── Local advance fallback (called when writeShotResolved fails) ──────────
  const forceLocalAdvance = useCallback((nextPos?: Vec3) => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
    advanceTimerRef.current = setTimeout(() => {
      setShotPosition(nextPos ?? { ...PHYSICS.FREE_THROW_POS })
      setFlash(null)
      localShotPhaseRef.current = 'aiming'
      setLocalShotPhase('aiming')
      setPower(0)
      powerRef.current = 0
      setShotCounter((c) => c + 1)
    }, 800)
  }, [])

  // ─── BasketballScene callbacks ─────────────────────────────────────────────
  const resolveCurrentShot = useCallback((
    result: 'goal' | 'miss',
    nextStartPosition: Vec3,
    bouncePosition?: Vec3,
  ) => {
    const shotId = currentShotIdRef.current
    if (!roomId || !user || !shotId) {
      if (isDev && !isAuthoritativeShooterRef.current) {
        console.debug('[MULTI] spectator callback blocked — not authoritative shooter', result) // eslint-disable-line no-console
      }
      if (isMyTurnRef.current) forceLocalAdvance(nextStartPosition)
      return
    }
    if (resolvingShotIdsRef.current.has(shotId)) {
      if (isDev) console.debug('[MULTI] 중복 resolve 차단 shotId:', shotId) // eslint-disable-line no-console
      return
    }

    resolvingShotIdsRef.current.add(shotId)
    if (isDev) console.debug('[MULTI] resolveCurrentShot', result, 'shotId:', shotId) // eslint-disable-line no-console
    const shooterUid =
      currentShooterUidRef.current ??
      roomRef.current?.currentShot?.shooterUid ??
      roomRef.current?.currentTurnUid ??
      user.uid

    const MAX_WAIT_MS = 2000
    void Promise.race([
      shotStartPromiseRef.current,
      new Promise<void>((r) => setTimeout(r, MAX_WAIT_MS)),
    ]).then(() =>
      writeShotResolved(roomId, {
        shotId,
        shooterUid,
        result,
        nextStartPosition,
        bouncePosition,
        goalsAfterShot: {},
        nextTurnUid: null,
        winnerUid: null,
        resolvedAt: Date.now(),
      }),
    ).then(() => {
      resolvingShotIdsRef.current.delete(shotId)
      if (currentShotIdRef.current === shotId) {
        currentShotIdRef.current = null
        currentShooterUidRef.current = null
        isAuthoritativeShooterRef.current = false
      }
    }).catch(() => {
      resolvingShotIdsRef.current.delete(shotId)
      isAuthoritativeShooterRef.current = false
      forceLocalAdvance(nextStartPosition)
    })
  }, [roomId, user, forceLocalAdvance])

  const handleGoalScored = useCallback(() => {
    setFlash('success')
    // resolveCurrentShot은 handleGoal에서만 호출 — 비행 중 중복 resolve 방지
  }, [])

  const handleGoal = useCallback((nextPos: Vec3) => {
    localShotPhaseRef.current = 'settled'
    setLocalShotPhase('settled')
    resolveCurrentShot('goal', nextPos)
  }, [resolveCurrentShot])

  const handleMiss = useCallback((secondBouncePos: Vec3 | null) => {
    localShotPhaseRef.current = 'settled'
    setLocalShotPhase('settled')
    setFlash('miss')

    const nextPos: Vec3 = secondBouncePos ?? { ...PHYSICS.FREE_THROW_POS }
    resolveCurrentShot('miss', nextPos, secondBouncePos ?? undefined)
  }, [resolveCurrentShot])

  const handleBounce = useCallback((speed: number) => {
    playBounceSound(speed)
  }, [])

  const handleLeaveGame = useCallback(async () => {
    if (!roomId || !myUid) {
      navigate(`${TWO_BOUNCE_BASE}/multi`, { replace: true })
      return
    }
    // 관전자는 방 상태를 변경하지 않고 바로 이동
    const isCurrentlySpectator = !(roomRef.current?.turnOrder.includes(myUid) ?? false)
    if (!isCurrentlySpectator) {
      try {
        await leaveTwoBounceRoom(roomId, myUid)
      } catch {
        // 실패해도 화면 이동
      }
    }
    navigate(`${TWO_BOUNCE_BASE}/multi`, { replace: true })
  }, [roomId, myUid, navigate])

  // 결과 화면 전용 — 다시 하기 요청
  const handleRematch = useCallback(async () => {
    if (!roomId || !myUid) return
    setRematchReadied(true)
    try {
      await setTwoBounceRematchReady(roomId, myUid)
    } catch {
      setRematchReadied(false)
    }
  }, [roomId, myUid])

  // 결과 화면 전용 — finished 방을 통째로 삭제 후 멀티 메뉴 복귀
  const handleLeaveToMenu = useCallback(async () => {
    if (roomId) {
      try { await deleteRoom(roomId) } catch { /* ignore */ }
    }
    navigate(`${TWO_BOUNCE_BASE}/multi`, { replace: true })
  }, [roomId, navigate])

  // 결과 화면 전용 — finished 방 삭제 후 방 만들기 페이지로 이동
  const handleNewRoom = useCallback(async () => {
    const prevGoals = resultSnapshot?.targetGoals ?? 3
    if (roomId) {
      try { await deleteRoom(roomId) } catch { /* ignore */ }
    }
    navigate(`${TWO_BOUNCE_BASE}/multi/create`, { replace: true, state: { targetGoals: prevGoals } })
  }, [roomId, resultSnapshot, navigate])

  // ─── Derived ───────────────────────────────────────────────────────────────
  const isMyTurn = room?.currentTurnUid === myUid
  const isDevGuestTurn = isDev && isDevGuestUid(room?.currentTurnUid ?? '')
  const canControl = isMyTurn || isDevGuestTurn
  const isFinished = room?.status === 'finished'
  // 관전자: room에 입장했지만 turnOrder에 없는 사용자
  const isSpectator = room !== null && !room.turnOrder.includes(myUid ?? '')

  const powerRange = useMemo(() => {
    if (localShotPhase === 'flying' || localShotPhase === 'settled') return null
    return predictPowerRange(shotPosition, aimAz, aimEl)
  }, [shotPosition, aimAz, aimEl, localShotPhase])

  const distanceToHoop = useMemo(
    () => calcDistanceToHoop(shotPosition),
    [shotPosition],
  )

  const inRange = localShotPhase === 'charging' && powerRange !== null
    && power >= powerRange.min && power <= powerRange.max

  // ─── Loading / not found ───────────────────────────────────────────────────
  if (loading) {
    return <div className={styles.fullscreen}><div className={styles.center}>로딩 중...</div></div>
  }

  if (subscribeError) {
    return (
      <div className={styles.fullscreen}>
        <div className={styles.center}>
          <div className={styles.error}>{subscribeError}</div>
          <button className={styles.backBtn} onClick={() => navigate(`${TWO_BOUNCE_BASE}/multi`)}>← 멀티 메뉴</button>
        </div>
      </div>
    )
  }

  if (!room) {
    return (
      <div className={styles.fullscreen}>
        <div className={styles.center}>
          <div className={styles.error}>방을 찾을 수 없습니다.</div>
          <button className={styles.backBtn} onClick={() => navigate(`${TWO_BOUNCE_BASE}/multi`)}>← 멀티 메뉴</button>
        </div>
      </div>
    )
  }

  // ─── 비정상 종료: winnerUid 없는 finished 상태 ─────────────────────────────
  if (isFinished && !room.winnerUid) {
    return (
      <div className={styles.fullscreen}>
        <div className={styles.center}>
          <div className={styles.error}>게임이 종료되었습니다.</div>
          <button className={styles.backBtn} onClick={handleLeaveGame}>← 멀티 메뉴</button>
        </div>
      </div>
    )
  }

  // ─── Result screen ─────────────────────────────────────────────────────────
  if (showResult && resultSnapshot) {
    const { winner, players, targetGoals: snapGoals } = resultSnapshot
    const sortedPlayers = [...players].sort((a, b) => b.goals - a.goals)

    const rematchReadyMap = room?.rematchReady ?? {}
    const connectedUids = room?.turnOrder.filter(uid => room.players[uid]?.connected) ?? []
    const readyCount = connectedUids.filter(uid => rematchReadyMap[uid]).length
    const totalCount = connectedUids.length

    return (
      <div className={styles.fullscreen}>
        <div className={styles.resultCard}>
          <div className={styles.resultTitle}>게임 종료</div>
          <div className={styles.resultWinner}>
            {winner?.displayName ?? '알 수 없음'} 승리!
          </div>
          <div className={styles.resultTable}>
            {sortedPlayers.map((p, i) => {
              const pct = p.totalShots > 0 ? Math.round((p.goals / p.totalShots) * 100) : 0
              return (
                <div key={p.uid} className={styles.resultRow}>
                  <span className={styles.resultRank}>{i + 1}위</span>
                  <span className={styles.resultName}>
                    {p.displayName}
                    {p.uid === myUid && ' (나)'}
                  </span>
                  <span className={styles.resultGoals}>{p.goals}골</span>
                  <span className={styles.resultShots}>{p.totalShots}슛</span>
                  <span className={styles.resultPct}>{pct}%</span>
                </div>
              )
            })}
          </div>
          <div className={styles.resultMeta}>목표 골: {snapGoals}골</div>
          <div className={styles.resultActions}>
            {rematchReadied ? (
              <div className={styles.rematchWaiting}>
                준비 완료 ({readyCount}/{totalCount}) 대기 중...
              </div>
            ) : (
              <button className={styles.primaryBtn} onClick={handleRematch}>
                다시 하기
              </button>
            )}
            <button className={styles.backBtn} onClick={handleNewRoom}>
              새 방 만들기
            </button>
            <button className={styles.backBtn} onClick={handleLeaveToMenu}>
              멀티 메뉴
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Game screen ───────────────────────────────────────────────────────────
  const currentTurnPlayer = room.currentTurnUid ? room.players[room.currentTurnUid] : null

  const positionLabel = isFreeThrowPos(room.currentStartPosition) ? 'Free throw' : '2nd bounce'
  let turnLabel: string
  if (isMyTurn) {
    turnLabel = '내 차례'
  } else if (isSpectator) {
    turnLabel = `관전 중 — ${currentTurnPlayer?.displayName ?? '?'}`
  } else if (isDevGuestTurn) {
    turnLabel = `${currentTurnPlayer?.displayName ?? '?'} 차례 (dev)`
  } else {
    turnLabel = `${currentTurnPlayer?.displayName ?? '?'} 차례`
  }

  return (
    <div className={styles.gameWrap}>
      <div className={styles.multiHud}>
        <div className={styles.hudTurn}>
          <span className={isMyTurn ? styles.myTurnLabel : styles.otherTurnLabel}>
            {turnLabel}
          </span>
          <span className={styles.hudPosition}>{positionLabel}</span>
        </div>
        <button className={styles.leaveBtn} onClick={handleLeaveGame}>Leave</button>
        <div className={styles.hudPlayers}>
          {room.turnOrder.map(uid => {
            const p = room.players[uid]
            if (!p) return null
            const isNearGoal = room.targetGoals - p.goals === 1
            return (
              <div
                key={uid}
                className={[
                  styles.hudPlayer,
                  uid === room.currentTurnUid ? styles.hudPlayerActive : '',
                  isNearGoal ? styles.hudPlayerNearGoal : '',
                ].join(' ')}
              >
                <span className={styles.hudPlayerName}>
                  {p.displayName}
                  {uid === myUid ? ' (me)' : ''}
                  {isDev && isDevGuestUid(uid) && uid === room.currentTurnUid ? ' [dev]' : ''}
                </span>
                <span className={styles.hudPlayerGoals}>
                  {p.goals}/{room.targetGoals}
                </span>
                <span className={styles.hudPlayerShots}>
                  {p.totalShots}s
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {isSpectator && (
        <div className={styles.watchingBadge}>관전 중</div>
      )}

      {isDevGuestTurn && (
        <div className={styles.devProxyBadge}>Dev guest control</div>
      )}

      {canControl && (localShotPhase === 'aiming' || localShotPhase === 'charging') && (
        <div className={`${styles.crosshair} ${inRange ? styles.crosshairInRange : ''}`} />
      )}

      <BasketballScene
        shotPhase={localShotPhase}
        aimAzimuth={aimAz}
        aimElevation={aimEl}
        power={power}
        startPosition={shotPosition}
        shotKey={shotCounter}
        onGoal={handleGoal}
        onGoalScored={handleGoalScored}
        onMiss={handleMiss}
        onBounce={handleBounce}
      />

      {canControl && (localShotPhase === 'aiming' || localShotPhase === 'charging') && (
        <div className={`${styles.gauge} ${localShotPhase === 'aiming' ? styles.gaugeReady : ''}`}>
          <div className={styles.gaugeLabel}>
            {localShotPhase === 'charging' ? `${Math.round(power * 100)}%` : 'READY'}
          </div>
          <div className={`${styles.gaugeTrack} ${!powerRange ? styles.gaugeNoRange : ''}`}>
            <div className={styles.gaugeFill} style={{ height: `${power * 100}%` }} />
            {powerRange && (
              <>
                <div
                  className={styles.gaugeRecommended}
                  style={{
                    bottom: `${powerRange.min * 100}%`,
                    height: `${Math.max((powerRange.max - powerRange.min) * 100, 2)}%`,
                  }}
                />
                <div
                  className={styles.gaugeOptimalLine}
                  style={{ bottom: `${powerRange.optimal * 100}%` }}
                />
              </>
            )}
          </div>
          <div className={styles.gaugeDistance}>{distanceToHoop.toFixed(1)}m</div>
          {!powerRange && <div className={styles.gaugeAimHint}>Adjust aim</div>}
        </div>
      )}

      {flash && (
        <div className={styles.flash}>
          <span className={`${styles.flashText} ${
            flash === 'success' ? styles.flashSuccess :
            flash === 'miss' ? styles.flashMiss :
            styles.flashGameSet
          }`}>
            {flash === 'success' ? 'GOAL!' : flash === 'miss' ? 'MISS' : 'GAME SET'}
          </span>
          {flash !== 'gameSet' && (
          <span className={styles.flashSub}>
            {flash === 'success' ? 'Keep shooting' : 'Next player'}
          </span>
          )}
        </div>
      )}

      {canControl && (localShotPhase === 'aiming' || localShotPhase === 'charging') && (
        <div className={styles.hint}>Arrow keys: aim &nbsp;|&nbsp; Hold/release Space: shoot</div>
      )}

      {isDev && (
        <div className={styles.devPanel}>
          <button
            className={styles.devPanelToggle}
            onClick={() => setDevPanelOpen(o => !o)}
          >
            DEV {devPanelOpen ? '▲' : '▼'}
          </button>
          {devPanelOpen && (
            <>
              <div className={styles.devPanelTitle}>ROOM STATE</div>
              <div className={styles.devPanelRow}>
                <span className={styles.devPanelLabel}>room </span>{room?.id} - {room?.status}
              </div>
              <div className={styles.devPanelRow}>
                <span className={styles.devPanelLabel}>turn </span>{room?.currentTurnUid ?? 'null'}
              </div>
              <div className={styles.devPanelRow}>
                <span className={styles.devPanelLabel}>shot </span>
                {room?.currentShot?.shotId?.slice(-6) ?? 'null'} ({room?.currentShot?.result ?? '-'})
              </div>
              <div className={styles.devPanelRow}>
                <span className={styles.devPanelLabel}>last </span>
                {room?.lastResolvedShot?.shotId?.slice(-6) ?? 'null'} ({room?.lastResolvedShot?.result ?? '-'})
              </div>
              <div className={styles.devPanelRow}>
                <span className={styles.devPanelLabel}>startPos </span>
                {room?.currentStartPosition
                  ? `(${room.currentStartPosition.x.toFixed(1)}, ${room.currentStartPosition.z.toFixed(1)})`
                  : 'null'}
              </div>
              <div className={styles.devPanelRow}>
                <span className={styles.devPanelLabel}>localPhase </span>{localShotPhase}
              </div>
              <div className={styles.devPanelRow}>
                <span className={styles.devPanelLabel}>localShotId </span>
                {currentShotIdRef.current?.slice(-6) ?? 'null'}
              </div>
              <div className={styles.devPanelPlayers}>
                {room?.turnOrder.map(uid => {
                  const p = room.players[uid]
                  if (!p) return null
                  return (
                    <div key={uid} className={styles.devPanelPlayer}>
                      {p.displayName.slice(0, 10)}: {p.goals}g / {p.totalShots}s {p.connected ? 'on' : 'off'}
                      {uid === room.currentTurnUid ? ' <- turn' : ''}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
