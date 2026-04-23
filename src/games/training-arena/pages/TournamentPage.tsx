import { useGameStore } from '../store/useGameStore'
import type { CharacterDef } from '../types'
import charactersRaw from '../data/characters.json'

const characters = charactersRaw as CharacterDef[]
const charName = (id: number) => {
  const c = characters.find(c => c.id === id)
  return c ? c.name : `#${id}`
}

const BRACKET_LABELS: Record<number, string> = {
  1: '16강 탈락', 2: '8강 탈락', 3: '4강 탈락', 4: '준우승',
}

export default function TournamentPage() {
  const { activeSlot, lastTournament } = useGameStore()

  if (!activeSlot || !lastTournament) return (
    <div style={s.root}>
      <p style={{ color: '#666' }}>토너먼트 데이터 없음</p>
    </div>
  )

  const pid    = activeSlot.characterId
  const result = lastTournament

  function PlayerBadge() {
    if (result.winner === pid) {
      return <span style={{ ...s.badge, background: '#ffd700', color: '#000' }}>🏆 우승!</span>
    }
    if (result.finalists.includes(pid)) {
      const r  = result.bracketEliminations[pid] ?? 0
      const label = BRACKET_LABELS[r] ?? '토너먼트 탈락'
      const bg = r === 4 ? '#b8860b' : r === 3 ? '#7c5cfc' : '#336699'
      return <span style={{ ...s.badge, background: bg }}>⚔️ {label}</span>
    }
    if (result.qualifiers.includes(pid)) {
      return <span style={{ ...s.badge, background: '#1a3366' }}>🛡 조별리그 탈락</span>
    }
    return <span style={{ ...s.badge, background: '#5c1a1a' }}>💀 예선 탈락</span>
  }

  return (
    <div style={s.root}>
      <h2 style={s.title}>토너먼트 결과</h2>
      <p style={s.sub}>Round {activeSlot.currentRound} — {charName(pid)}</p>

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
              <div style={s.groupRow}><span style={s.rank1}>1위</span> {charName(g.rank1)}</div>
              <div style={s.groupRow}><span style={s.rank2}>2위</span> {charName(g.rank2)}</div>
              <div style={s.groupRow}><span style={s.elim}>탈락</span> {charName(g.eliminated[0])}, {charName(g.eliminated[1])}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={s.winner}>🏆 우승: {charName(result.winner)} (#{result.winner})</div>

      <div style={s.btnRow}>
        <button style={s.btnBracket} onClick={() => useGameStore.setState({ phase: 'bracket' })}>
          📊 대진표 보기
        </button>
        <button style={s.btnNext} onClick={() => useGameStore.setState({ phase: 'reward' })}>
          보상 받기 →
        </button>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:        { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', gap: '1.25rem' },
  title:       { fontSize: '1.5rem', fontWeight: 700, color: '#c0aaff', margin: 0 },
  sub:         { color: '#888', margin: 0 },
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
  btnRow:      { display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' },
  btnBracket:  { background: '#1a3a5c', border: '1px solid #44aaff', borderRadius: '8px', color: '#44aaff', padding: '0.75rem 1.5rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 700 },
  btnNext:     { background: '#7c5cfc', border: 'none', borderRadius: '8px', color: '#fff', padding: '0.75rem 2.5rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 700 },
}
