import { useState, useEffect } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { CharacterDef } from '../types'
import { mergePlayerSkills } from '../types'
import { MAX_SKILL_SLOTS } from '../constants'
import charactersRaw from '../data/characters.json'
import skillsRaw from '../data/skills.json'
import '../styles/arena.css'

const CHARACTERS = charactersRaw as CharacterDef[]
const charName = (id: number) => CHARACTERS.find(c => c.id === id)?.name ?? `#${id}`

interface SkillDef { id: string; name: string; tier: string; description: string; cost: number; cooldown: number }
const SKILLS = skillsRaw as SkillDef[]
const findSkill = (id: string) => SKILLS.find(s => s.id === id)

const TIER_COLOR: Record<string, string> = {
  common: '#9aa3b2', rare: '#67e8f9', hero: '#c78bff', legend: '#ffd66b',
}
const TIER_LABEL: Record<string, string> = {
  common: '보통', rare: '희귀', hero: '영웅', legend: '전설',
}

const STAT_LABELS: Record<string, string> = { hp: 'HP', str: 'STR', agi: 'AGI', int: 'INT', luk: 'LUK' }

export default function MatchResultPage() {
  const {
    playerMatches, playerMatchIndex, activeSlot,
    pendingBattleSkillOpts, acquireBattleSkill, pendingReward,
  } = useGameStore()

  const matchInfo = playerMatches[playerMatchIndex]
  const match     = matchInfo?.matchResult

  const [pickPhase, setPickPhase] = useState<'pick' | 'replace' | 'done'>('pick')
  const [chosenSkill, setChosenSkill] = useState<string | null>(null)

  useEffect(() => {
    setPickPhase('pick')
    setChosenSkill(null)
  }, [playerMatchIndex])

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

  const oppSkillsFromMatch = won
    ? (match.char1Id === pid ? match.char2Skills : match.char1Skills)
    : []

  useEffect(() => {
    if (won && oppSkillsFromMatch.length > 0 && pendingBattleSkillOpts === null) {
      useGameStore.setState({ pendingBattleSkillOpts: oppSkillsFromMatch })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerMatchIndex, won])

  const currentSkills = mergePlayerSkills(activeSlot)
  const isFull = currentSkills.length >= MAX_SKILL_SLOTS
  const hasPendingSkills = won && pendingBattleSkillOpts !== null && pendingBattleSkillOpts.length > 0

  async function handleSkip() {
    await acquireBattleSkill(null)
    setPickPhase('done')
  }

  async function handlePickSkill(skillId: string) {
    if (!isFull) {
      await acquireBattleSkill(skillId)
      setPickPhase('done')
    } else {
      setChosenSkill(skillId)
      setPickPhase('replace')
    }
  }

  async function handleReplace(replaceId: string) {
    if (chosenSkill) {
      await acquireBattleSkill(chosenSkill, replaceId)
      setPickPhase('done')
    }
  }

  function handleNext() {
    if (won) {
      useGameStore.setState({ phase: 'skill_learn' })
    } else {
      useGameStore.getState().completeMatchAndAdvance(false)
    }
  }

  const panelBg = won ? 'rgba(94,240,168,.03)' : 'rgba(255,92,110,.03)'

  return (
    <div className="arena-bg-arena" style={{ display: 'flex', flexDirection: 'column' as const, minHeight: '100vh' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--line)', background: 'rgba(10,6,20,.7)', backdropFilter: 'blur(8px)' }}>
        <span className="arena-mono" style={{ fontSize: 10, color: 'var(--violet-glow)', letterSpacing: '.15em' }}>MATCH RESULT</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>{matchInfo.stageLabel}</span>
      </div>

      {/* Main body: left result panel + right skill panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left panel: result info */}
        <div style={{ flex: 3, overflowY: 'auto' as const, padding: '28px 24px', borderRight: '1px solid var(--line)', background: panelBg, display: 'flex', flexDirection: 'column' as const, gap: 20 }}>

          {/* VICTORY / DEFEAT headline */}
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

          {/* Gold reward + record row */}
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
              <span style={{ fontSize: 12, color: 'var(--ink-mute)' }}>통산전적</span>
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

          {/* Player growthStats */}
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

          {/* Battle stat comparison */}
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

        {/* Right panel: skill selection (win) or next (defeat) */}
        <div style={{ flex: 7, overflowY: 'auto' as const, padding: '28px 24px', display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
          {won ? (
            <>
              {/* Header */}
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--violet-glow)' }}>상대에게서 스킬을 배운다</div>
                <div style={{ fontSize: 12, color: 'var(--ink-mute)' }}>하나를 선택해 습득합니다</div>
                <div style={{ fontSize: 11, color: 'var(--ink-dim)' }}>
                  스킬 슬롯 {currentSkills.length}/{MAX_SKILL_SLOTS}{isFull ? ' · 슬롯 가득 — 교체 가능' : ''}
                </div>
              </div>

              {/* Skill pick phase — 가로 배치 */}
              {hasPendingSkills && pickPhase === 'pick' && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {pendingBattleSkillOpts!.map(sid => {
                      const sk = findSkill(sid)
                      if (!sk) return null
                      const tc = TIER_COLOR[sk.tier] ?? 'var(--ink-mute)'
                      return (
                        <div
                          key={sid}
                          title={`${sk.name} | ${sk.description} | CD:${sk.cooldown}턴 MP:${sk.cost}`}
                          style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 8, background: 'rgba(255,255,255,.03)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px' }}
                        >
                          <span style={{ fontSize: 9, fontWeight: 700, color: tc, border: `1px solid ${tc}55`, borderRadius: 999, padding: '1px 6px', alignSelf: 'flex-start' as const }}>{TIER_LABEL[sk.tier] ?? sk.tier}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{sk.name}</span>
                          <span style={{ fontSize: 11, color: 'var(--ink-mute)', flex: 1 }}>{sk.description}</span>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <span style={{ fontSize: 10, color: 'var(--ink-dim)', background: 'rgba(255,255,255,.05)', border: '1px solid var(--line)', borderRadius: 6, padding: '2px 6px' }}>CD {sk.cooldown}턴</span>
                            <span style={{ fontSize: 10, color: 'var(--ink-dim)', background: 'rgba(255,255,255,.05)', border: '1px solid var(--line)', borderRadius: 6, padding: '2px 6px' }}>MP {sk.cost}</span>
                          </div>
                          <button
                            className="arena-btn arena-btn-primary"
                            style={{ padding: '6px 0', fontSize: 12, borderRadius: 8, width: '100%' }}
                            onClick={() => handlePickSkill(sid)}
                          >
                            {isFull ? '교체' : '습득'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                  <button className="arena-btn" style={{ alignSelf: 'flex-start' as const, fontSize: 12, padding: '6px 16px' }} onClick={handleSkip}>건너뛰기</button>
                </div>
              )}

              {/* Replace phase */}
              {hasPendingSkills && pickPhase === 'replace' && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--violet-glow)' }}>교체할 스킬을 선택하세요</div>
                  {chosenSkill && (() => {
                    const sk = findSkill(chosenSkill)
                    const tc = TIER_COLOR[sk?.tier ?? ''] ?? 'var(--ink-mute)'
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(94,240,168,.06)', border: '1px solid rgba(94,240,168,.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 4 }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: tc, border: `1px solid ${tc}55`, borderRadius: 999, padding: '1px 6px' }}>{TIER_LABEL[sk?.tier ?? ''] ?? sk?.tier}</span>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>{sk?.name}</div>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--green)', whiteSpace: 'nowrap' as const }}>습득 예정</span>
                      </div>
                    )
                  })()}
                  <div style={{ fontSize: 11, color: 'var(--ink-mute)' }}>현재 보유 스킬 중 하나를 교체합니다:</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {currentSkills.map(sid => {
                      const sk = findSkill(sid)
                      if (!sk) return null
                      const tc = TIER_COLOR[sk.tier] ?? 'var(--ink-mute)'
                      return (
                        <div
                          key={sid}
                          title={`${sk.name} | ${sk.description} | CD:${sk.cooldown}턴 MP:${sk.cost}`}
                          style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 6, padding: '10px 8px', background: 'rgba(255,255,255,.03)', border: '1px solid var(--line)', borderRadius: 10, textAlign: 'center' as const }}
                        >
                          <span style={{ fontSize: 8, fontWeight: 700, color: tc, border: `1px solid ${tc}55`, borderRadius: 999, padding: '1px 5px' }}>{TIER_LABEL[sk.tier] ?? sk.tier}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3 }}>{sk.name}</span>
                          <button
                            className="arena-btn"
                            style={{ padding: '3px 8px', fontSize: 10, borderRadius: 6, borderColor: 'rgba(255,92,110,.5)', color: 'var(--red)', whiteSpace: 'nowrap' as const, marginTop: 'auto' }}
                            onClick={() => handleReplace(sid)}
                          >
                            교체
                          </button>
                        </div>
                      )
                    })}
                  </div>
                  <button className="arena-btn" style={{ alignSelf: 'flex-start' as const, fontSize: 12, padding: '6px 16px' }} onClick={handleSkip}>취소 (건너뛰기)</button>
                </div>
              )}

              {/* Current skill slots — 가로 배치 */}
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--violet-glow)', letterSpacing: '.1em' }}>현재 스킬 슬롯</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {Array.from({ length: MAX_SKILL_SLOTS }).map((_, i) => {
                    const sid = currentSkills[i]
                    const sk = sid ? findSkill(sid) : null
                    const tc = sk ? (TIER_COLOR[sk.tier] ?? 'var(--ink-mute)') : 'transparent'
                    return (
                      <div
                        key={i}
                        title={sk ? `${sk.name} | ${sk.description} | CD:${sk.cooldown}턴 MP:${sk.cost}` : undefined}
                        style={{
                          flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
                          gap: 6, padding: '10px 8px', minHeight: 80,
                          background: sk ? 'rgba(255,255,255,.03)' : 'transparent',
                          border: sk ? '1px solid var(--line)' : '1px dashed rgba(255,255,255,.12)',
                          borderRadius: 10, textAlign: 'center' as const,
                        }}
                      >
                        {sk ? (
                          <>
                            <span style={{ fontSize: 8, fontWeight: 700, color: tc, border: `1px solid ${tc}55`, borderRadius: 999, padding: '1px 5px', whiteSpace: 'nowrap' as const }}>{TIER_LABEL[sk.tier] ?? sk.tier}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>{sk.name}</span>
                            {pickPhase === 'replace' && (
                              <button
                                className="arena-btn"
                                style={{ padding: '3px 8px', fontSize: 10, borderRadius: 6, borderColor: 'rgba(255,92,110,.5)', color: 'var(--red)', whiteSpace: 'nowrap' as const, marginTop: 'auto' }}
                                onClick={() => handleReplace(sid)}
                              >
                                교체
                              </button>
                            )}
                          </>
                        ) : (
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,.15)', marginTop: 'auto', marginBottom: 'auto' }}>{i + 1}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Next button (shown after pick is done or no pending skills) */}
              {(!hasPendingSkills || pickPhase === 'done') && (
                <button
                  className="arena-btn arena-btn-primary"
                  style={{ padding: '12px 32px', fontSize: 14, borderRadius: 12, alignSelf: 'flex-start' as const, marginTop: 8 }}
                  onClick={handleNext}
                >
                  스킬 학습 →
                </button>
              )}
            </>
          ) : (
            /* Defeat panel */
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--red)' }}>다음 준비</div>
              <div style={{ fontSize: 13, color: 'var(--ink-mute)' }}>아쉽지만 다음 기회를 노리세요.</div>
              <button
                className="arena-btn"
                style={{ padding: '12px 32px', fontSize: 14, borderRadius: 12, alignSelf: 'flex-start' as const, marginTop: 8 }}
                onClick={handleNext}
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
