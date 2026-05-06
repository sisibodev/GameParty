import { useNavigate } from 'react-router-dom'
import type { GameState, TwoBounceBestRecord } from '../types'
import styles from './ResultPage.module.css'

interface Props {
  gameState: GameState
  elapsedMs: number
  isNewBest: boolean
  previousBest: TwoBounceBestRecord | null
  onRestart: () => void
  onGoalSelect: () => void
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function ResultPage({
  gameState, elapsedMs, isNewBest, previousBest, onRestart, onGoalSelect,
}: Props) {
  const navigate = useNavigate()
  const successRate =
    gameState.shots > 0 ? Math.round((gameState.goals / gameState.shots) * 100) : 0

  // 신기록 피드백 문구
  const newBestMessage = (() => {
    if (!isNewBest) return null
    if (previousBest === null) return '첫 기록을 세웠습니다! 🎉'
    const shotDiff = previousBest.totalShots - gameState.shots
    const timeDiff = Math.floor((previousBest.elapsedMs - elapsedMs) / 1000)
    const parts: string[] = []
    if (shotDiff > 0) parts.push(`${shotDiff}슛 줄임`)
    if (timeDiff > 0) parts.push(`${timeDiff}초 단축`)
    return parts.length > 0 ? `이전 기록보다 ${parts.join(', ')}! 🏆` : '동률 신기록! 🏆'
  })()

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>🏀 게임 완료!</div>

      {isNewBest && (
        <div className={styles.newBestBanner}>
          🏆 신기록!
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.row}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>목표</span>
            <span className={styles.statValue}>{gameState.targetGoals}골</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>시도</span>
            <span className={styles.statValue}>{gameState.shots}회</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>성공률</span>
            <span className={styles.statValue}>{successRate}%</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>시간</span>
            <span className={styles.statValue}>{formatTime(elapsedMs)}</span>
          </div>
        </div>

        {newBestMessage && (
          <div className={styles.newBestMsg}>{newBestMessage}</div>
        )}

        {!isNewBest && previousBest !== null && (
          <>
            <div className={styles.divider} />
            <div className={styles.bestRow}>
              <span className={styles.bestLabel}>최고 기록</span>
              <span className={styles.bestValue}>
                {previousBest.totalShots}슛 &nbsp;/&nbsp; {formatTime(previousBest.elapsedMs)}
              </span>
            </div>
          </>
        )}

        <div className={styles.divider} />
        <div className={styles.buttons}>
          <button className={styles.btnPrimary} onClick={onRestart} aria-label="같은 목표로 다시 하기">
            다시 하기
          </button>
          <button className={styles.btnSecondary} onClick={onGoalSelect} aria-label="목표 골 수 변경">
            목표 변경
          </button>
          <button className={styles.btnSecondary} onClick={() => navigate('/')} aria-label="홈 화면으로 이동">
            홈으로
          </button>
        </div>
      </div>
    </div>
  )
}
