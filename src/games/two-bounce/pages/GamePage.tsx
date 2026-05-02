import { useState, useEffect, useCallback, useRef } from 'react'
import type { ShotPhase, Vec3, GameState } from '../types'
import { PHYSICS } from '../utils/physics'
import BasketballScene from '../components/BasketballScene'
import styles from './GamePage.module.css'

const MAX_CHARGE_MS = 2000
const AIM_SENSITIVITY = 0.003

interface Props {
  gameState: GameState
  onGoal: () => void
  onMiss: (secondBouncePos: Vec3 | null) => void
}

type FlashType = 'success' | 'miss' | null

export default function GamePage({ gameState, onGoal, onMiss }: Props) {
  const [shotPhase, setShotPhase] = useState<ShotPhase>('aiming')
  const [aimAzimuth, setAimAzimuth] = useState(0)
  const [aimElevation, setAimElevation] = useState(0.6)
  const [power, setPower] = useState(0)
  const [flash, setFlash] = useState<FlashType>(null)

  const chargeStartRef = useRef<number>(0)
  const shotPhaseRef = useRef<ShotPhase>('aiming')
  const powerRef = useRef(0)
  const chargeRafRef = useRef<number>(0)

  useEffect(() => { shotPhaseRef.current = shotPhase }, [shotPhase])

  // reset when shot position changes (new shot)
  useEffect(() => {
    setShotPhase('aiming')
    setPower(0)
    setFlash(null)
  }, [gameState.shotPosition.x, gameState.shotPosition.y, gameState.shotPosition.z])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (shotPhaseRef.current === 'settled') return
    setAimAzimuth((prev) => prev + e.movementX * AIM_SENSITIVITY)
    setAimElevation((prev) => Math.max(-Math.PI / 18, Math.min(Math.PI / 3, prev - e.movementY * AIM_SENSITIVITY)))
  }, [])

  const handleClick = useCallback(() => {
    document.documentElement.requestPointerLock?.()?.catch(() => {})
  }, [])

  const startChargeLoop = useCallback(() => {
    const tick = () => {
      const p = Math.min((performance.now() - chargeStartRef.current) / MAX_CHARGE_MS, 1)
      powerRef.current = p
      setPower(p)
      if (shotPhaseRef.current === 'charging') {
        chargeRafRef.current = requestAnimationFrame(tick)
      }
    }
    chargeRafRef.current = requestAnimationFrame(tick)
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.code !== 'Space') return
    e.preventDefault()
    if (shotPhaseRef.current !== 'aiming') return
    chargeStartRef.current = performance.now()
    setShotPhase('charging')
    shotPhaseRef.current = 'charging'
    startChargeLoop()
  }, [startChargeLoop])

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.code !== 'Space') return
    e.preventDefault()
    if (shotPhaseRef.current !== 'charging') return
    cancelAnimationFrame(chargeRafRef.current)
    setPower(powerRef.current)
    setShotPhase('flying')
    shotPhaseRef.current = 'flying'
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      cancelAnimationFrame(chargeRafRef.current)
    }
  }, [handleMouseMove, handleKeyDown, handleKeyUp])

  const handleGoal = useCallback(() => {
    setShotPhase('settled')
    setFlash('success')
    setTimeout(() => { setFlash(null); onGoal() }, 1200)
  }, [onGoal])

  const handleMiss = useCallback((secondBouncePos: Vec3 | null) => {
    setShotPhase('settled')
    setFlash('miss')
    setTimeout(() => { setFlash(null); onMiss(secondBouncePos) }, 1200)
  }, [onMiss])

  const successRate =
    gameState.shots > 0 ? Math.round((gameState.goals / gameState.shots) * 100) : 0

  const atFreeThrow =
    Math.abs(gameState.shotPosition.z - PHYSICS.FREE_THROW_POS.z) < 0.01 &&
    Math.abs(gameState.shotPosition.x) < 0.01

  return (
    <div className={styles.wrap} onClick={handleClick}>
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
        </div>
      </div>

      <BasketballScene
        shotPhase={shotPhase}
        aimAzimuth={aimAzimuth}
        aimElevation={aimElevation}
        power={power}
        startPosition={gameState.shotPosition}
        onGoal={handleGoal}
        onMiss={handleMiss}
      />

      {shotPhase === 'charging' && (
        <div className={styles.gauge}>
          <div className={styles.gaugeLabel}>파워</div>
          <div className={styles.gaugeTrack}>
            <div className={styles.gaugeFill} style={{ height: `${power * 100}%` }} />
          </div>
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
        클릭: 포인터 잠금 &nbsp;|&nbsp; 마우스: 조준 &nbsp;|&nbsp; Space 누르고 떼기: 파워 충전/발사
        &nbsp;|&nbsp; 위치: {atFreeThrow ? '프리스로' : '바운스 지점'}
      </div>
    </div>
  )
}
