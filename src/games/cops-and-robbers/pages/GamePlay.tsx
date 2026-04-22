import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Application, Container, Graphics } from 'pixi.js'
import { buildTileMap, renderTileMap, circleCollidesWall } from '../engine/createMap'
import { createPlayer, setPlayerFacing, syncPlayerView } from '../engine/createPlayer'
import { createFogOfWar } from '../engine/createFogOfWar'
import { createKeyboard } from '../engine/keyboard'
import {
  createSafes,
  findNearestInteractable,
  renderSafes,
  type SafesHandle,
} from '../engine/safes'
import { judge } from '../engine/numberBaseball'
import { createCopBot, updateCopBot, type CopBotHandle } from '../engine/copBot'
import {
  activateSmoke,
  activateStealth,
  createAbilities,
  isStealthed,
  type AbilitiesHandle,
} from '../engine/abilities'
import type {
  CapturePhase,
  NumberBaseballSession,
  SafeState,
  SafeStatus,
  TeamStats,
} from '../types'
import NumberBaseballModal from './NumberBaseballModal'
import Minimap from './Minimap'
import {
  COLORS,
  COP_BOT_ATTACK_RADIUS,
  COP_BOT_DETECT_RADIUS,
  COP_BOT_HIT_COOLDOWN_MS,
  HIT_STACK_MAX,
  JAIL_CAMPING_REVEAL_MS,
  JAIL_CAMPING_REVEAL_RADIUS,
  JAIL_EXIT_OFFSET_X,
  JAIL_POS,
  JAIL_RESCUE_WAIT_MS,
  PLAYER_RADIUS,
  SAFE_ALARM_DURATION_MS,
  SAFE_DIGITS,
  SAFE_MAX_ATTEMPTS,
  SMOKE_COOLDOWN_MS,
  SMOKE_DURATION_MS,
  STEALTH_COOLDOWN_MS,
  STEALTH_DURATION_MS,
  THIEF_VISION_RADIUS,
  TILE_SIZE,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
} from '../constants'
import type { DatabaseReference } from 'firebase/database'
import {
  subscribeRoom,
  unsubscribeRoom,
  updatePlayerPos,
  updatePlayerHit,
  updateBot,
  updateSafe,
  updateTreasureCount,
  endGame,
  jailPlayer,
  rescuePlayer,
  type RoomData,
} from '../utils/copsRtdb'
import { saveGameResult } from '../utils/copsFirestore'
import { createEscapeZone, type EscapeZoneHandle } from '../engine/escapeZone'
import { createJail, type JailHandle } from '../engine/jail'
import {
  createCopFootprintRing,
  createFootstepIndicator,
  updateCopFootprintRing,
  type FootstepIndicatorHandle,
} from '../engine/footstep'
import { createThiefBot } from '../engine/thiefBot'
import type { PlayerRole, ResultStats } from '../types'

const POS_SYNC_MS = 67   // ~15 fps
const BOT_SYNC_MS = 100  // ~10 fps

interface GamePlayProps {
  onBack: () => void
  onGameEnd?: (stats: ResultStats) => void
  roomId?: string
  uid?: string
  isHost?: boolean
  myRole?: PlayerRole
  isDemo?: boolean
}

const TOTAL_SAFES = 10
const TREASURE_GOAL = 5
const COP_SPAWN = { x: TILE_SIZE * 20.5, y: TILE_SIZE * 14.5 }
const DEMO_RESCUE_WAIT_MS = 8_000

