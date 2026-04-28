import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { Archetype, CharacterDef, CombatStats, GrowthStats, MatchLogEntry, SkillDef } from '../types'
import { deriveStats } from '../engine/statDeriver'
import { NPC_BASE_GROWTH, RIVAL_STAT_PER_ROUND } from '../constants'
import Portrait from '../components/ui/Portrait'
import charactersRaw from '../data/characters.json'
import skillsRaw    from '../data/skills.json'
import '../styles/arena.css'

const CHARACTERS = charactersRaw as CharacterDef[]
const SKILLS     = skillsRaw    as SkillDef[]

const charName  = (id: number) => CHARACTERS.find(c => c.id === id)?.name ?? `#${id}`
const skillName = (id: string) => SKILLS.find(s => s.id === id)?.name ?? id

const SPEED_MS: Record<string, number> = { '1x': 500, '2x': 220, '4x': 70 }

const ARCHETYPE_LABEL: Record<Archetype, string> = {
  warrior: '전사', mage: '마법사', assassin: '암살자', tank: '탱커',
  support: '지원', ranger: '레인저', berserker: '광전사', paladin: '팔라딘',
}

const SKILL_TIER_COLOR: Record<string, string> = {
  common: '#aaa', rare: '#44aaff', hero: '#c05cfc', legend: '#ffd700',
}

function loadSpeed(): '1x' | '2x' | '4x' {
  const v = localStorage.getItem('bgp_battle_speed')
  return v === '1x' || v === '2x' || v === '4x' ? v : '1x'
}

function npcGrowth(round: number, isRival = false): GrowthStats {
  const b = NPC_BASE_GROWTH + (round - 1) + (isRival ? RIVAL_STAT_PER_ROUND * round : 0)
  return { hp: b, str: b, agi: b, int: b, luk: b }
}

function computeAtbGauges(
  log: MatchLogEntry[],
  cursor: number,
  pid: number,
  oppId: number,
  playerSpd: number,
  oppSpd: number,
): { pidGauge: number; oppGauge: number } {
  let lastPidAct = -1
  let lastOppAct = -1
  for (let i = 0; i < cursor; i++) {
    if (log[i].actorId === pid)   lastPidAct = i
    if (log[i].actorId === oppId) lastOppAct = i
  }
  const totalSpd = (playerSpd + oppSpd) || 1
  const pidSteps = cursor - (lastPidAct + 1)
  const oppSteps = cursor - (lastOppAct + 1)
  return {
    pidGauge: Math.min(100, Math.round((pidSteps / (totalSpd / playerSpd)) * 100)),
    oppGauge: Math.min(100, Math.round((oppSteps / (totalSpd / oppSpd))    * 100)),
  }
}

