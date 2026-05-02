import { useState, useCallback } from 'react'
import type { GamePhase, GameState, TargetGoals, Vec3 } from './types'
import { PHYSICS } from './utils/physics'
import GoalSelectPage from './pages/GoalSelectPage'
import GamePage from './pages/GamePage'
import ResultPage from './pages/ResultPage'

const FREE_THROW_POS: Vec3 = { ...PHYSICS.FREE_THROW_POS }

function makeInitialState(targetGoals: TargetGoals): GameState {
  return {
    targetGoals,
    goals: 0,
    shots: 0,
    shotPosition: { ...FREE_THROW_POS },
  }
}

export default function TwoBounceGame() {
  const [phase, setPhase] = useState<GamePhase>('goal-select')
  const [gameState, setGameState] = useState<GameState>(makeInitialState(5))

  const handleStart = useCallback((targetGoals: TargetGoals) => {
    setGameState(makeInitialState(targetGoals))
    setPhase('playing')
  }, [])

  const handleGoal = useCallback(() => {
    setGameState((prev) => {
      const nextGoals = prev.goals + 1
      const nextState: GameState = {
        ...prev,
        goals: nextGoals,
        shots: prev.shots + 1,
        shotPosition: { ...FREE_THROW_POS },
      }
      if (nextGoals >= prev.targetGoals) {
        // transition after state settles
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

  if (phase === 'goal-select') {
    return <GoalSelectPage onStart={handleStart} />
  }

  if (phase === 'result') {
    return <ResultPage gameState={gameState} onRestart={handleRestart} />
  }

  return (
    <GamePage
      gameState={gameState}
      onGoal={handleGoal}
      onMiss={handleMiss}
    />
  )
}
