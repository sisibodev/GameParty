import { useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { SkillDef } from '../types'
import skillsRaw from '../data/skills.json'
import { MAX_SKILL_SLOTS } from '../constants'

const skillMap = Object.fromEntries(
  (skillsRaw as SkillDef[]).map(s => [s.id, s])
)

const TIER_COLOR: Record<string, string> = {
  common: '#9aa3b2', rare: '#44aaff', hero: '#b44eff', legend: '#ffd700',
}

const TIER_LABEL: Record<string, string> = {
  common: '보통', rare: '희귀', hero: '영웅', legend: '전설',
}

type Step = 'pick_new' | 'pick_replace'

function TierBadge({ tier }: { tier: string }) {
  const color = TIER_COLOR[tier] ?? '#9aa3b2'
  return (
    <span style={{
      fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999,
      border: `1px solid ${color}55`, color, flexShrink: 0,
    }}>
      {TIER_LABEL[tier] ?? tier}
    </span>
  )
}

function SkillCardFull({ skill, selected, onSelect }: { skill: SkillDef; selected: boolean; onSelect: () => void }) {
  const tierColor = TIER_COLOR[skill.tier] ?? '#9aa3b2'
  return (
    <button
      style={{
        display: 'flex', flexDirection: 'column', gap: '0.5rem',
        padding: '1rem', borderRadius: '10px', cursor: 'pointer', textAlign: 'left', width: '100%',
        border: selected ? `2px solid ${tierColor}` : `1px solid ${tierColor}44`,
        background: selected ? `${tierColor}18` : '#1a1a2e',
      }}
      onClick={onSelect}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <TierBadge tier={skill.tier} />
        <span style={{ fontWeight: 700, fontSize: '1rem', flex: 1, color: tierColor }}>{skill.name}</span>
        <span style={{ fontSize: '0.75rem', color: '#888' }}>{skill.category}</span>
      </div>
      <p style={{ fontSize: '0.85rem', color: '#bbb', margin: 0 }}>{skill.description}</p>
      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: '#666' }}>
        <span>비용 {skill.cost}</span>
        <span>쿨다운 {skill.cooldown}</span>
        <span>대상 {skill.target}</span>
      </div>
    </button>
  )
}

function SkillCardCompact({ skill, selected, onSelect }: { skill: SkillDef; selected: boolean; onSelect: () => void }) {
  const tierColor = TIER_COLOR[skill.tier] ?? '#9aa3b2'
  return (
    <button
      style={{
        display: 'flex', flexDirection: 'column', gap: '0.4rem',
        padding: '0.7rem 0.8rem', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', width: '100%',
        border: selected ? `2px solid ${tierColor}` : `1px solid ${tierColor}44`,
        background: selected ? `${tierColor}18` : '#1a1a2e',
      }}
      onClick={onSelect}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' as const }}>
        <TierBadge tier={skill.tier} />
        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: tierColor }}>{skill.name}</span>
      </div>
      <p style={{ fontSize: '0.75rem', color: '#999', margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{skill.description}</p>
    </button>
  )
}

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
            <TierBadge tier={newSkill.tier} />
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: TIER_COLOR[newSkill.tier] ?? '#9aa3b2' }}>{newSkill.name}</span>
          </div>
        )}
        <div style={s.grid3}>
          {currentSkills.map(id => {
            const sk = skillMap[id]
            if (!sk) return null
            return (
              <SkillCardCompact
                key={id}
                skill={sk}
                selected={pickedReplace === id}
                onSelect={() => setPickedReplace(id)}
              />
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
            <SkillCardFull
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
  grid3:       { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem', width: '100%', maxWidth: '700px' },
  empty:       { color: '#666' },
  newSkillBox: { display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#1a2e1a', border: '1px solid #44ffaa', borderRadius: '8px', padding: '0.6rem 1rem' },
  newLabel:    { color: '#44ffaa', fontWeight: 700, fontSize: '0.85rem' },
  btnRow:      { display: 'flex', gap: '0.75rem', marginTop: '0.5rem' },
  btnSkip:     { background: 'transparent', border: '1px solid #555', borderRadius: '8px', color: '#888', padding: '0.75rem 1.5rem', cursor: 'pointer', fontSize: '0.9rem' },
  btnConfirm:  { background: '#7c5cfc', border: 'none', borderRadius: '8px', color: '#fff', padding: '0.75rem 2rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 700 },
}
