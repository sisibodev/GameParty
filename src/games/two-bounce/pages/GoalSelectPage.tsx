import { useState } from 'react'
import type { TargetGoals } from '../types'
import styles from './GoalSelectPage.module.css'

interface Props {
  onStart: (targetGoals: TargetGoals) => void
}

const OPTIONS: TargetGoals[] = [3, 5, 10]

export default function GoalSelectPage({ onStart }: Props) {
  const [selected, setSelected] = useState<TargetGoals>(5)

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>🏀 2 Bounce</div>
      <div className={styles.subtitle}>슛 실패 시 두 번째 바운스 위치에서 다음 샷 시작</div>
      <div className={styles.card}>
        <div className={styles.label}>목표 골 선택</div>
        <div className={styles.buttons}>
          {OPTIONS.map((n) => (
            <button
              key={n}
              className={`${styles.btn} ${selected === n ? styles.btnActive : ''}`}
              onClick={() => setSelected(n)}
            >
              {n}골
            </button>
          ))}
        </div>
        <button className={styles.start} onClick={() => onStart(selected)}>
          게임 시작
        </button>
      </div>
    </div>
  )
}
