import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { GachaResult, GrowthStatKey } from '../types'

const GRADE_COLOR: Record<string, string> = {
  C: '#888', B: '#44aaff', A: '#44ffaa', S: '#ffd700', SS: '#ff9900', SSS: '#ff44aa',
}

const STAT_LABEL: Record<GrowthStatKey, string> = {
  hp: '체력', str: '힘', agi: '민첩', int: '지력', luk: '행운',
}

export default function GachaPage() {
  const { activeSlot, runGachaPhase, startTournamentAndBattle } = useGameStore()
  const [result, setResult]     = useState<GachaResult | null>(null)
  const [starting, setStarting] = useState(false)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    runGachaPhase(Date.now()).then(setResult)
  }, [runGachaPhase])

  if (!activeSlot) return null

  async function handleStart() {
    setStarting(true)
    await startTournamentAndBattle(Date.now())
  }

  const playerTotal = result?.playerGains.reduce((s, c) => s + c.statGain, 0) ?? 0

  return (
    <div style={s.root}>
      <h2 style={s.title}>라운드 강화</h2>
      <p style={s.sub}>Round {activeSlot.currentRound} — 캐릭터 스탯 자동 적용</p>

      {!result ? (
        <div style={s.loading}>강화 적용 중…</div>
      ) : (
        <>
          <div style={s.playerBox}>
            <h3 style={s.boxTitle}>내 캐릭터 강화 결과</h3>
            {result.playerGains.length === 0 ? (
              <p style={s.noGain}>이번 라운드에서 내 캐릭터 강화 없음</p>
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

          <button style={s.btnNext} disabled={starting} onClick={handleStart}>
            {starting ? '대회 준비 중…' : '⚔️ 대회 시작 →'}
          </button>
        </>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:        { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', gap: '1.25rem' },
  title:       { fontSize: '1.5rem', fontWeight: 700, color: '#c0aaff', margin: 0 },
  sub:         { color: '#888', margin: 0, fontSize: '0.9rem' },
  loading:     { color: '#888', fontSize: '1rem', marginTop: '2rem' },
  playerBox:   { background: '#1a1a2e', border: '1px solid #333', borderRadius: '12px', padding: '1.25rem', width: '100%', maxWidth: '400px' },
  boxTitle:    { fontSize: '0.95rem', fontWeight: 700, color: '#c0aaff', margin: '0 0 0.75rem' },
  noGain:      { color: '#666', margin: 0, fontSize: '0.9rem', textAlign: 'center' as const },
  totalGain:   { color: '#44ffaa', fontWeight: 700, margin: '0 0 0.5rem', fontSize: '0.9rem' },
  gainList:    { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  gainRow:     { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  gradeTag:    { border: '1px solid', borderRadius: '4px', padding: '1px 6px', fontSize: '0.75rem', fontWeight: 700, minWidth: '32px', textAlign: 'center' as const },
  gainStatKey: { color: '#ccc', fontSize: '0.85rem', flex: 1 },
  gainVal:     { color: '#44ffaa', fontWeight: 700, fontSize: '0.9rem' },
  btnNext:     { background: 'linear-gradient(135deg,#fc5c5c,#fc9c3c)', border: 'none', borderRadius: '12px', color: '#fff', padding: '1rem 3rem', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700 },
}
