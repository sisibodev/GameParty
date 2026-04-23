import { useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { SkillDef } from '../types'
import skillsRaw from '../data/skills.json'

const skillMap = Object.fromEntries(
  (skillsRaw as SkillDef[]).map(s => [s.id, s])
)

const TIER_COLOR: Record<string, string> = {
  common: '#888', rare: '#44aaff', hero: '#b44eff', legend: '#ffd700',
}

export default function SkillSelectPage() {
  const { pendingReward, activeSlot, acquireSkill, setPhase } = useGameStore()
  const [picked, setPicked] = useState<string | null>(null)

  if (!pendingReward || !activeSlot) return null

  const currentSkills = [...activeSlot.initialSkills, ...activeSlot.acquiredSkills]
  const choices       = pendingReward.skillChoices
    .map(id => skillMap[id])
    .filter(Boolean) as SkillDef[]

  async function handleConfirm() {
    if (!picked) return
    await acquireSkill(picked)
  }

  return (
    <div style={s.root}>
      <h2 style={s.title}>스킬 선택</h2>
      <p style={s.sub}>현재 스킬 {currentSkills.length}/8개 — 1개를 습득합니다</p>

      <div style={s.list}>
        {choices.map(skill => (
          <button
            key={skill.id}
            style={{
              ...s.card,
              border: picked === skill.id ? '2px solid #c0aaff' : '1px solid #333',
              background: picked === skill.id ? '#2a1a4e' : '#1a1a2e',
            }}
            onClick={() => setPicked(skill.id)}
          >
            <div style={s.cardHeader}>
              <span style={{ ...s.tier, color: TIER_COLOR[skill.tier] ?? '#888' }}>
                [{skill.tier.toUpperCase()}]
              </span>
              <span style={s.skillName}>{skill.name}</span>
              <span style={s.cat}>{skill.category}</span>
            </div>
            <p style={s.desc}>{skill.description}</p>
            <div style={s.meta}>
              <span>비용 {skill.cost}</span>
              <span>쿨다운 {skill.cooldown}</span>
              <span>대상 {skill.target}</span>
            </div>
          </button>
        ))}
      </div>

      {choices.length === 0 && (
        <p style={s.empty}>선택 가능한 스킬 없음 (모두 보유 중)</p>
      )}

      <div style={s.btnRow}>
        {choices.length > 0 ? (
          <button
            style={{ ...s.btnConfirm, opacity: picked ? 1 : 0.4 }}
            disabled={!picked}
            onClick={handleConfirm}
          >
            습득 →
          </button>
        ) : (
          <button style={s.btnConfirm} onClick={() => setPhase('gacha')}>
            다음 라운드 →
          </button>
        )}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:       { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', gap: '1.25rem' },
  title:      { fontSize: '1.5rem', fontWeight: 700, color: '#c0aaff', margin: 0 },
  sub:        { color: '#888', margin: 0 },
  list:       { display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: '460px' },
  card:       { display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem', borderRadius: '10px', cursor: 'pointer', textAlign: 'left' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '0.6rem' },
  tier:       { fontSize: '0.75rem', fontWeight: 700 },
  skillName:  { fontWeight: 700, fontSize: '1rem', flex: 1 },
  cat:        { fontSize: '0.75rem', color: '#888' },
  desc:       { fontSize: '0.85rem', color: '#bbb', margin: 0 },
  meta:       { display: 'flex', gap: '1rem', fontSize: '0.75rem', color: '#666' },
  empty:      { color: '#666' },
  btnRow:     { marginTop: '0.5rem' },
  btnConfirm: { background: '#7c5cfc', border: 'none', borderRadius: '8px', color: '#fff', padding: '0.75rem 2.5rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 700 },
}
