import { useGameStore } from '../store/useGameStore'
import type { Archetype, CharacterDef, CombatStats, GrowthStats, TournamentResult } from '../types'
import { deriveStats } from '../engine/statDeriver'
import { NPC_BASE_GROWTH } from '../constants'
import charactersRaw from '../data/characters.json'

const CHARACTERS = charactersRaw as CharacterDef[]
const findChar = (id: number) => CHARACTERS.find(c => c.id === id)

const ARCHETYPE_COLOR: Record<Archetype, string> = {
  warrior:   '#ff6644',
  mage:      '#4488ff',
  assassin:  '#aa44ff',
  tank:      '#44dd88',
  support:   '#ffcc44',
  ranger:    '#44ffcc',
  berserker: '#ff4488',
  paladin:   '#ffddaa',
}

const ARCHETYPE_LABEL: Record<Archetype, string> = {
  warrior: '전사', mage: '마법사', assassin: '암살자', tank: '탱커',
  support: '지원', ranger: '레인저', berserker: '광전사', paladin: '팔라딘',
}

function npcGrowth(round: number): GrowthStats {
  const b = NPC_BASE_GROWTH + (round - 1)
  return { hp: b, str: b, agi: b, int: b, luk: b }
}

function getOpponentAchievement(oppId: number, t: TournamentResult): string {
  if (t.winner === oppId) return '🏆 우승'
  const br = t.bracketEliminations[oppId]
  if (br !== undefined) {
    const labels: Record<number, string> = { 4: '준우승', 3: '4강', 2: '8강', 1: '16강' }
    return labels[br] ?? `${br}라운드`
  }
  if (t.finalists.includes(oppId)) return '16강'
  if (t.qualifiers.includes(oppId)) return '본선 그룹 탈락'
  return '예선 탈락'
}

export default function MatchPreviewPage() {
  const { playerMatches, playerMatchIndex, activeSlot, lastTournament } = useGameStore()

  if (!activeSlot) return null

  const matchInfo = playerMatches[playerMatchIndex]
  if (!matchInfo) return null

  const { matchResult, stageLabel, opponentId } = matchInfo
  const pid = activeSlot.characterId

  const playerChar    = findChar(pid)
  const opponentChar  = findChar(opponentId)
  const playerMaxHp   = matchResult.initialHp[pid]   ?? 0
  const opponentMaxHp = matchResult.initialHp[opponentId] ?? 0

  const round         = activeSlot.currentRound
  const oppGrowth     = npcGrowth(round)
  const playerStats: CombatStats | null  = playerChar
    ? deriveStats(playerChar.baseCombat, activeSlot.growthStats, playerChar.archetype) : null
  const opponentStats: CombatStats | null = opponentChar
    ? deriveStats(opponentChar.baseCombat, oppGrowth, opponentChar.archetype) : null

  const achievement = lastTournament ? getOpponentAchievement(opponentId, lastTournament) : null

  const prevMatches = playerMatches.slice(0, playerMatchIndex)
  const h2h = prevMatches.filter(m => m.opponentId === opponentId)
  const h2hWins   = h2h.filter(m => m.playerWon).length
  const h2hLosses = h2h.filter(m => !m.playerWon).length

  return (
    <div style={s.root}>
      <div style={s.stageLabel}>{stageLabel}</div>
      <p style={s.progress}>{playerMatchIndex + 1} / {playerMatches.length} 경기</p>

      <div style={s.vsRow}>
        <CharCard
          char={playerChar}
          maxHp={playerMaxHp}
          stats={playerStats}
          isPlayer
        />
        <div style={s.vsText}>VS</div>
        <CharCard
          char={opponentChar}
          maxHp={opponentMaxHp}
          stats={opponentStats}
          achievement={achievement ?? undefined}
          h2hWins={h2hWins}
          h2hLosses={h2hLosses}
        />
      </div>

      {h2h.length > 0 && (
        <div style={s.h2hBanner}>
          맞대결 전적 <span style={{ color: '#44ff88' }}>{h2hWins}승</span>
          {' '}<span style={{ color: '#ff4444' }}>{h2hLosses}패</span>
        </div>
      )}

      <button
        style={s.btnFight}
        onClick={() => useGameStore.setState({ phase: 'battle' })}
      >
        ⚔️ 전투 시작
      </button>
    </div>
  )
}

