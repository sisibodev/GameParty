import { useGameStore } from '../store/useGameStore'
import type { GrowthStatKey } from '../types'

const STAT_LABELS: Record<GrowthStatKey, string> = {
  hp: 'HP', str: 'STR', agi: 'AGI', int: 'INT', luk: 'LUK',
}

export default function RewardPage() {
  const { pendingReward, activeSlot, lastRandomStatKey, claimReward } = useGameStore()

  if (!pendingReward || !activeSlot) return null

  const extraPoints = pendingReward.playerExtraPoints
  const hasSkills   = pendingReward.skillChoices.length > 0
  const nextLabel   = extraPoints > 0
    ? '스탯 배분 →'
    : hasSkills ? '스킬 선택 →' : '다음 라운드 →'

  return (
    <div style={s.root}>
      <h2 style={s.title}>보상</h2>
      <p style={s.sub}>캐릭터 #{activeSlot.characterId} · 라운드 {activeSlot.currentRound}</p>

      <div style={s.box}>
        <div style={s.rewardRow}>
          <span style={s.label}>랜덤 스탯 자동 배정</span>
          <span style={s.val}>
            {lastRandomStatKey
              ? `${STAT_LABELS[lastRandomStatKey]} +${pendingReward.randomStatGain}`
              : `+${pendingReward.randomStatGain} (수령 시 자동 결정)`}
          </span>
        </div>
        <div style={s.rewardRow}>
          <span style={s.label}>추가 배분 포인트</span>
          <span style={s.val}>+{extraPoints} pt</span>
        </div>
        {hasSkills && (
          <div style={s.rewardRow}>
            <span style={s.label}>스킬 선택 후보</span>
            <span style={s.val}>{pendingReward.skillChoices.length}개</span>
          </div>
        )}
      </div>

      {extraPoints > 0 && (
        <p style={s.hint}>수령 후 추가 포인트 {extraPoints}pt를 직접 분배합니다.</p>
      )}

      <button style={s.btnClaim} onClick={claimReward}>
        {nextLabel}
      </button>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:      { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', gap: '1.25rem' },
  title:     { fontSize: '1.5rem', fontWeight: 700, color: '#c0aaff', margin: 0 },
  sub:       { color: '#888', margin: 0 },
  box:       { background: '#1a1a2e', border: '1px solid #333', borderRadius: '12px', padding: '1.25rem', width: '100%', maxWidth: '380px', display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  rewardRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  label:     { color: '#aaa', fontSize: '0.9rem' },
  val:       { color: '#44ffaa', fontWeight: 700, fontSize: '1rem' },
  hint:      { color: '#888', fontSize: '0.8rem', textAlign: 'center' },
  btnClaim:  { background: '#7c5cfc', border: 'none', borderRadius: '8px', color: '#fff', padding: '0.75rem 2.5rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 700 },
}
