import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { GachaResult, GrowthStatKey } from '../types'
import HeaderBar from '../components/ui/HeaderBar'
import '../styles/arena.css'

const GRADE_COLOR: Record<string, string> = {
  C: '#9aa3b2', B: '#5ef0a8', A: '#67e8f9', S: '#c78bff', SS: '#ff7ab6', SSS: '#ffd66b',
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
  const topGain = result?.playerGains.length
    ? result.playerGains.reduce((a, b) => a.statGain >= b.statGain ? a : b)
    : null

  return (
    <div className="arena-bg-arena" style={{ display:'flex', flexDirection:'column' as const, minHeight:'100vh' }}>
      <HeaderBar
        subtitle="ROUND GACHA"
        round={activeSlot.currentRound}
        phase="라운드 시작 · 스탯 뽑기"
      />

      <div style={{ flex:1, display:'flex', flexDirection:'column' as const, alignItems:'center', justifyContent:'center', padding:'32px 24px', gap:28 }}>
        {!result ? (
          <div className="arena-pulse" style={{ color:'var(--ink-mute)', fontSize:14 }}>강화 적용 중…</div>
        ) : (
          <>
            {/* Main gacha card */}
            <div className="arena-crt" style={{ width:340, padding:'32px 28px', background:'linear-gradient(180deg,rgba(36,26,66,.95),rgba(18,12,36,.95))', border:'1px solid var(--line-strong)', borderRadius:24, display:'flex', flexDirection:'column' as const, alignItems:'center', gap:20, boxShadow:'0 0 60px -20px rgba(164,120,255,.3)' }}>
              <div className="arena-mono" style={{ fontSize:11, color:'var(--ink-mute)', letterSpacing:'.15em' }}>ROUND {activeSlot.currentRound} ENHANCEMENT</div>

              {topGain ? (
                <>
                  <div style={{ fontSize:72, fontWeight:900, lineHeight:1, color: GRADE_COLOR[topGain.grade], textShadow:`0 0 40px ${GRADE_COLOR[topGain.grade]}` }}>
                    {topGain.grade}
                  </div>
                  <div style={{ fontSize:14, color:'var(--ink-dim)' }}>{STAT_LABEL[topGain.statKey]}</div>
                  <div style={{ fontSize:48, fontWeight:900, color:'var(--ink)' }}>+{topGain.statGain}</div>
                </>
              ) : (
                <div style={{ fontSize:18, color:'var(--ink-mute)', padding:'20px 0' }}>이번 라운드 강화 없음</div>
              )}

              {playerTotal > 0 && (
                <div style={{ fontSize:13, color:'var(--green)', fontWeight:700 }}>총 +{playerTotal} 스탯 획득</div>
              )}
            </div>

            {/* Gain history strip */}
            {result.playerGains.length > 0 && (
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' as const, justifyContent:'center', maxWidth:400 }}>
                {result.playerGains.map((card, i) => {
                  const c = GRADE_COLOR[card.grade] ?? '#888'
                  return (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 10px', borderRadius:999, background:`${c}12`, border:`1px solid ${c}44` }}>
                      <span className="arena-mono" style={{ fontSize:11, fontWeight:700, color:c }}>{card.grade}</span>
                      <span style={{ fontSize:11, color:'var(--ink-dim)' }}>{STAT_LABEL[card.statKey]}</span>
                      <span className="arena-mono" style={{ fontSize:11, fontWeight:700, color:c }}>+{card.statGain}</span>
                    </div>
                  )
                })}
              </div>
            )}

            <button
              className="arena-btn arena-btn-gold"
              style={{ padding:'14px 48px', fontSize:15, borderRadius:14 }}
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
