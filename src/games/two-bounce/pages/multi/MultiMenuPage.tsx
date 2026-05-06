import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../../contexts/AuthContext'
import { joinTwoBounceRoom } from '../../utils/rtdb'
import { subscribeTwoBounceOpenRoomIndex } from '../../utils/roomIndex'
import type { TwoBounceRoomIndexEntry } from '../../types.multi'
import styles from './multi.module.css'

const TWO_BOUNCE_BASE = '/game/two-bounce'

function formatElapsed(createdAt: number): string {
  const sec = Math.floor((Date.now() - createdAt) / 1000)
  if (sec < 60) return `${sec}초 전`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}분 전`
  return `${Math.floor(min / 60)}시간 전`
}

export default function MultiMenuPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [openRooms, setOpenRooms] = useState<TwoBounceRoomIndexEntry[]>([])
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)

  useEffect(() => {
    const unsub = subscribeTwoBounceOpenRoomIndex(
      (entries) => setOpenRooms(entries),
      () => setOpenRooms([]),
    )
    return unsub
  }, [])

  const handleQuickJoin = useCallback(async (entry: TwoBounceRoomIndexEntry) => {
    if (!user) {
      setJoinError('로그인이 필요합니다.')
      return
    }
    if (joiningId) return
    setJoiningId(entry.roomId)
    setJoinError(null)
    try {
      await joinTwoBounceRoom(entry.roomId, {
        uid: user.uid,
        displayName: user.displayName ?? user.email?.split('@')[0] ?? '플레이어',
        photoURL: user.photoURL ?? undefined,
      })
      navigate(`${TWO_BOUNCE_BASE}/multi/room/${entry.roomId}`, { replace: false })
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : '참가에 실패했습니다.')
    } finally {
      setJoiningId(null)
    }
  }, [user, joiningId, navigate])

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>🏀 2 Bounce 멀티</div>
      <div className={styles.card}>
        <button className={styles.bigBtn} onClick={() => navigate(`${TWO_BOUNCE_BASE}/multi/create`)}>
          방 만들기
        </button>
        <button className={styles.bigBtn} onClick={() => navigate(`${TWO_BOUNCE_BASE}/multi/join`)}>
          방 참가 (코드 입력)
        </button>
        <button className={styles.backBtn} onClick={() => navigate(TWO_BOUNCE_BASE)}>
          ← 뒤로
        </button>
      </div>

      <div className={styles.openRoomsSection}>
        <div className={styles.openRoomsTitle}>참가 가능한 방</div>
        {joinError && <div className={styles.error}>{joinError}</div>}
        {openRooms.length === 0 ? (
          <div className={styles.emptyRooms}>현재 참가 가능한 방이 없습니다.</div>
        ) : (
          <div className={styles.roomList}>
            {openRooms.map((entry) => {
              const isJoining = joiningId === entry.roomId
              return (
                <div key={entry.roomId} className={styles.roomCard}>
                  <div className={styles.roomCardTop}>
                    <span className={styles.roomCardCode}>{entry.roomId}</span>
                    <span className={styles.roomCardElapsed}>{formatElapsed(entry.createdAt)}</span>
                  </div>
                  <div className={styles.roomCardInfo}>
                    <span className={styles.roomCardHost}>{entry.hostName}</span>
                    <span className={styles.roomCardMeta}>
                      {entry.playerCount}/{entry.maxPlayers}명 · 목표 {entry.targetGoals}골
                    </span>
                  </div>
                  <button
                    className={styles.quickJoinBtn}
                    onClick={() => handleQuickJoin(entry)}
                    disabled={isJoining || !!joiningId}
                  >
                    {isJoining ? '참가 중...' : '빠른 참가'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
