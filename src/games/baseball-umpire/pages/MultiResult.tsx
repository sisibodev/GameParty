import { useEffect, useRef, useState } from 'react'
import { User } from 'firebase/auth'
import { MultiRoom, MultiPlayer, subscribeMultiRoom, unsubscribeMultiRoom } from '../utils/umpire-rtdb'

interface Props {
  roomId: string
  user: User
  onRetry: () => void
  onLobby: () => void
}

const GRADE_COLOR: Record<string, string> = {
  S: '#ffd700', A: '#4fc3f7', B: '#81c784', C: '#ffb74d', D: '#ef5350', '-': '#888',
}

export default function MultiResult({ roomId, user, onRetry, onLobby }: Props) {
  const [room, setRoom] = useState<MultiRoom | null>(null)
  const roomRef = useRef<ReturnType<typeof subscribeMultiRoom> | null>(null)

  useEffect(() => {
    roomRef.current = subscribeMultiRoom(roomId, r => setRoom(r))
    return () => { if (roomRef.current) unsubscribeMultiRoom(roomRef.current) }
  }, [roomId])

  if (!room) {
    return (
      <div style={styles.loading}>결과 집계 중...</div>
    )
  }

  const players = Object.values(room.players)
    .sort((a, b) => b.score - a.score)

  const finished = players.filter(p => p.finished).length
  const total = players.length
  const allDone = finished === total

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.title}>⚾ 멀티 배틀 결과</div>

        {!allDone && (
          <div style={styles.waiting}>
            ⏳ 결과 집계 중... ({finished}/{total}명 완료)
          </div>
        )}

        {/* 순위표 */}
        <div style={styles.rankTable}>
          <div style={styles.rankHeader}>
            <span style={styles.col0}>#</span>
            <span style={styles.col1}>플레이어</span>
            <span style={styles.col2}>등급</span>
            <span style={styles.col3}>점수</span>
            <span style={styles.col4}>정확도</span>
            <span style={styles.col5}>정답/총계</span>
            <span style={styles.col6}>최고콤보</span>
          </div>

          {players.map((p, i) => {
            const isMe = p.uid === user.uid
            return (
              <div
                key={p.uid}
                style={{
                  ...styles.rankRow,
                  background: isMe ? 'rgba(0,229,255,0.08)' : i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
                  border: isMe ? '1px solid rgba(0,229,255,0.3)' : '1px solid transparent',
                }}
              >
                <span style={{ ...styles.col0, color: i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#888', fontWeight: 900 }}>
                  {i + 1}
                </span>
                <span style={styles.col1}>
                  {p.email.split('@')[0]}
                  {isMe && <span style={styles.meTag}>나</span>}
                  {!p.finished && <span style={styles.playingTag}>진행중</span>}
                </span>
                <span style={{ ...styles.col2, color: GRADE_COLOR[p.grade] ?? '#888', fontWeight: 900 }}>
                  {p.grade}
                </span>
                <span style={{ ...styles.col3, fontWeight: 700 }}>
                  {p.finished ? p.score.toLocaleString() : '-'}
                </span>
                <span style={styles.col4}>
                  {p.finished ? `${p.accuracy.toFixed(1)}%` : '-'}
                </span>
                <span style={styles.col5}>
                  {p.finished ? `${p.correctCount}/${p.totalPitches}` : '-'}
                </span>
                <span style={styles.col6}>
                  {p.finished ? `${p.maxCombo}연속` : '-'}
                </span>
              </div>
            )
          })}
        </div>

        {/* 내 상세 결과 */}
        {(() => {
          const me = room.players[user.uid] as MultiPlayer | undefined
          if (!me?.finished) return null
          return (
            <div style={styles.myResult}>
              <div style={styles.myTitle}>내 결과</div>
              <div style={styles.myStats}>
                <MStat label="등급" value={me.grade} color={GRADE_COLOR[me.grade]} large />
                <MStat label="점수" value={me.score.toLocaleString()} />
                <MStat label="정확도" value={`${me.accuracy.toFixed(1)}%`} />
                <MStat label="최고 콤보" value={`${me.maxCombo}연속`} color="#ffcc00" />
              </div>
            </div>
          )
        })()}

        <div style={styles.buttons}>
          <button style={styles.retryBtn} onClick={onRetry}>다시 하기</button>
          <button style={styles.lobbyBtn} onClick={onLobby}>로비로</button>
        </div>
      </div>
    </div>
  )
}

function MStat({ label, value, color, large }: { label: string; value: string; color?: string; large?: boolean }) {
  return (
    <div style={styles.mStatItem}>
      <div style={{ fontSize: large ? 36 : 22, fontWeight: 900, color: color ?? '#fff' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{label}</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  loading: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0a1628 0%, #1a2e44 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#aaa', fontSize: 18, fontFamily: 'sans-serif',
  },
  wrap: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0a1628 0%, #1a2e44 100%)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: '32px 20px', fontFamily: 'sans-serif', overflowY: 'auto',
  },
  card: {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 20, padding: '28px 32px',
    color: '#fff', width: '100%', maxWidth: 680,
    display: 'flex', flexDirection: 'column', gap: 20,
  },
  title: { fontSize: 24, fontWeight: 900, textAlign: 'center', letterSpacing: 2 },
  waiting: {
    textAlign: 'center', fontSize: 14, color: '#ffb74d',
    background: 'rgba(255,183,77,0.1)', borderRadius: 8, padding: '8px 16px',
  },
  rankTable: {
    display: 'flex', flexDirection: 'column', gap: 4,
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, overflow: 'hidden',
  },
  rankHeader: {
    display: 'flex', alignItems: 'center', gap: 0,
    padding: '8px 12px', background: 'rgba(0,229,255,0.08)',
    fontSize: 11, color: '#9ecaf8', fontWeight: 700,
  },
  rankRow: {
    display: 'flex', alignItems: 'center', gap: 0,
    padding: '10px 12px', fontSize: 13, borderRadius: 0,
    transition: 'background 0.1s',
  },
  col0: { width: 28, textAlign: 'center' },
  col1: { flex: 1, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' },
  col2: { width: 44, textAlign: 'center' },
  col3: { width: 80, textAlign: 'right' },
  col4: { width: 68, textAlign: 'right' },
  col5: { width: 68, textAlign: 'right' },
  col6: { width: 72, textAlign: 'right' },
  meTag: {
    fontSize: 10, fontWeight: 700, color: '#00e5ff',
    background: 'rgba(0,229,255,0.12)', borderRadius: 4, padding: '1px 5px',
  },
  playingTag: {
    fontSize: 10, color: '#ffb74d',
    background: 'rgba(255,183,77,0.12)', borderRadius: 4, padding: '1px 5px',
  },
  myResult: {
    borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 16,
  },
  myTitle: { fontSize: 13, color: '#9ecaf8', fontWeight: 700, marginBottom: 12 },
  myStats: { display: 'flex', justifyContent: 'space-around' },
  mStatItem: { textAlign: 'center' },
  buttons: { display: 'flex', gap: 12 },
  retryBtn: {
    flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
    background: '#1976d2', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer',
  },
  lobbyBtn: {
    flex: 1, padding: '12px 0', borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.3)',
    background: 'transparent', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer',
  },
}