export default function GamePlay({ onBack, onGameEnd, roomId, uid, isHost, myRole = 'thief', isDemo = false }: GamePlayProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [ready, setReady] = useState(false)

  const [safes, setSafes] = useState<SafeState[]>([])
  const safesRef = useRef<SafeState[]>([])
  safesRef.current = safes
  const safesHandleRef = useRef<SafesHandle | null>(null)

  // Multi-player refs
  const worldRef = useRef<Container | null>(null)
  const remotePlayersRef = useRef<Map<string, Container>>(new Map())
  const rtdbRoomRef = useRef<DatabaseReference | null>(null)
  const rtdbDataRef = useRef<RoomData | null>(null)
  const lastPosSyncRef = useRef(0)
  const lastBotSyncRef = useRef(0)
  const facingRef = useRef({ x: 1, y: 0 })
  // Game time + result
  const nowMsRef = useRef(0)
  const treasureCountRef = useRef(0)
  const treasureGoalRef = useRef(TREASURE_GOAL)
  const gameEndedRef = useRef(false)
  const escapeZoneHandleRef = useRef<EscapeZoneHandle | null>(null)
  const jailHandleRef = useRef<JailHandle | null>(null)
  // 구출 탈출구 잠금 해제 여부 (한 번만 토스트)
  const escapeUnlockedRef = useRef(false)
  // 구출 가능 여부 (E키 처리용)
  const [canRescue, setCanRescue] = useState(false)
  const canRescueRef = useRef(false)
  canRescueRef.current = canRescue
  // 유치장 갇힌 시각 (대기 화면 타이머용)
  const [jailedAt, setJailedAt] = useState<number | null>(null)
  // 구출할 대상 uid (E키 처리용)
  const rescueTargetUidRef = useRef<string | null>(null)
  // pixi thief 오브젝트 (RTDB 구독에서 위치 리셋용)
  const thiefRef = useRef<ReturnType<typeof createPlayer> | null>(null)
  // 발소리 인디케이터 (도둑 전용)
  const footstepIndicatorRef = useRef<FootstepIndicatorHandle | null>(null)
  // 경찰 발소리 링 (경찰 전용)
  const copFootprintRingRef = useRef<import('pixi.js').Graphics | null>(null)
  // 관전 모드: 잡혔을 때 볼 팀원 uid
  const [spectateUid, setSpectateUid] = useState<string | null>(null)
  const spectateUidRef = useRef<string | null>(null)
  spectateUidRef.current = spectateUid
  // RTDB 플레이어 목록 (관전 이름 표시용)
  const [roomPlayers, setRoomPlayers] = useState<Record<string, import('../utils/copsRtdb').RoomPlayer>>({})
  // Per-cop hit cooldowns: copUid → lastHitMs
  const remoteCopHitRef = useRef<Map<string, number>>(new Map())
  // Minimap
  const tileMapRef = useRef<import('../types').TileMap | null>(null)
  const [myPosForMinimap, setMyPosForMinimap] = useState<import('../types').Vec2>({ x: 0, y: 0 })
  const [botPosForMinimap, setBotPosForMinimap] = useState<import('../types').Vec2 | null>(null)
  const minimapTickRef = useRef(0)
  const [highlightSafeIds, setHighlightSafeIds] = useState<Set<string>>(new Set())
  // 봇 데모 모드
  const thiefBotRef = useRef<ReturnType<typeof createThiefBot> | null>(null)
  type DemoThief = {
    player: ReturnType<typeof createPlayer>
    bot: ReturnType<typeof createThiefBot>
    ab: AbilitiesHandle
    hitStack: number
    lastHitMs: number
    captured: boolean
    capturedAt: number
  }
  const demoExtraThievesRef = useRef<DemoThief[]>([])
  const demoCop2Ref = useRef<CopBotHandle | null>(null)
  const demoMainCapturedRef = useRef(false)
  const demoMainCapturedAtRef = useRef(-1)

  const [nearestId, setNearestId] = useState<string | null>(null)
  const nearestIdRef = useRef<string | null>(null)
  nearestIdRef.current = nearestId

  const [session, setSession] = useState<NumberBaseballSession | null>(null)
  const sessionRef = useRef<NumberBaseballSession | null>(null)
  sessionRef.current = session

  const [team, setTeam] = useState<TeamStats>({
    treasureCount: 0,
    treasureGoal: TREASURE_GOAL,
  })
  treasureCountRef.current = team.treasureCount
  treasureGoalRef.current = team.treasureGoal

  const [hitStack, setHitStack] = useState(0)
  const hitStackRef = useRef(0)
  hitStackRef.current = hitStack

  const [capturePhase, setCapturePhase] = useState<CapturePhase>('playing')
  const capturePhaseRef = useRef<CapturePhase>('playing')
  capturePhaseRef.current = capturePhase

  const [abilitiesSnapshot, setAbilitiesSnapshot] = useState({
    stealthState: 'ready' as 'ready' | 'active' | 'cooldown',
    stealthRemMs: 0,
    smokeState: 'ready' as 'ready' | 'active' | 'cooldown',
    smokeRemMs: 0,
    stealthed: false,
  })

  const abilitiesHandleRef = useRef<AbilitiesHandle | null>(null)
  const copBotHandleRef = useRef<CopBotHandle | null>(null)

  const [toast, setToast] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(msg)
    toastTimerRef.current = setTimeout(() => setToast(null), 2400)
  }, [])

  // ── Game end helper ──────────────────────────────────────────────────────────
  const triggerGameEnd = useCallback((winner: 'thieves' | 'cops') => {
    if (gameEndedRef.current) return
    gameEndedRef.current = true
    capturePhaseRef.current = winner === 'thieves' ? 'escaped' : 'captured'
    setCapturePhase(winner === 'thieves' ? 'escaped' : 'captured')

    const stats: ResultStats = {
      winner,
      timeMs: nowMsRef.current,
      treasureCount: treasureCountRef.current,
      roomId: roomId ?? null,
      playerResults: rtdbDataRef.current
        ? Object.values(rtdbDataRef.current.players).map((p) => ({
            name: p.name,
            role: p.role ?? 'thief',
            hitStack: p.hitStack,
            captured: p.captured,
          }))
        : [{ name: '나', role: myRole, hitStack: hitStackRef.current, captured: winner === 'cops' }],
    }
    if (isHost) saveGameResult(stats).catch(() => {})
    onGameEnd?.(stats)
  }, [roomId, isHost, myRole, onGameEnd])

  // ── RTDB subscription (multi mode only) ─────────────────────────────────────
  useEffect(() => {
    if (!roomId) return
    const r = subscribeRoom(roomId, (data) => {
      rtdbDataRef.current = data
      if (!data) return
      if (data.players) setRoomPlayers(data.players)
      setBotPosForMinimap(data.bot?.pos ?? null)

      // Sync safe states from RTDB (changes made by other players)
      if (data.safes) {
        setSafes((prev) => {
          let changed = false
          const next = prev.map((local) => {
            const remote = data.safes![local.id]
            if (!remote) return local
            if (remote.status !== local.status || remote.attemptsUsed !== local.attemptsUsed) {
              changed = true
              const updated = { ...local, status: remote.status, attemptsUsed: remote.attemptsUsed, secret: remote.secret }
              safesHandleRef.current?.refresh(updated)
              return updated
            }
            return local
          })
          if (!changed) return prev
          safesRef.current = next
          return next
        })
      }

      // Sync treasure count + goal
      if (typeof data.treasureCount === 'number' || typeof data.treasureGoal === 'number') {
        setTeam((t) => {
          const nextCount = typeof data.treasureCount === 'number' ? data.treasureCount : t.treasureCount
          const nextGoal = typeof data.treasureGoal === 'number' ? data.treasureGoal : t.treasureGoal
          if (t.treasureCount === nextCount && t.treasureGoal === nextGoal) return t
          return { ...t, treasureCount: nextCount, treasureGoal: nextGoal }
        })
      }

      // Cop player wins when all thieves captured
      if (!gameEndedRef.current && data.players) {
        const allPlayers = Object.values(data.players)
        const thieves = allPlayers.filter((p) => (p.role ?? 'thief') !== 'cop')
        const hasCopPlayer = allPlayers.some((p) => p.role === 'cop')
        if (hasCopPlayer && thieves.length > 0 && thieves.every((p) => p.captured)) {
          if (roomId) endGame(roomId, 'cops').catch(() => {})
          triggerGameEnd('cops')
        }
      }

      // 구출 감지: 내가 jailed 상태인데 RTDB에서 captured=false로 바뀌면 구출된 것
      if (uid && capturePhaseRef.current === 'jailed') {
        const myPlayer = data.players?.[uid]
        if (myPlayer && !myPlayer.captured) {
          capturePhaseRef.current = 'playing'
          setCapturePhase('playing')
          hitStackRef.current = 0
          setHitStack(0)
          setJailedAt(null)
          // 유치장 옆으로 리스폰
          const thief = thiefRef.current
          if (thief) {
            thief.state.pos.x = JAIL_POS.x + JAIL_EXIT_OFFSET_X
            thief.state.pos.y = JAIL_POS.y
            syncPlayerView(thief)
          }
        }
      }

      // Game over broadcast from RTDB
      if (data.status === 'finished' && data.winner && !gameEndedRef.current) {
        triggerGameEnd(data.winner)
      }

      // Sync non-host bot position
      if (!isHost && data.bot) {
        const copHandle = copBotHandleRef.current
        if (copHandle) {
          copHandle.state.pos.x = data.bot.pos.x
          copHandle.state.pos.y = data.bot.pos.y
          copHandle.state.behavior = data.bot.behavior
          copHandle.view.position.set(data.bot.pos.x, data.bot.pos.y)
        }
      }

      // Update remote player ghosts
      const world = worldRef.current
      if (!world) return
      const remotePlayers = remotePlayersRef.current
      const myUid = uid ?? ''

      for (const [pUid, player] of Object.entries(data.players ?? {})) {
        if (pUid === myUid) continue
        let ghost = remotePlayers.get(pUid)
        if (!ghost) {
          ghost = new Container()
          const body = new Graphics()
            .circle(0, 0, PLAYER_RADIUS)
            .fill(0x7dd3fc)
            .stroke({ color: 0xffffff, width: 1, alpha: 0.5 })
          const label = new Graphics().rect(-10, -PLAYER_RADIUS - 14, 20, 12).fill({ color: 0x000000, alpha: 0.5 })
          ghost.addChild(body, label)
          ghost.alpha = 0.7
          world.addChild(ghost)
          remotePlayers.set(pUid, ghost)
        }
        ghost.position.set(player.pos.x, player.pos.y)
        ghost.alpha = player.stealthed ? 0.2 : 0.7
      }
      // Remove ghosts for players who left
      for (const [pUid, ghost] of remotePlayers) {
        if (!data.players?.[pUid]) {
          world.removeChild(ghost)
          remotePlayers.delete(pUid)
        }
      }
    })
    rtdbRoomRef.current = r
    return () => { unsubscribeRoom(r) }
  }, [roomId, uid, isHost])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let destroyed = false
    const app = new Application()
    const keyboard = createKeyboard(window)

    ;(async () => {
      await app.init({
        width: VIEWPORT_WIDTH,
        height: VIEWPORT_HEIGHT,
        background: COLORS.hudBg,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
      })
      if (destroyed) { app.destroy(true); return }
      host.appendChild(app.canvas)

      const world = new Container()
      world.label = 'world'
      worldRef.current = world
      app.stage.addChild(world)

      const map = buildTileMap()
      tileMapRef.current = map
      world.addChild(renderTileMap(map))

      const ezHandle = createEscapeZone()
      escapeZoneHandleRef.current = ezHandle
      ezHandle.setLocked(true) // 보물 목표 달성 전까지 잠김
      world.addChild(ezHandle.view)

      const jailHandle = createJail()
      jailHandleRef.current = jailHandle
      world.addChild(jailHandle.view)

      // In multi mode, use safes seeded by host (from RTDB); fall back to local for solo
      const rtdbSafes = rtdbDataRef.current?.safes
      const initialSafes: SafeState[] = rtdbSafes
        ? Object.values(rtdbSafes)
        : createSafes(map, TOTAL_SAFES)
      const safesHandle = renderSafes(initialSafes)
      safesHandleRef.current = safesHandle
      world.addChild(safesHandle.layer)
      setSafes(initialSafes)

      const abHandle = createAbilities()
      abilitiesHandleRef.current = abHandle
      world.addChild(abHandle.smokeLayer)

      const copHandle = createCopBot(COP_SPAWN)
      copBotHandleRef.current = copHandle
      world.addChild(copHandle.footprintRing)
      world.addChild(copHandle.view)
      world.addChild(copHandle.scanRing)

      const thief = createPlayer(myRole, { x: TILE_SIZE * 2.5, y: TILE_SIZE * 2.5 })
      thiefRef.current = thief

      // 발소리 인디케이터 (도둑 전용 — 경찰 방향 화살표)
      if (myRole === 'thief') {
        const fsIndicator = createFootstepIndicator()
        footstepIndicatorRef.current = fsIndicator
        fsIndicator.container.position.set(thief.state.pos.x, thief.state.pos.y)
        world.addChild(fsIndicator.container)
      }

      // 경찰 발소리 링 (경찰 플레이어 본인 전용)
      if (myRole === 'cop') {
        const copRing = createCopFootprintRing()
        copFootprintRingRef.current = copRing
        world.addChild(copRing)
      }
      world.addChild(abHandle.stealthOverlay)
      world.addChild(thief.view)

      const fog = createFogOfWar()
      // 데모 모드: 안개 없음 (전체 맵 공개)
      if (isDemo) {
        world.mask = null
        thiefBotRef.current = createThiefBot()

        // 추가 도둑 3명 (총 4명)
        const extraSpawns = [
          { x: TILE_SIZE * 37.5, y: TILE_SIZE * 2.5 },
          { x: TILE_SIZE * 2.5,  y: TILE_SIZE * 25.5 },
          { x: TILE_SIZE * 37.5, y: TILE_SIZE * 25.5 },
        ]
        demoExtraThievesRef.current = extraSpawns.map((spawn) => {
          const player = createPlayer('thief', spawn)
          const ab = createAbilities()
          world.addChild(ab.smokeLayer)
          world.addChild(ab.stealthOverlay)
          world.addChild(player.view)
          return { player, bot: createThiefBot(), ab, hitStack: 0, lastHitMs: -COP_BOT_HIT_COOLDOWN_MS, captured: false, capturedAt: -1 }
        })

        // 경찰 2번째 봇
        const cop2 = createCopBot({ x: TILE_SIZE * 10.5, y: TILE_SIZE * 14.5 })
        demoCop2Ref.current = cop2
        world.addChild(cop2.footprintRing)
        world.addChild(cop2.view)
        world.addChild(cop2.scanRing)
      } else {
        // visibilityMask를 world의 마스크로 적용 — fill() 기반이라 cut() 아티팩트 없음
        world.mask = fog.visibilityMask
        fog.update(thief.state.pos.x, thief.state.pos.y, thief.state.visionRadius * 1.8, 0, map)
      }

      setReady(true)

      app.ticker.add((ticker) => {
        const dtMs = ticker.deltaMS
        nowMsRef.current += dtMs

        // 관전 모드 (유치장 대기 중): fog만 관전 대상 위치로 갱신
        if (capturePhaseRef.current === 'jailed') {
          const sp = spectateUidRef.current
            ? rtdbDataRef.current?.players?.[spectateUidRef.current]
            : null
          const viewPos = sp ? sp.pos : thief.state.pos
          fog.update(viewPos.x, viewPos.y, THIEF_VISION_RADIUS)
          return
        }

        if (capturePhaseRef.current !== 'playing') return
        const nowMs = nowMsRef.current
        const dt = dtMs / 1000
        const k = keyboard.state
        const modalOpen = sessionRef.current !== null

        // ── 데모: 구출 조정 ────────────────────────────────────────────────────
        let demoNeedsRescue = false
        if (isDemo) {
          const hasCapturedMain = demoMainCapturedRef.current && nowMs - demoMainCapturedAtRef.current >= DEMO_RESCUE_WAIT_MS
          const hasCapturedExtra = demoExtraThievesRef.current.some(
            (t) => t.captured && nowMs - t.capturedAt >= DEMO_RESCUE_WAIT_MS,
          )
          demoNeedsRescue = hasCapturedMain || hasCapturedExtra
          const rescuePos = { x: JAIL_POS.x + JAIL_EXIT_OFFSET_X, y: JAIL_POS.y }
          if (!demoMainCapturedRef.current && thiefBotRef.current) {
            thiefBotRef.current.setRescueTarget(demoNeedsRescue ? rescuePos : null)
          }
        }

        const performRescue = () => {
          if (demoMainCapturedRef.current) {
            demoMainCapturedRef.current = false
            demoMainCapturedAtRef.current = -1
            hitStackRef.current = 0
            setHitStack(0)
            thief.state.pos.x = JAIL_POS.x + JAIL_EXIT_OFFSET_X
            thief.state.pos.y = JAIL_POS.y
            syncPlayerView(thief)
            showToast('🔓 팀원 구출!')
            return
          }
          for (const demoThief of demoExtraThievesRef.current) {
            if (demoThief.captured) {
              demoThief.captured = false
              demoThief.capturedAt = -1
              demoThief.hitStack = 0
              demoThief.player.state.pos.x = JAIL_POS.x + JAIL_EXIT_OFFSET_X
              demoThief.player.state.pos.y = JAIL_POS.y
              syncPlayerView(demoThief.player)
              showToast('🔓 팀원 구출!')
              return
            }
          }
        }

        // ── 이동 (데모 봇 / 키보드) ──────────────────────────────────────────────
        let dx = 0
        let dy = 0
        let botCrackedSafeId: string | null = null

        if (isDemo && thiefBotRef.current && !demoMainCapturedRef.current) {
          // 가장 가까운 경찰 위치 (두 경찰 중 더 가까운 쪽 회피)
          const cop2 = demoCop2Ref.current
          const nearestCopPos = (() => {
            if (!cop2) return copHandle.state.pos
            const d1 = Math.hypot(copHandle.state.pos.x - thief.state.pos.x, copHandle.state.pos.y - thief.state.pos.y)
            const d2 = Math.hypot(cop2.state.pos.x - thief.state.pos.x, cop2.state.pos.y - thief.state.pos.y)
            return d1 < d2 ? copHandle.state.pos : cop2.state.pos
          })()
          const mainCopDist = Math.hypot(nearestCopPos.x - thief.state.pos.x, nearestCopPos.y - thief.state.pos.y)
          if (mainCopDist < COP_BOT_ATTACK_RADIUS * 2.5 && abHandle.abilities.smoke.state === 'ready') {
            activateSmoke(abHandle, thief.state.pos)
          } else if (mainCopDist < COP_BOT_DETECT_RADIUS && abHandle.abilities.stealth.state === 'ready') {
            activateStealth(abHandle)
          }
          const extraOccupied = new Set(
            demoExtraThievesRef.current
              .filter(t => !t.captured)
              .map(t => t.bot.getTargetSafeId())
              .filter((id): id is string => id !== null)
          )
          const botResult = thiefBotRef.current.tick(
            dtMs,
            thief.state.pos,
            safesRef.current,
            nearestCopPos,
            treasureCountRef.current,
            treasureGoalRef.current,
            map,
            extraOccupied,
          )
          if (botResult.dir) { dx = botResult.dir.x; dy = botResult.dir.y }
          botCrackedSafeId = botResult.crackedSafeId
          if (botResult.rescued) performRescue()
        } else if (!modalOpen) {
          if (k.up) dy -= 1
          if (k.down) dy += 1
          if (k.left) dx -= 1
          if (k.right) dx += 1
        }

        if (dx !== 0 || dy !== 0) {
          const len = Math.hypot(dx, dy)
          dx /= len; dy /= len
          facingRef.current = { x: dx, y: dy }
          setPlayerFacing(thief, dx, dy)
          const sprint = (k.sprint && !isDemo) ? 1.5 : 1
          const step = thief.state.speed * sprint * dt

          const nextX = thief.state.pos.x + dx * step
          if (!circleCollidesWall(map, nextX, thief.state.pos.y, PLAYER_RADIUS - 1))
            thief.state.pos.x = nextX
          const nextY = thief.state.pos.y + dy * step
          if (!circleCollidesWall(map, thief.state.pos.x, nextY, PLAYER_RADIUS - 1))
            thief.state.pos.y = nextY
          syncPlayerView(thief)
        }

        // ── 봇 자동 금고 해킹 처리 ────────────────────────────────────────────────
        if (botCrackedSafeId) {
          const safe = safesRef.current.find((s) => s.id === botCrackedSafeId)
          if (safe && (safe.status === 'locked' || safe.status === 'alarmed')) {
            const openedStatus = safe.hasTreasure ? 'opened_treasure' as const : 'opened_empty' as const
            const next = safesRef.current.map((s) =>
              s.id === botCrackedSafeId ? { ...s, status: openedStatus } : s,
            )
            setSafes(next); safesRef.current = next
            safesHandleRef.current?.refresh({ ...safe, status: openedStatus })
            if (safe.hasTreasure) {
              setTeam((t) => ({ ...t, treasureCount: t.treasureCount + 1 }))
              showToast('🤖 봇이 보물을 획득!')
            } else {
              showToast('🤖 봇: 빈 금고')
            }
          }
        }

        abHandle.tick(dtMs)
        const stealthed = isStealthed(abHandle)
        abHandle.stealthOverlay.position.set(thief.state.pos.x, thief.state.pos.y)

        // Throttled pos write to RTDB
        if (roomId && uid) {
          lastPosSyncRef.current += dtMs
          if (lastPosSyncRef.current >= POS_SYNC_MS) {
            lastPosSyncRef.current = 0
            updatePlayerPos(roomId, uid, thief.state.pos, facingRef.current, stealthed).catch(() => {})
          }
        }

        // 데모: 추가 도둑 봇 3명 처리
        if (isDemo) {
          const allCops = [copHandle, demoCop2Ref.current].filter(Boolean) as CopBotHandle[]
          for (const demoThief of demoExtraThievesRef.current) {
            if (demoThief.captured) continue
            // 가장 가까운 경찰 회피
            const nearestCop = allCops.reduce((best, cop) => {
              const db = Math.hypot(best.state.pos.x - demoThief.player.state.pos.x, best.state.pos.y - demoThief.player.state.pos.y)
              const dc = Math.hypot(cop.state.pos.x - demoThief.player.state.pos.x, cop.state.pos.y - demoThief.player.state.pos.y)
              return dc < db ? cop : best
            }, allCops[0])
            demoThief.ab.tick(dtMs)
            demoThief.ab.stealthOverlay.position.set(demoThief.player.state.pos.x, demoThief.player.state.pos.y)
            const extraCopDist = Math.hypot(nearestCop.state.pos.x - demoThief.player.state.pos.x, nearestCop.state.pos.y - demoThief.player.state.pos.y)
            if (extraCopDist < COP_BOT_ATTACK_RADIUS * 2.5 && demoThief.ab.abilities.smoke.state === 'ready') {
              activateSmoke(demoThief.ab, demoThief.player.state.pos)
            } else if (extraCopDist < COP_BOT_DETECT_RADIUS && demoThief.ab.abilities.stealth.state === 'ready') {
              activateStealth(demoThief.ab)
            }
            const rescuePos = { x: JAIL_POS.x + JAIL_EXIT_OFFSET_X, y: JAIL_POS.y }
            demoThief.bot.setRescueTarget(demoNeedsRescue ? rescuePos : null)
            const occupied = new Set<string>()
            const mainId = (!demoMainCapturedRef.current && thiefBotRef.current) ? thiefBotRef.current.getTargetSafeId() : null
            if (mainId) occupied.add(mainId)
            for (const other of demoExtraThievesRef.current) {
              if (other !== demoThief && !other.captured) {
                const id = other.bot.getTargetSafeId()
                if (id) occupied.add(id)
              }
            }
            const br = demoThief.bot.tick(dtMs, demoThief.player.state.pos, safesRef.current, nearestCop.state.pos, treasureCountRef.current, treasureGoalRef.current, map, occupied)
            if (br.rescued) performRescue()
            if (br.dir) {
              const step = demoThief.player.state.speed * dt
              const nx = demoThief.player.state.pos.x + br.dir.x * step
              if (!circleCollidesWall(map, nx, demoThief.player.state.pos.y, PLAYER_RADIUS - 1)) demoThief.player.state.pos.x = nx
              const ny = demoThief.player.state.pos.y + br.dir.y * step
              if (!circleCollidesWall(map, demoThief.player.state.pos.x, ny, PLAYER_RADIUS - 1)) demoThief.player.state.pos.y = ny
              syncPlayerView(demoThief.player)
            }
            if (br.crackedSafeId) {
              const safe = safesRef.current.find((s) => s.id === br.crackedSafeId)
              if (safe && (safe.status === 'locked' || safe.status === 'alarmed')) {
                const openedStatus = safe.hasTreasure ? 'opened_treasure' as const : 'opened_empty' as const
                const next = safesRef.current.map((s) => s.id === br.crackedSafeId ? { ...s, status: openedStatus } : s)
                setSafes(next); safesRef.current = next
                safesHandleRef.current?.refresh({ ...safe, status: openedStatus })
                if (safe.hasTreasure) {
                  setTeam((t) => ({ ...t, treasureCount: t.treasureCount + 1 }))
                  showToast('🤖 도둑봇이 보물 획득!')
                }
              }
            }
            // 경찰 피격
            for (const cop of allCops) {
              const dist = Math.hypot(cop.state.pos.x - demoThief.player.state.pos.x, cop.state.pos.y - demoThief.player.state.pos.y)
              if (dist < COP_BOT_ATTACK_RADIUS && nowMs - demoThief.lastHitMs >= COP_BOT_HIT_COOLDOWN_MS) {
                demoThief.lastHitMs = nowMs
                demoThief.hitStack++
                if (demoThief.hitStack >= HIT_STACK_MAX) {
                  demoThief.captured = true
                  demoThief.capturedAt = nowMs
                  demoThief.player.state.pos.x = JAIL_POS.x + (Math.random() - 0.5) * TILE_SIZE
                  demoThief.player.state.pos.y = JAIL_POS.y + (Math.random() - 0.5) * TILE_SIZE
                  syncPlayerView(demoThief.player)
                }
                break
              }
            }
            // 탈출 체크
            if (!gameEndedRef.current && treasureCountRef.current >= treasureGoalRef.current) {
              if (escapeZoneHandleRef.current?.isInZone(demoThief.player.state.pos)) triggerGameEnd('thieves')
            }
          }

          // 데모: 전원 체포 체크
          if (!gameEndedRef.current) {
            const allThieves = [{ captured: demoMainCapturedRef.current }, ...demoExtraThievesRef.current]
            if (allThieves.every((t) => t.captured)) triggerGameEnd('cops')
          }
        }

        // Disable bot if a human cop player exists in the room
        const humanCopExists = roomId
          ? Object.values(rtdbDataRef.current?.players ?? {}).some((p) => p.role === 'cop')
          : false

        // 데모: 은신 상태 포함한 도둑 목록 구성
        const allSmokeClouds = isDemo
          ? [...abHandle.smokeClouds, ...demoExtraThievesRef.current.flatMap(t => t.ab.smokeClouds)]
          : abHandle.smokeClouds

        const demoThievesPool = isDemo ? [
          { pos: thief.state.pos, captured: demoMainCapturedRef.current, stealthed: isStealthed(abHandle) },
          ...demoExtraThievesRef.current.map(t => ({
            pos: t.player.state.pos, captured: t.captured, stealthed: isStealthed(t.ab),
          })),
        ] : [{ pos: thief.state.pos, captured: false, stealthed }]

        // 경찰은 은신 안 한 살아있는 도둑만 추격
        const pickNearestVisible = (fromPos: { x: number; y: number }) => {
          const visible = demoThievesPool.filter(t => !t.captured && !t.stealthed)
          if (!visible.length) return { pos: thief.state.pos, stealthed: true }
          const nearest = visible.reduce((best, t) => {
            const db = Math.hypot(best.pos.x - fromPos.x, best.pos.y - fromPos.y)
            const dc = Math.hypot(t.pos.x - fromPos.x, t.pos.y - fromPos.y)
            return dc < db ? t : best
          }, visible[0])
          return { pos: nearest.pos, stealthed: false }
        }

        const cop1Target = pickNearestVisible(copHandle.state.pos)

        // Only host (or solo) runs bot AI; non-host reads bot pos from RTDB subscription
        const { hitRegistered } = (!humanCopExists && isHost !== false)
          ? updateCopBot(copHandle, map, cop1Target.pos, cop1Target.stealthed, allSmokeClouds, dtMs, nowMs)
          : { hitRegistered: false }

        // 경찰 2번째 봇 (데모 전용)
        if (isDemo && demoCop2Ref.current) {
          const cop2 = demoCop2Ref.current
          const cop2Target = pickNearestVisible(cop2.state.pos)
          updateCopBot(cop2, map, cop2Target.pos, cop2Target.stealthed, allSmokeClouds, dtMs, nowMs)
        }

        // Host throttled bot position write (only when bot is active)
        if (roomId && !humanCopExists && (isHost ?? true)) {
          lastBotSyncRef.current += dtMs
          if (lastBotSyncRef.current >= BOT_SYNC_MS) {
            lastBotSyncRef.current = 0
            updateBot(roomId, copHandle.state.pos, copHandle.state.behavior).catch(() => {})
          }
        }

        if (hitRegistered && capturePhaseRef.current === 'playing' && !demoMainCapturedRef.current) {
          const newStack = hitStackRef.current + (stealthed ? 0 : 1)
          hitStackRef.current = newStack
          setHitStack(newStack)
          if (stealthed) {
            abHandle.abilities.stealth.state = 'cooldown'
            abHandle.abilities.stealth.remainingMs = STEALTH_COOLDOWN_MS
          }
          const captured = newStack >= HIT_STACK_MAX
          if (roomId && uid) updatePlayerHit(roomId, uid, newStack, captured).catch(() => {})
          if (captured) {
            if (roomId && uid) {
              // 멀티모드: 유치장으로 이송 (전원 체포 시 RTDB 구독에서 게임 오버 처리)
              const nowTs = Date.now()
              jailPlayer(roomId, uid, nowTs).catch(() => {})
              capturePhaseRef.current = 'jailed'
              setCapturePhase('jailed')
              setJailedAt(nowTs)
              // 유치장 위치로 이동
              thief.state.pos.x = JAIL_POS.x
              thief.state.pos.y = JAIL_POS.y
              syncPlayerView(thief)
            } else if (isDemo) {
              // 데모모드: 메인 도둑 체포 — 게임 계속 (전원 체포 시 종료)
              demoMainCapturedRef.current = true
              demoMainCapturedAtRef.current = nowMs
              thief.state.pos.x = JAIL_POS.x
              thief.state.pos.y = JAIL_POS.y
              syncPlayerView(thief)
            } else {
              // 솔로모드: 즉시 게임 오버
              triggerGameEnd('cops')
            }
          }
        }

        const nearest = findNearestInteractable(safesRef.current, thief.state.pos)
        const nextId = nearest ? nearest.id : null
        if (nextId !== nearestIdRef.current) {
          nearestIdRef.current = nextId
          setNearestId(nextId)
          safesHandleRef.current?.setHighlight(nextId)
        }

        setAbilitiesSnapshot({
          stealthState: abHandle.abilities.stealth.state,
          stealthRemMs: abHandle.abilities.stealth.remainingMs,
          smokeState: abHandle.abilities.smoke.state,
          smokeRemMs: abHandle.abilities.smoke.remainingMs,
          stealthed,
        })

        if (!isDemo) {
          const fAngle = Math.atan2(facingRef.current.y, facingRef.current.x)
          fog.update(thief.state.pos.x, thief.state.pos.y, thief.state.visionRadius * 1.8, fAngle, tileMapRef.current ?? undefined)
        }

        // ── 발소리 시스템 ────────────────────────────────────────────────────────
        if (myRole === 'thief') {
          // 경찰 봇 발소리 (순찰=걷기, 추격/공격=뛰기)
          const botCops = [{
            pos: copHandle.state.pos,
            sprinting: copHandle.state.behavior !== 'patrol',
          }]
          // 멀티: 원격 경찰 플레이어 (항상 sprint 반경 사용 — 정보 부족)
          const remoteCops = Object.entries(rtdbDataRef.current?.players ?? {})
            .filter(([pUid, p]) => pUid !== uid && p.role === 'cop')
            .map(([, p]) => ({ pos: p.pos, sprinting: true }))

          footstepIndicatorRef.current?.update(thief.state.pos, [...botCops, ...remoteCops])
          footstepIndicatorRef.current?.container.position.set(thief.state.pos.x, thief.state.pos.y)
        }

        if (myRole === 'cop') {
          const sprinting = keyboard.state.sprint
          const copRing = copFootprintRingRef.current
          if (copRing) updateCopFootprintRing(copRing, thief.state.pos, sprinting)
        }

        // Minimap 위치 동기화 (300ms 주기)
        minimapTickRef.current += dtMs
        if (minimapTickRef.current >= 300) {
          minimapTickRef.current = 0
          setMyPosForMinimap({ x: thief.state.pos.x, y: thief.state.pos.y })
        }

        // 탈출구 잠금 해제 (보물 목표 달성 시 1회)
        if (!escapeUnlockedRef.current && treasureCountRef.current >= treasureGoalRef.current) {
          escapeUnlockedRef.current = true
          escapeZoneHandleRef.current?.setLocked(false)
          showToast('🔓 탈출구 해제! 탈출 존으로 이동하세요!')
        }

        // 구출 가능 여부 감지 (자유 도둑만)
        if (myRole === 'thief' && capturePhaseRef.current === 'playing' && roomId) {
          const now = Date.now()
          const jailHandle = jailHandleRef.current
          const nearJail = jailHandle?.isInRescueZone(thief.state.pos) ?? false
          const rescuable = Object.entries(rtdbDataRef.current?.players ?? {}).find(
            ([pUid, p]) => pUid !== uid && p.captured && p.jailedAt != null && now - p.jailedAt >= JAIL_RESCUE_WAIT_MS,
          )
          rescueTargetUidRef.current = rescuable ? rescuable[0] : null
          const canRescueNow = nearJail && rescuable != null
          if (canRescueNow !== canRescueRef.current) {
            canRescueRef.current = canRescueNow
            setCanRescue(canRescueNow)
            jailHandle?.setRescuable(canRescueNow)
          }
        }

        // Escape zone win check (thief role only)
        if (myRole === 'thief' && !gameEndedRef.current) {
          if (
            treasureCountRef.current >= treasureGoalRef.current &&
            escapeZoneHandleRef.current?.isInZone(thief.state.pos)
          ) {
            if (roomId) endGame(roomId, 'thieves').catch(() => {})
            triggerGameEnd('thieves')
          }
        }

        // Remote cop player hit detection (thief role in multi)
        if (myRole === 'thief' && roomId && !gameEndedRef.current) {
          const allPlayers = rtdbDataRef.current?.players ?? {}
          for (const [pUid, player] of Object.entries(allPlayers)) {
            if (pUid === uid || player.role !== 'cop') continue
            const dist = Math.hypot(player.pos.x - thief.state.pos.x, player.pos.y - thief.state.pos.y)
            if (dist < COP_BOT_ATTACK_RADIUS) {
              const lastHit = remoteCopHitRef.current.get(pUid) ?? -COP_BOT_HIT_COOLDOWN_MS
              if (nowMs - lastHit >= COP_BOT_HIT_COOLDOWN_MS) {
                remoteCopHitRef.current.set(pUid, nowMs)
                const stealthed = isStealthed(abHandle)
                const newStack = hitStackRef.current + (stealthed ? 0 : 1)
                hitStackRef.current = newStack
                setHitStack(newStack)
                if (stealthed) {
                  abHandle.abilities.stealth.state = 'cooldown'
                  abHandle.abilities.stealth.remainingMs = STEALTH_COOLDOWN_MS
                }
                const captured = newStack >= HIT_STACK_MAX
                if (roomId && uid) updatePlayerHit(roomId, uid, newStack, captured).catch(() => {})
                if (captured) {
                  const nowTs = Date.now()
                  jailPlayer(roomId, uid, nowTs).catch(() => {})
                  capturePhaseRef.current = 'jailed'
                  setCapturePhase('jailed')
                  setJailedAt(nowTs)
                  thief.state.pos.x = JAIL_POS.x
                  thief.state.pos.y = JAIL_POS.y
                  syncPlayerView(thief)
                }
              }
            }
          }
        }
      })
    })()

    return () => {
      destroyed = true
      keyboard.dispose()
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      try { app.destroy(true, { children: true, texture: true }) } catch { /* noop */ }
    }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // 관전 모드: Q/E로 팀원 시점 전환
      if (capturePhaseRef.current === 'jailed' && (e.code === 'KeyQ' || e.code === 'KeyE')) {
        const players = rtdbDataRef.current?.players ?? {}
        const free = Object.entries(players)
          .filter(([pUid, p]) => pUid !== uid && !p.captured)
          .map(([pUid]) => pUid)
        if (free.length === 0) return
        const cur = spectateUidRef.current
        const curIdx = cur ? free.indexOf(cur) : -1
        const nextIdx = e.code === 'KeyE'
          ? (curIdx + 1) % free.length
          : (curIdx - 1 + free.length) % free.length
        const nextUid = free[nextIdx]
        spectateUidRef.current = nextUid
        setSpectateUid(nextUid)
        return
      }

      const abHandle = abilitiesHandleRef.current
      if (!abHandle) return

      if (e.code === 'KeyZ') {
        if (sessionRef.current) return
        if (activateStealth(abHandle)) showToast('🫥 은신 활성화')
        return
      }

      if (e.code === 'KeyX') {
        if (sessionRef.current) return
        const thiefPos = abHandle.stealthOverlay.position
        if (activateSmoke(abHandle, { x: thiefPos.x, y: thiefPos.y })) showToast('💨 연막 투척')
        return
      }

      if (e.code === 'KeyE') {
        if (myRole === 'cop') return
        if (sessionRef.current !== null) return

        // 구출 상호작용 (금고보다 우선)
        if (canRescueRef.current && roomId && rescueTargetUidRef.current) {
          rescuePlayer(roomId, rescueTargetUidRef.current).catch(() => {})
          showToast('🔓 팀원 구출!')
          return
        }

        const id = nearestIdRef.current
        if (!id) return
        const safe = safesRef.current.find((s) => s.id === id)
        if (!safe || (safe.status !== 'locked' && safe.status !== 'cracking')) return

        const next: SafeState[] = safesRef.current.map((s) =>
          s.id === safe.id && s.status === 'locked'
            ? { ...s, status: 'cracking' as SafeStatus }
            : s,
        )
        setSafes(next)
        safesRef.current = next
        const updated = next.find((s) => s.id === safe.id)
        if (updated) safesHandleRef.current?.refresh(updated)

        setSession({
          safeId: safe.id,
          digits: SAFE_DIGITS,
          maxAttempts: SAFE_MAX_ATTEMPTS,
          attempts: [],
          solved: false,
          failed: false,
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showToast])

  function handleGuess(guess: string) {
    const current = sessionRef.current
    if (!current) return
    const safe = safesRef.current.find((s) => s.id === current.safeId)
    if (!safe) return

    const attempt = judge(safe.secret, guess)
    const attempts = [...current.attempts, attempt]
    const solved = attempt.strikes === current.digits
    const failed = !solved && attempts.length >= current.maxAttempts

    setSession({ ...current, attempts, solved, failed })

    if (solved) {
      const openedStatus: SafeStatus = safe.hasTreasure ? 'opened_treasure' : 'opened_empty'
      const next: SafeState[] = safesRef.current.map((s) =>
        s.id === safe.id ? { ...s, status: openedStatus, attemptsUsed: attempts.length } : s,
      )
      setSafes(next); safesRef.current = next
      const updated = next.find((s) => s.id === safe.id)
      if (updated) safesHandleRef.current?.refresh(updated)
      if (roomId) updateSafe(roomId, safe.id, openedStatus, attempts.length).catch(() => {})
      if (safe.hasTreasure) {
        setTeam((t) => {
          const count = t.treasureCount + 1
          if (roomId) updateTreasureCount(roomId, count).catch(() => {})
          return { ...t, treasureCount: count }
        })
        showToast('💎 보물 획득!')
      } else {
        showToast('∅ 빈 금고')
      }
    } else if (failed) {
      const next: SafeState[] = safesRef.current.map((s) =>
        s.id === safe.id
          ? { ...s, status: 'alarmed' as SafeStatus, attemptsUsed: attempts.length }
          : s,
      )
      setSafes(next); safesRef.current = next
      const updated = next.find((s) => s.id === safe.id)
      if (updated) safesHandleRef.current?.refresh(updated)
      if (roomId) updateSafe(roomId, safe.id, 'alarmed', attempts.length).catch(() => {})
      showToast('🚨 경보 발동 — 위치 노출')

      const alarmedId = safe.id
      setTimeout(() => {
        const latest = safesRef.current
        const target = latest.find((s) => s.id === alarmedId)
        if (!target || target.status !== 'alarmed') return
        const revertStatus: SafeStatus = target.hasTreasure ? 'locked' : 'opened_empty'
        const reverted: SafeState[] = latest.map((s) =>
          s.id === alarmedId ? { ...s, status: revertStatus, attemptsUsed: 0 } : s,
        )
        setSafes(reverted); safesRef.current = reverted
        const r = reverted.find((s) => s.id === alarmedId)
        if (r) safesHandleRef.current?.refresh(r)
        if (roomId) updateSafe(roomId, alarmedId, revertStatus, 0).catch(() => {})
      }, SAFE_ALARM_DURATION_MS)
    }
  }

  // 캠핑 방지: 유치장 15s 경과 시 근처 금고 미니맵 강조
  useEffect(() => {
    if (!jailedAt || capturePhase !== 'jailed') {
      setHighlightSafeIds(new Set())
      return
    }
    const delay = Math.max(0, jailedAt + JAIL_CAMPING_REVEAL_MS - Date.now())
    const timer = setTimeout(() => {
      const nearby = new Set(
        safes
          .filter((s) => {
            if (s.status === 'opened_treasure' || s.status === 'opened_empty') return false
            return Math.hypot(s.pos.x - JAIL_POS.x, s.pos.y - JAIL_POS.y) <= JAIL_CAMPING_REVEAL_RADIUS
          })
          .map((s) => s.id),
      )
      setHighlightSafeIds(nearby)
    }, delay)
    return () => clearTimeout(timer)
  }, [jailedAt, capturePhase, safes])

  const openedCount = useMemo(
    () => safes.filter((s) => s.status === 'opened_treasure' || s.status === 'opened_empty').length,
    [safes],
  )

  if (capturePhase === 'captured') {
    return (
      <div style={captureScreenStyle}>
        <div style={captureCardStyle}>
          <div style={captureIconStyle}>🚔</div>
          <h2 style={captureTitleStyle}>체포됐습니다!</h2>
          <p style={captureDescStyle}>경찰에게 3번 피격되어 유치장으로 이송됩니다.</p>
          <p style={captureStatsStyle}>획득 보물: {team.treasureCount} / {team.treasureGoal}</p>
          <button style={captureRetryStyle} onClick={onBack}>
            돌아가기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={rootStyle}>
      <div style={headerStyle}>
        <button style={backButtonStyle} onClick={onBack}>← 나가기</button>
        <div style={titleStyle}>경찰과 도둑{roomId ? ` — 멀티 [${roomId}]` : ' — 싱글'}</div>
        <div style={hintStyle}>
          {myRole === 'cop'
            ? 'WASD 이동 · Shift 가속 — 도둑을 체포하세요'
            : 'WASD · Shift · E 금고 · Z 은신 · X 연막 — 보물 5개 후 탈출 존 도달'}
        </div>
      </div>

      <div style={statusBarStyle}>
        <StatBadge label="보물" value={`${team.treasureCount} / ${team.treasureGoal}`} color="#34d399" />
        <StatBadge label="금고" value={`${openedCount} / ${safes.length}`} color="#fbbf24" />
        <HitBadge stack={hitStack} max={HIT_STACK_MAX} />
        <AbilityBadge
          label="은신 Z"
          state={abilitiesSnapshot.stealthState}
          remainingMs={abilitiesSnapshot.stealthRemMs}
          totalMs={STEALTH_DURATION_MS}
          cooldownMs={STEALTH_COOLDOWN_MS}
          activeColor="#7dd3fc"
        />
        <AbilityBadge
          label="연막 X"
          state={abilitiesSnapshot.smokeState}
          remainingMs={abilitiesSnapshot.smokeRemMs}
          totalMs={SMOKE_DURATION_MS}
          cooldownMs={SMOKE_COOLDOWN_MS}
          activeColor="#8da0b8"
        />
        {abilitiesSnapshot.stealthed && (
          <div style={stealthBadgeStyle}>🫥 은신 중</div>
        )}
      </div>

      <div style={canvasWrapStyle}>
        <div
          style={{ position: 'relative', lineHeight: 0 }}
        >
          <div
            ref={hostRef}
            style={{
              width: VIEWPORT_WIDTH,
              height: VIEWPORT_HEIGHT,
              boxShadow: '0 0 0 1px #222, 0 12px 40px rgba(0,0,0,0.6)',
              borderRadius: 8,
              overflow: 'hidden',
              background: '#000',
            }}
          />
          {ready && tileMapRef.current && (
            <Minimap
              tileMap={tileMapRef.current}
              myPos={myPosForMinimap}
              myRole={myRole}
              myUid={uid ?? ''}
              remotePlayers={roomPlayers}
              botPos={botPosForMinimap}
              safes={safes}
              highlightSafeIds={highlightSafeIds}
            />
          )}
          {isDemo && ready && (
            <div style={demoBannerStyle}>🤖 봇 대전 관전 중</div>
          )}
        </div>
        {!ready && <div style={loadingStyle}>로딩 중…</div>}
        {toast && <div style={toastStyle}>{toast}</div>}
      </div>

      {session && (
        <NumberBaseballModal
          session={session}
          onSubmit={handleGuess}
          onClose={() => setSession(null)}
        />
      )}

      {capturePhase === 'jailed' && (
        <JailOverlay
          jailedAt={jailedAt}
          treasureCount={team.treasureCount}
          treasureGoal={team.treasureGoal}
          spectateUid={spectateUid}
          roomPlayers={roomPlayers}
          onBack={onBack}
        />
      )}
    </div>
  )
}

function StatBadge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={badgeStyle}>
      <span style={{ ...badgeLabelStyle, color }}>{label}</span>
      <span style={badgeValueStyle}>{value}</span>
    </div>
  )
}

