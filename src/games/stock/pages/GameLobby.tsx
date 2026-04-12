import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { subscribeRoom, unsubscribeRoom, setReady, startGame } from '../utils/rtdb'
import type { Room } from '../types'
import styles from './GameLobby.module.css'

export default function GameLobby() {
  const { roomId } = useParams<{ roomId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [room, setRoom] = useState<Room | null>(null)

  useEffect(() => {
    if (!roomId) return
    const roomRef = subscribeRoom(roomId, r => {
      if (r === null) { navigate('/game/stock-boardgame'); return }
      if (r.status === 'playing') {
        navigate(`/game/stock-boardgame/room/${roomId}/play`)
        return
      }
      setRoom(r)
    })
    return () => unsubscribeRoom(roomRef)
  }, [roomId, navigate])

  if (!room || !user) {
    return <div className={styles.loading}>로딩 중...</div>
  }

  const players = Object.values(room.players)
  const me = room.players[user.uid]
  const isHost = room.host === user.uid
  const allReady = players.length >= 2 && players.every(p => p.uid === room.host || p.ready)

  async function handleReady() {
    if (!roomId || !user) return
    await setReady(roomId, user.uid, !me?.ready)
  }

  async function handleStart() {
    if (!roomId) return
    await startGame(roomId)
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/game/stock-boardgame')}>← 나가기</button>
        <h1 className={styles.title}>📈 주식 보드게임</h1>
        <div className={styles.roomCode}>방 코드: <strong>{roomId}</strong></div>
      </div>

      <div className={styles.body}>
        {/* 설정 요약 */}
        <div className={styles.settingsCard}>
          <h2 className={styles.sectionTitle}>방 설정</h2>
          <div className={styles.settingRow}>
            <span>라운드</span><strong>{room.settings.rounds}라운드</strong>
          </div>
          <div className={styles.settingRow}>
            <span>제한 시간</span><strong>{room.settings.timerSeconds / 60}분</strong>
          </div>
          <div className={styles.settingRow}>
            <span>시작 자금</span><strong>₩{room.settings.startCash.toLocaleString()}</strong>
          </div>
          <div className={styles.settingRow}>
            <span>회사 수</span><strong>{room.settings.companyMode === 'auto' ? '자동' : `${room.settings.companyCount}개`}</strong>
          </div>
        </div>

        {/* 플레이어 목록 */}
        <div className={styles.playersCard}>
          <h2 className={styles.sectionTitle}>플레이어 ({players.length}/8)</h2>
          <div className={styles.playerList}>
            {players.map(p => (
              <div key={p.uid} className={styles.playerRow}>
                <div className={styles.playerInfo}>
                  {p.photoURL
                    ? <img src={p.photoURL} className={styles.avatar} alt="" />
                    : <div className={styles.avatarFallback}>{p.name[0]}</div>
                  }
                  <span className={styles.playerName}>{p.name}</span>
                  {p.uid === room.host && <span className={styles.hostBadge}>방장</span>}
                </div>
                <span className={p.uid === room.host || p.ready ? styles.readyBadge : styles.waitBadge}>
                  {p.uid === room.host ? '방장' : p.ready ? '준비 완료' : '대기 중'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 버튼 영역 */}
        <div className={styles.actions}>
          {isHost ? (
            <button
              className={styles.startBtn}
              onClick={handleStart}
              disabled={!allReady}
            >
              {allReady ? '게임 시작!' : `모든 플레이어 준비 대기 중... (${players.filter(p => p.uid === room.host || p.ready).length}/${players.length})`}
            </button>
          ) : (
            <button
              className={me?.ready ? styles.cancelReadyBtn : styles.readyBtn}
              onClick={handleReady}
            >
              {me?.ready ? '준비 취소' : '준비 완료'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
