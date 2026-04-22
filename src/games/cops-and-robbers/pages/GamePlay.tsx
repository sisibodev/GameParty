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
import {
  COLORS,
  COP_BOT_ATTACK_RADIUS,
  COP_BOT_HIT_COOLDOWN_MS,
  HIT_STACK_MAX,
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
}

const TOTAL_SAFES = 10
const TREASURE_GOAL = 5
const COP_SPAWN = { x: TILE_SIZE * 20.5, y: TILE_SIZE * 14.5 }

export default function GamePlay({ onBack, onGameEnd, roomId, uid, isHost, myRole = 'thief' }: GamePlayProps) {
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
  // Per-cop hit cooldowns: copUid → lastHitMs
  const remoteCopHitRef = useRef<Map<string, number>>(new Map())

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

      // Sync treasure count
      if (typeof data.treasureCount === 'number') {
        setTeam((t) => t.treasureCount !== data.treasureCount ? { ...t, treasureCount: data.treasureCount } : t)
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
      world.addChild(abHandle.stealthOverlay)
      world.addChild(thief.view)

      const fog = createFogOfWar()
      app.stage.addChild(fog.view)
      fog.update(thief.state.pos.x, thief.state.pos.y, thief.state.visionRadius)

      setReady(true)

      app.ticker.add((ticker) => {
        if (capturePhaseRef.current !== 'playing') return

        const dtMs = ticker.deltaMS
        nowMsRef.current += dtMs
        const nowMs = nowMsRef.current
        const dt = dtMs / 1000
        const k = keyboard.state
        const modalOpen = sessionRef.current !== null

        let dx = 0
        let dy = 0
        if (!modalOpen) {
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
          const sprint = k.sprint ? 1.5 : 1
          const step = thief.state.speed * sprint * dt

          const nextX = thief.state.pos.x + dx * step
          if (!circleCollidesWall(map, nextX, thief.state.pos.y, PLAYER_RADIUS - 1))
            thief.state.pos.x = nextX
          const nextY = thief.state.pos.y + dy * step
          if (!circleCollidesWall(map, thief.state.pos.x, nextY, PLAYER_RADIUS - 1))
            thief.state.pos.y = nextY
          syncPlayerView(thief)
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

        // Disable bot if a human cop player exists in the room
        const humanCopExists = roomId
          ? Object.values(rtdbDataRef.current?.players ?? {}).some((p) => p.role === 'cop')
          : false

        // Only host (or solo) runs bot AI; non-host reads bot pos from RTDB subscription
        const { hitRegistered } = (!humanCopExists && isHost !== false)
          ? updateCopBot(copHandle, map, thief.state.pos, stealthed, abHandle.smokeClouds, dtMs, nowMs)
          : { hitRegistered: false }

        // Host throttled bot position write (only when bot is active)
        if (roomId && !humanCopExists && (isHost ?? true)) {
          lastBotSyncRef.current += dtMs
          if (lastBotSyncRef.current >= BOT_SYNC_MS) {
            lastBotSyncRef.current = 0
            updateBot(roomId, copHandle.state.pos, copHandle.state.behavior).catch(() => {})
          }
        }

        if (hitRegistered && capturePhaseRef.current === 'playing') {
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

        fog.update(thief.state.pos.x, thief.state.pos.y, thief.state.visionRadius)

        // 탈출구 잠금 해제 (보물 목표 달성 시 1회)
        if (!escapeUnlockedRef.current && treasureCountRef.current >= TREASURE_GOAL) {
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
            treasureCountRef.current >= TREASURE_GOAL &&
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

  const openedCount = useMemo(
    () => safes.filter((s) => s.status === 'opened_treasure' || s.status === 'opened_empty').length,
    [safes],
  )

  if (capturePhase === 'jailed') {
    return <JailWaitScreen jailedAt={jailedAt} treasureCount={team.treasureCount} onBack={onBack} />
  }

  if (capturePhase === 'captured') {
    return (
      <div style={captureScreenStyle}>
        <div style={captureCardStyle}>
          <div style={captureIconStyle}>🚔</div>
          <h2 style={captureTitleStyle}>체포됐습니다!</h2>
          <p style={captureDescStyle}>경찰에게 3번 피격되어 유치장으로 이송됩니다.</p>
          <p style={captureStatsStyle}>획득 보물: {team.treasureCount} / {TREASURE_GOAL}</p>
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
  position: 'relative',
}

const loadingStyle: React.CSSProperties = {
  position: 'absolute',
  color: '#8a93a6',
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

// ── 유치장 대기 화면 ─────────────────────────────────────────────────────────────
function JailWaitScreen({
  jailedAt,
  treasureCount,
  onBack,
}: {
  jailedAt: number | null
  treasureCount: number
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

  const waitMs = JAIL_RESCUE_WAIT_MS
  const remaining = Math.max(0, waitMs - elapsed)
  const rescuable = remaining === 0
  const min = Math.floor(remaining / 60000)
  const sec = Math.floor((remaining % 60000) / 1000)

  return (
    <div style={captureScreenStyle}>
      <div style={{ ...captureCardStyle, borderColor: '#1a2a4a' }}>
        <div style={captureIconStyle}>🔒</div>
        <h2 style={{ ...captureTitleStyle, color: '#7dd3fc' }}>유치장에 갇혔습니다</h2>
        <p style={captureDescStyle}>팀원이 유치장에 와서 구출할 수 있습니다.</p>

        {rescuable ? (
          <p style={{ ...captureStatsStyle, color: '#34d399' }}>
            ✅ 구출 가능 — 팀원이 유치장에 오면 자동 구출됩니다
          </p>
        ) : (
          <p style={captureStatsStyle}>
            ⏳ 구출 대기: {min}:{sec.toString().padStart(2, '0')}
          </p>
        )}

        <p style={{ ...captureDescStyle, marginTop: 8 }}>
          팀 보물: {treasureCount} / {TREASURE_GOAL}
        </p>
        <button style={captureRetryStyle} onClick={onBack}>
          포기하고 나가기
        </button>
      </div>
    </div>
  )
}
