import { useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import {
  SKILL_ENHANCE_COSTS,
  SKILL_ENHANCE_MULT,
  MAX_SKILL_ENHANCE_LEVEL,
} from '../constants'
import { mergePlayerSkills } from '../types'
import skillsRaw from '../data/skills.json'
import '../styles/arena.css'

type SkillDef = {
  id: string
  name: string
  tier: string
  description: string
}

const SKILLS_BY_ID: Record<string, SkillDef> = Object.fromEntries(
  (skillsRaw as SkillDef[]).map(s => [s.id, s]),
)

const TIER_COLOR: Record<string, string> = {
  common: '#9aa3b2',
  rare:   '#67e8f9',
  hero:   '#c78bff',
  legend: '#ffd66b',
}

const TIER_LABEL: Record<string, string> = {
  common: '보통',
  rare:   '희귀',
  hero:   '영웅',
  legend: '전설',
}

export default function SkillEnhancePage() {
  const { activeSlot, enhanceSkill, setPhase } = useGameStore()
  const [enhancing, setEnhancing] = useState<string | null>(null)
  const [errorMsg, setErrorMsg]   = useState<string | null>(null)

  if (!activeSlot) return null

  const playerSkills  = mergePlayerSkills(activeSlot)
  const enhancements  = activeSlot.skillEnhancements ?? {}
  const gold          = activeSlot.gold ?? 0

  const skillDefs = playerSkills
    .map(id => SKILLS_BY_ID[id])
    .filter((d): d is SkillDef => !!d)

  async function handleEnhance(skillId: string) {
    setEnhancing(skillId)
    setErrorMsg(null)
    try {
      await enhanceSkill(skillId)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '강화 실패'
      setErrorMsg(msg)
    } finally {
      setEnhancing(null)
    }
  }

  return (
    <div className="arena-bg-arena" style={s.root}>
      {/* Top bar */}
      <div style={s.topBar}>
        <div style={s.topLeft}>
          <span className="arena-mono" style={s.topLabel}>SKILL ENHANCE</span>
          <div style={s.goldDisplay}>
            💰 <span style={s.goldAmount}>{gold}</span>
            <span style={s.goldUnit}> G</span>
          </div>
        </div>
        <button
          className="arena-btn arena-btn-ghost"
          style={s.backBtn}
          onClick={() => setPhase('shop')}
        >
          ← 돌아가기
        </button>
      </div>

      {/* Title section */}
      <div style={s.titleSection}>
        <h2 style={s.title}>스킬 강화</h2>
        <p style={s.subtitle}>골드를 소비해 스킬을 강화합니다</p>
      </div>

      {/* Error message */}
      {errorMsg && (
        <div style={s.errorBox}>{errorMsg}</div>
      )}

      {/* Skill list */}
      {skillDefs.length === 0 ? (
        <div style={s.emptyBox}>
          <p style={s.emptyText}>보유 스킬 없음</p>
        </div>
      ) : (
        <div style={s.skillList}>
          {skillDefs.map(def => {
            const level      = enhancements[def.id] ?? 0
            const isMax      = level >= MAX_SKILL_ENHANCE_LEVEL
            const cost       = isMax ? 0 : SKILL_ENHANCE_COSTS[level]
            const mult       = level > 0 ? SKILL_ENHANCE_MULT[level - 1] : 0
            const canAfford  = gold >= cost
            const tierColor  = TIER_COLOR[def.tier] ?? '#9aa3b2'
            const isEnhancing = enhancing === def.id

            return (
              <div key={def.id} className="arena-panel" style={s.skillCard}>
                {/* Left: skill info */}
                <div style={s.cardInfo}>
                  <div style={s.cardNameRow}>
                    <span style={s.skillName}>{def.name}</span>
                    <span
                      style={{
                        ...s.tierBadge,
                        color: tierColor,
                        borderColor: `${tierColor}55`,
                      }}
                    >
                      {TIER_LABEL[def.tier] ?? def.tier}
                    </span>
                  </div>

                  <div style={s.starsRow}>
                    <span style={s.stars}>
                      <span style={{ color: 'var(--gold)' }}>
                        {'★'.repeat(level)}
                      </span>
                      <span style={{ color: 'rgba(255,255,255,.18)' }}>
                        {'☆'.repeat(MAX_SKILL_ENHANCE_LEVEL - level)}
                      </span>
                    </span>
                    <span style={s.levelText}>
                      Lv.{level} / {MAX_SKILL_ENHANCE_LEVEL}
                    </span>
                  </div>

                  <div style={s.bonusRow}>
                    {level > 0 && (
                      <span style={s.bonusText}>
                        +{Math.round(mult * 100)}% 강화 보너스
                      </span>
                    )}
                    {!isMax ? (
                      <span style={{ fontSize: 12, color: canAfford ? 'var(--gold)' : 'var(--red)' }}>
                        강화 비용: {cost} G
                      </span>
                    ) : (
                      <span style={s.maxText}>최대 레벨</span>
                    )}
                  </div>
                </div>

                {/* Right: enhance button */}
                <div style={s.cardAction}>
                  <button
                    className="arena-btn arena-btn-primary"
                    style={{
                      ...s.enhanceBtn,
                      opacity: (!isMax && canAfford) ? 1 : 0.35,
                      cursor: (!isMax && canAfford) ? 'pointer' : 'not-allowed',
                    }}
                    disabled={isMax || !canAfford || isEnhancing}
                    onClick={() => handleEnhance(def.id)}
                  >
                    {isEnhancing ? '강화 중…' : isMax ? '최대' : '강화'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minHeight: '100vh',
    padding: '0 1rem 2rem',
    color: 'var(--ink)',
    gap: '1.25rem',
  },
  topBar: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem 1rem',
    borderBottom: '1px solid var(--line)',
  },
  topLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.25rem',
  },
  topLabel: {
    fontSize: '0.7rem',
    fontWeight: 700,
    color: 'var(--violet-glow)',
    letterSpacing: '.12em',
  },
  goldDisplay: {
    fontSize: 14,
    color: 'var(--ink-dim)',
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
  goldAmount: {
    fontWeight: 800,
    color: 'var(--gold)',
    fontSize: 15,
  },
  goldUnit: {
    color: 'var(--ink-mute)',
    fontSize: 12,
  },
  backBtn: {
    fontSize: 12,
    padding: '5px 14px',
  },
  titleSection: {
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.35rem',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 900,
    color: 'var(--violet-glow)',
    margin: 0,
    letterSpacing: '-.01em',
  },
  subtitle: {
    fontSize: '0.85rem',
    color: 'var(--ink-mute)',
    margin: 0,
  },
  errorBox: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--red)',
    background: 'rgba(255,60,60,.08)',
    border: '1px solid rgba(255,60,60,.3)',
    borderRadius: 8,
    padding: '0.5rem 1.25rem',
    maxWidth: 600,
    width: '100%',
    textAlign: 'center',
  },
  skillList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    width: '100%',
    maxWidth: 640,
  },
  skillCard: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '1rem',
    padding: '14px 16px',
    width: '100%',
  },
  cardInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  cardNameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  skillName: {
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--ink)',
  },
  tierBadge: {
    fontSize: '0.62rem',
    fontWeight: 700,
    border: '1px solid',
    borderRadius: 999,
    padding: '2px 7px',
    flexShrink: 0,
  },
  starsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  stars: {
    fontSize: '0.85rem',
    letterSpacing: '0.05em',
  },
  levelText: {
    fontSize: '0.75rem',
    color: 'var(--ink-mute)',
    fontWeight: 600,
  },
  bonusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  bonusText: {
    fontSize: '0.78rem',
    color: 'var(--green)',
    fontWeight: 600,
  },
  maxText: {
    fontSize: '0.78rem',
    color: 'var(--ink-mute)',
    fontStyle: 'italic',
  },
  cardAction: {
    flexShrink: 0,
  },
  enhanceBtn: {
    padding: '8px 20px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    minWidth: 68,
    justifyContent: 'center',
  },
  emptyBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
    marginTop: '2rem',
  },
  emptyText: {
    color: 'var(--ink-mute)',
    fontSize: '0.9rem',
    margin: 0,
  },
}
