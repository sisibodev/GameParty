import { useState } from 'react'
import { useGameStore, GROWTH_STAT_KEYS } from '../store/useGameStore'
import type { GrowthStatKey } from '../types'

const STAT_LABELS: Record<GrowthStatKey, string> = {
  hp: 'HP', str: 'STR', agi: 'AGI', int: 'INT', luk: 'LUK',
}

export default function RewardPage() {
  const { pendingReward, activeSlot, claimReward } = useGameStore()
  const [picked, setPicked] = useState<GrowthStatKey | null>(null)

  if (!pendingReward || !activeSlot) return null

  async function handleClaim() {
    if (!picked) return
    await claimReward(picked)
  }

  return (
    <div style={s.root}>
      <h2 style={s.title}>보상</h2>
      <p style={s.sub}>캐릭터 #{activeSlot.characterId}</p>

      <div style={s.box}>
        <div style={s.rewardRow}>
          <span style={s.label}>랜덤 스탯 보상</span>
          <span style={s.val}>+{pendingReward.randomStatGain}</span>
        </div>
        <div style={s.rewardRow}>
          <span style={s.label}>추가 배분 포인트</span>
          <span style={s.val}>+{pendingReward.playerExtraPoints}</span>
        </div>
        {pendingReward.skillChoices.length > 0 && (
          <div style={s.rewardRow}>
            <span style={s.label}>스킬 선택 후보</span>
            <span style={s.val}>{pendingReward.skillChoices.length}개</span>
          </div>
        )}
      </div>

      <div style={s.section}>
        <p style={s.sectionLabel}>
          랜덤 스탯 보상 (+{pendingReward.randomStatGain}) 을 어디에 적용할까요?
        </p>
        <div style={s.statGrid}>
          {GROWTH_STAT_KEYS.map(key => (
            <button
              key={key}
              style={{
                ...s.statBtn,
                border: picked === key ? '2px solid #c0aaff' : '1px solid #333',
                background: picked === key ? '#2a1a4e' : '#1a1a2e',
              }}
              onClick={() => setPicked(key)}
            >
              {STAT_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      <button
        style={{ ...s.btnClaim, opacity: picked ? 1 : 0.4 }}
        disabled={!picked}
        onClick={handleClaim}
      >
        {pendingReward.skillChoices.length > 0 ? '수령 후 스킬 선택 →' : '수령 완료 →'}
      </button>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:        { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', gap: '1.25rem' },
  title:       { fontSize: '1.5rem', fontWeight: 700, color: '#c0aaff', margin: 0 },
  sub:         { color: '#888', margin: 0 },
  box:         { background: '#1a1a2e', border: '1px solid #333', borderRadius: '12px', padding: '1.25rem', width: '100%', maxWidth: '380px', display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  rewardRow:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  label:       { color: '#aaa', fontSize: '0.9rem' },
  val:         { color: '#44ffaa', fontWeight: 700, fontSize: '1rem' },
  section:     { width: '100%', maxWidth: '380px' },
  sectionLabel:{ color: '#ccc', fontSize: '0.85rem', marginBottom: '0.75rem' },
  statGrid:    { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' },
  statBtn:     { borderRadius: '8px', padding: '0.5rem 1.25rem', cursor: 'pointer', color: '#e8e8ff', fontWeight: 700, fontSize: '0.9rem' },
  btnClaim:    { background: '#7c5cfc', border: 'none', borderRadius: '8px', color: '#fff', padding: '0.75rem 2.5rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 700 },
}
