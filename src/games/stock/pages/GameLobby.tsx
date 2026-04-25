import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { subscribeRoom, unsubscribeRoom, setReady, startGame } from '../utils/rtdb'
import type { Room } from '../types'
import styles from './GameLobby.module.css'

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #ff4d5e, #ff7788)',
  'linear-gradient(135deg, #3b82f6, #6ba7ff)',
  'linear-gradient(135deg, #4ade80, #86efac)',
  'linear-gradient(135deg, #ffc857, #ffd97e)',
  'linear-gradient(135deg, #9d7aff, #b79bff)',
  'linear-gradient(135deg, #5de3ff, #8eecff)',
]

function Avatar({ name, index, size = 44 }: { name: string; index: number; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length],
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.42, fontWeight: 800, color: '#0a0b12',
      flexShrink: 0, border: '2px solid rgba(255,255,255,0.12)',
    }}>
      {name?.[0] ?? '?'}
    </div>
  )
}

export default function GameLobby() {
  const { roomId } = useParams<{ roomId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [room, setRoom] = useState<Room | null>(null)
  const [copied, setCopied] = useState(false)

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
  const allReady = players.length >= 1 && players.every(p => p.uid === room.host || p.ready)
  const readyCount = players.filter(p => p.uid === room.host || p.ready).length

  async function handleReady() {
    if (!roomId || !user) return
    await setReady(roomId, user.uid, !me?.ready)
  }

  async function handleStart() {
    if (!roomId) return
    await startGame(roomId)
  }

  function handleCopy() {
    if (roomId) {
      navigator.clipboard.writeText(roomId).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  // 빈 자리 수 계산 (최대 10명)
  const MAX_PLAYERS = 10
  const emptySlots = Math.max(0, MAX_PLAYERS - players.length)
  const shownEmpty = Math.min(emptySlots, 3) // 최대 3개 빈 자리만 표시

  return (
    <div className={styles.page}>
      {/* ── 헤더 ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.logo}>📈</div>
          <div>
            <div className={styles.roomName}>주식 보드게임</div>
            <div className={styles.headerSub}>
              방 코드 <span className={styles.roomCode}>{roomId}</span>
            </div>
          </div>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.headerBtn} onClick={handleCopy}>
            {copied ? '✓ 복사됨' : '📋 코드 복사'}
          </button>
          <button
            className={styles.headerBtnDanger}
            onClick={() => navigate('/game/stock-boardgame')}
          >
            나가기
          </button>
        </div>
      </header>

      {/* ── 본문 ── */}
      <div className={styles.body}>
        {/* 플레이어 그리드 */}
        <div className={styles.playerGrid}>
          {players.map((p, i) => {
            const isMe = p.uid === user.uid
            const isHostPlayer = p.uid === room.host
            const ready = isHostPlayer || p.ready
            return (
              <div key={p.uid} className={`${styles.playerCard} ${isMe ? styles.playerCardMe : ''}`}>
                <div className={styles.playerCardRow}>
                  <Avatar name={p.name} index={i} size={44} />
                  <div className={styles.playerMeta}>
                    <div className={styles.playerNameRow}>
                      <span className={styles.playerName}>{p.name}</span>
                      {isHostPlayer && (
                        <span className={styles.chipAmber}>👑 방장</span>
                      )}
                      {isMe && (
                        <span className={styles.chipPurple}>나</span>
                      )}
                    </div>
                    <div className={styles.playerSub}>Lv.1</div>
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  {ready
                    ? <span className={styles.chipGreen}>✓ 준비 완료</span>
                    : <span className={styles.chipGhost}>⏳ 대기 중</span>
                  }
                </div>
              </div>
            )
          })}
          {Array.from({ length: shownEmpty }).map((_, i) => (
            <div key={`empty-${i}`} className={styles.playerCardEmpty}>
              <div className={styles.emptyPlus}>＋</div>
              <div className={styles.emptyText}>빈 자리</div>
            </div>
          ))}
        </div>

        {/* 규칙 패널 */}
        <div className={styles.rulesPanel}>
          <div className={styles.rulesPanelHeader}>
            <span className={styles.rulesPanelTitle}>게임 규칙</span>
          </div>
          <div className={styles.rulesGrid}>
            {[
              { k: '라운드', v: String(room.settings.rounds), s: '라운드' },
              { k: '제한 시간', v: String(room.settings.timerSeconds / 60), s: '분' },
              { k: '시작 자금', v: (room.settings.startCash / 10000).toFixed(0), s: '만원' },
              { k: '회사 수', v: room.settings.companyMode === 'auto' ? '자동' : String(room.settings.companyCount), s: '' },
            ].map(x => (
              <div key={x.k} className={styles.ruleItem}>
                <div className={styles.ruleLabel}>{x.k}</div>
                <div className={styles.ruleValue}>
                  {x.v}
                  {x.s && <span className={styles.ruleUnit}>{x.s}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA 바 */}
        <div className={styles.ctaBar}>
          <div className={styles.ctaStatus}>
            <span className={styles.ctaReadyCount}>{readyCount}/{players.length}</span>
            {' '}준비 완료
            {allReady && isHost && (
              <span className={styles.chipGreen} style={{ marginLeft: 8 }}>전원 준비!</span>
            )}
          </div>
          <div className={styles.ctaBtns}>
            {!isHost && (
              <button
                className={me?.ready ? styles.btnCancel : styles.btnReady}
                onClick={handleReady}
              >
                {me?.ready ? '🚫 준비 취소' : '✅ 준비 완료'}
              </button>
            )}
            {isHost && (
              <button
                className={styles.btnStart}
                onClick={handleStart}
                disabled={!allReady}
              >
                {allReady ? '▶ 게임 시작' : `준비 대기 중... (${readyCount}/${players.length})`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
