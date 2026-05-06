import { useState } from 'react'
import type { TargetGoals, TwoBounceBestRecords } from '../types'
import { loadBestRecords, clearBestRecords } from '../utils/records'
import styles from './GoalSelectPage.module.css'

interface Props {
  onStart: (targetGoals: TargetGoals) => void
  onMulti?: () => void
}

const OPTIONS: TargetGoals[] = [3, 5, 10]

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function GoalSelectPage({ onStart, onMulti }: Props) {
  const [selected, setSelected] = useState<TargetGoals>(5)
  const [records, setRecords] = useState<TwoBounceBestRecords>(() => loadBestRecords())

  const handleClearRecords = () => {
    if (!window.confirm('기록을 초기화할까요? 모든 최고 기록이 삭제됩니다.')) return
    setRecords(clearBestRecords())
  }

  const hasAnyRecord = OPTIONS.some((n) => records[n] !== null)

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>🏀 2 Bounce</div>
      <div className={styles.subtitle}>슛 실패 시 두 번째 바운스 위치에서 다음 샷 시작</div>
      <div className={styles.card}>
        <div className={styles.label}>목표 골 선택</div>
        <div className={styles.buttons}>
          {OPTIONS.map((n) => {
            const best = records[n]
            return (
              <div key={n} className={styles.btnWrap}>
                <button
                  className={`${styles.btn} ${selected === n ? styles.btnActive : ''}`}
                  onClick={() => setSelected(n)}
                  aria-label={`${n}골 선택`}
                  aria-pressed={selected === n}
                >
                  {n}골
                </button>
                <div className={styles.btnRecord}>
                  {best
                    ? `${best.totalShots}슛 / ${formatTime(best.elapsedMs)}`
                    : '기록 없음'}
                </div>
              </div>
            )
          })}
        </div>
        <button className={styles.start} onClick={() => onStart(selected)}>
          게임 시작
        </button>
        {hasAnyRecord && (
          <button className={styles.clearBtn} onClick={handleClearRecords}>
            기록 초기화
          </button>
        )}
        <div className={styles.controls}>방향키 조준 · Space 충전 → 슛</div>
      </div>
      {onMulti && (
        <div className={styles.multiSection}>
          <div className={styles.divider} />
          <button className={styles.multiBtn} onClick={onMulti}>
            멀티 플레이
          </button>
        </div>
      )}
    </div>
  )
}
