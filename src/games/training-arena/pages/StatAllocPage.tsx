import { useGameStore } from '../store/useGameStore'
import type { CharacterDef, GrowthStatKey } from '../types'
import { deriveStats } from '../engine/statDeriver'
import charactersRaw from '../data/characters.json'

const characters = charactersRaw as CharacterDef[]

const STAT_LABELS: Record<GrowthStatKey, string> = {
  hp:  'HP  (최대 체력 +10)',
  str: 'STR (공격/방어 +3/+1)',
  agi: 'AGI (속도/회피 +2/+0.5)',
  int: 'INT (마나 +5)',
  luk: 'LUK (크리확률 +0.5%)',
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

export default function StatAllocPage() {
  const { activeSlot, statPointsLeft, allocateStat, confirmStatAlloc } = useGameStore()

  if (!activeSlot) return null

  const g       = activeSlot.growthStats
  const charDef = characters.find(c => c.id === activeSlot.characterId)
  const derived = charDef ? deriveStats(charDef.baseCombat, g, charDef.archetype) : null

  return (
    <div style={s.root}>
      <h2 style={s.title}>스탯 배분</h2>
      <p style={s.pts}>
        남은 포인트: <strong style={s.ptNum}>{statPointsLeft}</strong>
      </p>

      <div style={s.cols}>
        {/* 성장 스탯 배분 */}
        <div style={s.allocBox}>
          <h3 style={s.sectionTitle}>성장 스탯 배분</h3>
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
        </div>

        {/* 순수 성장 스탯 + 전투 스탯 */}
        <div style={s.statsBox}>
          <h3 style={s.sectionTitle}>성장 스탯</h3>
          <div style={s.statGrid}>
            {(['hp','str','agi','int','luk'] as const).map(key => (
              <div key={key} style={s.statCell}>
                <span style={s.statLabel}>{key.toUpperCase()}</span>
                <span style={{ ...s.statVal, color: '#ffd700' }}>{g[key]}</span>
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
            <p style={s.charName}>#{charDef.id} {charDef.name}</p>
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
  pts:          { color: '#aaa', margin: 0 },
  ptNum:        { color: '#ffd700', fontSize: '1.2rem' },
  cols:         { display: 'flex', gap: '1.5rem', width: '100%', maxWidth: '720px', flexWrap: 'wrap', justifyContent: 'center' },
  allocBox:     { flex: '1 1 300px' },
  statsBox:     { flex: '1 1 240px', background: '#1a1a2e', border: '1px solid #333', borderRadius: '12px', padding: '1rem' },
  sectionTitle: { color: '#888', fontSize: '0.8rem', letterSpacing: '0.08em', margin: '0 0 0.75rem', textTransform: 'uppercase' },
  list:         { display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  row:          { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a1a2e', borderRadius: '8px', padding: '0.65rem 0.9rem' },
  label:        { fontSize: '0.85rem', color: '#ccc' },
  controls:     { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  val:          { fontWeight: 700, minWidth: '2rem', textAlign: 'right' },
  btn:          { background: '#7c5cfc', border: 'none', borderRadius: '4px', color: '#fff', width: '28px', height: '28px', cursor: 'pointer', fontSize: '1rem', fontWeight: 700 },
  statGrid:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' },
  statCell:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', borderRadius: '6px', padding: '0.4rem 0.6rem' },
  statLabel:    { fontSize: '0.75rem', color: '#888' },
  statVal:      { fontSize: '0.85rem', fontWeight: 700, color: '#c0aaff' },
  charName:     { color: '#555', fontSize: '0.75rem', margin: '0.75rem 0 0', textAlign: 'center' },
  btnConfirm:   { background: '#7c5cfc', border: 'none', borderRadius: '8px', color: '#fff', padding: '0.75rem 3rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, marginTop: '1rem' },
}
