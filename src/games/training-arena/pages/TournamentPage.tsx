import { useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { TournamentResult } from '../types'

type Stage = 'idle' | 'running' | 'done'

export default function TournamentPage() {
  const { activeSlot, startTournament } = useGameStore()
  const [stage, setStage]               = useState<Stage>('idle')
  const [result, setResult]             = useState<TournamentResult | null>(null)

  if (!activeSlot) return null

  const pid = activeSlot.characterId

  async function handleStart() {
    setStage('running')
    const r = await startTournament(Date.now())
    setResult(r)
    setStage('done')
  }

  function PlayerBadge() {
    if (!result) return null
    if (result.winner === pid)           return <span style={{ ...s.badge, background: '#ffd700', color: '#000' }}>🏆 우승</span>
    if (result.finalists.includes(pid))  return <span style={{ ...s.badge, background: '#7c5cfc' }}>⚔️ 토너먼트 진출</span>
    if (result.qualifiers.includes(pid)) return <span style={{ ...s.badge, background: '#336' }}>🛡 본선 진출</span>
    return <span style={{ ...s.badge, background: '#5c1a1a' }}>💀 예선 탈락</span>
  }

  return (
    <div style={s.root}>
      <h2 style={s.title}>토너먼트</h2>
      <p style={s.sub}>Round {activeSlot.currentRound} — 캐릭터 #{pid}</p>

      {stage === 'idle' && (
        <button style={s.btnStart} onClick={handleStart}>▶ 토너먼트 시작</button>
      )}

      {stage === 'running' && (
        <div style={s.running}>
          <div style={s.spinner} />
          <p>시뮬레이션 진행 중…</p>
        </div>
      )}

      {stage === 'done' && result && (
        <>
          <div style={s.resultBox}>
            <PlayerBadge />
            <div style={s.stats}>
              <div style={s.statItem}>총 경기 수<strong>{result.allMatches.length}</strong></div>
              <div style={s.statItem}>예선 통과<strong>{result.qualifiers.length}명</strong></div>
              <div style={s.statItem}>본선 진출<strong>{result.finalists.length}명</strong></div>
              <div style={s.statItem}>다크호스<strong>{result.darkhorses.length}명</strong></div>
            </div>
          </div>

          <div style={s.groupBox}>
            <h3 style={s.sectionTitle}>조별 결과</h3>
            <div style={s.groupGrid}>
              {result.groups.map(g => (
                <div
                  key={g.groupId}
                  style={{ ...s.groupCard, border: (g.rank1 === pid || g.rank2 === pid) ? '1px solid #c0aaff' : '1px solid #333' }}
                >
                  <div style={s.groupId}>조 {g.groupId}</div>
                  <div style={s.groupRow}><span style={s.rank1}>1위</span> #{g.rank1}</div>
                  <div style={s.groupRow}><span style={s.rank2}>2위</span> #{g.rank2}</div>
                  <div style={s.groupRow}><span style={s.elim}>탈락</span> #{g.eliminated[0]}, #{g.eliminated[1]}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={s.winner}>🏆 우승: 캐릭터 #{result.winner}</div>

          <button style={s.btnNext} onClick={() => useGameStore.setState({ phase: 'reward' })}>
            보상 받기 →
          </button>
        </>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:        { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', gap: '1.25rem' },
  title:       { fontSize: '1.5rem', fontWeight: 700, color: '#c0aaff', margin: 0 },
  sub:         { color: '#888', margin: 0 },
  btnStart:    { background: 'linear-gradient(135deg,#fc5c5c,#fc9c3c)', border: 'none', borderRadius: '12px', color: '#fff', padding: '1rem 3rem', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 700 },
  running:     { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', color: '#888' },
  spinner:     { width: '40px', height: '40px', border: '4px solid #333', borderTopColor: '#7c5cfc', borderRadius: '50%' },
  resultBox:   { background: '#1a1a2e', border: '1px solid #333', borderRadius: '12px', padding: '1.25rem', width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '1rem' },
  badge:       { borderRadius: '6px', padding: '4px 12px', fontWeight: 700, alignSelf: 'flex-start', color: '#fff' },
  stats:       { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' },
  statItem:    { background: '#111', borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#aaa', display: 'flex', flexDirection: 'column', gap: '2px' },
  groupBox:    { width: '100%', maxWidth: '560px' },
  sectionTitle:{ color: '#888', fontSize: '0.85rem', letterSpacing: '0.1em', margin: '0 0 0.75rem' },
  groupGrid:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: '0.5rem' },
  groupCard:   { background: '#1a1a2e', borderRadius: '8px', padding: '0.6rem 0.75rem', fontSize: '0.75rem' },
  groupId:     { fontWeight: 700, color: '#c0aaff', marginBottom: '4px' },
  groupRow:    { display: 'flex', gap: '0.4rem', alignItems: 'center', color: '#ccc', marginBottom: '2px' },
  rank1:       { color: '#ffd700', fontWeight: 700, minWidth: '20px' },
  rank2:       { color: '#aaa', fontWeight: 700, minWidth: '20px' },
  elim:        { color: '#666', minWidth: '20px' },
  winner:      { fontSize: '1.1rem', fontWeight: 700, color: '#ffd700' },
  btnNext:     { background: '#7c5cfc', border: 'none', borderRadius: '8px', color: '#fff', padding: '0.75rem 2.5rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 700 },
}
