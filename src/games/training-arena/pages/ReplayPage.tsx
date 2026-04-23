import { useState, useMemo } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { CharacterDef, MatchResult, MatchLogEntry, SkillDef } from '../types'
import charactersRaw from '../data/characters.json'
import skillsRaw from '../data/skills.json'

const charById = Object.fromEntries(
  (charactersRaw as CharacterDef[]).map(c => [c.id, c])
)
const skillById = Object.fromEntries(
  (skillsRaw as SkillDef[]).map(s => [s.id, s])
)

const BRACKET_COUNT = 15
const GROUP_COUNT_MATCHES = 40  // 8 groups × 5 matches

function getMatchStage(idx: number, total: number): string {
  const bracketStart = total - BRACKET_COUNT
  const groupStart   = total - BRACKET_COUNT - GROUP_COUNT_MATCHES

  if (idx >= bracketStart) {
    const bi = idx - bracketStart
    if (bi < 8)  return '16강'
    if (bi < 12) return '8강'
    if (bi < 14) return '4강'
    return '결승'
  }
  if (idx >= groupStart) {
    const gi       = idx - groupStart
    const groupIdx = Math.floor(gi / 5)
    return `본선 ${String.fromCharCode(65 + groupIdx)}조`
  }
  return '예선'
}

function getStageColor(stage: string): string {
  if (stage === '결승') return '#ffd700'
  if (stage === '4강')  return '#ff9944'
  if (stage === '8강')  return '#ff7766'
  if (stage === '16강') return '#c0aaff'
  if (stage.startsWith('본선')) return '#4ab0c1'
  return '#666'
}

function formatEntry(entry: MatchLogEntry): string {
  if (entry.evaded) return '회피'
  const skill = entry.skillId ? skillById[entry.skillId]?.name : null
  const crit  = entry.critical ? ' 💥' : ''
  if (skill) return `[${skill}] -${entry.damage}${crit}`
  return `공격 -${entry.damage}${crit}`
}

interface TurnLogProps {
  match: MatchResult
}

