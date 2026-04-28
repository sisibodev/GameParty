import { useGameStore } from '../store/useGameStore'
import type { GrowthStatKey, TournamentResult } from '../types'

const STAT_LABELS: Record<GrowthStatKey, string> = {
  vit: 'VIT', str: 'STR', agi: 'AGI', int: 'INT', luk: 'LUK',
}

const BRACKET_LABELS: Record<number, string> = {
  1: '16강 탈락', 2: '8강 탈락', 3: '4강 탈락', 4: '준우승',
}

function getResultLabel(result: TournamentResult, charId: number): { label: string; color: string } {
  if (result.winner === charId)
    return { label: '🏆 우승!', color: '#ffd700' }
  if (result.finalists.includes(charId)) {
    const r = result.bracketEliminations[charId] ?? 0
    const label = BRACKET_LABELS[r] ?? '토너먼트 탈락'
    const color = r === 4 ? '#e0c040' : r === 3 ? '#b44eff' : '#44aaff'
    return { label: `⚔️ ${label}`, color }
  }
  if (result.qualifiers.includes(charId))
    return { label: '🛡 조별리그 탈락', color: '#6688cc' }
  return { label: '💀 예선 탈락', color: '#cc4444' }
}

export default function RewardPage() {
  const { pendingReward, activeSlot, lastRandomStatKey, lastTournament, claimReward } = useGameStore()

  if (!pendingReward || !activeSlot) return null

  const resultInfo  = lastTournament
    ? getResultLabel(lastTournament, activeSlot.characterId)
    : null

  return (
    <div style={s.root}>
      <h2 style={s.title}>보상</h2>
      <p style={s.sub}>캐릭터 #{activeSlot.characterId} · 라운드 {activeSlot.currentRound}</p>

      {resultInfo && (
        <div style={{ ...s.resultBadge, color: resultInfo.color, borderColor: resultInfo.color }}>
          {resultInfo.label}
        </div>
      )}

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
          <span style={s.label}>획득 골드</span>
          <span style={s.val}>+{pendingReward.goldEarned} G</span>
        </div>
      </div>

      <button style={s.btnClaim} onClick={claimReward}>
        다음 라운드 →
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
  resultBadge: { fontSize: '1.3rem', fontWeight: 700, border: '2px solid', borderRadius: '10px', padding: '0.5rem 1.5rem' },
  hint:      { color: '#888', fontSize: '0.8rem', textAlign: 'center' },
  btnClaim:  { background: '#7c5cfc', border: 'none', borderRadius: '8px', color: '#fff', padding: '0.75rem 2.5rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 700 },
}