function HitBadge({ stack, max }: { stack: number; max: number }) {
  return (
    <div style={badgeStyle}>
      <span style={{ ...badgeLabelStyle, color: '#fca5a5' }}>피격</span>
      <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
        {Array.from({ length: max }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 14,
              height: 14,
              borderRadius: 3,
              background: i < stack ? '#ef4444' : '#1f2638',
              border: '1px solid #374151',
            }}
          />
        ))}
      </div>
    </div>
  )
}

function AbilityBadge({
  label,
  state,
  remainingMs,
  totalMs,
  cooldownMs,
  activeColor,
}: {
  label: string
  state: 'ready' | 'active' | 'cooldown'
  remainingMs: number
  totalMs: number
  cooldownMs: number
  activeColor: string
}) {
  const pct =
    state === 'active'
      ? remainingMs / totalMs
      : state === 'cooldown'
        ? remainingMs / cooldownMs
        : 1

  const labelColor =
    state === 'ready' ? '#34d399' : state === 'active' ? activeColor : '#6b7280'

  const sub =
    state === 'active'
      ? `${(remainingMs / 1000).toFixed(1)}s`
      : state === 'cooldown'
        ? `${(remainingMs / 1000).toFixed(0)}s`
        : '준비'

  return (
    <div style={{ ...badgeStyle, position: 'relative', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: `${pct * 100}%`,
          height: '100%',
          background:
            state === 'active'
              ? `${activeColor}22`
              : state === 'cooldown'
                ? '#ffffff08'
                : '#34d39918',
          transition: 'width 0.1s linear',
        }}
      />
      <span style={{ ...badgeLabelStyle, color: labelColor, position: 'relative' }}>{label}</span>
      <span style={{ ...badgeValueStyle, fontSize: 12, position: 'relative' }}>{sub}</span>
    </div>
  )
}

const rootStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#05070d',
  color: '#e4e7ef',
  display: 'flex',
  flexDirection: 'column',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '12px 20px',
  borderBottom: '1px solid #1a1f2a',
}

const titleStyle: React.CSSProperties = { fontWeight: 600, fontSize: 16 }

const hintStyle: React.CSSProperties = {
  marginLeft: 'auto',
  fontSize: 13,
  color: '#8a93a6',
}

const backButtonStyle: React.CSSProperties = {
  background: '#1b2230',
  color: '#e4e7ef',
  border: '1px solid #2a3345',
  padding: '6px 12px',
  borderRadius: 6,
  cursor: 'pointer',
}

const statusBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  padding: '10px 20px',
  borderBottom: '1px solid #1a1f2a',
  background: '#0a0d14',
  flexWrap: 'wrap',
}

const badgeStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  background: '#121725',
  border: '1px solid #1f2638',
  padding: '6px 12px',
  borderRadius: 8,
  minWidth: 80,
}

const badgeLabelStyle: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: 1,
  fontWeight: 700,
}

const badgeValueStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: '#e4e7ef',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
}

const stealthBadgeStyle: React.CSSProperties = {
  alignSelf: 'center',
  background: '#0f3460',
  border: '1px solid #7dd3fc44',
  color: '#7dd3fc',
  padding: '4px 12px',
  borderRadius: 20,
  fontSize: 13,
  fontWeight: 600,
}

const canvasWrapStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  position: 'relative', // jail overlay 기준점
}

const loadingStyle: React.CSSProperties = {
  position: 'absolute',
  color: '#8a93a6',
}

const demoBannerStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 12,
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(15,19,29,0.88)',
  border: '1px solid #f97316',
  color: '#f97316',
  padding: '5px 14px',
  borderRadius: 20,
  fontSize: 13,
  fontWeight: 700,
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
}

const toastStyle: React.CSSProperties = {
  position: 'absolute',
  top: 40,
  background: 'rgba(15, 19, 29, 0.95)',
  border: '1px solid #2a3345',
  color: '#e4e7ef',
  padding: '10px 18px',
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
  pointerEvents: 'none',
}

const captureScreenStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#05070d',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const captureCardStyle: React.CSSProperties = {
  background: '#0f131d',
  border: '1px solid #3b0a0a',
  borderRadius: 16,
  padding: 36,
  textAlign: 'center',
  color: '#e4e7ef',
  maxWidth: 420,
}

const captureIconStyle: React.CSSProperties = { fontSize: 56, marginBottom: 12 }
const captureTitleStyle: React.CSSProperties = { fontSize: 24, fontWeight: 700, color: '#fca5a5', margin: '0 0 10px' }
const captureDescStyle: React.CSSProperties = { color: '#8a93a6', margin: '0 0 16px' }
const captureStatsStyle: React.CSSProperties = { color: '#fbbf24', fontWeight: 600, margin: '0 0 22px' }
const captureRetryStyle: React.CSSProperties = {
  background: '#1b2230',
  color: '#e4e7ef',
  border: '1px solid #2a3345',
  padding: '10px 20px',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 14,
}

