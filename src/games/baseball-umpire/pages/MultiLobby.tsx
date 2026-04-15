import { useEffect, useRef, useState } from 'react'
import { User } from 'firebase/auth'
import { DIFFICULTY_CONFIG } from '../types'
import {
  MultiRoom,
  subscribeMultiRoom, unsubscribeMultiRoom,
  setPlayerReady, startMultiGame,
} from '../utils/umpire-rtdb'

interface Props {
  roomId: string
  user: User
  onGameStart: (room: MultiRoom) => void
  onBack: () => void
}

export default function MultiLobby({ roomId, user, onGameStart, onBack }: Props) {
  const [room, setRoom] = useState<MultiRoom | null>(null)
  const [error, setError] = useState('')
  const onGameStartRef = useRef(onGameStart)
  onGameStartRef.current = onGameStart

  useEffect(() => {
    const roomRef = subscribeMultiRoom(roomId, r => {
      if (!r) { setError('방이 사라졌습니다.'); return }
      setRoom(r)
      if (r.status === 'playing') {
        onGameStartRef.current(r)
      }
    })
    return () => unsubscribeMultiRoom(roomRef)
  }, [roomId])

  if (!room) {
    return (
      <div style={styles.loading}>
        {error || '대기실 로딩 중...'}
      </div>
    )
  }

  const players = Object.values(room.players)
  const me = room.players[user.uid]
  const isHost = room.hostUid === user.uid
  const allReady = players.length >= 2 && players.every(p => p.ready)
  const config = DIFFICULTY_CONFIG[room.difficulty]

  async function handleReady() {
    if (!me) return
    try {
      await setPlayerReady(roomId, user.uid, !me.ready)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleStart() {
    if (!isHost) return
    try {
      await startMultiGame(roomId)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div style={styles.wrap}>
      <button style={styles.backBtn} onClick={onBack}>← 나가기</button>

      <div style={styles.header}>
        <div style={styles.title}>⚾ 멀티 배틀 대기실</div>
        <div style={styles.roomCode}>
          방 코드 <span style={styles.code}>{roomId}</span>
        </div>
      </div>

      {/* 방 설정 */}
      <div style={styles.settingRow}>
        <span style={styles.settingLabel}>난이도</span>
        <span style={styles.settingValue}>{config.label}</span>
        <span style={styles.settingLabel}>속도</span>
        <span style={styles.settingValue}>{config.speedMin}~{config.speedMax} km/h</span>
        <span style={styles.settingLabel}>구종</span>
        <span style={styles.settingValue}>{config.pitchTypes.length}종</span>
      </div>

      {/* 플레이어 목록 */}
      <div style={styles.playerList}>
        <div style={styles.listTitle}>참가자 ({players.length}/10)</div>
        {players.map(p => (
          <div key={p.uid} style={styles.playerRow}>
            <span style={styles.hostBadge}>{p.uid === room.hostUid ? '👑' : '👤'}</span>
            <span style={styles.playerEmail}>{p.email}</span>
            {p.uid === user.uid && <span style={styles.meTag}>나</span>}
            <span style={{
              ...styles.readyBadge,
              background: p.ready ? 'rgba(76,175,80,0.2)' : 'rgba(150,150,150,0.15)',
              color: p.ready ? '#4caf50' : '#888',
            }}>
              {p.ready ? '✓ 준비' : '대기'}
            </span>
          </div>
        ))}
      </div>

      {/* 안내 */}
      <div style={styles.notice}>
        모든 참가자가 같은 투구를 보고 독립적으로 판정합니다.<br />
        9타자 완료 후 결과 비교 화면으로 이동합니다.
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {/* 버튼 */}
      <div style={styles.btnRow}>
        {!isHost && (
          <button
            style={{
              ...styles.readyBtn,
              background: me?.ready ? 'rgba(76,175,80,0.2)' : 'rgba(0,229,255,0.15)',
              borderColor: me?.ready ? '#4caf50' : '#00e5ff',
              color: me?.ready ? '#4caf50' : '#00e5ff',
            }}
            onClick={handleReady}
          >
            {me?.ready ? '✓ 준비 완료' : '준비'}
          </button>
        )}

        {isHost && (
          <button
            style={{
              ...styles.startBtn,
              opacity: allReady ? 1 : 0.5,
              cursor: allReady ? 'pointer' : 'not-allowed',
            }}
            onClick={handleStart}
            disabled={!allReady}
          >
            {allReady ? '▶ 게임 시작' : `시작 대기 중 (${players.filter(p => p.ready).length}/${players.length} 준비)`}
          </button>
        )}
      </div>
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
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    color: '#fff', padding: '32px 20px', fontFamily: 'sans-serif', gap: 20,
  },
  backBtn: {
    position: 'absolute', top: 20, left: 20,
    background: 'none', border: '1px solid rgba(255,255,255,0.3)',
    color: '#fff', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 14,
  },
  header: { textAlign: 'center' },
  title: { fontSize: 28, fontWeight: 900, marginBottom: 8 },
  roomCode: { fontSize: 14, color: '#aaa' },
  code: { fontSize: 20, fontWeight: 900, color: '#00e5ff', letterSpacing: 4, marginLeft: 8 },
  settingRow: {
    display: 'flex', gap: 16, alignItems: 'center',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10, padding: '10px 20px',
  },
  settingLabel: { fontSize: 12, color: '#888' },
  settingValue: { fontSize: 14, fontWeight: 700, color: '#fff' },
  playerList: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 14, padding: '16px 20px',
    width: '100%', maxWidth: 460,
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  listTitle: { fontSize: 13, color: '#9ecaf8', fontWeight: 700, marginBottom: 4 },
  playerRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 10px', borderRadius: 8,
    background: 'rgba(255,255,255,0.04)',
  },
  hostBadge: { fontSize: 16 },
  playerEmail: { flex: 1, fontSize: 14, color: '#eee' },
  meTag: {
    fontSize: 10, fontWeight: 700, color: '#00e5ff',
    background: 'rgba(0,229,255,0.12)', borderRadius: 4, padding: '1px 6px',
  },
  readyBadge: {
    fontSize: 12, fontWeight: 700, borderRadius: 5, padding: '2px 9px',
  },
  notice: {
    fontSize: 12, color: '#778', textAlign: 'center', lineHeight: 1.8,
    maxWidth: 400,
  },
  error: {
    color: '#f44336', fontSize: 13, textAlign: 'center',
    background: 'rgba(244,67,54,0.1)', borderRadius: 6, padding: '8px 16px',
  },
  btnRow: { display: 'flex', gap: 12, marginTop: 8 },
  readyBtn: {
    padding: '12px 48px', borderRadius: 10, border: '2px solid',
    fontSize: 16, fontWeight: 900, cursor: 'pointer', transition: 'all 0.15s',
  },
  startBtn: {
    padding: '12px 48px', borderRadius: 10, border: 'none',
    background: 'linear-gradient(90deg, #0288d1, #00e5ff)',
    color: '#000', fontSize: 16, fontWeight: 900,
    transition: 'opacity 0.2s',
  },
}
