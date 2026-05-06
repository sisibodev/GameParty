import { useState, useCallback, useEffect, useRef } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import type { GamePhase, GameState, TargetGoals, Vec3, TwoBounceBestRecord } from './types'
import { PHYSICS } from './utils/physics'
import { saveBestRecord } from './utils/records'
import GoalSelectPage from './pages/GoalSelectPage'
import GamePage from './pages/GamePage'
import ResultPage from './pages/ResultPage'
import MultiMenuPage from './pages/multi/MultiMenuPage'
import CreateRoomPage from './pages/multi/CreateRoomPage'
import JoinRoomPage from './pages/multi/JoinRoomPage'
import WaitingRoomPage from './pages/multi/WaitingRoomPage'
import MultiGamePage from './pages/multi/MultiGamePage'

const FREE_THROW_POS: Vec3 = { ...PHYSICS.FREE_THROW_POS }

// 3점 라인 내 랜덤 슛 위치 (골대 기준 반원형 2.5~5.8m, ±75°)
function randomShotPos(): Vec3 {
  const MIN_DIST = 2.5
  const MAX_DIST = 5.8
  const MAX_ANGLE = (75 * Math.PI) / 180
  const dist = MIN_DIST + Math.random() * (MAX_DIST - MIN_DIST)
  const angle = (Math.random() * 2 - 1) * MAX_ANGLE
  return {
    x: Math.sin(angle) * dist,
    y: PHYSICS.BALL_HOLD_HEIGHT,
    z: PHYSICS.HOOP_CENTER.z + Math.cos(angle) * dist,
  }
}

function makeInitialState(targetGoals: TargetGoals): GameState {
  return {
    targetGoals,
    goals: 0,
    shots: 0,
    shotPosition: randomShotPos(),
  }
}

function SinglePlayerFlow() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<GamePhase>('goal-select')
  const [gameState, setGameState] = useState<GameState>(makeInitialState(5))
  const [elapsedMs, setElapsedMs] = useState(0)
  const [isNewBest, setIsNewBest] = useState(false)
  const [previousBest, setPreviousBest] = useState<TwoBounceBestRecord | null>(null)

  const startTimeRef = useRef(0)

  // 타이머: playing 중에만 100ms 간격으로 경과 시간 업데이트
  useEffect(() => {
    if (phase !== 'playing') return
    startTimeRef.current = Date.now()
    setElapsedMs(0)
    const id = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current)
    }, 100)
    return () => clearInterval(id)
  }, [phase])

  const handleStart = useCallback((targetGoals: TargetGoals) => {
    setGameState(makeInitialState(targetGoals))
    setPhase('playing')
  }, [])

  const handleGoal = useCallback((_nextPos: Vec3) => {
    const nextPos = randomShotPos()
    setGameState((prev) => {
      const nextGoals = prev.goals + 1
      const nextShots = prev.shots + 1
      const nextState: GameState = {
        ...prev,
        goals: nextGoals,
        shots: nextShots,
        shotPosition: nextPos,
      }
      if (nextGoals >= prev.targetGoals) {
        const finalElapsed = Date.now() - startTimeRef.current
        const runResult = {
          targetGoals: prev.targetGoals,
          goals: nextGoals,
          totalShots: nextShots,
          madeShots: nextGoals,
          accuracy: Math.round((nextGoals / nextShots) * 100),
          elapsedMs: finalElapsed,
          completedAt: new Date().toISOString(),
        }
        const saved = saveBestRecord(runResult)
        setElapsedMs(finalElapsed)
        setIsNewBest(saved.isNewBest)
        setPreviousBest(saved.previousBest)
        setTimeout(() => setPhase('result'), 0)
      }
      return nextState
    })
  }, [])

  const handleMiss = useCallback((secondBouncePos: Vec3 | null) => {
    setGameState((prev) => ({
      ...prev,
      shots: prev.shots + 1,
      shotPosition: secondBouncePos ?? { ...FREE_THROW_POS },
    }))
  }, [])

  const handleRestart = useCallback(() => {
    setGameState((prev) => makeInitialState(prev.targetGoals))
    setPhase('playing')
  }, [])

  const handleGoalSelect = useCallback(() => {
    setPhase('goal-select')
  }, [])

  if (phase === 'goal-select') {
    return <GoalSelectPage onStart={handleStart} onMulti={() => navigate('multi')} />
  }

  if (phase === 'result') {
    return (
      <ResultPage
        gameState={gameState}
        elapsedMs={elapsedMs}
        isNewBest={isNewBest}
        previousBest={previousBest}
        onRestart={handleRestart}
        onGoalSelect={handleGoalSelect}
      />
    )
  }

  return (
    <GamePage
      gameState={gameState}
      elapsedMs={elapsedMs}
      onGoal={handleGoal}
      onMiss={handleMiss}
    />
  )
}

export default function TwoBounceGame() {
  return (
    <Routes>
      <Route index element={<SinglePlayerFlow />} />
      <Route path="multi" element={<MultiMenuPage />} />
      <Route path="multi/create" element={<CreateRoomPage />} />
      <Route path="multi/join" element={<JoinRoomPage />} />
      <Route path="multi/room/:roomId" element={<WaitingRoomPage />} />
      <Route path="multi/play/:roomId" element={<MultiGamePage />} />
      <Route path="*" element={<Navigate to="/game/two-bounce" replace />} />
    </Routes>
  )
}
