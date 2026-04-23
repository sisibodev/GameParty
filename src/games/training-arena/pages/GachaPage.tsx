import { useEffect, useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { CharacterDef, GachaCard, GachaResult, GrowthStatKey } from '../types'
import charactersRaw from '../data/characters.json'

const CHARACTERS = charactersRaw as CharacterDef[]
const charName = (id: number) => CHARACTERS.find(c => c.id === id)?.name ?? `#${id}`

const GRADE_COLOR: Record<string, string> = {
  C: '#888', B: '#44aaff', A: '#44ffaa', S: '#ffd700', SS: '#ff9900', SSS: '#ff44aa',
}

const STAT_LABEL: Record<GrowthStatKey, string> = {
  hp: '체력', str: '힘', agi: '민첩', int: '지력', luk: '행운',
}

const SPEED_INTERVAL: Record<string, number> = { '1x': 80, '2x': 30, '4x': 10 }

export default function GachaPage() {
  const { activeSlot, runGachaPhase, startTournamentAndBattle } = useGameStore()
  const [result, setResult]     = useState<GachaResult | null>(null)
  const [running, setRunning]   = useState(false)
  const [revealed, setRevealed] = useState(0)
  const [speed, setSpeed]       = useState<'1x' | '2x' | '4x'>(() => {
    const v = localStorage.getItem('bgp_play_speed')
    return (v === '1x' || v === '2x' || v === '4x') ? v : '1x'
  })
  const [starting, setStarting] = useState(false)

  if (!activeSlot) return null

  const totalCards = result?.cards.length ?? 0
  const allDone    = result !== null && revealed >= totalCards

  useEffect(() => {
    if (!result || revealed >= totalCards) return
    const ms = SPEED_INTERVAL[speed]
    const id = setInterval(() => {
      setRevealed(c => {
        if (c + 1 >= totalCards) clearInterval(id)
        return c + 1
      })
    }, ms)
    return () => clearInterval(id)
  }, [result, speed, revealed >= totalCards])

  async function handlePull() {
    setRunning(true)
    const r = await runGachaPhase(Date.now())
    setResult(r)
    setRevealed(0)
    setRunning(false)
  }

  function handleSkip() {
    if (result) setRevealed(totalCards)
  }

  async function handleStartBattle() {
    setStarting(true)
    await startTournamentAndBattle(Date.now())
  }

  function buildCharSummary(cards: GachaCard[]) {
    const map: Record<number, Partial<Record<GrowthStatKey, number>>> = {}
    for (const card of cards) {
      if (!map[card.targetCharId]) map[card.targetCharId] = {}
      const prev = map[card.targetCharId][card.statKey] ?? 0
      map[card.targetCharId][card.statKey] = prev + card.statGain
    }
    return map
  }

  const visibleCards = result ? result.cards.slice(0, revealed) : []
  const playerTotal  = result?.playerGains.reduce((sum, c) => sum + c.statGain, 0) ?? 0
  const charSummary  = allDone && result ? buildCharSummary(result.cards) : null

  return (
    <div style={s.root}>
      <style>{`
        @keyframes cardPop {
          from { opacity: 0; transform: scale(0.5) translateY(6px); }
          to   { opacity: 1; transform: scale(1)   translateY(0); }
        }
      `}</style>

      <h2 style={s.title}>가챠</h2>
      <p style={s.sub}>Round {activeSlot.currentRound} — 100장 뽑기</p>

      {!result && (
        <button style={s.btnPull} disabled={running} onClick={handlePull}>
          {running ? '뽑는 중…' : '▶ 100연 가챠 시작'}
        </button>
      )}

      {result && !allDone && (
        <div style={s.controls}>
          {(['1x', '2x', '4x'] as const).map(sp => (
            <button
              key={sp}
              style={{ ...s.speedBtn, ...(speed === sp ? s.speedActive : {}) }}
              onClick={() => { setSpeed(sp); localStorage.setItem('bgp_play_speed', sp) }}
            >{sp}</button>
          ))}
          <button style={s.skipBtn} onClick={handleSkip}>스킵</button>
          <span style={s.counter}>{revealed} / {totalCards}</span>
        </div>
      )}

      {result && (
        <div style={s.cardGrid}>
          {visibleCards.map((card, i) => (
            <div
              key={i}
              style={{
                ...s.card,
                borderColor: GRADE_COLOR[card.grade] ?? '#333',
                animation: 'cardPop 0.15s ease-out both',
              }}
            >
              <span style={{ ...s.grade, color: GRADE_COLOR[card.grade] }}>{card.grade}</span>
              <span style={s.cardName}>{charName(card.targetCharId)}</span>
              <span style={s.cardStat}>{card.statKey}+{card.statGain}</span>
            </div>
          ))}
        </div>
      )}

      {allDone && result && (
        <>
          <div style={s.playerBox}>
            <h3 style={s.boxTitle}>내 캐릭터 강화 결과</h3>
            {result.playerGains.length === 0 ? (
              <p style={s.noGain}>이번 가챠에서 내 캐릭터 카드 없음</p>
            ) : (
              <>
                <p style={s.totalGain}>총 +{playerTotal} 스탯 획득</p>
                <div style={s.gainList}>
                  {result.playerGains.map((card, i) => (
                    <div key={i} style={s.gainRow}>
                      <span style={{ ...s.gradeTag, color: GRADE_COLOR[card.grade], borderColor: GRADE_COLOR[card.grade] }}>
                        {card.grade}
                      </span>
                      <span style={s.gainStatKey}>{STAT_LABEL[card.statKey]}</span>
                      <span style={s.gainVal}>+{card.statGain}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {charSummary && (
            <details style={s.details}>
              <summary style={s.detailsSummary}>전체 캐릭터 스탯 변화 보기 ({totalCards}장)</summary>
              <div style={s.summaryTable}>
                {Object.entries(charSummary)
                  .sort(([, a], [, b]) => {
                    const sumA = Object.values(a as Record<string, number>).reduce((n, v) => n + v, 0)
                    const sumB = Object.values(b as Record<string, number>).reduce((n, v) => n + v, 0)
                    return sumB - sumA
                  })
                  .map(([id, stats]) => (
                    <div key={id} style={s.summaryRow}>
                      <span style={s.summaryName}>{charName(Number(id))}</span>
                      <div style={s.summaryBadges}>
                        {(Object.entries(stats as Record<string, number>)).map(([k, v]) => (
                          <span key={k} style={s.statBadge}>{k}+{v}</span>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </details>
          )}

          <button style={s.btnNext} disabled={starting} onClick={handleStartBattle}>
            {starting ? '대회 준비 중…' : '⚔️ 대회 시작 →'}
          </button>
        </>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:          { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', gap: '1rem' },
  title:         { fontSize: '1.5rem', fontWeight: 700, color: '#c0aaff', margin: 0 },
  sub:           { color: '#888', margin: 0, fontSize: '0.9rem' },
  btnPull:       { background: 'linear-gradient(135deg,#7c5cfc,#c05cfc)', border: 'none', borderRadius: '12px', color: '#fff', padding: '1rem 3rem', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 700 },
  controls:      { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' },
  speedBtn:      { background: '#1a1a2e', border: '1px solid #444', borderRadius: '6px', color: '#aaa', padding: '4px 14px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700 },
  speedActive:   { background: '#7c5cfc', border: '1px solid #7c5cfc', color: '#fff' },
  skipBtn:       { background: 'transparent', border: '1px solid #666', borderRadius: '6px', color: '#aaa', padding: '4px 14px', cursor: 'pointer', fontSize: '0.85rem' },
  counter:       { color: '#666', fontSize: '0.8rem', marginLeft: '0.25rem' },
  cardGrid:      { display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '660px', justifyContent: 'flex-start' },
  card:          { border: '1px solid', borderRadius: '6px', padding: '4px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', width: '60px', background: '#111' },
  grade:         { fontSize: '0.75rem', fontWeight: 900, letterSpacing: '0.05em' },
  cardName:      { fontSize: '0.6rem', color: '#aaa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'center' },
  cardStat:      { fontSize: '0.6rem', color: '#ddd' },
  playerBox:     { background: '#1a1a2e', border: '1px solid #333', borderRadius: '12px', padding: '1.25rem', width: '100%', maxWidth: '420px' },
  boxTitle:      { fontSize: '0.95rem', fontWeight: 700, color: '#c0aaff', margin: '0 0 0.75rem' },
  noGain:        { color: '#666', margin: 0, fontSize: '0.9rem' },
  totalGain:     { color: '#44ffaa', fontWeight: 700, margin: '0 0 0.5rem', fontSize: '0.9rem' },
  gainList:      { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  gainRow:       { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  gradeTag:      { border: '1px solid', borderRadius: '4px', padding: '1px 6px', fontSize: '0.75rem', fontWeight: 700, minWidth: '32px', textAlign: 'center' },
  gainStatKey:   { color: '#ccc', fontSize: '0.85rem', flex: 1 },
  gainVal:       { color: '#44ffaa', fontWeight: 700, fontSize: '0.9rem' },
  details:       { width: '100%', maxWidth: '560px' },
  detailsSummary:{ color: '#666', cursor: 'pointer', fontSize: '0.8rem', padding: '0.25rem 0' },
  summaryTable:  { display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '0.5rem', maxHeight: '240px', overflowY: 'auto' },
  summaryRow:    { display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#111', borderRadius: '4px', padding: '3px 8px' },
  summaryName:   { fontSize: '0.75rem', color: '#aaa', minWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  summaryBadges: { display: 'flex', flexWrap: 'wrap', gap: '3px' },
  statBadge:     { fontSize: '0.65rem', background: '#1a1a3e', border: '1px solid #333', borderRadius: '3px', padding: '1px 5px', color: '#88bbff' },
  btnNext:       { background: 'linear-gradient(135deg,#fc5c5c,#fc9c3c)', border: 'none', borderRadius: '12px', color: '#fff', padding: '1rem 3rem', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700, marginTop: '0.5rem' },
}