function TurnLog({ match }: TurnLogProps) {
  const winnerName = charById[match.winnerId]?.name ?? `#${match.winnerId}`

  return (
    <div style={s.logBox}>
      <div style={s.logSummary}>
        {match.totalTurns}턴 · 승자: <span style={{ color: '#c0aaff' }}>{winnerName}</span>
      </div>
      <div style={s.logScroll}>
        {match.log.map((entry, i) => {
          const actor    = charById[entry.actorId]?.name  ?? `#${entry.actorId}`
          const target   = charById[entry.targetId]?.name ?? `#${entry.targetId}`
          const hpBefore = entry.hpAfter[entry.targetId] + entry.damage
          const hpAfter  = entry.hpAfter[entry.targetId]

          return (
            <div key={i} style={s.logRow}>
              <span style={s.turnNum}>T{entry.turn}</span>
              <span style={s.logActor}>{actor}</span>
              <span style={s.logArrow}>→</span>
              <span style={s.logTarget}>{target}</span>
              <span style={s.logAction}>{formatEntry(entry)}</span>
              <span style={s.hpChain}>
                {hpBefore}<span style={{ color: '#444' }}>→</span>{hpAfter}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface MatchRowProps {
  match: MatchResult
  origIdx: number
  total: number
  playerId?: number
}

function MatchRow({ match, origIdx, total, playerId }: MatchRowProps) {
  const [open, setOpen] = useState(false)
  const stage = getMatchStage(origIdx, total)

  const c1Name = charById[match.char1Id]?.name ?? `#${match.char1Id}`
  const c2Name = charById[match.char2Id]?.name ?? `#${match.char2Id}`
  const isPlayerMatch = match.char1Id === playerId || match.char2Id === playerId
  const playerWon     = match.winnerId === playerId

  return (
    <div style={{ ...s.matchRow, borderColor: isPlayerMatch ? '#7c5cfc66' : '#2a2a3e' }}>
      <button style={s.matchHeader} onClick={() => setOpen(v => !v)}>
        <span style={{ ...s.stageBadge, color: getStageColor(stage) }}>{stage}</span>
        <span style={s.vsLine}>
          <span style={{ color: match.winnerId === match.char1Id ? '#e8e8ff' : '#555', fontWeight: match.winnerId === match.char1Id ? 700 : 400 }}>
            {c1Name}
          </span>
          <span style={{ color: '#444', margin: '0 0.35rem' }}>vs</span>
          <span style={{ color: match.winnerId === match.char2Id ? '#e8e8ff' : '#555', fontWeight: match.winnerId === match.char2Id ? 700 : 400 }}>
            {c2Name}
          </span>
        </span>
        {isPlayerMatch && (
          <span style={{ ...s.resultBadge, background: playerWon ? '#1a4a2a' : '#4a1a1a', color: playerWon ? '#4ac17c' : '#ff5555' }}>
            {playerWon ? '승' : '패'}
          </span>
        )}
        <span style={s.chevron}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <TurnLog match={match} />}
    </div>
  )
}

export default function ReplayPage() {
  const lastTournament = useGameStore(s => s.lastTournament)
  const activeSlot     = useGameStore(s => s.activeSlot)
  const [showAll, setShowAll] = useState(false)

  if (!lastTournament) {
    return (
      <div style={s.root}>
        <div style={s.topBar}>
          <button style={s.btnBack} onClick={() => useGameStore.setState({ phase: 'bracket' })}>
            ← 돌아가기
          </button>
          <h2 style={s.title}>전투 기록</h2>
        </div>
        <div style={s.empty}>기록이 없습니다. 토너먼트를 먼저 진행해주세요.</div>
      </div>
    )
  }

  const pid     = activeSlot?.characterId
  const matches = lastTournament.allMatches
  const total   = matches.length

  const indexed = useMemo(
    () => matches.map((match, origIdx) => ({ match, origIdx })),
    [matches],
  )

  const displayed = useMemo(
    () => showAll
      ? indexed
      : indexed.filter(({ match: m }) => m.char1Id === pid || m.char2Id === pid),
    [indexed, showAll, pid],
  )

  const playerCount = useMemo(
    () => matches.filter(m => m.char1Id === pid || m.char2Id === pid).length,
    [matches, pid],
  )

  return (
    <div style={s.root}>
      <div style={s.topBar}>
        <button style={s.btnBack} onClick={() => useGameStore.setState({ phase: 'bracket' })}>
          ← 돌아가기
        </button>
        <h2 style={s.title}>전투 기록</h2>
        <span style={s.meta}>R{lastTournament.round} · {total}경기</span>
      </div>

      <div style={s.toggle}>
        <button
          style={{ ...s.toggleBtn, ...(showAll ? {} : s.toggleActive) }}
          onClick={() => setShowAll(false)}
        >
          내 경기 ({playerCount})
        </button>
        <button
          style={{ ...s.toggleBtn, ...(showAll ? s.toggleActive : {}) }}
          onClick={() => setShowAll(true)}
        >
          전체 ({total})
        </button>
      </div>

      <div style={s.list}>
        {displayed.map(({ match, origIdx }) => (
          <MatchRow
            key={match.matchId}
            match={match}
            origIdx={origIdx}
            total={total}
            playerId={pid}
          />
        ))}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:        { display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', padding: '1rem' },
  topBar:      { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' },
  title:       { fontSize: '1.2rem', fontWeight: 700, color: '#c0aaff', margin: 0, flex: 1, textAlign: 'center' },
  meta:        { fontSize: '0.75rem', color: '#555', minWidth: '80px', textAlign: 'right' },
  btnBack:     { background: 'transparent', border: '1px solid #333', borderRadius: '6px', color: '#aaa', padding: '0.35rem 0.7rem', cursor: 'pointer', fontSize: '0.82rem', whiteSpace: 'nowrap' },
  toggle:      { display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' },
  toggleBtn:   { flex: 1, background: 'transparent', border: '1px solid #333', borderRadius: '6px', color: '#555', padding: '0.4rem 0.6rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 },
  toggleActive:{ borderColor: '#7c5cfc', color: '#c0aaff', background: '#7c5cfc1a' },
  list:        { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  empty:       { textAlign: 'center', color: '#555', marginTop: '4rem', fontSize: '0.9rem' },

  matchRow:    { background: '#14142a', border: '1px solid', borderRadius: '8px', overflow: 'hidden' },
  matchHeader: { width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.75rem', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: '#e8e8ff' },
  stageBadge:  { fontSize: '0.68rem', fontWeight: 700, minWidth: '60px', flexShrink: 0 },
  vsLine:      { flex: 1, fontSize: '0.8rem', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
  resultBadge: { fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: '3px', flexShrink: 0 },
  chevron:     { fontSize: '0.6rem', color: '#444', flexShrink: 0 },

  logBox:      { borderTop: '1px solid #1e1e30', padding: '0.6rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  logSummary:  { fontSize: '0.72rem', color: '#888' },
  logScroll:   { display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '260px', overflowY: 'auto' },
  logRow:      { display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.7rem', padding: '2px 0', borderBottom: '1px solid #161622' },
  turnNum:     { color: '#444', minWidth: '26px', flexShrink: 0 },
  logActor:    { color: '#aaa', minWidth: '64px', flexShrink: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
  logArrow:    { color: '#333', flexShrink: 0 },
  logTarget:   { color: '#888', minWidth: '64px', flexShrink: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
  logAction:   { flex: 1, color: '#e8e8ff', fontSize: '0.68rem' },
  hpChain:     { color: '#666', fontSize: '0.65rem', flexShrink: 0, minWidth: '64px', textAlign: 'right' },
}
