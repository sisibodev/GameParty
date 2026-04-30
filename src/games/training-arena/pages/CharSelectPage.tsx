import { useState, useEffect } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { CharacterDef, SlotId } from '../types'
import charactersRaw from '../data/characters.json'
import HeaderBar from '../components/ui/HeaderBar'
import Portrait from '../components/ui/Portrait'
import '../styles/arena.css'

const allOriginals = (charactersRaw as CharacterDef[]).filter(c => c.ipId == null)
const TOTAL_CHARS = allOriginals.length

const ARCHETYPE_COLOR: Record<string, string> = {
  tank: '#4a9eff', warrior: '#ff6b35', mage: '#b44eff',
  assassin: '#ff4466', support: '#44ffaa', ranger: '#ffcc44',
  berserker: '#ff3333', paladin: '#ffd700',
}

const ARCHETYPE_LABEL: Record<string, string> = {
  tank: 'TANK', warrior: 'WARRIOR', berserker: 'BERSERKER',
  mage: 'MAGE', assassin: 'ASSASSIN', ranger: 'RANGER',
  paladin: 'PALADIN', support: 'SUPPORT',
}

const ARCHETYPE_INFO: Record<string, { role: string; stats: string }> = {
  tank:      { role: '방어 특화 탱커',      stats: 'DEF · HP' },
  warrior:   { role: '균형형 근접 전사',    stats: 'ATK · DEF' },
  berserker: { role: '광폭 공격 딜러',      stats: 'ATK · CRT' },
  mage:      { role: '마나 스킬 의존 딜러', stats: 'ATK · CRT' },
  assassin:  { role: '선제 회피 암살자',    stats: 'EVA · SPD' },
  ranger:    { role: '원거리 치명타 딜러',  stats: 'CRT · ATK' },
  paladin:   { role: '방어·회복 수호자',    stats: 'DEF · HP' },
  support:   { role: '아군 강화 서포터',    stats: 'SPD · HP' },
}

const STAT_COLORS: Record<string, string> = {
  HP:  'linear-gradient(90deg,#5ef0a8,#b7ff7a)',
  ATK: 'linear-gradient(90deg,#ff7ab6,#ff4466)',
  DEF: 'linear-gradient(90deg,#4a9eff,#67e8f9)',
  SPD: 'linear-gradient(90deg,#ffcc44,#f0a93a)',
  CRT: 'linear-gradient(90deg,#ff7ab6,#b44eff)',
  EVA: 'linear-gradient(90deg,#67e8f9,#a478ff)',
}

function statMax(val: number): number {
  return val > 100 ? 200 : 100
}

