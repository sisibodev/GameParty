import { useGameStore } from '../store/useGameStore'
import type { CharacterDef, GrowthStatKey } from '../types'
import { deriveStats } from '../engine/statDeriver'
import charactersRaw from '../data/characters.json'

const characters = charactersRaw as CharacterDef[]

const STAT_META: Record<GrowthStatKey, { label: string; desc: string; color: string }> = {
  hp:  { label: 'HP',  desc: '최대 체력 +10/pt',     color: '#e05c5c' },
  str: { label: 'STR', desc: '공격 +3, 방어 +1/pt',  color: '#e09c3c' },
  agi: { label: 'AGI', desc: '속도 +2, 회피 +0.5/pt', color: '#5ce08c' },
  int: { label: 'INT', desc: '마나 +5/pt',            color: '#5ca8e0' },
  luk: { label: 'LUK', desc: '크리확률 +0.5%/pt',    color: '#c05ce0' },
}

const COMBAT_LABELS = [
  { key: 'maxHp',   label: '최대HP' },
  { key: 'atk',     label: '공격력' },
  { key: 'def',     label: '방어력' },
  { key: 'spd',     label: '속도' },
  { key: 'crit',    label: '크리%' },
  { key: 'eva',     label: '회피%' },
  { key: 'maxMana', label: '마나' },
] as const

const BULK_AMOUNTS = [1, 5, 10] as const

