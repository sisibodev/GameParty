import { useState, type KeyboardEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../../contexts/AuthContext'
import { joinTwoBounceRoom } from '../../utils/rtdb'
import styles from './multi.module.css'

const ROOM_CODE_LENGTH = 6
const TWO_BOUNCE_BASE = '/game/two-bounce'

export default function JoinRoomPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialCode = (searchParams.get('roomId') ?? '').toUpperCase().slice(0, ROOM_CODE_LENGTH)
  const [code, setCode] = useState(initialCode)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleJoin = async () => {
    if (!user) {
      setError('로그인이 필요합니다.')
      return
    }
    const roomId = code.trim().toUpperCase()
    if (roomId.length !== ROOM_CODE_LENGTH) {
      setError('6자리 방 코드를 입력하세요.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await joinTwoBounceRoom(roomId, {
        uid: user.uid,
        displayName: user.displayName ?? user.email?.split('@')[0] ?? '플레이어',
        photoURL: user.photoURL ?? undefined,
      })
      navigate(`${TWO_BOUNCE_BASE}/multi/room/${roomId}`, { replace: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : '방 참가에 실패했습니다.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !loading) {
      handleJoin()
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>방 참가</div>
      <div className={styles.card}>
        <div>
          <div className={styles.sectionLabel}>방 코드 (6자리)</div>
          <input
            className={styles.codeInput}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, ROOM_CODE_LENGTH))}
            onKeyDown={handleKeyDown}
            placeholder="ABC123"
            maxLength={ROOM_CODE_LENGTH}
            autoFocus
            disabled={loading}
            spellCheck={false}
            autoCapitalize="characters"
          />
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <button
          className={styles.primaryBtn}
          onClick={handleJoin}
          disabled={loading || !user || code.length !== ROOM_CODE_LENGTH}
        >
          {loading ? '참가 중...' : '참가하기'}
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
