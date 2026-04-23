import { useGameStore } from '../store/useGameStore'
import type { GrowthStatKey } from '../types'

const STAT_LABELS: Record<GrowthStatKey, string> = {
  hp:  'HP  (최대 체력 +10)',
  str: 'STR (공격/방어 +3/+1)',
  agi: 'AGI (속도/회피 +2/+0.5)',
  int: 'INT (마나 +5)',
  luk: 'LUK (크리확률 +0.5%)',
}

export default function StatAllocPage() {
  const { activeSlot, statPointsLeft, allocateStat, confirmStatAlloc } = useGameStore()

  if (!activeSlot) return null

  const g = activeSlot.growthStats

  return (
    <div style={s.root}>
      <h2 style={s.title}>스탯 배분</h2>
      <p style={s.pts}>
        남은 포인트: <strong style={s.ptNum}>{statPointsLeft}</strong>
      </p>

      <div style={s.list}>
        {(Object.keys(STAT_LABELS) as GrowthStatKey[]).map(key => (
          <div key={key} style={s.row}>
            <div style={s.label}>{STAT_LABELS[key]}</div>
            <div style={s.controls}>
              <span style={s.val}>{g[key]}</span>
              <button
                style={{ ...s.btn, opacity: statPointsLeft <= 0 ? 0.3 : 1 }}
                disabled={statPointsLeft <= 0}
                onClick={() => allocateStat(key)}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      <button style={s.btnConfirm} onClick={confirmStatAlloc}>
        {statPointsLeft > 0 ? `확인 (${statPointsLeft}pt 남음)` : '배분 완료 →'}
      </button>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:      { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', gap: '1rem' },
  title:     { fontSize: '1.5rem', fontWeight: 700, color: '#c0aaff', margin: 0 },
  pts:       { color: '#aaa', margin: 0 },
  ptNum:     { color: '#ffd700', fontSize: '1.2rem' },
  list:      { width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' },
  row:       { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a1a2e', borderRadius: '8px', padding: '0.75rem 1rem' },
  label:     { fontSize: '0.9rem', color: '#ccc' },
  controls:  { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  val:       { fontWeight: 700, minWidth: '2rem', textAlign: 'right' },
  btn:       { background: '#7c5cfc', border: 'none', borderRadius: '4px', color: '#fff', width: '28px', height: '28px', cursor: 'pointer', fontSize: '1rem', fontWeight: 700 },
  btnConfirm:{ background: '#7c5cfc', border: 'none', borderRadius: '8px', color: '#fff', padding: '0.75rem 3rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, marginTop: '1.5rem' },
}
