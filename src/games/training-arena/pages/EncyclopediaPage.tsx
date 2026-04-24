import { useState, useEffect } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { Archetype, CharacterDef, SaveSlot } from '../types'
import charactersRaw from '../data/characters.json'

// Build charId → best score across all slots' runRecords
function buildBestScores(slots: SaveSlot[]): Record<number, number> {
  const map: Record<number, number> = {}
  for (const slot of slots) {
    for (const rec of slot.runRecords ?? []) {
      if (map[rec.characterId] === undefined || rec.score > map[rec.characterId]) {
        map[rec.characterId] = rec.score
      }
    }
  }
  return map
}

const characters = charactersRaw as CharacterDef[]

const ARCHETYPE_LABELS: Record<Archetype, string> = {
  tank:      '탱커',
  berserker: '버서커',
  assassin:  '어쌔신',
  ranger:    '레인저',
  mage:      '마법사',
  paladin:   '팔라딘',
  warrior:   '전사',
  support:   '서포터',
}

const ARCHETYPE_COLORS: Record<Archetype, string> = {
  tank:      '#4a7fc1',
  berserker: '#c14a4a',
  assassin:  '#7c5cfc',
  ranger:    '#4ac17c',
  mage:      '#c14ab0',
  paladin:   '#c1a04a',
  warrior:   '#c1714a',
  support:   '#4ab0c1',
}

const ALL_ARCHETYPES = Object.keys(ARCHETYPE_LABELS) as Archetype[]

