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

interface SkillDef { id: string; name: string; tier: string; description: string }
const SKILLS = skillsRaw as SkillDef[]
const findSkill = (id: string) => SKILLS.find(s => s.id === id)

const TIER_COLOR: Record<string, string> = {
  common: '#9aa3b2', rare: '#67e8f9', hero: '#c78bff', legend: '#ffd66b',
}
const TIER_LABEL: Record<string, string> = {
  common: '보통', rare: '희귀', hero: '영웅', legend: '전설',
}

export default function MatchResultPage() {
  const {
    playerMatches, playerMatchIndex, activeSlot,
    advancePlayerMatch, pendingBattleSkillOpts, acquireBattleSkill,
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
  // match.winnerId is the authoritative source — same value shown in battle log
  const won    = match.winnerId === pid

  const lastEntry  = match.log.length > 0 ? match.log[match.log.length - 1] : null
  const myFinalHp  = Math.max(0, lastEntry ? (lastEntry.hpAfter[pid]   ?? match.initialHp[pid])   : match.initialHp[pid])
  const oppFinalHp = Math.max(0, lastEntry ? (lastEntry.hpAfter[oppId] ?? match.initialHp[oppId]) : match.initialHp[oppId])

  const totalTurns = match.log.length
  const myCrits    = match.log.filter(e => e.actorId === pid  && e.critical).length
  const oppCrits   = match.log.filter(e => e.actorId === oppId && e.critical).length
  const myEvades   = match.log.filter(e => e.targetId === pid  && e.evaded).length
  const oppEvades  = match.log.filter(e => e.targetId === oppId && e.evaded).length

  // Set pending battle skill opts after a win (first time this match result shows)
  const oppSkillsFromMatch = won
    ? (match.char1Id === pid ? match.char2Skills : match.char1Skills)
    : []

  useEffect(() => {
    if (won && oppSkillsFromMatch.length > 0 && pendingBattleSkillOpts === null) {
      useGameStore.setState({ pendingBattleSkillOpts: oppSkillsFromMatch })
    }
  // run once per match result page show
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
      // 승리 시: 상대 스킬 학습 페이지로 이동
      useGameStore.setState({ phase: 'skill_learn' })
    } else {
      useGameStore.getState().completeMatchAndAdvance(false)
    }
  }

  return (
    <div className="arena-bg-arena" style={{ display: 'flex', flexDirection: 'column' as const, minHeight: '100vh' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--line)', background: 'rgba(10,6,20,.7)', backdropFilter: 'blur(8px)' }}>
        <span className="arena-mono" style={{ fontSize: 10, color: 'var(--violet-glow)', letterSpacing: '.15em' }}>MATCH RESULT</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>{matchInfo.stageLabel}</span>
      </div>

      <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 20 }}>
        {/* VICTORY / DEFEAT */}
        <div className="arena-crt" style={{ width: '100%', maxWidth: 400, padding: '28px 24px', background: won ? 'rgba(94,240,168,.06)' : 'rgba(255,92,110,.06)', border: `1px solid ${won ? 'rgba(94,240,168,.4)' : 'rgba(255,92,110,.4)'}`, borderRadius: 20, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 48 }}>{won ? '🏆' : '💀'}</div>
          <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: '.05em', color: won ? 'var(--green)' : 'var(--red)' }}>
            {won ? '승리!' : '패배'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
            <span style={{ fontWeight: 700, color: 'var(--violet-glow)' }}>{charName(pid)}</span>
            <span style={{ color: 'var(--ink-mute)', fontWeight: 900 }}>VS</span>
            <span style={{ fontWeight: 700, color: 'var(--red)' }}>{charName(oppId)}</span>
          </div>
        </div>

        {/* Stats comparison */}
        <div className="arena-panel" style={{ width: '100%', maxWidth: 400, padding: '16px 20px', display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 6, paddingBottom: 8, borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--violet-glow)' }}>나</span>
            <span style={{ fontSize: 10, color: 'var(--ink-mute)' }}></span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', textAlign: 'right' as const }}>상대</span>
          </div>
          <StatRow label="잔여 HP"  myVal={Math.ceil(myFinalHp)} oppVal={Math.ceil(oppFinalHp)} higher />
          <StatRow label="총 턴수"  myVal={totalTurns} oppVal={totalTurns} shared />
          <StatRow label="크리티컬" myVal={myCrits}   oppVal={oppCrits}   higher />
          <StatRow label="회피"     myVal={myEvades}  oppVal={oppEvades}  higher />
        </div>

        {/* Skill pick: select from opponent skills */}
        {hasPendingSkills && pickPhase === 'pick' && (
          <div style={{ width: '100%', maxWidth: 400, background: 'rgba(124,80,240,.08)', border: '1px solid rgba(164,120,255,.4)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--violet-glow)' }}>⚔️ 전리품 스킬 — 하나를 습득</div>
            <div style={{ fontSize: 11, color: 'var(--ink-mute)' }}>스킬 슬롯 {currentSkills.length}/{MAX_SKILL_SLOTS}{isFull ? ' · 슬롯 가득 — 교체 가능' : ''}</div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
              {pendingBattleSkillOpts!.map(sid => {
                const sk = findSkill(sid)
                if (!sk) return null
                const tc = TIER_COLOR[sk.tier] ?? 'var(--ink-mute)'
                return (
                  <div key={sid} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,.03)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 3 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: tc, border: `1px solid ${tc}55`, borderRadius: 999, padding: '1px 6px', alignSelf: 'flex-start' }}>{TIER_LABEL[sk.tier] ?? sk.tier}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{sk.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--green)' }}>{sk.description}</span>
                    </div>
                    <button className="arena-btn arena-btn-primary" style={{ padding: '6px 14px', fontSize: 12, borderRadius: 8, whiteSpace: 'nowrap' as const }} onClick={() => handlePickSkill(sid)}>
                      {isFull ? '교체' : '습득'}
                    </button>
                  </div>
                )
              })}
            </div>
            <button className="arena-btn" style={{ alignSelf: 'center', fontSize: 12, padding: '6px 16px' }} onClick={handleSkip}>건너뛰기</button>
          </div>
        )}

        {/* Replace step: pick which current skill to remove */}
        {hasPendingSkills && pickPhase === 'replace' && (
          <div style={{ width: '100%', maxWidth: 400, background: 'rgba(124,80,240,.08)', border: '1px solid rgba(164,120,255,.4)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--violet-glow)' }}>교체할 스킬을 선택하세요</div>
            {chosenSkill && (() => {
              const sk = findSkill(chosenSkill)
              const tc = TIER_COLOR[sk?.tier ?? ''] ?? 'var(--ink-mute)'
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(94,240,168,.06)', border: '1px solid rgba(94,240,168,.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 4 }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 3 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: tc, border: `1px solid ${tc}55`, borderRadius: 999, padding: '1px 6px', alignSelf: 'flex-start' }}>{TIER_LABEL[sk?.tier ?? ''] ?? sk?.tier}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{sk?.name}</span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--green)', whiteSpace: 'nowrap' as const }}>습득 예정</span>
                </div>
              )
            })()}
            <div style={{ fontSize: 11, color: 'var(--ink-mute)' }}>현재 보유 스킬 중 하나를 교체합니다:</div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
              {currentSkills.map(sid => {
                const sk = findSkill(sid)
                if (!sk) return null
                const tc = TIER_COLOR[sk.tier] ?? 'var(--ink-mute)'
                return (
                  <div key={sid} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,.03)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 3 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: tc, border: `1px solid ${tc}55`, borderRadius: 999, padding: '1px 6px', alignSelf: 'flex-start' }}>{TIER_LABEL[sk.tier] ?? sk.tier}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{sk.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--green)' }}>{sk.description}</span>
                    </div>
                    <button
                      className="arena-btn"
                      style={{ padding: '6px 14px', fontSize: 12, borderRadius: 8, borderColor: 'rgba(255,92,110,.5)', color: 'var(--red)', whiteSpace: 'nowrap' as const }}
                      onClick={() => handleReplace(sid)}
                    >
                      교체
                    </button>
                  </div>
                )
              })}
            </div>
            <button className="arena-btn" style={{ alignSelf: 'center', fontSize: 12, padding: '6px 16px' }} onClick={handleSkip}>취소 (건너뛰기)</button>
          </div>
        )}

        {/* Next button */}
        {(!hasPendingSkills || pickPhase === 'done') && (
          <button
            className={`arena-btn ${won ? 'arena-btn-primary' : 'arena-btn'}`}
            style={{ padding: '14px 48px', fontSize: 15, borderRadius: 14, marginTop: 4 }}
            onClick={handleNext}
          >
            {won ? '스킬 학습 →' : '토너먼트 결과 →'}
          </button>
        )}
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
