import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../../../contexts/AuthContext'
import { createTwoBounceRoom } from '../../utils/rtdb'
import type { TargetGoals } from '../../types'
import styles from './multi.module.css'

const GOALS: TargetGoals[] = [3, 5, 10]
const MAX_PLAYERS_OPTIONS = [2, 3, 4, 6]
const TWO_BOUNCE_BASE = '/game/two-bounce'

export default function CreateRoomPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const stateGoals = (location.state as { targetGoals?: TargetGoals } | null)?.targetGoals
  const [targetGoals, setTargetGoals] = useState<TargetGoals>(
    GOALS.includes(stateGoals as TargetGoals) ? (stateGoals as TargetGoals) : 5
  )
  const [maxPlayers, setMaxPlayers] = useState<number>(4)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!user) {
      setError('로그인이 필요합니다.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const roomId = await createTwoBounceRoom({
        host: {
          uid: user.uid,
          displayName: user.displayName ?? user.email?.split('@')[0] ?? '플레이어',
          photoURL: user.photoURL ?? undefined,
        },
        targetGoals,
        maxPlayers,
      })
      navigate(`${TWO_BOUNCE_BASE}/multi/room/${roomId}`, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : '방 생성에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>방 만들기</div>
      <div className={styles.card}>
        <div>
          <div className={styles.sectionLabel}>목표 골</div>
          <div className={styles.optionRow}>
            {GOALS.map((n) => (
              <button
                key={n}
                className={`${styles.optBtn} ${targetGoals === n ? styles.optBtnActive : ''}`}
                onClick={() => setTargetGoals(n)}
                disabled={loading}
              >
                {n}골
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className={styles.sectionLabel}>최대 인원</div>
          <div className={styles.optionRow}>
            {MAX_PLAYERS_OPTIONS.map((n) => (
              <button
                key={n}
                className={`${styles.optBtn} ${maxPlayers === n ? styles.optBtnActive : ''}`}
                onClick={() => setMaxPlayers(n)}
                disabled={loading}
              >
                {n}명
              </button>
            ))}
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <button
          className={styles.primaryBtn}
          onClick={handleCreate}
          disabled={loading || !user}
        >
          {loading ? '생성 중...' : '방 만들기'}
        </button>

        <button
          className={styles.backBtn}
          onClick={() => navigate(`${TWO_BOUNCE_BASE}/multi`)}
          disabled={loading}
        >
          ← 뒤로
        </button>
      </div>
    </div>
  )
}