export default function BattlePage() {
  const {
    playerMatches, playerMatchIndex, activeSlot, lastTournament,
  } = useGameStore()

  const matchInfo = playerMatches[playerMatchIndex]
  const match     = matchInfo?.matchResult

  const [logCursor, setLogCursor] = useState(0)
  const [speed, setSpeed]         = useState<'1x' | '2x' | '4x'>(loadSpeed)
  const [done, setDone]           = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLogCursor(0)
    setDone(false)
  }, [playerMatchIndex])

  useEffect(() => {
    if (done || !match) return
    if (logCursor >= match.log.length) { setDone(true); return }
    const ms = SPEED_MS[speed]
    const id = setInterval(() => {
      setLogCursor(c => {
        const next = c + 1
        if (next >= match.log.length) { clearInterval(id); setDone(true) }
        return next
      })
    }, ms)
    return () => clearInterval(id)
  }, [done, speed, logCursor >= (match?.log.length ?? 0)])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logCursor])

  if (!match || !activeSlot || !matchInfo) return null

  const pid          = activeSlot.characterId
  const oppId        = match.char1Id === pid ? match.char2Id : match.char1Id
  const playerSkills = match.char1Id === pid ? (match.char1Skills ?? []) : (match.char2Skills ?? [])
  const oppSkills    = match.char1Id === pid ? (match.char2Skills ?? []) : (match.char1Skills ?? [])

  const playerChar = CHARACTERS.find(c => c.id === pid)
  const oppChar    = CHARACTERS.find(c => c.id === oppId)

  const round     = activeSlot.currentRound
  const isRival           = (activeSlot.rivalIds ?? []).includes(oppId)
  const oppGrowth = npcGrowth(round, isRival)
  const playerStats: CombatStats | null = playerChar
    ? deriveStats(playerChar.baseCombat, activeSlot.growthStats, playerChar.archetype) : null
  const oppStats: CombatStats | null = oppChar
    ? deriveStats(oppChar.baseCombat, oppGrowth, oppChar.archetype) : null

  const isWinnerCandidate = lastTournament?.winner === oppId
  const isDarkhorse       = (lastTournament?.darkhorses ?? []).includes(oppId)

  const entry       = logCursor > 0 ? match.log[logCursor - 1] : null
  const currentTurn = entry?.turn ?? 0

  const pidHp   = Math.max(0, entry ? (entry.hpAfter[pid]    ?? match.initialHp[pid])    : match.initialHp[pid])
  const oppHp   = Math.max(0, entry ? (entry.hpAfter[oppId]  ?? match.initialHp[oppId])  : match.initialHp[oppId])
  const pidMana = Math.max(0, entry ? (entry.manaAfter[pid]   ?? match.initialMana[pid])  : match.initialMana[pid])
  const oppMana = Math.max(0, entry ? (entry.manaAfter[oppId] ?? match.initialMana[oppId]): match.initialMana[oppId])

  const { pidGauge, oppGauge } = computeAtbGauges(
    match.log, logCursor, pid, oppId,
    playerStats?.spd ?? 1, oppStats?.spd ?? 1,
  )

  const allLog    = match.log.slice(0, logCursor)
  const isWin     = match.winnerId === pid
  const gold      = activeSlot.gold ?? null

  function handleSetSpeed(sp: '1x' | '2x' | '4x') {
    setSpeed(sp)
    localStorage.setItem('bgp_battle_speed', sp)
  }

  function handleSkip() {
    setLogCursor(match.log.length)
    setDone(true)
  }

  return (
    <div className="arena-bg-arena" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: '1px solid var(--line)',
        background: 'rgba(10,6,20,.7)', backdropFilter: 'blur(8px)',
      }}>
        <div>
          <div className="arena-kr" style={{ fontSize: 16 }}>배틀 그랑프리</div>
          <div className="arena-mono" style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 2 }}>
            BATTLE · TURN {currentTurn}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--ink-dim)' }}>
            {matchInfo.stageLabel} ·{' '}
            <span style={{ color: 'var(--violet-glow)', fontWeight: 700 }}>{charName(pid)}</span>
            {' vs '}
            <span style={{ color: 'var(--red)', fontWeight: 700 }}>{charName(oppId)}</span>
          </span>
          <div className="arena-mono" style={{ padding: '6px 12px', borderRadius: 999, background: 'rgba(124,80,240,.15)', border: '1px solid rgba(124,80,240,.4)', fontSize: 11, fontWeight: 700, color: 'var(--violet-glow)' }}>
            ROUND {round}
          </div>
          {gold != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, background: 'rgba(255,214,107,.1)', border: '1px solid rgba(255,214,107,.4)' }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%,#fff3b0,#c98a1a)' }} />
              <span className="arena-mono" style={{ fontWeight: 700, color: 'var(--gold)', fontSize: 12 }}>{gold.toLocaleString()}</span>
            </div>
          )}
          <button className="arena-btn arena-btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { if (confirm('메인 화면으로 나가시겠습니까?\n현재까지의 진행은 저장되어 있습니다.')) useGameStore.setState({ phase: 'slot_select' }) }}>✕ 나가기</button>
        </div>
      </div>

      {/* Main — 2열×2행 Grid: 선이 픽셀 단위로 맞춤 */}
      <div style={{
        flex: 1, overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: '7fr 3fr',
        gridTemplateRows: '1fr auto',
      }}>

        {/* [1,1] 캐릭터 패널 */}
        <div style={{ overflow: 'hidden', display: 'flex', alignItems: 'center', padding: '20px 16px', gap: 12 }}>
          <CharPanel
            char={playerChar} tone={pid % 6} isPlayer
            hp={pidHp} maxHp={match.initialHp[pid]}
            mana={pidMana} maxMana={match.initialMana[pid]}
            isActing={entry?.actorId === pid}
            stats={playerStats}
            uniqueSkills={playerChar?.skills ?? []}
            commonSkills={playerSkills}
          />
          <div style={{ flexShrink: 0, width: 72, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div className="arena-mono" style={{ fontSize: 9, color: 'var(--ink-mute)', letterSpacing: '.15em' }}>TURN</div>
            <div style={{ fontSize: 56, fontWeight: 900, color: 'var(--gold)', lineHeight: 1, textShadow: '0 0 28px rgba(255,214,107,.55)' }}>
              {currentTurn}
            </div>
          </div>
          <CharPanel
            char={oppChar} tone={oppId % 6}
            isRival={isRival} isWinnerCandidate={isWinnerCandidate} isDarkhorse={isDarkhorse}
            hp={oppHp} maxHp={match.initialHp[oppId]}
            mana={oppMana} maxMana={match.initialMana[oppId]}
            isActing={entry?.actorId === oppId}
            stats={oppStats}
            uniqueSkills={oppChar?.skills ?? []}
            commonSkills={oppSkills}
          />
        </div>

        {/* [1,2] 전투 로그 */}
        <div style={{ borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', background: 'rgba(6,4,14,.6)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span className="arena-mono" style={{ fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '.1em', fontWeight: 700 }}>COMBAT LOG</span>
            <span className="arena-mono" style={{ fontSize: 10, color: 'var(--ink-mute)' }}>{logCursor} / {match.log.length}</span>
          </div>
          <div ref={logRef} style={{ flex: 1, overflowY: 'auto' as const, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {allLog.map((e, i) => (
              <LogRow key={i} entry={e} pid={pid} />
            ))}
          </div>
        </div>

        {/* [2,1] ATB + 속도 버튼 */}
        <div style={{ borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 20px', background: 'rgba(0,0,0,.2)' }}>
            <div className="arena-mono" style={{ fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '.15em', marginBottom: 10 }}>
              ACTIVE TIME BATTLE
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {([
                { name: charName(pid),   gauge: pidGauge, isPlayer: true  },
                { name: charName(oppId), gauge: oppGauge, isPlayer: false },
              ] as const).map(({ name, gauge, isPlayer }) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 80, fontSize: 12, fontWeight: 700, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, color: isPlayer ? 'var(--violet-glow)' : 'var(--red)' }}>
                    {name}
                  </span>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,.06)', overflow: 'hidden', border: '1px solid rgba(255,255,255,.06)' }}>
                    <div style={{
                      height: '100%', borderRadius: 4, transition: 'width .2s ease',
                      width: `${gauge}%`,
                      background: isPlayer
                        ? 'linear-gradient(90deg,#a478ff,#67e8f9)'
                        : 'linear-gradient(90deg,#ff7ab6,#ff5c6e)',
                    }} />
                  </div>
                  <span className="arena-mono" style={{ width: 36, fontSize: 11, fontWeight: 700, flexShrink: 0, textAlign: 'right' as const, color: isPlayer ? 'var(--violet-glow)' : 'var(--red)' }}>
                    {gauge}%
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding: '10px 20px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,.15)' }}>
            {(['1x', '2x', '4x'] as const).map(sp => (
              <button
                key={sp}
                className={`arena-btn${speed === sp ? ' arena-btn-primary' : ''}`}
                style={{ padding: '5px 14px', fontSize: 12, borderRadius: 6 }}
                onClick={() => handleSetSpeed(sp)}
              >{sp}</button>
            ))}
            <button
              className="arena-btn"
              style={{ padding: '5px 14px', fontSize: 12, borderRadius: 6 }}
              onClick={handleSkip}
              disabled={done}
            >{'>>'}</button>
          </div>
        </div>

        {/* [2,2] 결과 + 버튼 */}
        <div style={{ borderTop: '1px solid var(--line)', borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'rgba(6,4,14,.6)' }}>
          {done ? (
            <>
              <div style={{ textAlign: 'center' as const, padding: '14px 10px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: isWin ? 'var(--green)' : 'var(--red)' }}>
                  {isWin ? '🏆 승리!' : '💀 패배'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-mute)' }}>승자: {charName(match.winnerId)}</div>
              </div>
              <div style={{ padding: '8px 14px 14px' }}>
                <button
                  className="arena-btn arena-btn-primary"
                  style={{ width: '100%', justifyContent: 'center', borderRadius: 12, padding: '12px 0', fontSize: 14 }}
                  onClick={() => useGameStore.setState({ phase: 'match_result' })}
                >
                  결과 확인 →
                </button>
              </div>
            </>
          ) : null}
        </div>

      </div>
    </div>
  )
}

function CharPanel({
  char, tone, isPlayer, isRival, isWinnerCandidate, isDarkhorse,
  hp, maxHp, mana, maxMana, isActing, stats, uniqueSkills, commonSkills,
}: {
  char: CharacterDef | undefined
  tone: number
  isPlayer?: boolean
  isRival?: boolean
  isWinnerCandidate?: boolean
  isDarkhorse?: boolean
  hp: number
  maxHp: number
  mana: number
  maxMana: number
  isActing: boolean
  stats: CombatStats | null
  uniqueSkills: string[]
  commonSkills: string[]
}) {
  const arch        = char?.archetype ?? 'warrior'
  const hpPct       = maxHp   > 0 ? (hp   / maxHp)   * 100 : 0
  const manaPct     = maxMana > 0 ? (mana / maxMana) * 100 : 0
  const hpFillClass = hpPct > 60 ? 'arena-hp-fill' : hpPct > 30 ? 'arena-hp-fill arena-hp-warn' : 'arena-hp-fill arena-hp-danger'

  return (
    <div
      className="arena-panel arena-crt"
      style={{
        flex: 1, minWidth: 0, padding: 14,
        display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden',
        boxShadow: isActing ? '0 0 20px -4px rgba(255,214,107,.6)' : undefined,
        border: isActing ? '1px solid rgba(255,214,107,.5)' : undefined,
      }}
    >
      {/* Portrait + name + badges */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ flexShrink: 0, width: 80 }}>
          <Portrait height={80} tone={tone} label={ARCHETYPE_LABEL[arch] ?? arch} />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{char?.name ?? '???'}</span>
            {isPlayer && (
              <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--violet)', borderRadius: 3, padding: '1px 5px', color: '#fff' }}>나</span>
            )}
            {isRival && (
              <span style={{ fontSize: 9, fontWeight: 700, background: 'rgba(255,92,110,.2)', border: '1px solid rgba(255,92,110,.5)', borderRadius: 3, padding: '1px 5px', color: '#ff5c6e' }}>라이벌</span>
            )}
            {isWinnerCandidate && (
              <span style={{ fontSize: 9, fontWeight: 700, background: 'rgba(255,214,107,.15)', border: '1px solid rgba(255,214,107,.5)', borderRadius: 3, padding: '1px 5px', color: 'var(--gold)' }}>우승후보</span>
            )}
            {isDarkhorse && (
              <span style={{ fontSize: 9, fontWeight: 700, background: 'rgba(103,232,249,.15)', border: '1px solid rgba(103,232,249,.5)', borderRadius: 3, padding: '1px 5px', color: 'var(--cyan)' }}>다크호스</span>
            )}
          </div>
          {stats && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'rgba(255,122,182,.1)', border: '1px solid rgba(255,122,182,.3)', color: '#ff7ab6', alignSelf: 'flex-start' }}>
                ATK {Math.round(stats.pAtk)}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'rgba(74,158,255,.1)', border: '1px solid rgba(74,158,255,.3)', color: '#4a9eff', alignSelf: 'flex-start' }}>
                DEF {Math.round(stats.pDef)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* HP / MP */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="arena-mono" style={{ fontSize: 10, color: 'var(--ink-mute)' }}>HP</span>
          <span className="arena-mono" style={{ fontSize: 10, color: 'var(--ink-dim)' }}>{Math.ceil(hp)}/{maxHp}</span>
        </div>
        <div className="arena-hpbar"><div className={hpFillClass} style={{ width: `${hpPct}%` }} /></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="arena-mono" style={{ fontSize: 10, color: 'var(--ink-mute)' }}>MP</span>
          <span className="arena-mono" style={{ fontSize: 10, color: 'var(--ink-dim)' }}>{Math.ceil(mana)}/{maxMana}</span>
        </div>
        <div className="arena-hpbar"><div className="arena-mp-fill" style={{ width: `${manaPct}%` }} /></div>
      </div>

      {/* Skills — 고유 3 + 공통 3 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 8, color: 'var(--ink-mute)', letterSpacing: '.1em', marginBottom: 1 }}>고유 스킬</div>
        {Array.from({ length: 3 }).map((_, i) => {
          const id    = uniqueSkills[i]
          const def   = id ? SKILLS.find(s => s.id === id) : undefined
          const name  = def?.name ?? id ?? ''
          const color = def ? (SKILL_TIER_COLOR[def.tier] ?? '#aaa') : '#aaa'
          return id ? (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 6px', borderRadius: 4, background: `${color}0a`, height: 22 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{name}</span>
            </div>
          ) : (
            <div key={`empty-u${i}`} style={{ height: 22, borderRadius: 4, background: 'rgba(255,255,255,.02)', border: '1px dashed rgba(255,255,255,.06)' }} />
          )
        })}
        <div style={{ height: 1, background: 'rgba(255,255,255,.06)', margin: '2px 0' }} />
        <div style={{ fontSize: 8, color: 'var(--ink-mute)', letterSpacing: '.1em', marginBottom: 1 }}>공통 스킬</div>
        {Array.from({ length: 3 }).map((_, i) => {
          const id    = commonSkills[i]
          const def   = id ? SKILLS.find(s => s.id === id) : undefined
          const name  = def?.name ?? id ?? ''
          const color = def ? (SKILL_TIER_COLOR[def.tier] ?? '#aaa') : '#aaa'
          return id ? (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 6px', borderRadius: 4, background: `${color}0a`, height: 22 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{name}</span>
            </div>
          ) : (
            <div key={`empty-c${i}`} style={{ height: 22, borderRadius: 4, background: 'rgba(255,255,255,.02)', border: '1px dashed rgba(255,255,255,.06)' }} />
          )
        })}
      </div>
    </div>
  )
}

function LogRow({ entry, pid }: { entry: MatchLogEntry; pid: number }) {
  const isMyAction = entry.actorId === pid
  const actionDesc = entry.action === 'skill'
    ? `${skillName(entry.skillId ?? '')} → ${charName(entry.targetId)}`
    : `일반 공격 → ${charName(entry.targetId)}`

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '4px 8px', borderRadius: 4, fontSize: 11,
      background: isMyAction ? 'rgba(124,80,240,.08)' : 'rgba(255,255,255,.02)',
    }}>
      <span className="arena-mono" style={{ fontSize: 9, color: 'var(--ink-mute)', minWidth: 20, flexShrink: 0 }}>T{entry.turn}</span>
      <span style={{ fontWeight: 700, minWidth: 48, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flexShrink: 0, color: isMyAction ? 'var(--violet-glow)' : 'var(--red)' }}>
        {charName(entry.actorId)}
      </span>
      {entry.critical && (
        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: 'rgba(255,214,107,.2)', border: '1px solid rgba(255,214,107,.5)', color: 'var(--gold)', flexShrink: 0 }}>CRIT</span>
      )}
      <span style={{ flex: 1, color: 'var(--ink-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{actionDesc}</span>
      <span className="arena-mono" style={{ fontSize: 11, fontWeight: 700, flexShrink: 0, textAlign: 'right' as const, minWidth: 44, color: entry.evaded ? 'var(--ink-mute)' : 'var(--red)' }}>
        {entry.evaded ? 'MISS' : `-${entry.damage}`}
      </span>
    </div>
  )
}
