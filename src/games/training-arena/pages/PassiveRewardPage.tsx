import { useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import passiveSkillsRaw from '../data/passiveSkills.json'
import '../styles/arena.css'

type PassiveDef = {
  id: string
  name: string
  description: string
  effect: { type: string; [key: string]: unknown }
}

const PASSIVES_BY_ID: Record<string, PassiveDef> = Object.fromEntries(
  (passiveSkillsRaw as PassiveDef[]).map(p => [p.id, p]),
)

const EFFECT_TYPE_COLOR: Record<string, string> = {
  stat_boost:   'var(--gold)',
  lifesteal:    '#ff7eb3',
  thorns:       '#ff6644',
  regen:        'var(--green)',
  iron_will:    '#67e8f9',
  battle_focus: '#c78bff',
  first_strike: '#ffd66b',
  counter:      '#ff9966',
}

const EFFECT_TYPE_LABEL: Record<string, string> = {
  stat_boost:   '스탯 강화',
  lifesteal:    '흡혈',
  thorns:       '반사',
  regen:        '재생',
  iron_will:    '불굴',
  battle_focus: '집중',
  first_strike: '선제',
  counter:      '반격',
}

const MAX_PASSIVE_SLOTS = 6

export default function PassiveRewardPage() {
  const { activeSlot, pendingPassiveRewardOpts, acquirePassiveReward } = useGameStore()
  const [hoveredId,  setHoveredId]  = useState<string | null>(null)
  const [proposedId, setProposedId] = useState<string | null>(null)

  if (!activeSlot) return null

  const myPassives   = activeSlot.passiveSkills ?? []
  const passiveCount = myPassives.length
  const isFull       = passiveCount >= MAX_PASSIVE_SLOTS

  const opts    = pendingPassiveRewardOpts ?? []
  const optDefs = opts.map(id => PASSIVES_BY_ID[id]).filter((d): d is PassiveDef => !!d)

  // 교체 대상 선택 모드
  if (proposedId) {
    const proposed = PASSIVES_BY_ID[proposedId]
    return (
      <div className="arena-bg-arena" style={s.root}>
        <div style={s.topBar}>
          <span className="arena-mono" style={s.topLabel}>PASSIVE REWARD</span>
        </div>

        <div style={s.titleSection}>
          <h2 style={s.title}>교체할 패시브 선택</h2>
          <p style={s.subtitle}>
            <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{proposed?.name}</span> 을(를) 습득합니다. 어떤 패시브와 교체하겠습니까?
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, width: '100%', maxWidth: 700, justifyContent: 'center' }}>
          {myPassives.map(pid => {
            const p = PASSIVES_BY_ID[pid]
            if (!p) return null
            const effectType = p.effect.type
            const badgeColor = EFFECT_TYPE_COLOR[effectType] ?? 'var(--ink-dim)'
            return (
              <div key={pid} style={{
                flex: '1 1 260px', maxWidth: 280, borderRadius: 12, padding: 16,
                border: '1px solid rgba(255,92,110,.35)', background: 'rgba(255,92,110,.06)',
                display: 'flex', flexDirection: 'column', gap: '0.6rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, border: '1px solid', borderRadius: 999, padding: '2px 8px', color: badgeColor, borderColor: `${badgeColor}55` }}>
                    {EFFECT_TYPE_LABEL[effectType] ?? effectType}
                  </span>
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--red)' }}>{p.name}</div>
                <p style={{ fontSize: '0.82rem', color: 'var(--ink-mute)', margin: 0, lineHeight: 1.55, flex: 1 }}>{p.description}</p>
                <button
                  className="arena-btn"
                  style={{ width: '100%', justifyContent: 'center', borderRadius: 8, padding: '9px 0', fontSize: 13, fontWeight: 700, color: 'var(--red)', borderColor: 'rgba(255,92,110,.4)' }}
                  onClick={() => { acquirePassiveReward(proposedId, pid); setProposedId(null) }}
                >
                  이걸로 교체
                </button>
              </div>
            )
          })}
        </div>

        <button className="arena-btn arena-btn-ghost" style={s.skipBtn} onClick={() => setProposedId(null)}>
          ← 취소
        </button>
      </div>
    )
  }

  return (
    <div className="arena-bg-arena" style={s.root}>
      {/* Top bar */}
      <div style={s.topBar}>
        <span className="arena-mono" style={s.topLabel}>PASSIVE REWARD</span>
        <button className="arena-btn arena-btn-ghost" style={s.exitBtn} onClick={() => acquirePassiveReward(null)}>
          건너뛰기 ✕
        </button>
      </div>

      {/* Title */}
      <div style={s.titleSection}>
        <h2 style={s.title}>패시브 스킬 습득</h2>
        <p style={s.subtitle}>라운드 보상으로 새로운 패시브를 획득합니다</p>
        <div style={s.slotInfo}>
          보유 패시브:{' '}
          <span style={{ color: isFull ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>
            {passiveCount} / {MAX_PASSIVE_SLOTS}
          </span>
          {isFull && <span style={{ color: 'var(--ink-mute)', marginLeft: 6 }}>— 선택 시 교체</span>}
        </div>
      </div>

      {/* 보유 패시브 목록 */}
      {myPassives.length > 0 && (
        <div style={{ width: '100%', maxWidth: 900, padding: '10px 14px', background: 'rgba(255,255,255,.03)', border: '1px solid var(--line)', borderRadius: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-mute)', letterSpacing: '.1em', marginBottom: 8 }}>내 패시브</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {myPassives.map(pid => {
              const p = PASSIVES_BY_ID[pid]
              return p ? (
                <span key={pid} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'rgba(161,99,255,.1)', border: '1px solid rgba(161,99,255,.3)', color: 'var(--violet-glow)' }}>
                  {p.name}
                </span>
              ) : null
            })}
          </div>
        </div>
      )}

      {/* 선택지 */}
      {optDefs.length === 0 ? (
        <div style={s.emptyBox}>
          <p style={s.emptyText}>패시브 선택지 없음</p>
          <button className="arena-btn arena-btn-ghost" style={s.skipBtn} onClick={() => acquirePassiveReward(null)}>
            건너뛰기
          </button>
        </div>
      ) : (
        <>
          <div style={s.cardsRow}>
            {optDefs.map(def => {
              const effectType = def.effect.type
              const badgeColor = EFFECT_TYPE_COLOR[effectType] ?? 'var(--ink-dim)'
              const isHovered  = hoveredId === def.id
              return (
                <div
                  key={def.id}
                  style={{
                    ...s.card,
                    borderColor: isHovered ? 'rgba(161,99,255,.75)' : 'rgba(161,99,255,.3)',
                    background:  isHovered ? 'rgba(161,99,255,.08)' : 'rgba(255,255,255,.03)',
                  }}
                  onMouseEnter={() => setHoveredId(def.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <div style={s.cardTop}>
                    <span style={{ ...s.badge, color: badgeColor, borderColor: `${badgeColor}55` }}>
                      {EFFECT_TYPE_LABEL[effectType] ?? effectType}
                    </span>
                  </div>
                  <div style={s.skillName}>{def.name}</div>
                  <p style={s.skillDesc}>{def.description}</p>
                  <button
                    className="arena-btn arena-btn-primary"
                    style={s.selectBtn}
                    onClick={() => {
                      if (isFull) {
                        setProposedId(def.id)
                      } else {
                        acquirePassiveReward(def.id)
                      }
                    }}
                  >
                    {isFull ? '교체 선택' : '선택'}
                  </button>
                </div>
              )
            })}
          </div>

          <button className="arena-btn arena-btn-ghost" style={s.skipBtn} onClick={() => acquirePassiveReward(null)}>
            건너뛰기
          </button>
        </>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:         { display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh', padding: '0 1rem 2rem', color: 'var(--ink)', gap: '1.25rem' },
  topBar:       { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderBottom: '1px solid var(--line)' },
  topLabel:     { fontSize: '0.7rem', fontWeight: 700, color: 'var(--violet-glow)', letterSpacing: '.12em' },
  exitBtn:      { fontSize: 12, padding: '5px 14px' },
  titleSection: { textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' },
  title:        { fontSize: '1.5rem', fontWeight: 900, color: 'var(--violet-glow)', margin: 0, letterSpacing: '-.01em' },
  subtitle:     { fontSize: '0.85rem', color: 'var(--ink-mute)', margin: 0 },
  slotInfo:     { fontSize: '0.85rem', color: 'var(--ink-dim)', marginTop: 4 },
  cardsRow:     { display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: 900 },
  card:         { flex: '1 1 260px', maxWidth: 280, borderRadius: 12, padding: 16, border: '1px solid', display: 'flex', flexDirection: 'column', gap: '0.6rem', transition: 'border-color 0.15s, background 0.15s' },
  cardTop:      { display: 'flex', alignItems: 'center' },
  badge:        { fontSize: '0.65rem', fontWeight: 700, border: '1px solid', borderRadius: 999, padding: '2px 8px' },
  skillName:    { fontSize: '1.1rem', fontWeight: 800, color: 'var(--gold)', letterSpacing: '-.01em' },
  skillDesc:    { fontSize: '0.82rem', color: 'var(--ink-mute)', margin: 0, lineHeight: 1.55, flex: 1 },
  selectBtn:    { width: '100%', justifyContent: 'center', borderRadius: 8, padding: '9px 0', fontSize: 13, fontWeight: 700, marginTop: 4 },
  skipBtn:      { fontSize: 13, padding: '8px 28px', borderRadius: 999 },
  emptyBox:     { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginTop: '2rem' },
  emptyText:    { color: 'var(--ink-mute)', fontSize: '0.9rem', margin: 0 },
}
