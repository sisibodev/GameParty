import { useEffect } from 'react'
import { useGameStore } from '../store/useGameStore'

import type { CharacterDef, SlotId } from '../types'
import type { GamePhase } from '../store/useGameStore'
import charactersRaw from '../data/characters.json'

const characters = charactersRaw as CharacterDef[]
const charName = (id: number) => characters.find(c => c.id === id)?.name ?? `#${id}`

const SLOT_IDS: SlotId[] = [1, 2, 3]

export default function SlotSelectPage() {
  const { slots, initSlots, removeSlot } = useGameStore()

  useEffect(() => { initSlots() }, [initSlots])

  function handleContinue(slotId: SlotId) {
    const slot = slots.find(s => s.slotId === slotId)
    if (!slot) return
    const phase = (slot.savedPhase as GamePhase | undefined) ?? 'gacha'
    useGameStore.setState({ activeSlot: slot, phase })
  }

  function handleNew(slotId: SlotId) {
    sessionStorage.setItem('pendingSlotId', String(slotId))
    useGameStore.setState({ phase: 'char_select' })
  }

  function handleDelete(slotId: SlotId) {
    if (confirm(`슬롯 ${slotId}을 삭제하시겠습니까?`)) removeSlot(slotId)
  }

  return (
    <div style={s.root}>
      <div style={s.header}>
        <h1 style={s.title}>배틀 그랑프리</h1>
        <button style={s.btnEncy} onClick={() => useGameStore.setState({ phase: 'encyclopedia' })}>
          📖 도감
        </button>
      </div>
      <p style={s.sub}>슬롯을 선택하세요</p>
      <div style={s.grid}>
        {SLOT_IDS.map(id => {
          const slot = slots.find(ss => ss.slotId === id)
          return (
            <div key={id} style={s.card}>
              <div style={s.slotNum}>SLOT {id}</div>
              {slot ? (
                <>
                  <div style={s.charName}>{charName(slot.characterId)}</div>
                  <div style={s.charId}>#{slot.characterId}</div>
                  <div style={s.info}>라운드 {slot.currentRound}</div>
                  {slot.bestClearRound != null && (
                    <div style={s.info}>최고 기록: R{slot.bestClearRound}</div>
                  )}
                  <div style={s.btnRow}>
                    <button style={s.btnPrimary} onClick={() => handleContinue(id)}>
                      계속하기
                    </button>
                    <button style={s.btnDanger} onClick={() => handleDelete(id)}>
                      삭제
                    </button>
                  </div>
                </>
              ) : (
                <button style={s.btnNew} onClick={() => handleNew(id)}>
                  새 게임
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:       { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff' },
  header:     { display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' },
  title:      { fontSize: '2.5rem', fontWeight: 900, letterSpacing: '0.05em', color: '#c0aaff', margin: 0 },
  btnEncy:    { background: 'transparent', border: '1px solid #555', borderRadius: '8px', color: '#aaa', padding: '0.4rem 0.9rem', cursor: 'pointer', fontSize: '0.85rem' },
  sub:        { color: '#888', marginBottom: '2rem', marginTop: 0 },
  grid:       { display: 'flex', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center' },
  card:       { background: '#1a1a2e', border: '1px solid #333', borderRadius: '12px', padding: '1.5rem', width: '220px', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' },
  slotNum:    { fontSize: '0.75rem', color: '#888', letterSpacing: '0.1em' },
  charName:   { fontSize: '1.1rem', fontWeight: 700, color: '#c0aaff' },
  charId:     { fontSize: '0.75rem', color: '#555' },
  info:       { fontSize: '0.85rem', color: '#aaa' },
  btnRow:     { display: 'flex', gap: '0.5rem', marginTop: '0.5rem' },
  btnPrimary: { background: '#7c5cfc', border: 'none', borderRadius: '6px', color: '#fff', padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 600 },
  btnDanger:  { background: '#5c1a1a', border: 'none', borderRadius: '6px', color: '#ff8888', padding: '0.5rem 0.75rem', cursor: 'pointer' },
  btnNew:     { background: 'transparent', border: '1px dashed #555', borderRadius: '8px', color: '#888', padding: '0.75rem 1.5rem', cursor: 'pointer', fontSize: '1rem', marginTop: '1rem' },
}
