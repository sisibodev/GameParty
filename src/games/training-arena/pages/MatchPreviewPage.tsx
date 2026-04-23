import { useGameStore } from '../store/useGameStore'
import type { Archetype, CharacterDef } from '../types'
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

export default function MatchPreviewPage() {
  const { playerMatches, playerMatchIndex, activeSlot } = useGameStore()

  if (!activeSlot) return null

  const matchInfo = playerMatches[playerMatchIndex]
  if (!matchInfo) return null

  const { matchResult, stageLabel, opponentId } = matchInfo
  const playerChar    = findChar(activeSlot.characterId)
  const opponentChar  = findChar(opponentId)
  const playerMaxHp   = matchResult.initialHp[activeSlot.characterId] ?? 0
  const opponentMaxHp = matchResult.initialHp[opponentId] ?? 0

  const matchNum   = playerMatchIndex + 1
  const matchTotal = playerMatches.length

  return (
    <div style={s.root}>
      <div style={s.stageLabel}>{stageLabel}</div>
      <p style={s.progress}>{matchNum} / {matchTotal} 경기</p>
      <p style={s.round}>Round {activeSlot.currentRound}</p>

      <div style={s.vsRow}>
        <CharCard char={playerChar} maxHp={playerMaxHp} isPlayer />
        <div style={s.vsText}>VS</div>
        <CharCard char={opponentChar} maxHp={opponentMaxHp} />
      </div>

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
  char,
  maxHp,
  isPlayer,
}: {
  char: CharacterDef | undefined
  maxHp: number
  isPlayer?: boolean
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
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:      { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 1rem', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', gap: '1rem' },
  stageLabel:{ fontSize: '1.6rem', fontWeight: 900, color: '#ffd700', letterSpacing: '0.05em' },
  progress:  { color: '#888', margin: 0, fontSize: '0.85rem' },
  round:     { color: '#666', margin: 0, fontSize: '0.8rem' },
  vsRow:     { display: 'flex', alignItems: 'center', gap: '1.5rem', marginTop: '0.5rem' },
  vsText:    { fontSize: '1.5rem', fontWeight: 900, color: '#c0aaff' },
  charCard:  { background: '#1a1a2e', borderRadius: '12px', padding: '1.25rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', width: '140px', position: 'relative' as const },
  playerTag: { position: 'absolute' as const, top: '6px', left: '8px', fontSize: '0.65rem', fontWeight: 700, background: '#7c5cfc', borderRadius: '4px', padding: '1px 6px', color: '#fff' },
  charIcon:  { width: '72px', height: '72px', background: '#111', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  charName:  { fontSize: '0.9rem', fontWeight: 700, textAlign: 'center' as const, color: '#e8e8ff' },
  archBadge: { fontSize: '0.7rem', fontWeight: 700, borderRadius: '4px', padding: '2px 8px' },
  hpInfo:    { display: 'flex', gap: '0.4rem', alignItems: 'baseline', marginTop: '0.25rem' },
  hpLabel:   { fontSize: '0.7rem', color: '#666' },
  hpVal:     { fontSize: '0.95rem', fontWeight: 700, color: '#44ff88' },
  btnFight:  { marginTop: '1rem', background: 'linear-gradient(135deg,#fc5c5c,#fc9c3c)', border: 'none', borderRadius: '12px', color: '#fff', padding: '1rem 3.5rem', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 700 },
}
