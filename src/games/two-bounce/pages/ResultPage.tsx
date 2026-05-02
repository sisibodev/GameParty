import { useNavigate } from 'react-router-dom'
import type { GameState } from '../types'
import styles from './ResultPage.module.css'

interface Props {
  gameState: GameState
  onRestart: () => void
}

export default function ResultPage({ gameState, onRestart }: Props) {
  const navigate = useNavigate()
  const successRate =
    gameState.shots > 0 ? Math.round((gameState.goals / gameState.shots) * 100) : 0

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>🏀 게임 완료!</div>
      <div className={styles.card}>
        <div className={styles.row}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>목표</span>
            <span className={styles.statValue}>{gameState.targetGoals}골</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>달성</span>
            <span className={styles.statValue}>{gameState.goals}골</span>
          </div>
        </div>
        <div className={styles.divider} />
        <div className={styles.row}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>시도</span>
            <span className={styles.statValue}>{gameState.shots}회</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>성공률</span>
            <span className={styles.statValue}>{successRate}%</span>
          </div>
        </div>
        <div className={styles.buttons}>
          <button className={styles.btnPrimary} onClick={onRestart}>
            다시 하기
          </button>
          <button className={styles.btnSecondary} onClick={() => navigate('/')}>
            홈으로
          </button>
        </div>
      </div>
    </div>
  )
}