function CharCard({
  char, maxHp, stats, isPlayer, achievement,
}: {
  char: CharacterDef | undefined
  maxHp: number
  stats: CombatStats | null
  isPlayer?: boolean
  achievement?: string
  h2hWins?: number
  h2hLosses?: number
}) {
  const arch  = char?.archetype ?? 'warrior'
  const color = ARCHETYPE_COLOR[arch] ?? '#888'

  return (
    <div style={{ ...s.charCard, border: isPlayer ? '2px solid #c0aaff' : '1px solid #444' }}>
      {isPlayer && <div style={s.playerTag}>나</div>}

      <div style={s.charIcon}>
        <span style={{ fontSize: '2rem' }}>🃏</span>
      </div>

      <div style={s.charName}>{char?.name ?? '???'}</div>
      <div style={{ ...s.archBadge, background: color + '33', color, border: `1px solid ${color}66` }}>
        {ARCHETYPE_LABEL[arch]}
      </div>
      <div style={s.hpInfo}>
        <span style={s.hpLabel}>HP</span>
        <span style={s.hpVal}>{maxHp.toLocaleString()}</span>
      </div>

      {stats && (
        <div style={s.statGrid}>
          <MiniStat label="공격" val={Math.round(stats.atk)} />
          <MiniStat label="방어" val={Math.round(stats.def)} />
          <MiniStat label="속도" val={Math.round(stats.spd)} />
          <MiniStat label="치명" val={`${stats.crit.toFixed(1)}%`} />
          <MiniStat label="회피" val={`${stats.eva.toFixed(1)}%`} />
        </div>
      )}

      {achievement && (
        <div style={s.achieveBadge}>{achievement}</div>
      )}
    </div>
  )
}

function MiniStat({ label, val }: { label: string; val: string | number }) {
  return (
    <div style={s.miniStat}>
      <span style={s.miniLabel}>{label}</span>
      <span style={s.miniVal}>{val}</span>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:         { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 1rem', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', gap: '1rem' },
  stageLabel:   { fontSize: '1.6rem', fontWeight: 900, color: '#ffd700', letterSpacing: '0.05em' },
  progress:     { color: '#888', margin: 0, fontSize: '0.85rem' },
  vsRow:        { display: 'flex', alignItems: 'flex-start', gap: '1.5rem', marginTop: '0.5rem' },
  vsText:       { fontSize: '1.5rem', fontWeight: 900, color: '#c0aaff', alignSelf: 'center', minWidth: '30px', textAlign: 'center' as const },
  charCard:     { background: '#1a1a2e', borderRadius: '12px', padding: '1rem 0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', width: '148px', position: 'relative' as const },
  playerTag:    { position: 'absolute' as const, top: '6px', left: '8px', fontSize: '0.65rem', fontWeight: 700, background: '#7c5cfc', borderRadius: '4px', padding: '1px 6px', color: '#fff' },
  charIcon:     { width: '64px', height: '64px', background: '#111', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  charName:     { fontSize: '0.9rem', fontWeight: 700, textAlign: 'center' as const, color: '#e8e8ff' },
  archBadge:    { fontSize: '0.7rem', fontWeight: 700, borderRadius: '4px', padding: '2px 8px' },
  hpInfo:       { display: 'flex', gap: '0.4rem', alignItems: 'baseline' },
  hpLabel:      { fontSize: '0.7rem', color: '#666' },
  hpVal:        { fontSize: '0.9rem', fontWeight: 700, color: '#44ff88' },
  statGrid:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px', width: '100%', marginTop: '2px' },
  miniStat:     { background: '#0d0d1a', borderRadius: '4px', padding: '2px 5px', display: 'flex', justifyContent: 'space-between', gap: '4px' },
  miniLabel:    { fontSize: '0.6rem', color: '#555' },
  miniVal:      { fontSize: '0.6rem', color: '#aaa', fontWeight: 700 },
  achieveBadge: { marginTop: '4px', background: '#1a2a1a', border: '1px solid #44aa66', borderRadius: '6px', padding: '3px 8px', fontSize: '0.7rem', color: '#44ff88', fontWeight: 700, textAlign: 'center' as const, width: '100%' },
  h2hBanner:    { background: '#1a1a2e', border: '1px solid #333', borderRadius: '8px', padding: '0.4rem 1.2rem', fontSize: '0.85rem', color: '#aaa' },
  btnFight:     { marginTop: '1rem', background: 'linear-gradient(135deg,#fc5c5c,#fc9c3c)', border: 'none', borderRadius: '12px', color: '#fff', padding: '1rem 3.5rem', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 700 },
}
