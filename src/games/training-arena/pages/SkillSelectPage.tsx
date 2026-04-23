import { useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { SkillDef } from '../types'
import skillsRaw from '../data/skills.json'
import { MAX_SKILL_SLOTS } from '../constants'

const skillMap = Object.fromEntries(
  (skillsRaw as SkillDef[]).map(s => [s.id, s])
)

const TIER_COLOR: Record<string, string> = {
  common: '#888', rare: '#44aaff', hero: '#b44eff', legend: '#ffd700',
}

type Step = 'pick_new' | 'pick_replace'

export default function SkillSelectPage() {
  const { pendingReward, activeSlot, acquireSkill, setPhase } = useGameStore()
  const [step, setStep]                   = useState<Step>('pick_new')
  const [pickedNew, setPickedNew]         = useState<string | null>(null)
  const [pickedReplace, setPickedReplace] = useState<string | null>(null)

  if (!pendingReward || !activeSlot) return null

  const currentSkills = [...activeSlot.initialSkills, ...activeSlot.acquiredSkills]
  const isFull        = currentSkills.length >= MAX_SKILL_SLOTS
  const choices       = pendingReward.skillChoices
    .map(id => skillMap[id])
    .filter(Boolean) as SkillDef[]

  function handleSkip() {
    setPhase('gacha')
  }

  function handleConfirm() {
    if (!pickedNew) return
    if (isFull) {
      setStep('pick_replace')
    } else {
      acquireSkill(pickedNew)
    }
  }

  function SkillCard({ skill, selected, onSelect }: { skill: SkillDef; selected: boolean; onSelect: () => void }) {
    return (
      <button
        style={{
          ...s.card,
          border: selected ? '2px solid #c0aaff' : '1px solid #333',
          background: selected ? '#2a1a4e' : '#1a1a2e',
        }}
        onClick={onSelect}
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
    )
  }

  // ── 교체 대상 선택 단계 ──
  if (step === 'pick_replace') {
    const newSkill = pickedNew ? skillMap[pickedNew] : null
    return (
      <div style={s.root}>
        <h2 style={s.title}>교체할 스킬 선택</h2>
        <p style={s.sub}>슬롯이 가득 찼습니다. 교체할 기존 스킬을 선택하세요.</p>
        {newSkill && (
          <div style={s.newSkillBox}>
            <span style={s.newLabel}>새 스킬:</span>
            <span style={{ color: TIER_COLOR[newSkill.tier] ?? '#888', fontSize: '0.8rem' }}>
              [{newSkill.tier.toUpperCase()}]
            </span>
            <span style={s.skillName}>{newSkill.name}</span>
          </div>
        )}
        <div style={s.list}>
          {currentSkills.map(id => {
            const sk = skillMap[id]
            if (!sk) return null
            return (
              <button
                key={id}
                style={{
                  ...s.card,
                  border: pickedReplace === id ? '2px solid #ff6b35' : '1px solid #333',
                  background: pickedReplace === id ? '#3e1a0e' : '#1a1a2e',
                }}
                onClick={() => setPickedReplace(id)}
              >
                <div style={s.cardHeader}>
                  <span style={{ ...s.tier, color: TIER_COLOR[sk.tier] ?? '#888' }}>
                    [{sk.tier.toUpperCase()}]
                  </span>
                  <span style={s.skillName}>{sk.name}</span>
                  <span style={s.cat}>{sk.category}</span>
                </div>
                <p style={s.desc}>{sk.description}</p>
              </button>
            )
          })}
        </div>
        <div style={s.btnRow}>
          <button style={s.btnSkip} onClick={() => setStep('pick_new')}>← 돌아가기</button>
          <button
            style={{ ...s.btnConfirm, opacity: pickedReplace ? 1 : 0.4 }}
            disabled={!pickedReplace}
            onClick={() => acquireSkill(pickedNew!, pickedReplace!)}
          >
            교체 완료 →
          </button>
        </div>
      </div>
    )
  }

  // ── 새 스킬 선택 단계 ──
  return (
    <div style={s.root}>
      <h2 style={s.title}>스킬 선택</h2>
      <p style={s.sub}>
        현재 스킬 {currentSkills.length}/{MAX_SKILL_SLOTS}개
        {isFull ? ' — 선택 시 기존 스킬 1개와 교체' : ' — 1개를 습득합니다'}
      </p>

      {choices.length > 0 ? (
        <div style={s.list}>
          {choices.map(skill => (
            <SkillCard
              key={skill.id}
              skill={skill}
              selected={pickedNew === skill.id}
              onSelect={() => setPickedNew(skill.id)}
            />
          ))}
        </div>
      ) : (
        <p style={s.empty}>선택 가능한 스킬이 없습니다 (모두 보유 중)</p>
      )}

      <div style={s.btnRow}>
        <button style={s.btnSkip} onClick={handleSkip}>넘기기</button>
        {choices.length > 0 && (
          <button
            style={{ ...s.btnConfirm, opacity: pickedNew ? 1 : 0.4 }}
            disabled={!pickedNew}
            onClick={handleConfirm}
          >
            {isFull ? '교체할 스킬 선택 →' : '습득 →'}
          </button>
        )}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:        { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', gap: '1.25rem' },
  title:       { fontSize: '1.5rem', fontWeight: 700, color: '#c0aaff', margin: 0 },
  sub:         { color: '#888', margin: 0 },
  list:        { display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: '460px' },
  card:        { display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem', borderRadius: '10px', cursor: 'pointer', textAlign: 'left', width: '100%' },
  cardHeader:  { display: 'flex', alignItems: 'center', gap: '0.6rem' },
  tier:        { fontSize: '0.75rem', fontWeight: 700 },
  skillName:   { fontWeight: 700, fontSize: '1rem', flex: 1 },
  cat:         { fontSize: '0.75rem', color: '#888' },
  desc:        { fontSize: '0.85rem', color: '#bbb', margin: 0 },
  meta:        { display: 'flex', gap: '1rem', fontSize: '0.75rem', color: '#666' },
  empty:       { color: '#666' },
  newSkillBox: { display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#1a2e1a', border: '1px solid #44ffaa', borderRadius: '8px', padding: '0.6rem 1rem' },
  newLabel:    { color: '#44ffaa', fontWeight: 700, fontSize: '0.85rem' },
  btnRow:      { display: 'flex', gap: '0.75rem', marginTop: '0.5rem' },
  btnSkip:     { background: 'transparent', border: '1px solid #555', borderRadius: '8px', color: '#888', padding: '0.75rem 1.5rem', cursor: 'pointer', fontSize: '0.9rem' },
  btnConfirm:  { background: '#7c5cfc', border: 'none', borderRadius: '8px', color: '#fff', padding: '0.75rem 2rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 700 },
}
