import { useGameStore } from '../store/useGameStore'
import type { CharacterDef } from '../types'
import charactersRaw from '../data/characters.json'

const CHARACTERS = charactersRaw as CharacterDef[]
const charName = (id: number) => CHARACTERS.find(c => c.id === id)?.name ?? `#${id}`

export default function MatchResultPage() {
  const { playerMatches, playerMatchIndex, activeSlot } = useGameStore()

  const matchInfo = playerMatches[playerMatchIndex]
  const match     = matchInfo?.matchResult

  if (!match || !activeSlot || !matchInfo) return null

  const pid    = activeSlot.characterId
  const oppId  = matchInfo.opponentId
  // match.winnerId is the authoritative source — same value shown in battle log
  const won    = match.winnerId === pid

  const lastEntry  = match.log.length > 0 ? match.log[match.log.length - 1] : null
  const myFinalHp  = Math.max(0, lastEntry ? (lastEntry.hpAfter[pid]   ?? match.initialHp[pid])   : match.initialHp[pid])
  const oppFinalHp = Math.max(0, lastEntry ? (lastEntry.hpAfter[oppId] ?? match.initialHp[oppId]) : match.initialHp[oppId])

  const totalTurns = match.log.length
  const myCrits    = match.log.filter(e => e.actorId === pid  && e.critical).length
  const oppCrits   = match.log.filter(e => e.actorId === oppId && e.critical).length
  const myEvades   = match.log.filter(e => e.targetId === pid  && e.evaded).length
  const oppEvades  = match.log.filter(e => e.targetId === oppId && e.evaded).length

  function handleNext() {
    if (won) {
      // 승리 시: 상대 스킬 학습 페이지로 이동
      useGameStore.setState({ phase: 'skill_learn' })
    } else {
      useGameStore.getState().completeMatchAndAdvance(false)
    }
  }

  return (
    <div style={s.root}>
      <div style={s.stageBar}>{matchInfo.stageLabel}</div>

      <div style={{ ...s.resultBadge, background: won ? '#1a3a1a' : '#3a1a1a', border: `2px solid ${won ? '#44ff88' : '#ff4444'}` }}>
        <span style={{ fontSize: '2.5rem' }}>{won ? '🏆' : '💀'}</span>
        <span style={{ ...s.resultText, color: won ? '#44ff88' : '#ff4444' }}>
          {won ? '승리!' : '패배'}
        </span>
      </div>

      <div style={s.matchup}>
        <span style={s.myName}>{charName(pid)}</span>
        <span style={s.vsText}>VS</span>
        <span style={s.oppName}>{charName(oppId)}</span>
      </div>

      <div style={s.statsBox}>
        <div style={s.statsHeader}>
          <span style={s.colMe}>나</span>
          <span style={s.colLabel}></span>
          <span style={s.colOpp}>상대</span>
        </div>
        <StatRow label="잔여 HP"    myVal={Math.ceil(myFinalHp)} oppVal={Math.ceil(oppFinalHp)} higher />
        <StatRow label="총 턴수"    myVal={totalTurns} oppVal={totalTurns} shared />
        <StatRow label="크리티컬"   myVal={myCrits}   oppVal={oppCrits}   higher />
        <StatRow label="회피"        myVal={myEvades}  oppVal={oppEvades}  higher />
      </div>

      <button style={won ? s.btnNext : s.btnTournament} onClick={handleNext}>
        {won ? '스킬 학습 →' : '토너먼트 결과 →'}
      </button>
    </div>
  )
}

function StatRow({
  label, myVal, oppVal, higher, shared,
}: {
  label: string
  myVal: number
  oppVal: number
  higher?: boolean
  shared?: boolean
}) {
  const myBetter  = !shared && (higher ? myVal > oppVal : myVal < oppVal)
  const oppBetter = !shared && (higher ? oppVal > myVal : oppVal < myVal)

  return (
    <div style={s.statRow}>
      <span style={{ ...s.statVal, color: myBetter ? '#44ff88' : '#ccc', textAlign: 'left' as const }}>{myVal}</span>
      <span style={s.statLabel}>{label}</span>
      <span style={{ ...s.statVal, color: oppBetter ? '#ff6644' : '#ccc', textAlign: 'right' as const }}>{oppVal}</span>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:         { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 1rem', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', gap: '1.25rem' },
  stageBar:     { fontSize: '1rem', fontWeight: 700, color: '#ffd700', letterSpacing: '0.1em' },
  resultBadge:  { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', borderRadius: '16px', padding: '1.5rem 3rem' },
  resultText:   { fontSize: '2rem', fontWeight: 900, letterSpacing: '0.05em' },
  matchup:      { display: 'flex', alignItems: 'center', gap: '1rem' },
  myName:       { color: '#c0aaff', fontWeight: 700, fontSize: '1.1rem' },
  vsText:       { color: '#555', fontWeight: 900 },
  oppName:      { color: '#ff9966', fontWeight: 700, fontSize: '1.1rem' },
  statsBox:     { background: '#1a1a2e', border: '1px solid #333', borderRadius: '12px', padding: '1rem', width: '100%', maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  statsHeader:  { display: 'flex', justifyContent: 'space-between', paddingBottom: '0.4rem', borderBottom: '1px solid #333' },
  colMe:        { color: '#c0aaff', fontWeight: 700, fontSize: '0.8rem', flex: 1, textAlign: 'left' as const },
  colLabel:     { color: '#666', fontSize: '0.75rem', flex: 1, textAlign: 'center' as const },
  colOpp:       { color: '#ff9966', fontWeight: 700, fontSize: '0.8rem', flex: 1, textAlign: 'right' as const },
  statRow:      { display: 'flex', alignItems: 'center' },
  statVal:      { fontWeight: 700, fontSize: '0.95rem', flex: 1 },
  statLabel:    { color: '#666', fontSize: '0.75rem', flex: 1, textAlign: 'center' as const },
  btnNext:      { background: '#7c5cfc', border: 'none', borderRadius: '10px', color: '#fff', padding: '0.85rem 2.5rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, marginTop: '0.5rem' },
  btnTournament:{ background: '#1a3a5c', border: '1px solid #44aaff', borderRadius: '10px', color: '#44aaff', padding: '0.85rem 2.5rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, marginTop: '0.5rem' },
}
