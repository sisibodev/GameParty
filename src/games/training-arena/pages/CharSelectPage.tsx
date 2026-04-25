import { useState, useEffect } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { CharacterDef, SlotId } from '../types'
import charactersRaw from '../data/characters.json'
import HeaderBar from '../components/ui/HeaderBar'
import Portrait from '../components/ui/Portrait'
import '../styles/arena.css'

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
  const selectedChar = allOriginals.find(c => c.id === selected)

  async function handleConfirm() {
    if (selected == null) return
    const slotId = Number(sessionStorage.getItem('pendingSlotId') ?? '1') as SlotId
    await startNewGame(slotId, selected, Date.now())
  }

  function CharCard({ char }: { char: CharacterDef }) {
    const isSelected  = selected === char.id
    const isNew       = newCharIds.includes(char.id)
    const isWinner    = winnerCharIds.includes(char.id)
    const isFirstPlay = !playedCharIds.includes(char.id)
    const archColor   = ARCHETYPE_COLOR[char.archetype] ?? '#888'
    return (
      <button
        style={{
          display:'flex', flexDirection:'column' as const, gap:0, padding:0,
          borderRadius:14, cursor:'pointer', textAlign:'left' as const, position:'relative' as const,
          border: isSelected ? '2px solid var(--violet)' : isWinner ? '1px solid rgba(255,214,107,.4)' : '1px solid var(--line)',
          background: isSelected ? 'linear-gradient(180deg,rgba(124,80,240,.25),rgba(60,30,120,.2))' : 'linear-gradient(180deg,rgba(36,26,66,.7),rgba(20,14,40,.7))',
          boxShadow: isSelected ? '0 0 0 1px rgba(164,120,255,.4), 0 10px 30px -10px rgba(124,80,240,.5)' : 'none',
          overflow:'hidden', minWidth:110,
        }}
        onClick={() => setSelected(char.id)}
      >
        <Portrait height={80} tone={char.id % 6} label={char.archetype}/>
        <div style={{ padding:'8px 10px 10px' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--ink)', marginBottom:4 }}>{char.name}</div>
          <div style={{ display:'inline-block', fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:999, background:`${archColor}22`, border:`1px solid ${archColor}66`, color:archColor, textTransform:'uppercase' as const }}>
            {char.archetype}
          </div>
        </div>
        {isWinner && <div style={{ position:'absolute' as const, top:6, left:6, fontSize:12, background:'rgba(255,214,107,.15)', border:'1px solid rgba(255,214,107,.4)', borderRadius:6, padding:'1px 5px' }}>🏆</div>}
        {isNew && <div style={{ position:'absolute' as const, top:6, right:6, fontSize:10, background:'#ff5c6e', color:'#fff', padding:'1px 6px', borderRadius:4, fontWeight:700 }}>NEW</div>}
        {!isNew && isFirstPlay && <div style={{ position:'absolute' as const, top:6, right:6, fontSize:10, background:'rgba(103,232,249,.15)', border:'1px solid rgba(103,232,249,.4)', color:'#67e8f9', padding:'1px 6px', borderRadius:4, fontWeight:700 }}>첫플</div>}
      </button>
    )
  }

  return (
    <div className="arena-bg" style={{ display:'flex', flexDirection:'column' as const, minHeight:'100vh' }}>
      <HeaderBar
        subtitle="CHARACTER SELECT"
        phase="캐릭터 선택"
        onExit={() => useGameStore.setState({ phase: 'slot_select' })}
      />

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        {/* Left: character grid */}
        <div style={{ flex:1, padding:'24px', overflowY:'auto' as const }}>
          <div style={{ fontSize:12, color:'var(--ink-mute)', marginBottom:16 }}>
            해금된 캐릭터 <span style={{ color:'var(--violet-glow)', fontWeight:700 }}>{unlocked.length}</span>개 · 토너먼트에서 싸운 캐릭터가 추가로 열립니다
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(110px, 1fr))', gap:12 }}>
            {unlocked.map(c => <CharCard key={c.id} char={c} />)}
          </div>
        </div>

        {/* Right: detail panel */}
        <div style={{ width:280, borderLeft:'1px solid var(--line)', padding:24, display:'flex', flexDirection:'column' as const, gap:16, background:'rgba(10,6,20,.5)' }}>
          {selectedChar ? (
            <>
              <Portrait height={160} tone={selectedChar.id % 6} label={selectedChar.archetype}/>
              <div>
                <div className="arena-kr" style={{ fontSize:22, color:'var(--ink)', marginBottom:4 }}>{selectedChar.name}</div>
                <div style={{ fontSize:12, color:'var(--ink-mute)' }}>{selectedChar.description}</div>
              </div>
              <div className="arena-divider"/>
              <div style={{ display:'flex', flexDirection:'column' as const, gap:8 }}>
                {([['HP', selectedChar.baseCombat.maxHp, 2000], ['ATK', selectedChar.baseCombat.atk, 300], ['DEF', selectedChar.baseCombat.def, 300], ['SPD', selectedChar.baseCombat.spd, 300]] as [string, number, number][]).map(([name, val, max]) => (
                  <div key={name} style={{ display:'grid', gridTemplateColumns:'40px 1fr 44px', gap:8, alignItems:'center' }}>
                    <div className="arena-mono" style={{ fontSize:11, color:'var(--ink-mute)' }}>{name}</div>
                    <div className="arena-stat-bar"><div className="arena-stat-fill" style={{ width:`${(val/max)*100}%` }}/></div>
                    <div className="arena-mono" style={{ textAlign:'right' as const, fontSize:12, fontWeight:700 }}>{val}</div>
                  </div>
                ))}
              </div>
              <button
                className="arena-btn arena-btn-primary"
                style={{ marginTop:'auto', justifyContent:'center', borderRadius:12, padding:'12px 0', fontSize:15 }}
                onClick={handleConfirm}
              >
                {selectedChar.name} 선택
              </button>
            </>
          ) : (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--ink-mute)', fontSize:13, textAlign:'center' as const }}>
              캐릭터를 선택하세요
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
