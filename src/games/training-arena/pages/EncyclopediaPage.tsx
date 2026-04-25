import { useState, useEffect } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { Archetype, CharacterDef, SaveSlot } from '../types'
import charactersRaw from '../data/characters.json'
import '../styles/arena.css'

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
  tank:      '#67e8f9',
  berserker: '#ff5c6e',
  assassin:  '#a478ff',
  ranger:    '#5ef0a8',
  mage:      '#ff7ab6',
  paladin:   '#ffd66b',
  warrior:   '#ff9a44',
  support:   '#67e8f9',
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
    <div className="arena-panel" style={{ opacity: isLocked ? 0.4 : 1, position: 'relative' as const, padding: 14, display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
      {isLocked && <div style={{ position: 'absolute' as const, top: 8, right: 8, fontSize: 14 }}>🔒</div>}
      {isNew && !isLocked && <div style={{ position: 'absolute' as const, top: 8, right: 8, fontSize: 9, fontWeight: 700, background: 'var(--red)', color: '#fff', padding: '2px 6px', borderRadius: 3 }}>NEW</div>}
      {isWinner && !isLocked && <div style={{ position: 'absolute' as const, top: 8, left: 8, fontSize: 12 }}>🏆</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{isLocked ? '???' : char.name}</div>
          <div style={{ fontSize: 9, fontWeight: 700, border: `1px solid ${color}55`, borderRadius: 999, padding: '1px 7px', color, background: `${color}12`, alignSelf: 'flex-start' }}>
            {ARCHETYPE_LABELS[char.archetype]}
          </div>
        </div>
        <span className="arena-mono" style={{ fontSize: 10, color: 'var(--ink-mute)' }}>#{char.id}</span>
      </div>

      {!isLocked && (
        <>
          <div style={{ fontSize: 11, color: 'var(--ink-mute)', lineHeight: 1.5 }}>{char.description}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
            {([['HP', b.maxHp], ['ATK', b.atk], ['DEF', b.def], ['SPD', b.spd], ['CRIT', b.crit], ['EVA', b.eva]] as [string, number][]).map(([label, val]) => (
              <div key={label} style={{ background: 'rgba(10,6,20,.5)', borderRadius: 5, padding: '4px 6px', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 1 }}>
                <span className="arena-mono" style={{ fontSize: 8, color: 'var(--ink-mute)', fontWeight: 700, letterSpacing: '.05em' }}>{label}</span>
                <span className="arena-mono" style={{ fontSize: 12, color: 'var(--ink-dim)', fontWeight: 600 }}>{val}</span>
              </div>
            ))}
          </div>
          {bestScore !== undefined && (
            <div style={{ alignSelf: 'flex-end', fontSize: 10, color: 'var(--gold)', background: 'rgba(255,214,107,.08)', border: '1px solid rgba(255,214,107,.25)', borderRadius: 4, padding: '2px 8px', fontWeight: 700 }}>
              ⭐ {bestScore.toLocaleString()}pt
            </div>
          )}
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
  const activeColor = color ?? 'var(--violet-glow)'
  return (
    <button
      className="arena-btn"
      style={{
        padding: '4px 12px',
        fontSize: 11,
        borderRadius: 999,
        background: active ? `${activeColor}22` : 'transparent',
        borderColor: active ? activeColor : 'var(--line)',
        color: active ? activeColor : 'var(--ink-mute)',
        fontWeight: active ? 700 : 400,
      }}
      onClick={() => onSelect(value)}
    >
      {label}
    </button>
  )
}

export default function EncyclopediaPage() {
  const { unlockedCharIds, newCharIds, clearNewChars, slots, playedCharIds } = useGameStore()
  const winnerCharIds = slots.filter(s => s.bestClearRound != null).map(s => s.characterId)
  const bestScores = buildBestScores(slots)
  const [filter, setFilter] = useState<Archetype | 'all'>('all')

  useEffect(() => { clearNewChars() }, [clearNewChars])

  const filtered = filter === 'all'
    ? characters
    : characters.filter(c => c.archetype === filter)

  const unlockedCount = characters.filter(c => unlockedCharIds.includes(c.id)).length

  return (
    <div className="arena-bg" style={{ display: 'flex', flexDirection: 'column' as const, minHeight: '100vh' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--line)', background: 'rgba(10,6,20,.7)', backdropFilter: 'blur(8px)' }}>
        <button className="arena-btn" style={{ padding: '6px 14px', fontSize: 12, borderRadius: 8, whiteSpace: 'nowrap' as const }} onClick={() => useGameStore.setState({ phase: 'slot_select' })}>
          ← 돌아가기
        </button>
        <div style={{ flex: 1, textAlign: 'center' as const }}>
          <span className="arena-kr" style={{ fontSize: 16, fontWeight: 700, color: 'var(--violet-glow)' }}>캐릭터 도감</span>
        </div>
        <span className="arena-mono" style={{ fontSize: 12, color: 'var(--ink-mute)', minWidth: 60, textAlign: 'right' as const }}>{unlockedCount} / {characters.length}</span>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>
        <FilterBtn label="전체" value="all" current={filter} onSelect={setFilter} />
        {ALL_ARCHETYPES.map(a => (
          <FilterBtn key={a} label={ARCHETYPE_LABELS[a]} value={a} current={filter} onSelect={setFilter} color={ARCHETYPE_COLORS[a]} />
        ))}
      </div>

      {/* Grid */}
      <div style={{ flex: 1, padding: '20px', overflowY: 'auto' as const }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
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
    </div>
  )
}