// ── 유치장 오버레이 (피시 캔버스 위에 반투명 패널) ──────────────────────────────
function JailOverlay({
  jailedAt,
  treasureCount,
  treasureGoal,
  spectateUid,
  roomPlayers,
  onBack,
}: {
  jailedAt: number | null
  treasureCount: number
  treasureGoal: number
  spectateUid: string | null
  roomPlayers: Record<string, import('../utils/copsRtdb').RoomPlayer>
  onBack: () => void
}) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      if (jailedAt == null) return
      setElapsed(Date.now() - jailedAt)
    }, 1000)
    return () => clearInterval(id)
  }, [jailedAt])

  const remaining = Math.max(0, JAIL_RESCUE_WAIT_MS - elapsed)
  const rescuable = remaining === 0
  const min = Math.floor(remaining / 60000)
  const sec = Math.floor((remaining % 60000) / 1000)
  const spectateName = spectateUid ? (roomPlayers[spectateUid]?.name ?? spectateUid) : null

  return (
    <div style={jailOverlayStyle}>
      <div style={jailPanelStyle}>
        <span style={jailIconStyle}>🔒</span>
        <span style={jailTitleStyle}>유치장 대기 중</span>
        {rescuable ? (
          <span style={{ color: '#34d399', fontSize: 13, fontWeight: 700 }}>
            ✅ 구출 가능
          </span>
        ) : (
          <span style={{ color: '#fbbf24', fontSize: 13 }}>
            ⏳ {min}:{sec.toString().padStart(2, '0')}
          </span>
        )}
        <span style={{ color: '#6b7280', fontSize: 12 }}>
          보물 {treasureCount}/{treasureGoal}
        </span>
        {spectateName ? (
          <span style={{ color: '#7dd3fc', fontSize: 12 }}>
            👁 관전: {spectateName}
          </span>
        ) : (
          <span style={{ color: '#6b7280', fontSize: 12 }}>Q/E: 팀원 관전</span>
        )}
        <button style={jailLeaveStyle} onClick={onBack}>포기</button>
      </div>
    </div>
  )
}

const jailOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  paddingBottom: 24,
  zIndex: 20,
}

const jailPanelStyle: React.CSSProperties = {
  pointerEvents: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  background: 'rgba(10, 13, 20, 0.88)',
  border: '1px solid #1a2a4a',
  borderRadius: 12,
  padding: '10px 20px',
  backdropFilter: 'blur(6px)',
}

const jailIconStyle: React.CSSProperties = { fontSize: 20 }
const jailTitleStyle: React.CSSProperties = { color: '#7dd3fc', fontWeight: 700, fontSize: 14 }
const jailLeaveStyle: React.CSSProperties = {
  background: '#1b2230',
  color: '#8a93a6',
  border: '1px solid #2a3345',
  padding: '4px 10px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
}
