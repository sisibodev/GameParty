import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { GachaResult, GrowthStatKey } from '../types'
import HeaderBar from '../components/ui/HeaderBar'
import '../styles/arena.css'

const GRADE_COLOR: Record<string, string> = {
  C: '#9aa3b2', B: '#5ef0a8', A: '#67e8f9', S: '#c78bff', SS: '#ff7ab6', SSS: '#ffd66b',
}

const STAT_LABEL: Record<GrowthStatKey, string> = {
  hp: 'HP', str: 'STR', agi: 'AGILITY', int: 'INT', luk: 'LUCK',
}

const GRADE_FLAVOR: Record<string, string> = {
  SSS: '이번 라운드 먹진 기회',
  SS:  '대박 성장!',
  S:   '좋은 성장',
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

  const topGain    = result?.playerGains.length
    ? result.playerGains.reduce((a, b) => a.statGain >= b.statGain ? a : b)
    : null
  const gradeColor = topGain ? (GRADE_COLOR[topGain.grade] ?? '#888') : '#888'
  const flavorText = topGain ? (GRADE_FLAVOR[topGain.grade] ?? null) : null
  const history    = activeSlot.gachaHistory ?? []

  return (
    <div className="arena-bg-arena" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <HeaderBar
        subtitle="ROUND GACHA"
        round={activeSlot.currentRound}
        phase="라운드 시작 · 스탯 뽑기"
        onExit={() => { if (confirm('메인 화면으로 나가시겠습니까?\n현재까지의 진행은 저장되어 있습니다.')) useGameStore.setState({ phase: 'slot_select' }) }}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: 28 }}>
        {/* 제목 */}
        <div style={{ textAlign: 'center' }}>
          <div className="arena-kr" style={{ fontSize: 32, fontWeight: 900, color: 'var(--ink)' }}>
            라운드 스탯 뽑기
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-mute)', marginTop: 6 }}>
            매 라운드 한 장의 랜덤 스탯 카드 · 이번 라운드의 내 성장
          </div>
        </div>

        {!result ? (
          <div className="arena-pulse" style={{ color: 'var(--ink-mute)', fontSize: 14 }}>강화 적용 중…</div>
        ) : (
          <>
            {/* 메인 가챠 카드 */}
            <div
              className={`arena-gacha-card arena-gacha-card-${topGain?.grade ?? 'C'}`}
              style={{
                width: 320,
                padding: '28px 24px 24px',
                background: 'linear-gradient(180deg,rgba(36,26,66,.97),rgba(18,12,36,.97))',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
              }}
            >
              {/* 카드 상단 뱃지 행 */}
              <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                  background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)',
                  color: 'var(--ink-mute)', letterSpacing: '.1em',
                }}>
                  MY CARD
                </div>
                {topGain && (
                  <div style={{
                    fontSize: 13, fontWeight: 900, padding: '3px 12px', borderRadius: 999,
                    background: `${gradeColor}22`, border: `1px solid ${gradeColor}66`,
                    color: gradeColor, letterSpacing: '.05em',
                  }}>
                    {topGain.grade}
                  </div>
                )}
              </div>

              {topGain ? (
                <>
                  <div className="arena-mono" style={{ fontSize: 12, color: 'var(--ink-mute)', letterSpacing: '.18em' }}>
                    {STAT_LABEL[topGain.statKey]}
                  </div>
                  <div style={{ fontSize: 80, fontWeight: 900, lineHeight: 1, color: gradeColor, textShadow: `0 0 40px ${gradeColor}` }}>
                    +{topGain.statGain}
                  </div>
                  {flavorText && (
                    <div style={{ fontSize: 13, color: gradeColor, fontWeight: 700 }}>
                      {flavorText}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 16, color: 'var(--ink-mute)', padding: '24px 0' }}>
                  이번 라운드 강화 없음
                </div>
              )}
            </div>

            {/* 히스토리 스트립 */}
            {history.length > 0 && (
              <div style={{ width: '100%', maxWidth: 560 }}>
                <div className="arena-mono" style={{ fontSize: 11, color: 'var(--ink-mute)', textAlign: 'center', marginBottom: 12, letterSpacing: '.15em' }}>
                  — MY GACHA HISTORY —
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {history.map((h, i) => {
                    const c         = GRADE_COLOR[h.grade] ?? '#888'
                    const isCurrent = h.round === activeSlot.currentRound
                    return (
                      <div
                        key={i}
                        style={{
                          display: 'flex', flexDirection: 'column', gap: 4,
                          padding: '10px 14px', borderRadius: 12, minWidth: 72, alignItems: 'center',
                          background: isCurrent ? `${c}18` : 'rgba(255,255,255,.04)',
                          border: `1px solid ${isCurrent ? c : 'var(--line)'}`,
                          position: 'relative',
                        }}
                      >
                        {isCurrent && (
                          <div style={{
                            position: 'absolute', top: -8, right: -6,
                            fontSize: 9, fontWeight: 700, background: '#ff5c6e',
                            color: '#fff', padding: '1px 5px', borderRadius: 4,
                          }}>NEW</div>
                        )}
                        <div className="arena-mono" style={{ fontSize: 10, color: 'var(--ink-mute)' }}>R{h.round}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: c }}>{h.grade}</div>
                        <div style={{ fontSize: 10, color: 'var(--ink-mute)' }}>{STAT_LABEL[h.statKey]}</div>
                        <div className="arena-mono" style={{ fontSize: 13, fontWeight: 700, color: c }}>+{h.statGain}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 대회 시작 버튼 */}
            <button
              className="arena-btn arena-btn-gold"
              style={{ padding: '14px 56px', fontSize: 15, borderRadius: 14 }}
              disabled={starting}
              onClick={handleStart}
            >
              {starting ? '대회 준비 중…' : '⚔️ 대회 시작'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
