import { useState, useEffect } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { CharacterDef, SlotId } from '../types'
import charactersRaw from '../data/characters.json'

const allOriginals = (charactersRaw as CharacterDef[]).filter(c => c.ipId == null)

const ARCHETYPE_COLOR: Record<string, string> = {
  tank: '#4a9eff', warrior: '#ff6b35', mage: '#b44eff',
  assassin: '#ff4466', support: '#44ffaa', ranger: '#ffcc44',
  berserker: '#ff3333', paladin: '#ffd700',
}

export default function CharSelectPage() {
  const { startNewGame, unlockedCharIds, newCharIds, clearNewChars, slots, playedCharIds } = useGameStore()
  const winnerCharIds = slots.filter(s => s.bestClearRound != null).map(s => s.characterId)
  const [selected, setSelected] = useState<number | null>(null)

  useEffect(() => { clearNewChars() }, [clearNewChars])

  const unlocked = allOriginals.filter(c => unlockedCharIds.includes(c.id))

  async function handleConfirm() {
    if (selected == null) return
    const slotId = Number(sessionStorage.getItem('pendingSlotId') ?? '1') as SlotId
    await startNewGame(slotId, selected, Date.now())
  }

  function CharCard({ char }: { char: CharacterDef }) {
    const isSelected   = selected === char.id
    const isNew        = newCharIds.includes(char.id)
    const isWinner     = winnerCharIds.includes(char.id)
    const isFirstPlay  = !playedCharIds.includes(char.id)
    return (
      <button
        style={{
          ...s.charCard,
          border: isSelected ? '2px solid #c0aaff' : isWinner ? '1px solid #ffd70066' : '1px solid #333',
          background: isSelected ? '#2a1a4e' : '#1a1a2e',
        }}
        onClick={() => setSelected(char.id)}
      >
        <div style={{ ...s.archBadge, background: ARCHETYPE_COLOR[char.archetype] ?? '#555' }}>
          {char.archetype}
        </div>
        <div style={s.charName}>{char.name}</div>
        {isWinner && <div style={s.winBadge}>🏆</div>}
        {isNew && <div style={s.newBadge}>NEW</div>}
        {!isNew && isFirstPlay && <div style={s.firstPlayBadge}>첫플</div>}
        <div style={s.statRow}>
          <span>HP {char.baseCombat.maxHp}</span>
          <span>ATK {char.baseCombat.atk}</span>
          <span>DEF {char.baseCombat.def}</span>
          <span>SPD {char.baseCombat.spd}</span>
        </div>
      </button>
    )
  }

  return (
    <div style={s.root}>
      <div style={s.header}>
        <h2 style={s.title}>캐릭터 선택</h2>
        <button style={s.btnBack} onClick={() => useGameStore.setState({ phase: 'slot_select' })}>
          ← 뒤로
        </button>
      </div>

      <p style={s.hint}>해금된 캐릭터 {unlocked.length}개 · 토너먼트에서 싸운 캐릭터가 추가로 열립니다</p>

      <div style={s.grid}>
        {unlocked.map(c => <CharCard key={c.id} char={c} />)}
      </div>

      <div style={s.footer}>
        <button
          style={{ ...s.btnConfirm, opacity: selected == null ? 0.4 : 1 }}
          disabled={selected == null}
          onClick={handleConfirm}
        >
          {selected != null
            ? `${allOriginals.find(c => c.id === selected)?.name} 선택`
            : '캐릭터를 선택하세요'}
        </button>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:      { display: 'flex', flexDirection: 'column', padding: '1.5rem', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', paddingBottom: '6rem' },
  header:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' },
  title:     { fontSize: '1.5rem', fontWeight: 700, color: '#c0aaff', margin: 0 },
  hint:      { color: '#555', fontSize: '0.78rem', margin: '0 0 1rem' },
  grid:      { display: 'flex', gap: '0.75rem', flexWrap: 'wrap' },
  charCard:  { display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.75rem', borderRadius: '10px', cursor: 'pointer', textAlign: 'left', position: 'relative', minWidth: '130px' },
  archBadge: { fontSize: '0.65rem', color: '#fff', padding: '2px 6px', borderRadius: '4px', alignSelf: 'flex-start', textTransform: 'uppercase' },
  charName:  { fontSize: '0.9rem', fontWeight: 700, color: '#e8e8ff' },
  newBadge:      { position: 'absolute', top: '6px', right: '6px', fontSize: '0.6rem', background: '#ff4444', color: '#fff', padding: '1px 5px', borderRadius: '3px', fontWeight: 700 },
  winBadge:      { position: 'absolute', bottom: '6px', left: '6px', fontSize: '0.75rem', background: '#ffd70033', padding: '2px 4px', borderRadius: '4px' },
  firstPlayBadge:{ position: 'absolute', bottom: '6px', right: '6px', fontSize: '0.6rem', background: '#2244aa', color: '#88aaff', padding: '1px 5px', borderRadius: '3px', fontWeight: 700 },
  statRow:   { display: 'flex', gap: '0.4rem', flexWrap: 'wrap', fontSize: '0.7rem', color: '#aaa' },
  footer:    { position: 'fixed', bottom: 0, left: 0, right: 0, padding: '1rem', background: '#0d0d1a', borderTop: '1px solid #222', display: 'flex', justifyContent: 'center' },
  btnConfirm:{ background: '#7c5cfc', border: 'none', borderRadius: '8px', color: '#fff', padding: '0.75rem 3rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 700 },
  btnBack:   { background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '0.9rem' },
}
