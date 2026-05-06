import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { ShotPhase, Vec3, GameState } from '../types'
import { PHYSICS } from '../utils/physics'
import BasketballScene from '../components/BasketballScene'
import {
  playBounceSound,
  playShootSound,
  playMissSound,
  setMuted as applySoundMuted,
  isMuted,
} from '../utils/sound'
import { predictPowerRange, calcDistanceToHoop, calcPowerForHoopHeight } from '../utils/aimPredictor'
import styles from './GamePage.module.css'

const MAX_CHARGE_MS = 1500
const AIM_SPEED = 1.5
const KEYBOARD_AIM_ENABLED = false
const AIM_PITCH_MIN = -Math.PI / 18
const AIM_PITCH_MAX = Math.PI / 3
const TOUCH_AIM_SENSITIVITY = 0.004
const MOUSE_AIM_SENSITIVITY = 0.0025

interface Props {
  gameState: GameState
  elapsedMs: number
  onGoal: (nextPos: Vec3) => void
  onMiss: (secondBouncePos: Vec3 | null) => void
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

type FlashType = 'success' | 'miss' | null

export default function GamePage({ gameState, elapsedMs, onGoal, onMiss }: Props) {
  const [shotPhase, setShotPhase] = useState<ShotPhase>('aiming')
  const [aimAzimuth, setAimAzimuth] = useState(0)
  const [aimElevation, setAimElevation] = useState(0.6)
  const [power, setPower] = useState(0)
  const [flash, setFlash] = useState<FlashType>(null)
  const [soundMuted, setSoundMuted] = useState(() => isMuted())

  const chargeStartRef = useRef<number>(0)
  const shotPhaseRef = useRef<ShotPhase>('aiming')
  const powerRef = useRef(0)
  const pressedKeysRef = useRef(new Set<string>())
  const aimAzRef = useRef(0)
  const aimElRef = useRef(0.6)
  const lastLoopTimeRef = useRef(0)
  const gameLoopRafRef = useRef<number>(0)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const mouseAimingRef = useRef(false)

  useEffect(() => { shotPhaseRef.current = shotPhase }, [shotPhase])

  useEffect(() => {
    setShotPhase('aiming')
    setPower(0)
    setFlash(null)
  }, [gameState.shots])

  // unified loop: arrow key aim + space hold power
  useEffect(() => {
    const loop = (time: number) => {
      gameLoopRafRef.current = requestAnimationFrame(loop)
      const dt = Math.min((time - (lastLoopTimeRef.current || time)) / 1000, 0.05)
      lastLoopTimeRef.current = time

      const phase = shotPhaseRef.current
      if (phase === 'flying' || phase === 'settled') return

      const keys = pressedKeysRef.current
      let az = aimAzRef.current
      let el = aimElRef.current
      let changed = false

      if (KEYBOARD_AIM_ENABLED) {
        if (keys.has('ArrowLeft'))  { az -= AIM_SPEED * dt; changed = true }
        if (keys.has('ArrowRight')) { az += AIM_SPEED * dt; changed = true }
        if (keys.has('ArrowUp'))    { el = Math.min(AIM_PITCH_MAX, el + AIM_SPEED * dt); changed = true }
        if (keys.has('ArrowDown'))  { el = Math.max(AIM_PITCH_MIN, el - AIM_SPEED * dt); changed = true }
      }

      if (changed) {
        aimAzRef.current = az
        aimElRef.current = el
        setAimAzimuth(az)
        setAimElevation(el)
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

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault()
      if (shotPhaseRef.current !== 'aiming') return
      chargeStartRef.current = performance.now()
      setShotPhase('charging')
      shotPhaseRef.current = 'charging'
    } else if (e.code === 'KeyF') {
      e.preventDefault()
      if (e.repeat) return
      if (!mouseAimingRef.current) {
        mouseAimingRef.current = true
        document.body.requestPointerLock?.()
      }
    } else if (KEYBOARD_AIM_ENABLED && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
      e.preventDefault()
      pressedKeysRef.current.add(e.code)
    }
  }, [])

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault()
      if (shotPhaseRef.current !== 'charging') return
      setPower(powerRef.current)
      setShotPhase('flying')
      shotPhaseRef.current = 'flying'
      playShootSound()
    } else if (e.code === 'KeyF') {
      e.preventDefault()
      mouseAimingRef.current = false
      if (document.pointerLockElement) document.exitPointerLock()
    } else if (KEYBOARD_AIM_ENABLED && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
      e.preventDefault()
      pressedKeysRef.current.delete(e.code)
    }
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!mouseAimingRef.current) return
    const phase = shotPhaseRef.current
    if (phase === 'flying' || phase === 'settled') return
    aimAzRef.current += e.movementX * MOUSE_AIM_SENSITIVITY
    aimElRef.current = Math.max(
      AIM_PITCH_MIN,
      Math.min(AIM_PITCH_MAX, aimElRef.current - e.movementY * MOUSE_AIM_SENSITIVITY),
    )
    setAimAzimuth(aimAzRef.current)
    setAimElevation(aimElRef.current)
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('mousemove', handleMouseMove)
    const handlePointerLockChange = () => {
      if (!document.pointerLockElement) {
        mouseAimingRef.current = false
      }
    }
    document.addEventListener('pointerlockchange', handlePointerLockChange)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('pointerlockchange', handlePointerLockChange)
      if (document.pointerLockElement) document.exitPointerLock()
    }
  }, [handleKeyDown, handleKeyUp, handleMouseMove])

  const handleTouchStart = useCallback((e: TouchEvent) => {
    e.preventDefault()
    const t = e.touches[0]
    touchStartRef.current = { x: t.clientX, y: t.clientY }
    if (shotPhaseRef.current === 'aiming') {
      chargeStartRef.current = performance.now()
      setShotPhase('charging')
      shotPhaseRef.current = 'charging'
    }
  }, [])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault()
    if (!touchStartRef.current || e.touches.length === 0) return
    const t = e.touches[0]
    const dx = t.clientX - touchStartRef.current.x
    const dy = t.clientY - touchStartRef.current.y
    touchStartRef.current = { x: t.clientX, y: t.clientY }
    aimAzRef.current += dx * TOUCH_AIM_SENSITIVITY
    aimElRef.current = Math.max(
      AIM_PITCH_MIN,
      Math.min(AIM_PITCH_MAX, aimElRef.current - dy * TOUCH_AIM_SENSITIVITY),
    )
    setAimAzimuth(aimAzRef.current)
    setAimElevation(aimElRef.current)
  }, [])

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    e.preventDefault()
    touchStartRef.current = null
    if (shotPhaseRef.current === 'charging') {
      setPower(powerRef.current)
      setShotPhase('flying')
      shotPhaseRef.current = 'flying'
      playShootSound()
    }
  }, [])

  useEffect(() => {
    window.addEventListener('touchstart', handleTouchStart, { passive: false })
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleTouchEnd, { passive: false })
    return () => {
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd])

  // called immediately when ball crosses the hoop — show flash, keep ball flying
  const handleGoalScored = useCallback(() => {
    setFlash('success')
  }, [])

  // called after 2 post-goal floor bounces — transition to next shot
  const handleGoal = useCallback((nextPos: Vec3) => {
    setShotPhase('settled')
    setTimeout(() => { setFlash(null); onGoal(nextPos) }, 400)
  }, [onGoal])

  const handleMiss = useCallback((secondBouncePos: Vec3 | null) => {
    setShotPhase('settled')
    setFlash('miss')
    playMissSound()
    setTimeout(() => { setFlash(null); onMiss(secondBouncePos) }, 1200)
  }, [onMiss])

  const handleBounce = useCallback((speed: number) => {
    playBounceSound(speed)
  }, [])

  const handleToggleMute = useCallback(() => {
    const next = !isMuted()
    applySoundMuted(next)
    setSoundMuted(next)
  }, [])

  const powerRange = useMemo(
    () => {
      if (shotPhase === 'flying' || shotPhase === 'settled') return null
      return predictPowerRange(gameState.shotPosition, aimAzimuth, aimElevation)
    },
    [gameState.shotPosition, aimAzimuth, aimElevation, shotPhase],
  )

  const hoopHeightPower = useMemo(
    () => {
      if (shotPhase === 'flying' || shotPhase === 'settled') return null
      return calcPowerForHoopHeight(gameState.shotPosition, aimAzimuth, aimElevation)
    },
    [gameState.shotPosition, aimAzimuth, aimElevation, shotPhase],
  )

  const distanceToHoop = useMemo(
    () => calcDistanceToHoop(gameState.shotPosition),
    [gameState.shotPosition],
  )

  const successRate =
    gameState.shots > 0 ? Math.round((gameState.goals / gameState.shots) * 100) : 0

  const atFreeThrow =
    Math.abs(gameState.shotPosition.z - PHYSICS.FREE_THROW_POS.z) < 0.01 &&
    Math.abs(gameState.shotPosition.x) < 0.01

  return (
    <div className={styles.wrap}>
      <div className={styles.hud}>
        <div className={styles.hudInner}>
          <div className={styles.hudItem}>
            <span className={styles.hudLabel}>골</span>
            <span className={styles.hudValue}>{gameState.goals} / {gameState.targetGoals}</span>
          </div>
          <div className={styles.hudDivider} />
          <div className={styles.hudItem}>
            <span className={styles.hudLabel}>시도</span>
            <span className={styles.hudValue}>{gameState.shots}</span>
          </div>
          <div className={styles.hudDivider} />
          <div className={styles.hudItem}>
            <span className={styles.hudLabel}>성공률</span>
            <span className={styles.hudValue}>{successRate}%</span>
          </div>
          <div className={styles.hudDivider} />
          <div className={styles.hudItem}>
            <span className={styles.hudLabel}>시간</span>
            <span className={styles.hudValue}>{formatTime(elapsedMs)}</span>
          </div>
        </div>
      </div>

      <button
      className={styles.muteBtn}
      onClick={handleToggleMute}
      aria-label={soundMuted ? '소리 켜기' : '소리 끄기'}
    >
      {soundMuted ? '소리 OFF' : '소리 ON'}
    </button>

    <div className={styles.crosshair} />

      <BasketballScene
        shotPhase={shotPhase}
        aimAzimuth={aimAzimuth}
        aimElevation={aimElevation}
        power={power}
        startPosition={gameState.shotPosition}
        shotKey={gameState.shots}
        onGoal={handleGoal}
        onGoalScored={handleGoalScored}
        onMiss={handleMiss}
        onBounce={handleBounce}
      />

      {(shotPhase === 'aiming' || shotPhase === 'charging') && (
        <div className={`${styles.gauge} ${shotPhase === 'aiming' ? styles.gaugeReady : ''}`}>
          <div className={styles.gaugeLabel}>
            {shotPhase === 'charging' ? `${Math.round(power * 100)}%` : 'READY'}
          </div>
          <div className={`${styles.gaugeTrack} ${!powerRange ? styles.gaugeNoRange : ''}`}>
            <div className={styles.gaugeFill} style={{ height: `${power * 100}%` }} />
            {hoopHeightPower !== null && (
              <div
                className={styles.gaugeHoopMark}
                style={{ bottom: `${hoopHeightPower * 100}%` }}
                title="이 파워로 쏘면 골대 높이까지 도달"
              />
            )}
          </div>
          <div className={styles.gaugeDistance}>{distanceToHoop.toFixed(1)}m</div>
        </div>
      )}

      {flash && (
        <div className={styles.flash}>
          <span className={`${styles.flashText} ${flash === 'success' ? styles.flashSuccess : styles.flashMiss}`}>
            {flash === 'success' ? 'GOAL!' : 'MISS'}
          </span>
        </div>
      )}

      <div className={styles.hint}>
        {'ontouchstart' in window
          ? '드래그: 조준 | 터치 누르고 떼기: 충전/발사'
          : 'F+마우스: 조준  |  Space 누르고 떼기: 파워 충전/발사'
        }
        &nbsp;|&nbsp; 위치: {atFreeThrow ? '프리스로' : '바운스 지점'}
      </div>
    </div>
  )
}
