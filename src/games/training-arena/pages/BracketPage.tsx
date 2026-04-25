import { useGameStore } from '../store/useGameStore'
import type { CharacterDef, MatchResult } from '../types'
import charactersRaw from '../data/characters.json'
import HeaderBar from '../components/ui/HeaderBar'
import '../styles/arena.css'

const characters = charactersRaw as CharacterDef[]
const charName = (id: number) => characters.find(c => c.id === id)?.name ?? `#${id}`

const ROUND_LABELS = ['16강', '8강', '4강', '결승']

interface MatchCardProps {
  match: MatchResult
  pid: number
}

function MatchCard({ match, pid }: MatchCardProps) {
  const isPlayerMatch = match.char1Id === pid || match.char2Id === pid
  const ids = [match.char1Id, match.char2Id]
  return (
    <div style={{
      background: isPlayerMatch ? 'rgba(124,80,240,.1)' : 'rgba(20,14,40,.8)',
      border: `1px solid ${isPlayerMatch ? 'rgba(164,120,255,.5)' : 'var(--line)'}`,
      borderRadius: 8, padding: '6px 8px',
      display: 'flex', flexDirection: 'column' as const, gap: 3,
      boxShadow: isPlayerMatch ? '0 0 12px -4px rgba(164,120,255,.3)' : 'none',
    }}>
      {ids.map(id => (
        <div
          key={id}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
            padding: '2px 4px', borderRadius: 4,
            color: id === match.winnerId ? 'var(--ink)' : 'var(--ink-mute)',
            fontWeight: id === match.winnerId ? 700 : 400,
            background: id === pid ? 'rgba(124,80,240,.15)' : 'transparent',
            overflow: 'hidden', whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis',
          }}
        >
          {id === match.winnerId && <span style={{ color:'var(--violet)', fontSize:9, flexShrink:0 }}>▶</span>}
          <span style={id === pid ? { color:'var(--violet-glow)', fontWeight:700 } : undefined}>{charName(id)}</span>
        </div>
      ))}
    </div>
  )
}

export default function BracketPage() {
  const { lastTournament, activeSlot } = useGameStore()

  if (!lastTournament || !activeSlot) return null

  const pid = activeSlot.characterId
  const allMatches = lastTournament.allMatches

  // Last 15 matches are bracket: 8 (16강) + 4 (8강) + 2 (4강) + 1 (결승)
  const bm = allMatches.slice(-15)
  const rounds: MatchResult[][] = [
    bm.slice(0, 8),
    bm.slice(8, 12),
    bm.slice(12, 14),
    bm.slice(14, 15),
  ]

  const winner = lastTournament.winner

  return (
    <div className="arena-bg-arena" style={{ display:'flex', flexDirection:'column' as const, minHeight:'100vh' }}>
      <HeaderBar
        subtitle="TOURNAMENT BRACKET"
        round={activeSlot.currentRound}
        phase={`대진표 · ${charName(pid)}`}
      />

      <div style={{ flex:1, padding:'20px 16px', display:'flex', flexDirection:'column' as const, gap:20, overflowX:'auto' as const }}>
        <div style={{ display:'flex', gap:8, minWidth:600 }}>
          {rounds.map((roundMatches, ri) => (
            <div key={ri} style={{ display:'flex', flexDirection:'column' as const, flex:'1 1 0', gap:6, minWidth:110 }}>
              <div style={{ textAlign:'center' as const, fontSize:10, fontWeight:700, color:'var(--ink-mute)', letterSpacing:'.1em', padding:'4px 0', borderBottom:'1px solid var(--line)' }}>
                {ROUND_LABELS[ri]}
              </div>
              <div style={{ display:'flex', flexDirection:'column' as const, flex:1, gap:6, justifyContent: ri === 3 ? 'center' : 'space-evenly' }}>
                {roundMatches.map((m, mi) => (
                  <MatchCard key={mi} match={m} pid={pid} />
                ))}
              </div>
            </div>
          ))}

          <div style={{ display:'flex', flexDirection:'column' as const, flex:'1 1 0', gap:6, minWidth:110 }}>
            <div style={{ textAlign:'center' as const, fontSize:10, fontWeight:700, color:'var(--gold)', letterSpacing:'.1em', padding:'4px 0', borderBottom:'1px solid rgba(255,214,107,.3)' }}>
              우승
            </div>
            <div style={{ display:'flex', flexDirection:'column' as const, flex:1, justifyContent:'center', alignItems:'center' }}>
              <div style={{ background:'rgba(255,214,107,.08)', border:'1px solid rgba(255,214,107,.5)', borderRadius:10, padding:'12px 16px', display:'flex', flexDirection:'column' as const, alignItems:'center', gap:6, fontSize:13, color:'var(--gold)', fontWeight:700 }}>
                🏆
                <span style={winner === pid ? { color:'var(--violet-glow)' } : undefined}>{charName(winner)}</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
          <button className="arena-btn" onClick={() => useGameStore.setState({ phase: 'replay' })}>
            📋 전적 보기
          </button>
          <button className="arena-btn arena-btn-primary" onClick={() => useGameStore.setState({ phase: 'reward' })}>
            보상 받기 →
          </button>
        </div>
      </div>
    </div>
  )
}