export default function CharSelectPage() {
  const { startNewGame, unlockedCharIds, newCharIds, clearNewChars, slots, playedCharIds } = useGameStore()
  const winnerCharIds = slots.filter(s => s.bestClearRound != null).map(s => s.characterId)
  const [selected, setSelected] = useState<number | null>(null)
  const [filter, setFilter] = useState<string>('전체')

  useEffect(() => { clearNewChars() }, [clearNewChars])

  const unlocked = allOriginals.filter(c => unlockedCharIds.includes(c.id))
  const selectedChar = allOriginals.find(c => c.id === selected)

  const presentArchetypes = Array.from(new Set(unlocked.map(c => c.archetype))).sort()
  const filterTabs = ['전체', ...presentArchetypes]

  const displayed = filter === '전체'
    ? unlocked
    : unlocked.filter(c => c.archetype === filter)

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
          display: 'flex', flexDirection: 'column', gap: 0, padding: 0,
          borderRadius: 14, cursor: 'pointer', textAlign: 'left', position: 'relative',
          border: isSelected
            ? '2px solid var(--violet)'
            : isWinner
              ? '1px solid rgba(255,214,107,.4)'
              : '1px solid var(--line)',
          background: isSelected
            ? 'linear-gradient(180deg,rgba(124,80,240,.25),rgba(60,30,120,.2))'
            : 'linear-gradient(180deg,rgba(36,26,66,.7),rgba(20,14,40,.7))',
          boxShadow: isSelected
            ? '0 0 0 1px rgba(164,120,255,.4), 0 10px 30px -10px rgba(124,80,240,.5)'
            : 'none',
          overflow: 'hidden', minWidth: 0,
        }}
        onClick={() => setSelected(char.id)}
      >
        <Portrait height={80} tone={char.id % 6} label={ARCHETYPE_LABEL[char.archetype] ?? char.archetype} />
        <div style={{ padding: '8px 10px 10px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>{char.name}</div>
          <div style={{
            display: 'inline-block', fontSize: 10, fontWeight: 700,
            padding: '2px 7px', borderRadius: 999,
            background: `${archColor}22`, border: `1px solid ${archColor}66`, color: archColor,
            textTransform: 'uppercase',
          }}>
            {char.archetype}
          </div>
        </div>
        {isWinner && (
          <div style={{ position: 'absolute', top: 6, left: 6, fontSize: 12, background: 'rgba(255,214,107,.15)', border: '1px solid rgba(255,214,107,.4)', borderRadius: 6, padding: '1px 5px' }}>🏆</div>
        )}
        {isNew && (
          <div style={{ position: 'absolute', top: 6, right: 6, fontSize: 10, background: '#ff5c6e', color: '#fff', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>NEW</div>
        )}
        {!isNew && isFirstPlay && (
          <div style={{ position: 'absolute', top: 6, right: 6, fontSize: 10, background: 'rgba(103,232,249,.15)', border: '1px solid rgba(103,232,249,.4)', color: '#67e8f9', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>첫플</div>
        )}
      </button>
    )
  }

  const archInfo  = selectedChar ? ARCHETYPE_INFO[selectedChar.archetype] : null
  const archColor = selectedChar ? (ARCHETYPE_COLOR[selectedChar.archetype] ?? '#888') : '#888'

  const statRows: Array<{ label: string; val: number }> = selectedChar ? [
    { label: 'HP',  val: selectedChar.baseCombat.maxHp },
    { label: 'ATK', val: selectedChar.baseCombat.pAtk },
    { label: 'DEF', val: selectedChar.baseCombat.pDef },
    { label: 'SPD', val: selectedChar.baseCombat.spd },
    { label: 'CRT', val: selectedChar.baseCombat.crit },
    { label: 'EVA', val: selectedChar.baseCombat.eva },
  ] : []

  return (
    <div className="arena-bg" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <HeaderBar
        subtitle="CHARACTER SELECT"
        phase="캐릭터 선택"
        onExit={() => useGameStore.setState({ phase: 'slot_select' })}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* ── 좌측: 캐릭터 그리드 (flex 7) ── */}
        <div style={{ flex: 7, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* 제목 + 해금 카운터 — 고정 */}
          <div style={{ flexShrink: 0, padding: '20px 20px 12px' }}>
            <div className="arena-kr" style={{ fontSize: 26, fontWeight: 900, color: 'var(--ink)', marginBottom: 6 }}>
              대전을 시작할 내 캐릭터를 골라라
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-mute)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span>해금 <span style={{ color: 'var(--violet-glow)', fontWeight: 700 }}>{unlocked.length}</span>/{TOTAL_CHARS}</span>
              <span style={{ color: 'var(--line-strong)' }}>·</span>
              <span>전투 승리 시 상대 캐릭터 해금</span>
              {newCharIds.length > 0 && (
                <>
                  <span style={{ color: 'var(--line-strong)' }}>·</span>
                  <span style={{ color: 'var(--red)', fontWeight: 700 }}>신규 해금 {newCharIds.length}명</span>
                </>
              )}
            </div>
          </div>

          {/* 아케타입 필터 탭 — 고정 */}
          <div style={{ flexShrink: 0, padding: '0 20px 12px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {filterTabs.map(tab => {
              const isActive = filter === tab
              const color = tab === '전체' ? 'var(--violet)' : (ARCHETYPE_COLOR[tab] ?? '#888')
              return (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  style={{
                    padding: '5px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                    cursor: 'pointer', border: `1px solid ${isActive ? color : 'var(--line)'}`,
                    background: isActive ? `${color}22` : 'transparent',
                    color: isActive ? color : 'var(--ink-mute)',
                    textTransform: 'uppercase', fontFamily: 'inherit',
                    transition: 'all .15s ease',
                  }}
                >
                  {tab === '전체' ? '전체' : (ARCHETYPE_LABEL[tab] ?? tab)}
                </button>
              )
            })}
          </div>

          {/* 캐릭터 그리드 — 스크롤 영역 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
              {displayed.map(c => <CharCard key={c.id} char={c} />)}
            </div>
          </div>
        </div>

        {/* ── 우측: 캐릭터 정보 패널 (flex 3) ── */}
        <div style={{
          flex: 3, minWidth: 300, borderLeft: '1px solid var(--line)',
          padding: 24, display: 'flex', flexDirection: 'column', gap: 14,
          background: 'rgba(10,6,20,.5)', overflowY: 'auto',
        }}>
          {selectedChar ? (
            <>
              {/* 초상화 */}
              <Portrait
                height={180}
                tone={selectedChar.id % 6}
                label={ARCHETYPE_LABEL[selectedChar.archetype] ?? selectedChar.archetype}
              />

              {/* 아케타입 레이블 + 이름 */}
              <div>
                <div style={{ fontSize: 11, color: archColor, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 4 }}>
                  ARCHETYPE · {ARCHETYPE_LABEL[selectedChar.archetype] ?? selectedChar.archetype}
                </div>
                <div className="arena-kr" style={{ fontSize: 26, color: 'var(--ink)', lineHeight: 1.1 }}>
                  {selectedChar.name}
                </div>
              </div>

              {/* 캐릭터 설명 */}
              <div style={{ fontSize: 12, color: 'var(--ink-mute)', lineHeight: 1.6 }}>
                {selectedChar.description}
              </div>

              {/* 아케타입 정보 박스 */}
              {archInfo && (
                <div style={{
                  background: `${archColor}11`, border: `1px solid ${archColor}33`,
                  borderRadius: 10, padding: '10px 14px',
                }}>
                  <div style={{ fontSize: 10, color: archColor, fontWeight: 700, letterSpacing: '.1em', marginBottom: 4 }}>
                    ARCHETYPE INFO
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-dim)', lineHeight: 1.5 }}>
                    {archInfo.role}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 2 }}>
                    주력 스탯: <span style={{ color: archColor, fontWeight: 700 }}>{archInfo.stats}</span>
                  </div>
                </div>
              )}

              <div className="arena-divider" />

              {/* 스탯 6개 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {statRows.map(({ label, val }) => (
                  <div key={label} style={{ display: 'grid', gridTemplateColumns: '36px 1fr 40px', gap: 8, alignItems: 'center' }}>
                    <div className="arena-mono" style={{ fontSize: 11, color: 'var(--ink-mute)' }}>{label}</div>
                    <div className="arena-stat-bar">
                      <div
                        className="arena-stat-fill"
                        style={{ width: `${(val / statMax(val)) * 100}%`, background: STAT_COLORS[label] }}
                      />
                    </div>
                    <div className="arena-mono" style={{ textAlign: 'right', fontSize: 12, fontWeight: 700 }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* 하단 버튼 2개 */}
              <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 8 }}>
                <button
                  className="arena-btn"
                  style={{ flex: 1, justifyContent: 'center', borderRadius: 10, padding: '11px 0', fontSize: 13 }}
                  onClick={() => useGameStore.setState({ phase: 'slot_select' })}
                >
                  ← 슬롯으로
                </button>
                <button
                  className="arena-btn arena-btn-primary"
                  style={{ flex: 2, justifyContent: 'center', borderRadius: 10, padding: '11px 0', fontSize: 14 }}
                  onClick={handleConfirm}
                >
                  {selectedChar.name} 선택 →
                </button>
              </div>
            </>
          ) : (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 12, color: 'var(--ink-mute)', fontSize: 13, textAlign: 'center',
            }}>
              <div style={{ fontSize: 32, opacity: .3 }}>⚔</div>
              <div>캐릭터를 선택하세요</div>
              <button
                className="arena-btn"
                style={{ marginTop: 8, justifyContent: 'center', borderRadius: 10, padding: '9px 20px', fontSize: 13 }}
                onClick={() => useGameStore.setState({ phase: 'slot_select' })}
              >
                ← 슬롯으로
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
