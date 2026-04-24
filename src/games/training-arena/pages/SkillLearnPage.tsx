import { useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { CharacterDef, SkillDef, SkillTier } from '../types'
import { MAX_SKILL_SLOTS, SKILL_LEARN_TURNS } from '../constants'
import skillsRaw from '../data/skills.json'
import charactersRaw from '../data/characters.json'

const SKILLS_BY_ID: Record<string, SkillDef> = Object.fromEntries(
  (skillsRaw as SkillDef[]).map(s => [s.id, s]),
)
const charName = (id: number) =>
  (charactersRaw as CharacterDef[]).find(c => c.id === id)?.name ?? `#${id}`

const TIER_COLOR: Record<SkillTier, string> = {
  common: '#aaa',
  rare:   '#44aaff',
  hero:   '#c05cfc',
  legend: '#ffd700',
}

const TIER_LABEL: Record<SkillTier, string> = {
  common: '보통',
  rare:   '희귀',
  hero:   '영웅',
  legend: '전설',
}

export default function SkillLearnPage() {
  const { playerMatches, playerMatchIndex, activeSlot } = useGameStore()
  const [learnTarget, setLearnTarget]     = useState<string | null>(null)
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null)

  const matchInfo = playerMatches[playerMatchIndex]
  if (!matchInfo || !activeSlot) return null

  const opponentSkills  = matchInfo.opponentSkills
  const ownedSkillIds   = new Set([...activeSlot.initialSkills, ...activeSlot.acquiredSkills])
  const pendingSkillIds = new Set((activeSlot.pendingSkills ?? []).map(p => p.skillId))

  const learnable = opponentSkills
    .map(id => SKILLS_BY_ID[id])
    .filter((def): def is SkillDef => !!def)
    .filter(def => !ownedSkillIds.has(def.id) && !pendingSkillIds.has(def.id))

  // 내 현재 활성 스킬
  const myActiveSkillIds = [...activeSlot.initialSkills, ...activeSlot.acquiredSkills]
  const myActiveSkills   = myActiveSkillIds.map(id => SKILLS_BY_ID[id]).filter(Boolean) as SkillDef[]

  // 슬롯 사용량: 활성 + 대기 합산
  const usedSlots = myActiveSkillIds.length + (activeSlot.pendingSkills ?? []).length
  const isFull    = usedSlots >= MAX_SKILL_SLOTS

  function handleLearnClick(skillId: string) {
    if (isFull) {
      setLearnTarget(skillId)
      setReplaceTarget(null)
    } else {
      useGameStore.getState().completeMatchAndAdvance(true, skillId)
    }
  }

  function handleConfirmReplace() {
    if (!learnTarget || !replaceTarget) return
    useGameStore.getState().completeMatchAndAdvance(true, learnTarget, replaceTarget)
  }

  function handleSkip() {
    useGameStore.getState().completeMatchAndAdvance(true)
  }

  const learnTargetDef = learnTarget ? SKILLS_BY_ID[learnTarget] : null

  return (
    <div style={s.root}>
      <div style={s.header}>
        <h2 style={s.title}>스킬 학습</h2>
        <p style={s.sub}>
          <span style={s.oppName}>{charName(matchInfo.opponentId)}</span>의 스킬을 관찰했습니다
        </p>
      </div>

      {/* ── 내 스킬 현황 ── */}
      <div style={s.mySkillBox}>
        <div style={s.mySkillHeader}>
          <span style={s.mySkillTitle}>내 스킬</span>
          <span style={{ ...s.slotBadge, color: isFull ? '#ff6644' : '#44ffaa' }}>
            {usedSlots} / {MAX_SKILL_SLOTS}
          </span>
        </div>
        {myActiveSkills.length === 0 && (activeSlot.pendingSkills ?? []).length === 0 ? (
          <p style={s.noSkillText}>보유 스킬 없음</p>
        ) : (
          <div style={s.mySkillList}>
            {myActiveSkills.map(def => {
              const color = TIER_COLOR[def.tier]
              return (
                <div key={def.id} style={s.mySkillRow}>
                  <span style={{ ...s.tierDot, background: color }} />
                  <span style={{ ...s.mySkillName, color }}>{def.name}</span>
                  <span style={s.mySkillMeta}>{TIER_LABEL[def.tier]} · CD {def.cooldown}</span>
                </div>
              )
            })}
            {(activeSlot.pendingSkills ?? []).map(ps => {
              const def = SKILLS_BY_ID[ps.skillId]
              if (!def) return null
              const color = TIER_COLOR[def.tier]
              return (
                <div key={ps.skillId} style={{ ...s.mySkillRow, opacity: 0.55 }}>
                  <span style={{ ...s.tierDot, background: color }} />
                  <span style={{ ...s.mySkillName, color }}>{def.name}</span>
                  <span style={s.mySkillMeta}>학습 중 ({ps.turnsRemaining}전투 남음)</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── 교체 선택 모드 ── */}
      {learnTarget && learnTargetDef && (
        <div style={s.replaceBox}>
          <p style={s.replaceTitle}>⚠️ 슬롯이 가득 찼습니다 — 제거할 스킬을 선택하세요</p>
          <p style={s.replaceSub}>
            배울 스킬:{' '}
            <span style={{ color: TIER_COLOR[learnTargetDef.tier], fontWeight: 700 }}>
              {learnTargetDef.name}
            </span>
            <span style={{ color: '#666', marginLeft: '0.4rem' }}>
              ({TIER_LABEL[learnTargetDef.tier]})
            </span>
          </p>
          <div style={s.replaceList}>
            {myActiveSkills.map(def => {
              const color      = TIER_COLOR[def.tier]
              const isSelected = replaceTarget === def.id
              return (
                <button
                  key={def.id}
                  style={{
                    ...s.replaceItem,
                    borderColor: isSelected ? '#ff6644' : '#2a2a3e',
                    background:  isSelected ? '#2a1414' : '#1a1a2e',
                  }}
                  onClick={() => setReplaceTarget(def.id)}
                >
                  <span style={{ ...s.tierDot, background: color }} />
                  <span style={{ ...s.replaceItemName, color }}>{def.name}</span>
                  <span style={s.replaceItemMeta}>{TIER_LABEL[def.tier]}</span>
                  {isSelected && <span style={s.removeTag}>삭제</span>}
                </button>
              )
            })}
          </div>
          <div style={s.replaceBtnRow}>
            <button
              style={s.btnCancel}
              onClick={() => { setLearnTarget(null); setReplaceTarget(null) }}
            >
              취소
            </button>
            <button
              style={{
                ...s.btnConfirm,
                opacity: replaceTarget ? 1 : 0.4,
                cursor: replaceTarget ? 'pointer' : 'not-allowed',
              }}
              disabled={!replaceTarget}
              onClick={handleConfirmReplace}
            >
              교체 후 학습
            </button>
          </div>
        </div>
      )}

      {/* ── 상대 스킬 목록 ── */}
      {!learnTarget && (
        learnable.length === 0 ? (
          <div style={s.emptyBox}>
            <p style={s.emptyText}>학습할 수 있는 새 스킬이 없습니다</p>
            <button style={s.btnSkip} onClick={handleSkip}>건너뛰기 →</button>
          </div>
        ) : (
          <>
            <p style={s.hint}>
              {isFull
                ? '⚠️ 슬롯 가득 참 — 학습 시 교체할 스킬을 선택해야 합니다'
                : '1개를 선택하거나 건너뛸 수 있습니다'}
            </p>
            <div style={s.skillList}>
              {learnable.map(def => {
                const color = TIER_COLOR[def.tier]
                const turns = SKILL_LEARN_TURNS[def.tier]
                return (
                  <div key={def.id} style={{ ...s.skillCard, borderColor: color }}>
                    <div style={s.cardTop}>
                      <span style={{ ...s.tierBadge, color, borderColor: color }}>
                        {TIER_LABEL[def.tier]}
                      </span>
                      <span style={s.skillName}>{def.name}</span>
                      <span style={s.skillMeta}>CD {def.cooldown} · 코스트 {def.cost}</span>
                    </div>
                    <p style={s.skillDesc}>{def.description}</p>
                    <div style={s.cardBottom}>
                      <span style={s.waitLabel}>⏳ {turns}전투 후 습득</span>
                      <button
                        style={{ ...s.btnLearn, borderColor: color, color }}
                        onClick={() => handleLearnClick(def.id)}
                      >
                        {isFull ? '교체 학습' : '학습'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <button style={s.btnSkip} onClick={handleSkip}>건너뛰기</button>
          </>
        )
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:           { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem 1rem', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', gap: '1rem' },
  header:         { textAlign: 'center' as const },
  title:          { fontSize: '1.5rem', fontWeight: 900, color: '#c0aaff', margin: '0 0 0.25rem' },
  sub:            { color: '#888', margin: 0, fontSize: '0.9rem' },
  oppName:        { color: '#ff9966', fontWeight: 700 },
  hint:           { color: '#888', fontSize: '0.8rem', margin: 0, textAlign: 'center' as const },
  emptyBox:       { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' },
  emptyText:      { color: '#666', fontSize: '0.9rem' },
  skillList:      { display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: '420px' },
  skillCard:      { background: '#1a1a2e', border: '2px solid', borderRadius: '10px', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column' as const, gap: '0.35rem' },
  cardTop:        { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  tierBadge:      { fontSize: '0.65rem', fontWeight: 700, border: '1px solid', borderRadius: '3px', padding: '1px 5px', flexShrink: 0 },
  skillName:      { fontSize: '0.95rem', fontWeight: 700, color: '#e8e8ff', flex: 1 },
  skillMeta:      { fontSize: '0.65rem', color: '#666' },
  skillDesc:      { fontSize: '0.8rem', color: '#bbb', margin: 0 },
  cardBottom:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  waitLabel:      { fontSize: '0.75rem', color: '#888' },
  btnLearn:       { background: 'transparent', border: '1px solid', borderRadius: '6px', padding: '0.3rem 0.9rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' },
  btnSkip:        { background: '#1a1a2e', border: '1px solid #444', borderRadius: '10px', color: '#888', padding: '0.7rem 2rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 },
  // 내 스킬 패널
  mySkillBox:     { width: '100%', maxWidth: '420px', background: '#15152a', border: '1px solid #2a2a3e', borderRadius: '10px', padding: '0.6rem 0.9rem' },
  mySkillHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' },
  mySkillTitle:   { fontSize: '0.78rem', color: '#c0aaff', fontWeight: 700 },
  slotBadge:      { fontSize: '0.85rem', fontWeight: 900 },
  mySkillList:    { display: 'flex', flexDirection: 'column' as const, gap: '0.3rem' },
  mySkillRow:     { display: 'flex', alignItems: 'center', gap: '0.45rem' },
  tierDot:        { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  mySkillName:    { fontSize: '0.82rem', fontWeight: 700, flex: 1 },
  mySkillMeta:    { fontSize: '0.68rem', color: '#666' },
  noSkillText:    { color: '#555', fontSize: '0.8rem', margin: 0 },
  // 교체 선택 UI
  replaceBox:     { width: '100%', maxWidth: '420px', background: '#1a1010', border: '1px solid #5a2020', borderRadius: '12px', padding: '0.9rem' },
  replaceTitle:   { margin: '0 0 0.3rem', fontSize: '0.85rem', color: '#ff9966', fontWeight: 700 },
  replaceSub:     { margin: '0 0 0.6rem', fontSize: '0.8rem', color: '#aaa' },
  replaceList:    { display: 'flex', flexDirection: 'column' as const, gap: '0.3rem', marginBottom: '0.75rem' },
  replaceItem:    { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.6rem', border: '1px solid', borderRadius: '6px', cursor: 'pointer', width: '100%', textAlign: 'left' as const },
  replaceItemName:{ fontSize: '0.82rem', fontWeight: 700, flex: 1 },
  replaceItemMeta:{ fontSize: '0.68rem', color: '#888' },
  removeTag:      { fontSize: '0.68rem', fontWeight: 700, color: '#ff6644', background: '#3a1010', border: '1px solid #ff6644', borderRadius: '4px', padding: '1px 5px' },
  replaceBtnRow:  { display: 'flex', gap: '0.5rem' },
  btnCancel:      { flex: 1, background: '#1a1a2e', border: '1px solid #444', borderRadius: '8px', color: '#888', padding: '0.55rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 },
  btnConfirm:     { flex: 2, background: '#7c3cfc', border: 'none', borderRadius: '8px', color: '#fff', padding: '0.55rem', fontSize: '0.85rem', fontWeight: 700 },
}
