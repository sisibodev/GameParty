import { useGameStore } from '../store/useGameStore'
import type { CharacterDef, MatchResult } from '../types'
import charactersRaw from '../data/characters.json'

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
    <div style={{ ...s.matchCard, borderColor: isPlayerMatch ? '#c0aaff' : '#2a2a3e' }}>
      {ids.map(id => (
        <div
          key={id}
          style={{
            ...s.combatant,
            color: id === match.winnerId ? '#e8e8ff' : '#555',
            fontWeight: id === match.winnerId ? 700 : 400,
            background: id === pid ? '#1e1440' : 'transparent',
          }}
        >
          {id === match.winnerId && <span style={s.win}>▶</span>}
          <span style={id === pid ? s.playerName : undefined}>{charName(id)}</span>
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
    <div style={s.root}>
      <h2 style={s.title}>대진표</h2>
      <p style={s.sub}>R{activeSlot.currentRound} · {charName(pid)}</p>

      <div style={s.bracket}>
        {rounds.map((roundMatches, ri) => (
          <div key={ri} style={s.roundCol}>
            <div style={s.roundLabel}>{ROUND_LABELS[ri]}</div>
            <div style={{ ...s.matchList, justifyContent: ri === 3 ? 'center' : 'space-evenly' }}>
              {roundMatches.map((m, mi) => (
                <MatchCard key={mi} match={m} pid={pid} />
              ))}
            </div>
          </div>
        ))}

        <div style={s.roundCol}>
          <div style={s.roundLabel}>우승</div>
          <div style={{ ...s.matchList, justifyContent: 'center' }}>
            <div style={s.winnerCard}>
              🏆
              <span style={winner === pid ? s.playerName : undefined}>{charName(winner)}</span>
            </div>
          </div>
        </div>
      </div>

      <button style={s.btnNext} onClick={() => useGameStore.setState({ phase: 'reward' })}>
        보상 받기 →
      </button>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:       { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem 1rem', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', gap: '1rem' },
  title:      { fontSize: '1.5rem', fontWeight: 700, color: '#c0aaff', margin: 0 },
  sub:        { color: '#888', margin: 0, fontSize: '0.85rem' },
  bracket:    { display: 'flex', gap: '0.5rem', overflowX: 'auto', width: '100%', maxWidth: '900px', padding: '0.5rem 0' },
  roundCol:   { display: 'flex', flexDirection: 'column', minWidth: '110px', flex: '1 1 0', gap: '0.4rem' },
  roundLabel: { textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#888', letterSpacing: '0.08em', padding: '4px 0', borderBottom: '1px solid #2a2a3e' },
  matchList:  { display: 'flex', flexDirection: 'column', flex: 1, gap: '0.35rem' },
  matchCard:  { background: '#14142a', border: '1px solid', borderRadius: '6px', padding: '5px 7px', display: 'flex', flexDirection: 'column', gap: '3px' },
  combatant:  { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', padding: '2px 3px', borderRadius: '3px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
  win:        { color: '#7c5cfc', fontSize: '0.6rem', flexShrink: 0 },
  playerName: { color: '#c0aaff', fontWeight: 700 },
  winnerCard: { background: '#1a1400', border: '1px solid #ffd700', borderRadius: '8px', padding: '0.6rem 0.8rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: '#ffd700', fontWeight: 700 },
  btnNext:    { background: '#7c5cfc', border: 'none', borderRadius: '8px', color: '#fff', padding: '0.75rem 2.5rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, marginTop: '0.5rem' },
}