function CharCard({ char, isNew, isLocked, isWinner, bestScore }: {
  char: CharacterDef
  isNew: boolean
  isLocked: boolean
  isWinner: boolean
  bestScore?: number
}) {
  const color = ARCHETYPE_COLORS[char.archetype]
  const b = char.baseCombat
  return (
    <div style={{ ...s.card, opacity: isLocked ? 0.35 : 1, position: 'relative' }}>
      {isLocked && <div style={s.lockOverlay}>🔒</div>}
      {isNew && !isLocked && <div style={s.newBadge}>NEW</div>}
      {isWinner && !isLocked && <div style={s.winBadge}>🏆</div>}
      {bestScore !== undefined && !isLocked && (
        <div style={s.scoreBadge}>⭐ {bestScore.toLocaleString()}pt</div>
      )}
      <div style={s.cardTop}>
        <div>
          <div style={s.charName}>{isLocked ? '???' : char.name}</div>
          <div style={{ ...s.archBadge, background: color + '33', color, borderColor: color }}>
            {ARCHETYPE_LABELS[char.archetype]}
          </div>
        </div>
        <div style={s.charId}>#{char.id}</div>
      </div>
      {!isLocked && (
        <>
          <div style={s.desc}>{char.description}</div>
          <div style={s.statGrid}>
            {([['HP', b.maxHp], ['ATK', b.atk], ['DEF', b.def], ['SPD', b.spd], ['CRIT', b.crit], ['EVA', b.eva]] as [string, number][]).map(([label, val]) => (
              <div key={label} style={s.stat}>
                <span style={s.statLabel}>{label}</span>
                <span style={s.statVal}>{val}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

interface FilterBtnProps {
  label: string
  value: Archetype | 'all'
  current: Archetype | 'all'
  onSelect: (v: Archetype | 'all') => void
  color?: string
}

function FilterBtn({ label, value, current, onSelect, color }: FilterBtnProps) {
  const active = current === value
  return (
    <button
      style={{
        ...s.filterBtn,
        background: active ? (color ? color + '33' : '#7c5cfc33') : 'transparent',
        borderColor: active ? (color ?? '#7c5cfc') : '#444',
        color: active ? (color ?? '#c0aaff') : '#888',
      }}
      onClick={() => onSelect(value)}
    >
      {label}
    </button>
  )
}

export default function EncyclopediaPage() {
  const { unlockedCharIds, newCharIds, clearNewChars, slots } = useGameStore()
  const winnerCharIds = slots.filter(s => s.bestClearRound != null).map(s => s.characterId)
  const bestScores = buildBestScores(slots)
  const [filter, setFilter] = useState<Archetype | 'all'>('all')

  useEffect(() => { clearNewChars() }, [clearNewChars])

  const filtered = filter === 'all'
    ? characters
    : characters.filter(c => c.archetype === filter)

  const unlockedCount = characters.filter(c => unlockedCharIds.includes(c.id)).length

  return (
    <div style={s.root}>
      <div style={s.topBar}>
        <button style={s.btnBack} onClick={() => useGameStore.setState({ phase: 'slot_select' })}>
          ← 돌아가기
        </button>
        <h2 style={s.title}>캐릭터 도감</h2>
        <span style={s.count}>{unlockedCount} / {characters.length}</span>
      </div>

      <div style={s.filters}>
        <FilterBtn label="전체" value="all" current={filter} onSelect={setFilter} />
        {ALL_ARCHETYPES.map(a => (
          <FilterBtn key={a} label={ARCHETYPE_LABELS[a]} value={a} current={filter} onSelect={setFilter} color={ARCHETYPE_COLORS[a]} />
        ))}
      </div>

      <div style={s.grid}>
        {filtered.map(c => (
          <CharCard
            key={c.id}
            char={c}
            isNew={newCharIds.includes(c.id)}
            isLocked={!unlockedCharIds.includes(c.id)}
            isWinner={winnerCharIds.includes(c.id)}
            bestScore={bestScores[c.id]}
          />
        ))}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:      { display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', padding: '1rem' },
  topBar:    { display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' },
  title:     { fontSize: '1.3rem', fontWeight: 700, color: '#c0aaff', margin: 0, flex: 1, textAlign: 'center' },
  count:     { fontSize: '0.8rem', color: '#666', minWidth: '60px', textAlign: 'right' },
  btnBack:   { background: 'transparent', border: '1px solid #444', borderRadius: '6px', color: '#aaa', padding: '0.4rem 0.8rem', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' },
  filters:   { display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' },
  filterBtn: { border: '1px solid', borderRadius: '20px', padding: '0.3rem 0.75rem', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 },
  grid:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' },
  card:      { background: '#14142a', border: '1px solid #2a2a3e', borderRadius: '10px', padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  cardTop:   { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  charName:  { fontSize: '1rem', fontWeight: 700, color: '#e8e8ff' },
  charId:    { fontSize: '0.7rem', color: '#444' },
  archBadge: { display: 'inline-block', fontSize: '0.68rem', fontWeight: 700, border: '1px solid', borderRadius: '4px', padding: '1px 6px', marginTop: '3px' },
  desc:      { fontSize: '0.72rem', color: '#777', lineHeight: 1.4 },
  statGrid:  { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '3px' },
  stat:      { background: '#0d0d1a', borderRadius: '4px', padding: '3px 5px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  statLabel:   { fontSize: '0.58rem', color: '#555', fontWeight: 700, letterSpacing: '0.05em' },
  statVal:     { fontSize: '0.8rem', color: '#aaa', fontWeight: 600 },
  lockOverlay: { position: 'absolute', top: '8px', right: '8px', fontSize: '0.9rem' },
  newBadge:    { position: 'absolute', top: '8px', right: '8px', fontSize: '0.6rem', background: '#ff4444', color: '#fff', padding: '1px 5px', borderRadius: '3px', fontWeight: 700 },
  winBadge:    { position: 'absolute', top: '8px', left: '8px', fontSize: '0.75rem' },
  scoreBadge:  { alignSelf: 'flex-end', fontSize: '0.65rem', color: '#ffd700', background: '#1a1500', border: '1px solid #ffd70044', borderRadius: '3px', padding: '1px 6px', fontWeight: 700 },
}
