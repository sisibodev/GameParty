import { useState } from 'react'
import { User } from 'firebase/auth'
import { Difficulty, DIFFICULTY_CONFIG } from '../types'
import { createMultiRoom, joinMultiRoom } from '../utils/umpire-rtdb'

interface Props {
  user: User
  onRoomCreated: (roomId: string, difficulty: Difficulty) => void
  onRoomJoined: (roomId: string) => void
  onBack: () => void
}

export default function MultiRoomEnter({ user, onRoomCreated, onRoomJoined, onBack }: Props) {
  const [tab, setTab]           = useState<'create' | 'join'>('create')
  const [difficulty, setDiff]   = useState<Difficulty>('amateur')
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const difficulties: { id: Difficulty; emoji: string }[] = [
    { id: 'rookie',  emoji: '⭐' },
    { id: 'amateur', emoji: '⭐⭐' },
    { id: 'pro',     emoji: '⭐⭐⭐' },
    { id: 'major',   emoji: '⭐⭐⭐⭐' },
  ]

  async function handleCreate() {
    setLoading(true)
    setError('')
    try {
      const roomId = await createMultiRoom(
        user.uid,
        user.email ?? 'anonymous',
        difficulty,
      )
      onRoomCreated(roomId, difficulty)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase()
    if (!code || code.length !== 6) {
      setError('6자리 방 코드를 입력해주세요.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await joinMultiRoom(code, user.uid, user.email ?? 'anonymous')
      onRoomJoined(code)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.wrap}>
      <button style={styles.backBtn} onClick={onBack}>← 뒤로</button>

      <div style={styles.title}>⚾ 멀티 배틀</div>
      <div style={styles.subtitle}>최대 10인 · 같은 투구 판정 후 정확도 비교</div>

      {/* 탭 */}
      <div style={styles.tabs}>
        {(['create', 'join'] as const).map(t => (
          <button
            key={t}
            style={{
              ...styles.tab,
              background: tab === t ? 'rgba(0,229,255,0.15)' : 'transparent',
              borderColor: tab === t ? '#00e5ff' : 'rgba(255,255,255,0.2)',
              color: tab === t ? '#00e5ff' : '#aaa',
            }}
            onClick={() => { setTab(t); setError('') }}
          >
            {t === 'create' ? '방 만들기' : '방 참가'}
          </button>
        ))}
      </div>

      <div style={styles.panel}>
        {tab === 'create' && (
          <>
            <div style={styles.label}>난이도 선택</div>
            <div style={styles.diffRow}>
              {difficulties.map(({ id, emoji }) => {
                const c = DIFFICULTY_CONFIG[id]
                return (
                  <button
                    key={id}
                    style={{
                      ...styles.diffBtn,
                      background: difficulty === id ? 'rgba(0,229,255,0.15)' : 'rgba(255,255,255,0.05)',
                      borderColor: difficulty === id ? '#00e5ff' : 'rgba(255,255,255,0.15)',
                      color: difficulty === id ? '#00e5ff' : '#ddd',
                    }}
                    onClick={() => setDiff(id)}
                  >
                    <div style={styles.diffEmoji}>{emoji}</div>
                    <div style={styles.diffName}>{c.label}</div>
                    <div style={styles.diffSub}>{c.speedMin}~{c.speedMax}km/h</div>
                  </button>
                )
              })}
            </div>

            <button
              style={{ ...styles.actionBtn, opacity: loading ? 0.6 : 1 }}
              onClick={handleCreate}
              disabled={loading}
            >
              {loading ? '생성 중...' : '방 생성'}
            </button>
          </>
        )}

        {tab === 'join' && (
          <>
            <div style={styles.label}>방 코드 입력 (6자리)</div>
            <input
              style={styles.codeInput}
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="예: AB12CD"
              maxLength={6}
              spellCheck={false}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
            />
            <button
              style={{ ...styles.actionBtn, opacity: loading ? 0.6 : 1 }}
              onClick={handleJoin}
              disabled={loading}
            >
              {loading ? '참가 중...' : '방 참가'}
            </button>
          </>
        )}

        {error && <div style={styles.error}>{error}</div>}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0a1628 0%, #1a2e44 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    padding: '32px 20px',
    fontFamily: 'sans-serif',
  },
  backBtn: {
    position: 'absolute', top: 20, left: 20,
    background: 'none', border: '1px solid rgba(255,255,255,0.3)',
    color: '#fff', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 14,
  },
  title: { fontSize: 40, fontWeight: 900, letterSpacing: 3, marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#9ecaf8', marginBottom: 32 },
  tabs: { display: 'flex', gap: 8, marginBottom: 24 },
  tab: {
    padding: '8px 32px', borderRadius: 8, border: '1px solid',
    fontSize: 15, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
  },
  panel: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 16,
    padding: '28px 36px',
    minWidth: 360,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  label: { fontSize: 13, color: '#9ecaf8', fontWeight: 700 },
  diffRow: { display: 'flex', gap: 10 },
  diffBtn: {
    flex: 1, border: '1px solid', borderRadius: 10,
    padding: '12px 6px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
  },
  diffEmoji: { fontSize: 18, marginBottom: 4 },
  diffName: { fontSize: 13, fontWeight: 700 },
  diffSub: { fontSize: 10, color: '#aaa', marginTop: 2 },
  codeInput: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(0,229,255,0.4)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 28,
    fontWeight: 900,
    textAlign: 'center',
    padding: '10px 16px',
    letterSpacing: 8,
    outline: 'none',
    fontFamily: 'monospace',
  },
  actionBtn: {
    padding: '13px 0', borderRadius: 10, border: 'none',
    background: 'linear-gradient(90deg, #0288d1, #00e5ff)',
    color: '#000', fontSize: 16, fontWeight: 900, cursor: 'pointer',
  },
  error: {
    color: '#f44336', fontSize: 13, textAlign: 'center',
    background: 'rgba(244,67,54,0.1)', borderRadius: 6, padding: '8px 12px',
  },
}
