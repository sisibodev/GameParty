import { useState, useEffect } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { CharacterDef } from '../types'
import { mergePlayerSkills } from '../types'
import { MAX_SKILL_SLOTS } from '../constants'
import charactersRaw from '../data/characters.json'
import skillsRaw from '../data/skills.json'

const CHARACTERS = charactersRaw as CharacterDef[]
const charName = (id: number) => CHARACTERS.find(c => c.id === id)?.name ?? `#${id}`

interface SkillDef { id: string; name: string; tier: string; description: string }
const SKILLS = skillsRaw as SkillDef[]
const findSkill = (id: string) => SKILLS.find(s => s.id === id)

const TIER_COLOR: Record<string, string> = {
  common: '#888', rare: '#44aaff', hero: '#cc66ff', legend: '#ffcc22',
}
const TIER_LABEL: Record<string, string> = {
  common: '일반', rare: '레어', hero: '영웅', legend: '전설',
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
  const won    = matchInfo.playerWon
  const isLast = playerMatchIndex >= playerMatches.length - 1

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
    if (won && !isLast) {
      advancePlayerMatch()
    } else {
      useGameStore.setState({ phase: 'tournament' })
    }
  }

  return (
    <div style={s.root}>
      <div style={s.stageBar}>{matchInfo.stageLabel}</div>

      <div style={{ ...s.resultBadge, background: won ? '#1a3a1a' : '#3a1a1a', border: `2px solid ${won ? '#44ff88' : '#ff4444'}` }}>
        <span style={{ fontSize: '2.5rem' }}>{won ? '🏆' : '💀'}</span>
        <span style={{ ...s.resultText, color: won ? '#44ff88' : '#ff4444' }}>
          {won ? '승리!' : '패배'}
        </span>
      </div>

      <div style={s.matchup}>
        <span style={s.myName}>{charName(pid)}</span>
        <span style={s.vsText}>VS</span>
        <span style={s.oppName}>{charName(oppId)}</span>
      </div>

      <div style={s.statsBox}>
        <div style={s.statsHeader}>
          <span style={s.colMe}>나</span>
          <span style={s.colLabel}></span>
          <span style={s.colOpp}>상대</span>
        </div>
        <StatRow label="잔여 HP"  myVal={Math.ceil(myFinalHp)} oppVal={Math.ceil(oppFinalHp)} higher />
        <StatRow label="총 턴수"  myVal={totalTurns} oppVal={totalTurns} shared />
        <StatRow label="크리티컬" myVal={myCrits}   oppVal={oppCrits}   higher />
        <StatRow label="회피"     myVal={myEvades}  oppVal={oppEvades}  higher />
      </div>

      {/* ── Skill pick: select from opponent skills ── */}
      {hasPendingSkills && pickPhase === 'pick' && (
        <div style={s.skillBox}>
          <div style={s.skillTitle}>⚔️ 전리품 스킬 — 하나를 습득할 수 있습니다</div>
          <div style={s.skillHint}>스킬 슬롯 {currentSkills.length}/{MAX_SKILL_SLOTS}{isFull ? ' · 슬롯이 가득 찼습니다. 교체할 수 있습니다.' : ''}</div>
          <div style={s.skillList}>
            {pendingBattleSkillOpts!.map(sid => {
              const sk = findSkill(sid)
              if (!sk) return null
              const tc = TIER_COLOR[sk.tier] ?? '#888'
              return (
                <div key={sid} style={s.skillRow}>
                  <div style={s.skillInfo}>
                    <span style={{ ...s.tierBadge, color: tc, borderColor: tc }}>{TIER_LABEL[sk.tier] ?? sk.tier}</span>
                    <span style={s.skillName}>{sk.name}</span>
                    <span style={s.skillDesc}>{sk.description}</span>
                  </div>
                  <button style={s.btnAcquire} onClick={() => handlePickSkill(sid)}>
                    {isFull ? '교체' : '습득'}
                  </button>
                </div>
              )
            })}
          </div>
          <button style={s.btnSkip} onClick={handleSkip}>건너뛰기</button>
        </div>
      )}

      {/* ── Replace step: pick which current skill to remove ── */}
      {hasPendingSkills && pickPhase === 'replace' && (
        <div style={s.skillBox}>
          <div style={s.skillTitle}>교체할 스킬을 선택하세요</div>
          {chosenSkill && (() => {
            const sk = findSkill(chosenSkill)
            const tc = TIER_COLOR[sk?.tier ?? ''] ?? '#888'
            return (
              <div style={{ ...s.skillRow, background: '#1a2a1a', border: '1px solid #44aa66', marginBottom: '0.25rem' }}>
                <div style={s.skillInfo}>
                  <span style={{ ...s.tierBadge, color: tc, borderColor: tc }}>{TIER_LABEL[sk?.tier ?? ''] ?? sk?.tier}</span>
                  <span style={s.skillName}>{sk?.name}</span>
                  <span style={s.skillDesc}>{sk?.description}</span>
                </div>
                <span style={{ fontSize: '0.7rem', color: '#44ff88', whiteSpace: 'nowrap' }}>습득 예정</span>
              </div>
            )
          })()}
          <div style={s.skillHint}>현재 보유 스킬 중 하나를 교체합니다:</div>
          <div style={s.skillList}>
            {currentSkills.map(sid => {
              const sk = findSkill(sid)
              if (!sk) return null
              const tc = TIER_COLOR[sk.tier] ?? '#888'
              return (
                <div key={sid} style={s.skillRow}>
                  <div style={s.skillInfo}>
                    <span style={{ ...s.tierBadge, color: tc, borderColor: tc }}>{TIER_LABEL[sk.tier] ?? sk.tier}</span>
                    <span style={s.skillName}>{sk.name}</span>
                    <span style={s.skillDesc}>{sk.description}</span>
                  </div>
                  <button
                    style={{ ...s.btnAcquire, background: '#3a1a1a', borderColor: '#ff4444', color: '#ff6666' }}
                    onClick={() => handleReplace(sid)}
                  >
                    교체
                  </button>
                </div>
              )
            })}
          </div>
          <button style={s.btnSkip} onClick={handleSkip}>취소 (건너뛰기)</button>
        </div>
      )}

      {/* ── Next button: visible when no pending skill pick or pick is done ── */}
      {(!hasPendingSkills || pickPhase === 'done') && (
        <button style={won && !isLast ? s.btnNext : s.btnTournament} onClick={handleNext}>
          {won && !isLast ? '다음 경기 →' : '토너먼트 결과 →'}
        </button>
      )}
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
    <div style={s.statRow}>
      <span style={{ ...s.statVal, color: myBetter ? '#44ff88' : '#ccc', textAlign: 'left' as const }}>{myVal}</span>
      <span style={s.statLabel}>{label}</span>
      <span style={{ ...s.statVal, color: oppBetter ? '#ff6644' : '#ccc', textAlign: 'right' as const }}>{oppVal}</span>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:         { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 1rem', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', gap: '1.25rem' },
  stageBar:     { fontSize: '1rem', fontWeight: 700, color: '#ffd700', letterSpacing: '0.1em' },
  resultBadge:  { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', borderRadius: '16px', padding: '1.5rem 3rem' },
  resultText:   { fontSize: '2rem', fontWeight: 900, letterSpacing: '0.05em' },
  matchup:      { display: 'flex', alignItems: 'center', gap: '1rem' },
  myName:       { color: '#c0aaff', fontWeight: 700, fontSize: '1.1rem' },
  vsText:       { color: '#555', fontWeight: 900 },
  oppName:      { color: '#ff9966', fontWeight: 700, fontSize: '1.1rem' },
  statsBox:     { background: '#1a1a2e', border: '1px solid #333', borderRadius: '12px', padding: '1rem', width: '100%', maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  statsHeader:  { display: 'flex', justifyContent: 'space-between', paddingBottom: '0.4rem', borderBottom: '1px solid #333' },
  colMe:        { color: '#c0aaff', fontWeight: 700, fontSize: '0.8rem', flex: 1, textAlign: 'left' as const },
  colLabel:     { color: '#666', fontSize: '0.75rem', flex: 1, textAlign: 'center' as const },
  colOpp:       { color: '#ff9966', fontWeight: 700, fontSize: '0.8rem', flex: 1, textAlign: 'right' as const },
  statRow:      { display: 'flex', alignItems: 'center' },
  statVal:      { fontWeight: 700, fontSize: '0.95rem', flex: 1 },
  statLabel:    { color: '#666', fontSize: '0.75rem', flex: 1, textAlign: 'center' as const },
  btnNext:      { background: '#7c5cfc', border: 'none', borderRadius: '10px', color: '#fff', padding: '0.85rem 2.5rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, marginTop: '0.5rem' },
  btnTournament:{ background: '#1a3a5c', border: '1px solid #44aaff', borderRadius: '10px', color: '#44aaff', padding: '0.85rem 2.5rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, marginTop: '0.5rem' },
  skillBox:     { background: '#141428', border: '1px solid #5544aa', borderRadius: '12px', padding: '1rem', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  skillTitle:   { fontSize: '0.9rem', fontWeight: 700, color: '#c0aaff' },
  skillHint:    { fontSize: '0.72rem', color: '#666' },
  skillList:    { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  skillRow:     { display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#1a1a2e', borderRadius: '8px', padding: '0.5rem 0.75rem', border: '1px solid #2a2a44' },
  skillInfo:    { flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' },
  tierBadge:    { fontSize: '0.6rem', fontWeight: 700, border: '1px solid', borderRadius: '3px', padding: '0 5px', alignSelf: 'flex-start' },
  skillName:    { fontSize: '0.85rem', fontWeight: 700, color: '#e8e8ff' },
  skillDesc:    { fontSize: '0.68rem', color: '#777' },
  btnAcquire:   { background: '#1a3a1a', border: '1px solid #44aa66', borderRadius: '6px', color: '#44ff88', padding: '0.3rem 0.7rem', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' as const },
  btnSkip:      { background: 'transparent', border: '1px solid #444', borderRadius: '6px', color: '#666', padding: '0.3rem 1rem', cursor: 'pointer', fontSize: '0.78rem', alignSelf: 'center' },
}
