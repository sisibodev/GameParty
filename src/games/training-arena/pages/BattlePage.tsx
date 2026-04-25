import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { CharacterDef, CombatStats, GrowthStats, MatchLogEntry, SkillDef } from '../types'
import { deriveStats } from '../engine/statDeriver'
import { NPC_BASE_GROWTH } from '../constants'
import charactersRaw from '../data/characters.json'
import skillsRaw    from '../data/skills.json'
import '../styles/arena.css'

const CHARACTERS = charactersRaw as CharacterDef[]
const SKILLS     = skillsRaw    as SkillDef[]

const charName  = (id: number) => CHARACTERS.find(c => c.id === id)?.name ?? `#${id}`
const skillName = (id: string) => SKILLS.find(s => s.id === id)?.name ?? id

const SPEED_MS: Record<string, number> = { '1x': 500, '2x': 220, '4x': 70 }

function loadSpeed(): '1x' | '2x' | '4x' {
  const v = localStorage.getItem('bgp_battle_speed')
  return v === '1x' || v === '2x' || v === '4x' ? v : '1x'
}

function npcGrowth(round: number): GrowthStats {
  const b = NPC_BASE_GROWTH + (round - 1)
  return { hp: b, str: b, agi: b, int: b, luk: b }
}

export default function BattlePage() {
  const { playerMatches, playerMatchIndex, activeSlot } = useGameStore()

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
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logCursor])

  if (!match || !activeSlot || !matchInfo) return null

  const pid        = activeSlot.characterId
  const oppId      = match.char1Id === pid ? match.char2Id : match.char1Id
  const playerSkills = match.char1Id === pid ? (match.char1Skills ?? []) : (match.char2Skills ?? [])
  const oppSkills    = match.char1Id === pid ? (match.char2Skills ?? []) : (match.char1Skills ?? [])

  const playerChar = CHARACTERS.find(c => c.id === pid)
  const oppChar    = CHARACTERS.find(c => c.id === oppId)
  const growth     = npcGrowth(activeSlot.currentRound)
  const playerStats: CombatStats | null = playerChar
    ? deriveStats(playerChar.baseCombat, activeSlot.growthStats, playerChar.archetype) : null
  const oppStats: CombatStats | null = oppChar
    ? deriveStats(oppChar.baseCombat, growth, oppChar.archetype) : null

  function handleSetSpeed(sp: '1x' | '2x' | '4x') {
    setSpeed(sp)
    localStorage.setItem('bgp_battle_speed', sp)
  }

  const entry   = logCursor > 0 ? match.log[logCursor - 1] : null
  const pidHp   = Math.max(0, entry ? (entry.hpAfter[pid]   ?? match.initialHp[pid])   : match.initialHp[pid])
  const oppHp   = Math.max(0, entry ? (entry.hpAfter[oppId]  ?? match.initialHp[oppId]) : match.initialHp[oppId])
  const pidMana = Math.max(0, entry ? (entry.manaAfter[pid]  ?? match.initialMana[pid])  : match.initialMana[pid])
  const oppMana = Math.max(0, entry ? (entry.manaAfter[oppId] ?? match.initialMana[oppId]) : match.initialMana[oppId])

  const recentLog = match.log.slice(Math.max(0, logCursor - 10), logCursor)

  function handleSkip() {
    setLogCursor(match.log.length)
    setDone(true)
  }

  const isWin = match.winnerId === pid

  return (
    <div className="arena-bg-arena" style={{ display: 'flex', flexDirection: 'column' as const, minHeight: '100vh' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--line)', background: 'rgba(10,6,20,.7)', backdropFilter: 'blur(8px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="arena-mono" style={{ fontSize: 10, color: 'var(--violet-glow)', letterSpacing: '.15em' }}>BATTLE</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>{matchInfo.stageLabel}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {(['1x', '2x', '4x'] as const).map(sp => (
            <button
              key={sp}
              className={`arena-btn${speed === sp ? ' arena-btn-primary' : ''}`}
              style={{ padding: '4px 12px', fontSize: 12, borderRadius: 6 }}
              onClick={() => handleSetSpeed(sp)}
            >{sp}</button>
          ))}
          <button className="arena-btn" style={{ padding: '4px 12px', fontSize: 12, borderRadius: 6 }} onClick={handleSkip} disabled={done}>스킵</button>
          <span className="arena-mono" style={{ fontSize: 11, color: 'var(--ink-mute)', marginLeft: 4 }}>{logCursor}/{match.log.length}</span>
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', gap: 0, overflow: 'hidden' }}>
        {/* Left: fighters */}
        <div style={{ flex: '0 0 320px', padding: '20px 16px', display: 'flex', flexDirection: 'column' as const, gap: 16, justifyContent: 'center' }}>
          <CharPanel
            charId={pid}
            isPlayer
            hp={pidHp}
            maxHp={match.initialHp[pid]}
            mana={pidMana}
            maxMana={match.initialMana[pid]}
            isActing={entry?.actorId === pid}
            stats={playerStats}
            skills={playerSkills}
          />
          <div style={{ textAlign: 'center' as const, fontSize: 18, fontWeight: 900, color: 'var(--violet-glow)', letterSpacing: '.1em' }}>VS</div>
          <CharPanel
            charId={oppId}
            hp={oppHp}
            maxHp={match.initialHp[oppId]}
            mana={oppMana}
            maxMana={match.initialMana[oppId]}
            isActing={entry?.actorId === oppId}
            stats={oppStats}
            skills={oppSkills}
          />
        </div>

        {/* Right: combat log */}
        <div style={{ flex: 1, borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column' as const, background: 'rgba(6,4,14,.6)' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '.1em', fontWeight: 700 }}>COMBAT LOG</div>
          <div ref={logRef} style={{ flex: 1, overflowY: 'auto' as const, padding: '8px 12px', display: 'flex', flexDirection: 'column' as const, gap: 3 }}>
            {recentLog.map((e, i) => (
              <LogRow key={i} entry={e} pid={pid} />
            ))}
            {done && (
              <div style={{ textAlign: 'center' as const, padding: '16px 0', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: isWin ? 'var(--green)' : 'var(--red)' }}>
                  {isWin ? '🏆 승리!' : '💀 패배'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-mute)' }}>
                  승자: {charName(match.winnerId)}{isWin ? ' · 나' : ''}
                </div>
              </div>
            )}
          </div>
          {done && (
            <div style={{ padding: '16px', borderTop: '1px solid var(--line)' }}>
              <button
                className="arena-btn arena-btn-primary"
                style={{ width: '100%', justifyContent: 'center', borderRadius: 12, padding: '12px 0', fontSize: 14 }}
                onClick={() => useGameStore.setState({ phase: 'match_result' })}
              >
                결과 확인 →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CharPanel({
  charId, isPlayer, hp, maxHp, mana, maxMana, isActing, stats, skills,
}: {
  charId: number
  isPlayer?: boolean
  hp: number
  maxHp: number
  mana: number
  maxMana: number
  isActing: boolean
  stats: CombatStats | null
  skills: string[]
}) {
  const hpPct   = maxHp   > 0 ? (hp   / maxHp)   * 100 : 0
  const manaPct = maxMana > 0 ? (mana / maxMana) * 100 : 0
  const hpFillClass = hpPct > 60 ? 'arena-hp-fill' : hpPct > 30 ? 'arena-hp-fill arena-hp-warn' : 'arena-hp-fill arena-hp-danger'

  return (
    <div className="arena-panel arena-crt" style={{ padding: 16, display: 'flex', flexDirection: 'column' as const, gap: 10, boxShadow: isActing ? '0 0 16px -4px rgba(255,214,107,.5)' : undefined, border: isActing ? '1px solid rgba(255,214,107,.4)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 40, height: 40, background: 'rgba(124,80,240,.15)', border: '1px solid var(--line-strong)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🃏</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{charName(charId)}</span>
            {isPlayer && <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--violet)', borderRadius: 3, padding: '1px 5px', color: '#fff' }}>나</span>}
            {isActing && <span style={{ fontSize: 9, color: 'var(--gold)', fontWeight: 700 }}>▶ 행동 중</span>}
          </div>
        </div>
      </div>

      {/* HP bar */}
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="arena-mono" style={{ fontSize: 10, color: 'var(--ink-mute)' }}>HP</span>
          <span className="arena-mono" style={{ fontSize: 10, color: 'var(--ink-dim)' }}>{Math.ceil(hp)}/{maxHp}</span>
        </div>
        <div className="arena-hpbar">
          <div className={hpFillClass} style={{ width: `${hpPct}%` }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="arena-mono" style={{ fontSize: 10, color: 'var(--ink-mute)' }}>MP</span>
          <span className="arena-mono" style={{ fontSize: 10, color: 'var(--ink-dim)' }}>{Math.ceil(mana)}/{maxMana}</span>
        </div>
        <div className="arena-hpbar">
          <div className="arena-mp-fill" style={{ width: `${manaPct}%` }} />
        </div>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
          <StatChip label="공격" val={Math.round(stats.atk)} />
          <StatChip label="방어" val={Math.round(stats.def)} />
          <StatChip label="속도" val={Math.round(stats.spd)} />
          <StatChip label="치명" val={`${stats.crit.toFixed(1)}%`} />
          <StatChip label="회피" val={`${stats.eva.toFixed(1)}%`} />
        </div>
      )}
      {skills.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
          {skills.map(id => (
            <span key={id} style={{ fontSize: 10, background: 'rgba(103,232,249,.08)', border: '1px solid rgba(103,232,249,.25)', borderRadius: 4, padding: '2px 7px', color: 'var(--cyan)', whiteSpace: 'nowrap' as const }}>{skillName(id)}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function StatChip({ label, val }: { label: string; val: string | number }) {
  return (
    <div style={{ background: 'rgba(10,6,20,.6)', borderRadius: 4, padding: '2px 6px', display: 'flex', justifyContent: 'space-between', gap: 4 }}>
      <span className="arena-mono" style={{ fontSize: 9, color: 'var(--ink-mute)' }}>{label}</span>
      <span className="arena-mono" style={{ fontSize: 9, color: 'var(--ink-dim)', fontWeight: 700 }}>{val}</span>
    </div>
  )
}

function LogRow({ entry, pid }: { entry: MatchLogEntry; pid: number }) {
  const isMyAction = entry.actorId === pid
  const actionStr  = entry.evaded
    ? '회피!'
    : entry.action === 'skill'
      ? `${skillName(entry.skillId ?? '')} ${entry.damage}dmg${entry.critical ? ' 💥' : ''}`
      : `${entry.damage}dmg${entry.critical ? ' 💥' : ''}`

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 8px', borderRadius: 4, fontSize: 11, background: isMyAction ? 'rgba(124,80,240,.08)' : 'rgba(255,255,255,.02)' }}>
      <span className="arena-mono" style={{ fontSize: 9, color: 'var(--ink-mute)', minWidth: 28 }}>T{entry.turn}</span>
      <span style={{ fontWeight: 700, minWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, color: isMyAction ? 'var(--violet-glow)' : 'var(--red)' }}>
        {charName(entry.actorId)}
      </span>
      <span style={{ color: 'var(--line-strong)' }}>→</span>
      <span style={{ color: 'var(--ink-dim)', minWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{charName(entry.targetId)}</span>
      <span style={{ color: entry.critical ? 'var(--gold)' : 'var(--ink)', flex: 1 }}>{actionStr}</span>
    </div>
  )
}

