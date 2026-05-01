import { useGameStore } from '../store/useGameStore'
import type { CharacterDef } from '../types'
import charactersRaw from '../data/characters.json'
import HeaderBar from '../components/ui/HeaderBar'
import '../styles/arena.css'

const characters = charactersRaw as CharacterDef[]
const charName = (id: number) => {
  const c = characters.find(c => c.id === id)
  return c ? c.name : `#${id}`
}

const BRACKET_LABELS: Record<number, string> = {
  1: '16강 탈락', 2: '8강 탈락', 3: '4강 탈락', 4: '준우승',
}

const badgeStyle = (color: string, bg: string, border: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 14px',
  borderRadius: 999,
  background: bg,
  border,
  color,
  fontWeight: 700,
  fontSize: 14,
})

export default function TournamentPage() {
  const { activeSlot, lastTournament, playerMatches } = useGameStore()

  if (!activeSlot || !lastTournament) return (
    <div className="arena-bg-arena" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <p style={{ color: 'var(--ink-mute)' }}>토너먼트 데이터 없음</p>
    </div>
  )

  const pid    = activeSlot.characterId
  const result = lastTournament

  function PlayerBadge() {
    // Use actual played matches — pre-run bracketEliminations can differ when player beats
    // opponents they were predicted to lose to.
    const playedMatches = playerMatches.filter(m => m.wasPlayed)
    const last = playedMatches[playedMatches.length - 1]

    if (!last) {
      return <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:999, background:'rgba(255,92,110,.1)', border:'1px solid rgba(255,92,110,.4)', color:'var(--red)', fontWeight:700, fontSize:14 }}>💀 예선 탈락</span>
    }

    const { stage, bracketRound } = last.matchResult

    if (last.playerWon) {
      if (stage === 'bracket' && (bracketRound ?? 0) >= 4) {
        return <span style={badgeStyle('var(--gold)', 'rgba(255,214,107,.15)', '1px solid rgba(255,214,107,.6)')}>우승!</span>
      }
      if (stage === 'bracket') {
        const r = bracketRound ?? 1
        const nextLabel = BRACKET_LABELS[r + 1] ?? '다음 라운드'
        return <span style={badgeStyle('var(--green)', 'rgba(94,240,168,.1)', '1px solid rgba(94,240,168,.45)')}>승리 · {nextLabel} 진출</span>
      }
      if (stage === 'group') {
        return <span style={badgeStyle('var(--green)', 'rgba(94,240,168,.1)', '1px solid rgba(94,240,168,.45)')}>본선 승리</span>
      }
      return <span style={badgeStyle('var(--green)', 'rgba(94,240,168,.1)', '1px solid rgba(94,240,168,.45)')}>예선 통과</span>
    }

    if (last.playerWon && stage === 'bracket' && (bracketRound ?? 0) >= 4) {
      return <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:999, background:'rgba(255,214,107,.15)', border:'1px solid rgba(255,214,107,.6)', color:'var(--gold)', fontWeight:700, fontSize:14 }}>🏆 우승!</span>
    }

    if (stage === 'bracket') {
      const r = bracketRound ?? 1
      const label = BRACKET_LABELS[r] ?? '토너먼트 탈락'
      return <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:999, background:'rgba(164,120,255,.15)', border:'1px solid rgba(164,120,255,.5)', color:'var(--violet-glow)', fontWeight:700, fontSize:14 }}>⚔️ {label}</span>
    }

    if (stage === 'group') {
      return <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:999, background:'rgba(103,232,249,.1)', border:'1px solid rgba(103,232,249,.4)', color:'var(--cyan)', fontWeight:700, fontSize:14 }}>🛡 조별리그 탈락</span>
    }

    return <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:999, background:'rgba(255,92,110,.1)', border:'1px solid rgba(255,92,110,.4)', color:'var(--red)', fontWeight:700, fontSize:14 }}>💀 예선 탈락</span>
  }

  return (
    <div className="arena-bg-arena" style={{ display:'flex', flexDirection:'column' as const, minHeight:'100vh' }}>
      <HeaderBar
        subtitle="TOURNAMENT RESULT"
        round={activeSlot.currentRound}
        phase={`토너먼트 결과 · ${charName(pid)}`}
      />

      <div style={{ flex:1, padding:'24px', display:'flex', flexDirection:'column' as const, gap:20, alignItems:'center' }}>
        {/* Result summary */}
        <div className="arena-panel" style={{ width:'100%', maxWidth:480, padding:24, display:'flex', flexDirection:'column' as const, gap:16 }}>
          <PlayerBadge />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {([['총 경기 수', result.allMatches.length], ['예선 통과', `${result.qualifiers.length}명`], ['본선 진출', `${result.finalists.length}명`], ['다크호스', `${result.darkhorses.length}명`]] as [string, string|number][]).map(([label, val]) => (
              <div key={label} style={{ background:'rgba(255,255,255,.03)', border:'1px solid var(--line)', borderRadius:10, padding:'10px 14px', display:'flex', flexDirection:'column' as const, gap:4 }}>
                <div style={{ fontSize:11, color:'var(--ink-mute)' }}>{label}</div>
                <div className="arena-mono" style={{ fontSize:16, fontWeight:700, color:'var(--ink)' }}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Group results */}
        <div style={{ width:'100%', maxWidth:480 }}>
          <div style={{ fontSize:11, color:'var(--ink-mute)', letterSpacing:'.1em', marginBottom:12 }}>조별 결과</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))', gap:8 }}>
            {result.groups.map(g => {
              const isMyGroup = g.rank1 === pid || g.rank2 === pid
              return (
                <div key={g.groupId} style={{ background:'rgba(26,19,48,.8)', border:`1px solid ${isMyGroup ? 'rgba(164,120,255,.5)' : 'var(--line)'}`, borderRadius:10, padding:'10px 12px', fontSize:11 }}>
                  <div style={{ fontWeight:700, color:'var(--violet-glow)', marginBottom:6 }}>조 {g.groupId}</div>
                  <div style={{ display:'flex', gap:4, color:'var(--gold)', marginBottom:2 }}><span style={{ minWidth:18 }}>1위</span>{charName(g.rank1)}</div>
                  <div style={{ display:'flex', gap:4, color:'var(--ink-dim)', marginBottom:2 }}><span style={{ minWidth:18 }}>2위</span>{charName(g.rank2)}</div>
                  {g.eliminated.map(id => (
                    <div key={id} style={{ display:'flex', gap:4, color:'var(--ink-mute)' }}><span style={{ minWidth:18 }}>탈락</span>{charName(id)}</div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ fontSize:14, fontWeight:700, color:'var(--gold)' }}>🏆 우승: {charName(result.winner)}</div>

        <div style={{ display:'flex', gap:10 }}>
          <button className="arena-btn" onClick={() => useGameStore.setState({ phase: 'bracket' })}>
            📊 대진표 보기
          </button>
          <button className="arena-btn arena-btn-primary" onClick={() => useGameStore.setState({ phase: 'reward' })}>
            보상 받기 →
          </button>
        </div>
      </div>
    </div>
  )
}