export default function StatAllocPage() {
  const {
    activeSlot, statPointsLeft,
    allocateStat, allocateStatBy, resetStat, resetAllStats,
    confirmStatAlloc,
  } = useGameStore()

  if (!activeSlot) return null

  const g       = activeSlot.growthStats
  const charDef = characters.find(c => c.id === activeSlot.characterId)
  const derived = charDef ? deriveStats(charDef.baseCombat, g, charDef.archetype) : null
  const totalAllocated = g.hp + g.str + g.agi + g.int + g.luk

  return (
    <div style={s.root}>
      <h2 style={s.title}>스탯 배분</h2>

      <div style={s.ptsRow}>
        <span style={s.ptsLabel}>
          남은 포인트: <strong style={s.ptNum}>{statPointsLeft}</strong>
        </span>
        <button
          style={{ ...s.resetAllBtn, opacity: totalAllocated === 0 ? 0.3 : 1 }}
          disabled={totalAllocated === 0}
          onClick={resetAllStats}
        >
          전체 초기화
        </button>
      </div>

      <div style={s.cols}>
        {/* 성장 스탯 배분 */}
        <div style={s.allocBox}>
          <h3 style={s.sectionTitle}>성장 스탯 배분</h3>
          <div style={s.list}>
            {(Object.keys(STAT_META) as GrowthStatKey[]).map(key => {
              const meta = STAT_META[key]
              const val  = g[key]
              const disabled = statPointsLeft <= 0
              return (
                <div key={key} style={s.row}>
                  <div style={s.statNameCol}>
                    <span style={{ ...s.statBadge, background: meta.color + '33', color: meta.color }}>
                      {meta.label}
                    </span>
                    <span style={s.statDesc}>{meta.desc}</span>
                  </div>

                  <div style={s.controls}>
                    <button
                      style={{ ...s.minusBtn, opacity: val <= 0 ? 0.2 : 1 }}
                      disabled={val <= 0}
                      onClick={() => resetStat(key)}
                      title="이 스탯 초기화"
                    >
                      ↺
                    </button>

                    <span style={{ ...s.val, color: val > 0 ? meta.color : '#555' }}>
                      {val}
                    </span>

                    {BULK_AMOUNTS.map(n => (
                      <button
                        key={n}
                        style={{ ...s.addBtn, opacity: disabled || statPointsLeft < n ? 0.25 : 1 }}
                        disabled={disabled || statPointsLeft < n}
                        onClick={() => n === 1 ? allocateStat(key) : allocateStatBy(key, n)}
                      >
                        +{n}
                      </button>
                    ))}
                    <button
                      style={{ ...s.addBtn, ...s.maxBtn, opacity: disabled ? 0.25 : 1 }}
                      disabled={disabled}
                      onClick={() => allocateStatBy(key, statPointsLeft)}
                    >
                      MAX
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 전투 스탯 미리보기 */}
        <div style={s.statsBox}>
          <h3 style={s.sectionTitle}>성장 스탯</h3>
          <div style={s.statGrid}>
            {(Object.keys(STAT_META) as GrowthStatKey[]).map(key => (
              <div key={key} style={s.statCell}>
                <span style={{ ...s.statLabel, color: STAT_META[key].color }}>
                  {STAT_META[key].label}
                </span>
                <span style={{ ...s.statVal, color: g[key] > 0 ? '#ffd700' : '#444' }}>
                  {g[key]}
                </span>
              </div>
            ))}
          </div>

          {derived && (
            <>
              <h3 style={{ ...s.sectionTitle, marginTop: '1rem' }}>전투 스탯</h3>
              <div style={s.statGrid}>
                {COMBAT_LABELS.map(({ key, label }) => (
                  <div key={key} style={s.statCell}>
                    <span style={s.statLabel}>{label}</span>
                    <span style={s.statVal}>
                      {Math.round(derived[key] as number)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {charDef && (
            <p style={s.charName}>#{charDef.id} {charDef.name} [{charDef.archetype}]</p>
          )}
        </div>
      </div>

      <button style={s.btnConfirm} onClick={confirmStatAlloc}>
        {statPointsLeft > 0 ? `확인 (${statPointsLeft}pt 남음)` : '배분 완료 →'}
      </button>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:         { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', gap: '1rem' },
  title:        { fontSize: '1.5rem', fontWeight: 700, color: '#c0aaff', margin: 0 },
  ptsRow:       { display: 'flex', alignItems: 'center', gap: '1.5rem' },
  ptsLabel:     { color: '#aaa', fontSize: '1rem' },
  ptNum:        { color: '#ffd700', fontSize: '1.4rem' },
  resetAllBtn:  { background: 'transparent', border: '1px solid #555', borderRadius: '6px', color: '#aaa', padding: '0.3rem 0.8rem', cursor: 'pointer', fontSize: '0.8rem' },
  cols:         { display: 'flex', gap: '1.5rem', width: '100%', maxWidth: '820px', flexWrap: 'wrap', justifyContent: 'center' },
  allocBox:     { flex: '1 1 380px' },
  statsBox:     { flex: '1 1 240px', background: '#1a1a2e', border: '1px solid #333', borderRadius: '12px', padding: '1rem' },
  sectionTitle: { color: '#888', fontSize: '0.75rem', letterSpacing: '0.08em', margin: '0 0 0.75rem', textTransform: 'uppercase' },
  list:         { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  row:          { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a1a2e', borderRadius: '8px', padding: '0.55rem 0.75rem', gap: '0.5rem' },
  statNameCol:  { display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: '100px' },
  statBadge:    { display: 'inline-block', fontWeight: 700, fontSize: '0.75rem', padding: '0.1rem 0.5rem', borderRadius: '4px', width: 'fit-content' },
  statDesc:     { fontSize: '0.7rem', color: '#666' },
  controls:     { display: 'flex', alignItems: 'center', gap: '0.35rem' },
  val:          { fontWeight: 700, minWidth: '2.2rem', textAlign: 'right', fontSize: '1rem' },
  minusBtn:     { background: '#2a1a1a', border: '1px solid #553', borderRadius: '4px', color: '#ffa0a0', width: '26px', height: '26px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 },
  addBtn:       { background: '#1e1e3a', border: '1px solid #4a4a8a', borderRadius: '4px', color: '#c0aaff', width: '30px', height: '26px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 },
  maxBtn:       { width: '38px', background: '#2a1a3e', border: '1px solid #7c5cfc', color: '#c090ff' },
  statGrid:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' },
  statCell:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', borderRadius: '6px', padding: '0.4rem 0.6rem' },
  statLabel:    { fontSize: '0.75rem', color: '#888' },
  statVal:      { fontSize: '0.85rem', fontWeight: 700, color: '#c0aaff' },
  charName:     { color: '#555', fontSize: '0.72rem', margin: '0.75rem 0 0', textAlign: 'center' },
  btnConfirm:   { background: '#7c5cfc', border: 'none', borderRadius: '8px', color: '#fff', padding: '0.75rem 3rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, marginTop: '1rem' },
}
