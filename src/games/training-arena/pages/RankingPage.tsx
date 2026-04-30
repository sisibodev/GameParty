import { useGameStore } from '../store/useGameStore'
import type { CharacterDef, SaveSlot } from '../types'
import charactersRaw from '../data/characters.json'

const characters = charactersRaw as CharacterDef[]
const charName = (id: number) => characters.find(c => c.id === id)?.name ?? `#${id}`

const RANK_COLORS = ['#ffd700', '#c0c0c0', '#cd7f32']
const RANK_LABELS = ['🥇', '🥈', '🥉']

function totalStats(slot: SaveSlot): number {
  const g = slot.growthStats
  return g.vit + g.str + g.agi + g.int + g.luk
}

function totalSkills(slot: SaveSlot): number {
  return slot.initialSkills.length + slot.acquiredSkills.length
}

interface SlotCardProps {
  slot: SaveSlot
  rank: number
  isActive: boolean
}

function SlotCard({ slot, rank, isActive }: SlotCardProps) {
  const rankColor = RANK_COLORS[rank] ?? '#555'
  const g = slot.growthStats
  return (
    <div style={{ ...s.card, borderColor: isActive ? '#c0aaff' : rankColor + '66' }}>
      <div style={s.rankBadge}>
        <span style={{ fontSize: '1.6rem' }}>{RANK_LABELS[rank] ?? `#${rank + 1}`}</span>
      </div>

      <div style={s.cardBody}>
        <div style={s.slotHeader}>
          <span style={{ ...s.slotTag, borderColor: rankColor, color: rankColor }}>SLOT {slot.slotId}</span>
          {isActive && <span style={s.activeBadge}>현재 플레이 중</span>}
        </div>

        <div style={s.charInfo}>
          <span style={s.charName}>{charName(slot.characterId)}</span>
          <span style={s.charId}>#{slot.characterId}</span>
        </div>

        <div style={s.statsRow}>
          <StatBox label="현재 라운드" val={`R${slot.currentRound}`} highlight />
          <StatBox label="최고 기록"   val={slot.bestClearRound != null ? `R${slot.bestClearRound}` : '—'} />
          <StatBox label="습득 스킬"   val={`${totalSkills(slot)}개`} />
          <StatBox label="성장 스탯 합" val={`${totalStats(slot)}`} />
        </div>

        <div style={s.growthRow}>
          {(['vit', 'str', 'agi', 'int', 'luk'] as const).map(k => (
            <div key={k} style={s.growthItem}>
              <span style={s.growthLabel}>{k.toUpperCase()}</span>
              <span style={s.growthVal}>+{g[k]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatBox({ label, val, highlight }: { label: string; val: string; highlight?: boolean }) {
  return (
    <div style={s.statBox}>
      <span style={s.statLabel}>{label}</span>
      <span style={{ ...s.statVal, color: highlight ? '#c0aaff' : '#e8e8ff' }}>{val}</span>
    </div>
  )
}

function EmptySlot({ slotId }: { slotId: number }) {
  return (
    <div style={s.emptyCard}>
      <span style={s.emptySlotTag}>SLOT {slotId}</span>
      <span style={s.emptyText}>비어있음</span>
    </div>
  )
}

export default function RankingPage() {
  const { slots, activeSlot } = useGameStore()

  // Sort by bestClearRound asc (lower = cleared earlier = better), then currentRound desc
  const sorted = [...slots].sort((a, b) => {
    const aBest = a.bestClearRound ?? Infinity
    const bBest = b.bestClearRound ?? Infinity
    if (aBest !== bBest) return aBest - bBest
    return b.currentRound - a.currentRound
  })

  const emptySlotIds = ([1, 2, 3] as const).filter(id => !slots.find(s => s.slotId === id))

  return (
    <div style={s.root}>
      <div style={s.topBar}>
        <button style={s.btnBack} onClick={() => useGameStore.setState({ phase: 'slot_select' })}>
          ← 돌아가기
        </button>
        <h2 style={s.title}>슬롯 랭킹</h2>
        <span style={s.count}>{slots.length}개 슬롯</span>
      </div>

      {slots.length === 0 ? (
        <div style={s.empty}>저장된 슬롯이 없습니다.</div>
      ) : (
        <div style={s.list}>
          {sorted.map((slot, i) => (
            <SlotCard
              key={slot.slotId}
              slot={slot}
              rank={i}
              isActive={activeSlot?.slotId === slot.slotId}
            />
          ))}
          {emptySlotIds.map(id => <EmptySlot key={id} slotId={id} />)}
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:        { display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', padding: '1.5rem 1rem' },
  topBar:      { display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' },
  title:       { fontSize: '1.3rem', fontWeight: 700, color: '#c0aaff', margin: 0, flex: 1, textAlign: 'center' },
  count:       { fontSize: '0.8rem', color: '#666', minWidth: '60px', textAlign: 'right' },
  btnBack:     { background: 'transparent', border: '1px solid #444', borderRadius: '6px', color: '#aaa', padding: '0.4rem 0.8rem', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' },
  list:        { display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '500px', margin: '0 auto', width: '100%' },
  card:        { background: '#14142a', border: '1px solid', borderRadius: '12px', padding: '1rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' },
  rankBadge:   { display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '40px' },
  cardBody:    { flex: 1, display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  slotHeader:  { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  slotTag:     { fontSize: '0.65rem', fontWeight: 700, border: '1px solid', borderRadius: '4px', padding: '1px 6px', letterSpacing: '0.05em' },
  activeBadge: { fontSize: '0.62rem', background: '#1e1440', color: '#c0aaff', border: '1px solid #7c5cfc', borderRadius: '4px', padding: '1px 6px' },
  charInfo:    { display: 'flex', alignItems: 'baseline', gap: '0.5rem' },
  charName:    { fontSize: '1.1rem', fontWeight: 700, color: '#e8e8ff' },
  charId:      { fontSize: '0.75rem', color: '#555' },
  statsRow:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' },
  statBox:     { background: '#0d0d1a', borderRadius: '6px', padding: '0.4rem 0.6rem', display: 'flex', flexDirection: 'column', gap: '1px' },
  statLabel:   { fontSize: '0.62rem', color: '#555', letterSpacing: '0.04em' },
  statVal:     { fontSize: '0.9rem', fontWeight: 700 },
  growthRow:   { display: 'flex', gap: '0.4rem' },
  growthItem:  { flex: 1, background: '#0d0d1a', borderRadius: '5px', padding: '3px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  growthLabel: { fontSize: '0.55rem', color: '#555', fontWeight: 700 },
  growthVal:   { fontSize: '0.75rem', color: '#7c5cfc', fontWeight: 600 },
  emptyCard:   { background: '#0d0d1a', border: '1px dashed #2a2a3e', borderRadius: '12px', padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', opacity: 0.5 },
  emptySlotTag:{ fontSize: '0.65rem', fontWeight: 700, color: '#555', border: '1px solid #333', borderRadius: '4px', padding: '1px 6px' },
  emptyText:   { fontSize: '0.85rem', color: '#555' },
  empty:       { textAlign: 'center', color: '#555', marginTop: '3rem' },
}
