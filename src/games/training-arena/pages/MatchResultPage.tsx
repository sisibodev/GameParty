import { useEffect, useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { CharacterDef } from '../types'
import charactersRaw from '../data/characters.json'
import passiveSkillsRaw from '../data/passiveSkills.json'
import skillsRaw from '../data/skills.json'
import '../styles/arena.css'

const CHARACTERS = charactersRaw as CharacterDef[]
const charName = (id: number) => CHARACTERS.find(c => c.id === id)?.name ?? `#${id}`

interface PassiveDef { id: string; name: string; description: string; effect: { type: string; [key: string]: unknown } }
const PASSIVES = passiveSkillsRaw as PassiveDef[]
const findPassive = (id: string) => PASSIVES.find(p => p.id === id)

interface SkillDef { id: string; name: string; tier: string; description: string }
const SKILLS = skillsRaw as SkillDef[]
const findSkill = (id: string) => SKILLS.find(s => s.id === id)

const STAT_LABELS: Record<string, string> = { vit: 'VIT', str: 'STR', agi: 'AGI', int: 'INT', luk: 'LUK' }

const TIER_COLOR: Record<string, string> = {
  common: 'var(--ink-dim)', rare: 'var(--cyan)', hero: 'var(--violet-glow)', legend: 'var(--gold)',
}
const TIER_LABEL: Record<string, string> = {
  common: '일반', rare: '희귀', hero: '영웅', legend: '전설',
}

const MAX_PASSIVE_SLOTS = 6

export default function MatchResultPage() {
  const {
    playerMatches, playerMatchIndex, activeSlot,
    pendingReward, pendingPassiveOpts, pendingSkillOpts,
    acquireBattlePassive, acquireBattleSkill,
    initMatchPassives, initMatchSkills,
    completeMatchAndAdvance,
  } = useGameStore()

  // 교체 모드: 슬롯이 꽉 찼을 때 제안 ID를 저장하고 교체 대상 선택 UI로 전환
  const [replaceMode, setReplaceMode] = useState<{ type: 'skill' | 'passive'; proposedId: string } | null>(null)
  // 툴팁: 내 스킬 칩 호버 시 표시
  const [hoveredChip, setHoveredChip] = useState<{ id: string; type: 'skill' | 'passive'; x: number; y: number } | null>(null)

  const matchInfo = playerMatches[playerMatchIndex]
  const match     = matchInfo?.matchResult

  useEffect(() => {
    if (matchInfo?.playerWon) {
      initMatchSkills()
      initMatchPassives()
    }
  }, [playerMatchIndex, matchInfo?.playerWon])

  // 매치가 바뀌면 교체 모드 초기화
  useEffect(() => { setReplaceMode(null) }, [playerMatchIndex])

  if (!match || !activeSlot || !matchInfo) return null

  const pid    = activeSlot.characterId
  const oppId  = matchInfo.opponentId
  const won    = match.winnerId === pid

  const lastEntry  = match.log.length > 0 ? match.log[match.log.length - 1] : null
  const myFinalHp  = Math.max(0, lastEntry ? (lastEntry.hpAfter[pid]   ?? match.initialHp[pid])   : match.initialHp[pid])
  const oppFinalHp = Math.max(0, lastEntry ? (lastEntry.hpAfter[oppId] ?? match.initialHp[oppId]) : match.initialHp[oppId])

  const totalTurns = match.log.length
  const myCrits    = match.log.filter(e => e.actorId === pid  && e.critical).length
  const oppCrits   = match.log.filter(e => e.actorId === oppId && e.critical).length
  const myEvades   = match.log.filter(e => e.targetId === pid  && e.evaded).length
  const oppEvades  = match.log.filter(e => e.targetId === oppId && e.evaded).length

  const matchesThru = playerMatches.slice(0, playerMatchIndex + 1)
  const wins   = matchesThru.filter(m => m.playerWon).length
  const losses = matchesThru.filter(m => !m.playerWon).length

  const h2h       = matchesThru.filter(m => m.opponentId === oppId)
  const h2hWins   = h2h.filter(m => m.playerWon).length
  const h2hLosses = h2h.filter(m => !m.playerWon).length

  const panelBg = won ? 'rgba(94,240,168,.03)' : 'rgba(255,92,110,.03)'

  const myPassives     = activeSlot.passiveSkills ?? []
  const isPassiveFull  = myPassives.length >= MAX_PASSIVE_SLOTS
  const uniqueSkills   = activeSlot.initialSkills
  const commonSkills   = activeSlot.acquiredSkills
  const isSkillFull    = commonSkills.length >= 3

  function chipEnter(e: React.MouseEvent, id: string, type: 'skill' | 'passive') {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setHoveredChip({ id, type, x: r.left, y: r.bottom + 6 })
  }

  // ── 우승 오른쪽 패널 렌더 ───────────────────────────────────────────────────

  function renderWinPanel() {
    const hasPicks = pendingSkillOpts !== null || pendingPassiveOpts !== null

    // 교체 대상 선택 모드
    if (replaceMode) {
      const { type, proposedId } = replaceMode
      const isSkillReplace = type === 'skill'
      const proposed = isSkillReplace ? findSkill(proposedId) : findPassive(proposedId)
      const list = isSkillReplace ? commonSkills : myPassives
      const accentColor = isSkillReplace ? 'var(--gold)' : 'var(--violet-glow)'

      return (
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: accentColor }}>
              {isSkillReplace ? '교체할 액티브 스킬 선택' : '교체할 패시브 스킬 선택'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginTop: 4 }}>
              <span style={{ color: accentColor, fontWeight: 700 }}>{proposed?.name}</span> 을(를) 습득합니다. 교체할 스킬을 선택하세요.
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
            {list.map(sid => {
              const item = isSkillReplace ? findSkill(sid) : findPassive(sid)
              if (!item) return null
              return (
                <div key={sid} style={{
                  flex: '1 1 calc(50% - 6px)', display: 'flex', flexDirection: 'column' as const, gap: 6,
                  background: 'rgba(255,92,110,.06)', border: '1px solid rgba(255,92,110,.25)',
                  borderRadius: 10, padding: '10px 12px',
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)' }}>{item.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--ink-mute)', flex: 1 }}>{item.description}</span>
                  <button
                    className="arena-btn"
                    style={{ padding: '5px 0', fontSize: 11, borderRadius: 6, width: '100%', color: 'var(--red)', borderColor: 'rgba(255,92,110,.4)' }}
                    onClick={() => {
                      isSkillReplace ? acquireBattleSkill(proposedId, sid) : acquireBattlePassive(proposedId, sid)
                      setReplaceMode(null)
                    }}
                  >
                    이걸로 교체
                  </button>
                </div>
              )
            })}
          </div>
          <button className="arena-btn" style={{ alignSelf: 'flex-start' as const, fontSize: 12, padding: '6px 16px' }} onClick={() => setReplaceMode(null)}>
            ← 취소
          </button>
        </div>
      )
    }

    // 모두 완료 → 다음 경기
    if (!hasPicks) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--ink-mute)' }}>모든 선택을 마쳤습니다.</div>
          <button className="arena-btn arena-btn-primary" style={{ padding: '12px 32px', fontSize: 14, borderRadius: 12, alignSelf: 'flex-start' as const }} onClick={() => acquireBattlePassive(null)}>
            다음 경기 →
          </button>
        </div>
      )
    }

    // 통합 선택 UI
    return (
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>

        {/* ── 내 스킬 현황 ── */}
        <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,.03)', border: '1px solid var(--line)', borderRadius: 10 }}>
          {/* 액티브 */}
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-mute)', letterSpacing: '.1em', marginBottom: 6 }}>
            내 액티브 스킬 <span style={{ color: 'var(--ink-dim)', fontWeight: 400 }}>고유 {uniqueSkills.length}/3 · 공통 {commonSkills.length}/3</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5, marginBottom: 4 }}>
            {uniqueSkills.length === 0 && <span style={{ fontSize: 10, color: 'var(--ink-dim)' }}>없음</span>}
            {uniqueSkills.map(sid => {
              const sk = findSkill(sid)
              return sk ? (
                <span key={sid}
                  onMouseEnter={e => chipEnter(e, sid, 'skill')}
                  onMouseLeave={() => setHoveredChip(null)}
                  style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'rgba(255,214,107,.15)', border: '1px solid rgba(255,214,107,.4)', color: 'var(--gold)', cursor: 'default' }}>
                  {sk.name}
                </span>
              ) : null
            })}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5, marginBottom: 10 }}>
            {commonSkills.length === 0 && <span style={{ fontSize: 10, color: 'var(--ink-dim)' }}>없음</span>}
            {commonSkills.map(sid => {
              const sk = findSkill(sid)
              return sk ? (
                <span key={sid}
                  onMouseEnter={e => chipEnter(e, sid, 'skill')}
                  onMouseLeave={() => setHoveredChip(null)}
                  style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'rgba(103,232,249,.1)', border: '1px solid rgba(103,232,249,.3)', color: 'var(--cyan)', cursor: 'default' }}>
                  {sk.name}
                </span>
              ) : null
            })}
          </div>
          {/* 패시브 */}
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-mute)', letterSpacing: '.1em', marginBottom: 6 }}>
            내 패시브 스킬 <span style={{ color: 'var(--ink-dim)', fontWeight: 400 }}>{myPassives.length}/{MAX_PASSIVE_SLOTS}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5 }}>
            {myPassives.length === 0 && <span style={{ fontSize: 10, color: 'var(--ink-dim)' }}>없음</span>}
            {myPassives.map(pid2 => {
              const p = findPassive(pid2)
              return p ? (
                <span key={pid2}
                  onMouseEnter={e => chipEnter(e, pid2, 'passive')}
                  onMouseLeave={() => setHoveredChip(null)}
                  style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'rgba(161,99,255,.1)', border: '1px solid rgba(161,99,255,.3)', color: 'var(--violet-glow)', cursor: 'default' }}>
                  {p.name}
                </span>
              ) : null
            })}
          </div>
        </div>

        {/* ── 액티브 스킬 선택지 (가로 3개) ── */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: '.08em', marginBottom: 8 }}>
            액티브 스킬 습득 {isSkillFull && <span style={{ color: 'var(--ink-mute)', fontWeight: 400 }}>(교체)</span>}
          </div>
          {pendingSkillOpts === null || pendingSkillOpts.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--ink-dim)' }}>배울 수 있는 액티브 스킬 없음</div>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              {pendingSkillOpts.slice(0, 3).map(skillId => {
                const sk = findSkill(skillId)
                if (!sk) return null
                return (
                  <div key={skillId} style={{
                    flex: '1 1 0', display: 'flex', flexDirection: 'column' as const, gap: 6,
                    background: 'rgba(255,214,107,.05)', border: '1px solid rgba(255,214,107,.22)',
                    borderRadius: 10, padding: '11px 13px',
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: TIER_COLOR[sk.tier], border: `1px solid ${TIER_COLOR[sk.tier]}55`, borderRadius: 999, padding: '2px 7px', alignSelf: 'flex-start' as const }}>
                      {TIER_LABEL[sk.tier] ?? sk.tier}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>{sk.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--ink-mute)', lineHeight: 1.5, flex: 1 }}>{sk.description}</span>
                    <button
                      className="arena-btn arena-btn-primary"
                      style={{ padding: '6px 0', fontSize: 12, borderRadius: 8, width: '100%', marginTop: 2 }}
                      onClick={() => isSkillFull ? setReplaceMode({ type: 'skill', proposedId: skillId }) : acquireBattleSkill(skillId)}
                    >
                      {isSkillFull ? '교체 선택' : '배우기'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── 패시브 스킬 선택지 (2열 그리드) ── */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--violet-glow)', letterSpacing: '.08em', marginBottom: 8 }}>
            패시브 스킬 습득 {isPassiveFull && <span style={{ color: 'var(--ink-mute)', fontWeight: 400 }}>(교체)</span>}
          </div>
          {pendingPassiveOpts === null || pendingPassiveOpts.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--ink-dim)' }}>배울 수 있는 패시브 없음</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {pendingPassiveOpts.map(passiveId => {
                const p = findPassive(passiveId)
                if (!p) return null
                return (
                  <div key={passiveId} style={{
                    display: 'flex', flexDirection: 'column' as const, gap: 6,
                    background: 'rgba(161,99,255,.06)', border: '1px solid rgba(161,99,255,.22)',
                    borderRadius: 10, padding: '11px 13px',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--violet-glow)' }}>{p.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--ink-mute)', lineHeight: 1.5, flex: 1 }}>{p.description}</span>
                    <button
                      className="arena-btn arena-btn-primary"
                      style={{ padding: '6px 0', fontSize: 12, borderRadius: 8, width: '100%', marginTop: 2 }}
                      onClick={() => isPassiveFull ? setReplaceMode({ type: 'passive', proposedId: passiveId }) : acquireBattlePassive(passiveId)}
                    >
                      {isPassiveFull ? '교체 선택' : '습득'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <button className="arena-btn" style={{ alignSelf: 'flex-start' as const, fontSize: 12, padding: '6px 16px' }} onClick={() => acquireBattlePassive(null)}>
          건너뛰기
        </button>
      </div>
    )
  }

  const tooltipInfo = hoveredChip
    ? (hoveredChip.type === 'skill' ? findSkill(hoveredChip.id) : findPassive(hoveredChip.id))
    : null

  return (
    <div className="arena-bg-arena" style={{ display: 'flex', flexDirection: 'column' as const, minHeight: '100vh' }}>
      {/* 툴팁 오버레이 */}
      {hoveredChip && tooltipInfo && (
        <div style={{
          position: 'fixed', left: hoveredChip.x, top: hoveredChip.y, zIndex: 9999,
          maxWidth: 220, pointerEvents: 'none',
          background: 'rgba(12,8,24,.97)', border: '1px solid rgba(161,99,255,.4)',
          borderRadius: 10, padding: '10px 13px',
          boxShadow: '0 4px 24px rgba(0,0,0,.65)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 5, color: hoveredChip.type === 'skill' ? 'var(--gold)' : 'var(--violet-glow)' }}>
            {tooltipInfo.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-mute)', lineHeight: 1.55 }}>
            {tooltipInfo.description}
          </div>
        </div>
      )}
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--line)', background: 'rgba(10,6,20,.7)', backdropFilter: 'blur(8px)' }}>
        <span className="arena-mono" style={{ fontSize: 10, color: 'var(--violet-glow)', letterSpacing: '.15em' }}>MATCH RESULT</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>{matchInfo.stageLabel}</span>
          <button className="arena-btn arena-btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { if (confirm('메인 화면으로 나가시겠습니까?\n현재까지의 진행은 저장되어 있습니다.')) useGameStore.setState({ phase: 'slot_select' }) }}>✕ 나가기</button>
        </div>
      </div>

      {/* Main body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left panel */}
        <div style={{ flex: 3, overflowY: 'auto' as const, padding: '28px 24px', borderRight: '1px solid var(--line)', background: panelBg, display: 'flex', flexDirection: 'column' as const, gap: 20 }}>

          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            <div style={{
              fontSize: 56, fontWeight: 900, letterSpacing: '.1em', lineHeight: 1,
              color: won ? 'var(--gold)' : 'var(--red)',
              textShadow: won
                ? '0 0 24px #ffd66b88, 0 0 60px #ffd66b44'
                : '0 0 24px #ff5c6e88, 0 0 60px #ff5c6e44',
            }}>
              {won ? 'VICTORY' : 'DEFEAT'}
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink-mute)' }}>
              {totalTurns}턴 만에 {charName(oppId)} {won ? '격파' : '에게 패배'} · {matchInfo.stageLabel}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, padding: '12px 16px', background: 'rgba(255,255,255,.03)', border: '1px solid var(--line)', borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--ink-mute)' }}>골드 보상</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--gold)' }}>+{pendingReward?.goldEarned ?? 0} G</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--ink-mute)' }}>이번 대회</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>{wins}승</span>
                <span style={{ fontSize: 12, color: 'var(--ink-mute)' }}>·</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)' }}>{losses}패</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--ink-mute)' }}>상대전적</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>{h2hWins}승</span>
                <span style={{ fontSize: 12, color: 'var(--ink-mute)' }}>·</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)' }}>{h2hLosses}패</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--violet-glow)', letterSpacing: '.1em' }}>내 성장 스탯</div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6, padding: '12px 16px', background: 'rgba(255,255,255,.03)', border: '1px solid var(--line)', borderRadius: 12 }}>
              {(Object.entries(activeSlot.growthStats) as [string, number][]).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: 'var(--ink-mute)' }}>{STAT_LABELS[k] ?? k}</span>
                  <span className="arena-mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--violet-glow)', letterSpacing: '.1em' }}>전투 결과</div>
            <div className="arena-panel" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 6, paddingBottom: 6, borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--violet-glow)' }}>나</span>
                <span style={{ fontSize: 10, color: 'var(--ink-mute)' }}></span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', textAlign: 'right' as const }}>상대</span>
              </div>
              <StatRow label="잔여 HP"  myVal={Math.ceil(myFinalHp)} oppVal={Math.ceil(oppFinalHp)} higher />
              <StatRow label="크리티컬" myVal={myCrits}   oppVal={oppCrits}   higher />
              <StatRow label="회피"     myVal={myEvades}  oppVal={oppEvades}  higher />
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div style={{ flex: 7, overflowY: 'auto' as const, padding: '28px 24px', display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
          {won ? renderWinPanel() : (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--red)' }}>다음 준비</div>
              <div style={{ fontSize: 13, color: 'var(--ink-mute)' }}>아쉽지만 다음 기회를 노리세요.</div>
              <button
                className="arena-btn"
                style={{ padding: '12px 32px', fontSize: 14, borderRadius: 12, alignSelf: 'flex-start' as const, marginTop: 8 }}
                onClick={() => completeMatchAndAdvance(false)}
              >
                토너먼트 결과 →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatRow({
  label, myVal, oppVal, higher, shared,
}: {
  label: string
  myVal: number
  oppVal: number
  higher?: boolean
  shared?: boolean
}) {
  const myBetter  = !shared && (higher ? myVal > oppVal : myVal < oppVal)
  const oppBetter = !shared && (higher ? oppVal > myVal : oppVal < myVal)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 6 }}>
      <span className="arena-mono" style={{ fontSize: 14, fontWeight: 700, color: myBetter ? 'var(--green)' : 'var(--ink-dim)' }}>{myVal}</span>
      <span style={{ fontSize: 10, color: 'var(--ink-mute)', textAlign: 'center' as const, minWidth: 60 }}>{label}</span>
      <span className="arena-mono" style={{ fontSize: 14, fontWeight: 700, color: oppBetter ? 'var(--red)' : 'var(--ink-dim)', textAlign: 'right' as const }}>{oppVal}</span>
    </div>
  )
}
