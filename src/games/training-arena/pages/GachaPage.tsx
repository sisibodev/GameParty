import { useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { GachaCard, GachaResult } from '../types'

const GRADE_COLOR: Record<string, string> = {
  C: '#888', B: '#44aaff', A: '#44ffaa', S: '#ffd700', SS: '#ff9900', SSS: '#ff44aa',
}

export default function GachaPage() {
  const { activeSlot, runGachaPhase } = useGameStore()
  const [result, setResult]           = useState<GachaResult | null>(null)
  const [running, setRunning]         = useState(false)

  if (!activeSlot) return null

  async function handlePull() {
    setRunning(true)
    const r = await runGachaPhase(Date.now())
    setResult(r)
    setRunning(false)
  }

  function GradeTag({ card }: { card: GachaCard }) {
    return (
      <span style={{ ...s.gradeTag, color: GRADE_COLOR[card.grade] ?? '#888', borderColor: GRADE_COLOR[card.grade] ?? '#888' }}>
        {card.grade}
      </span>
    )
  }

  return (
    <div style={s.root}>
      <h2 style={s.title}>가챠</h2>
      <p style={s.sub}>Round {activeSlot.currentRound} — 100장 뽑기</p>

      {!result ? (
        <button style={s.btnPull} disabled={running} onClick={handlePull}>
          {running ? '뽑는 중…' : '▶ 가챠 뽑기'}
        </button>
      ) : (
        <>
          <div style={s.summary}>
            <h3 style={s.summaryTitle}>내 캐릭터 획득</h3>
            {result.playerGains.length === 0 ? (
              <p style={s.noGain}>이번 가챠에서 내 캐릭터 카드 없음</p>
            ) : (
              <div style={s.gainList}>
                {result.playerGains.map((card, i) => (
                  <div key={i} style={s.gainRow}>
                    <GradeTag card={card} />
                    <span style={s.statKey}>{card.statKey.toUpperCase()}</span>
                    <span style={s.statGain}>+{card.statGain}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <details style={s.details}>
            <summary style={s.detailsSummary}>전체 100장 보기</summary>
            <div style={s.allCards}>
              {result.cards.map((card, i) => (
                <div key={i} style={s.cardChip}>
                  <GradeTag card={card} />
                  <span style={s.chipText}>#{card.targetCharId} {card.statKey}+{card.statGain}</span>
                </div>
              ))}
            </div>
          </details>

          <button style={s.btnNext} onClick={() => useGameStore.setState({ phase: 'tournament' })}>
            토너먼트로 →
          </button>
        </>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:          { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', gap: '1.25rem' },
  title:         { fontSize: '1.5rem', fontWeight: 700, color: '#c0aaff', margin: 0 },
  sub:           { color: '#888', margin: 0 },
  btnPull:       { background: 'linear-gradient(135deg,#7c5cfc,#c05cfc)', border: 'none', borderRadius: '12px', color: '#fff', padding: '1rem 3rem', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 700 },
  summary:       { background: '#1a1a2e', border: '1px solid #333', borderRadius: '12px', padding: '1.25rem', width: '100%', maxWidth: '420px' },
  summaryTitle:  { fontSize: '1rem', fontWeight: 700, color: '#c0aaff', margin: '0 0 0.75rem' },
  noGain:        { color: '#666', margin: 0 },
  gainList:      { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  gainRow:       { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  gradeTag:      { border: '1px solid', borderRadius: '4px', padding: '1px 6px', fontSize: '0.75rem', fontWeight: 700 },
  statKey:       { color: '#aaa', fontSize: '0.9rem', flex: 1 },
  statGain:      { color: '#44ffaa', fontWeight: 700 },
  details:       { width: '100%', maxWidth: '420px' },
  detailsSummary:{ color: '#888', cursor: 'pointer', fontSize: '0.85rem' },
  allCards:      { display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' },
  cardChip:      { background: '#1a1a2e', border: '1px solid #333', borderRadius: '6px', padding: '3px 8px', display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.7rem' },
  chipText:      { color: '#aaa' },
  btnNext:       { background: '#7c5cfc', border: 'none', borderRadius: '8px', color: '#fff', padding: '0.75rem 2.5rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, marginTop: '0.5rem' },
}
