import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { CharacterDef, MatchLogEntry, SkillDef } from '../types'
import charactersRaw from '../data/characters.json'
import skillsRaw    from '../data/skills.json'

const CHARACTERS = charactersRaw as CharacterDef[]
const SKILLS     = skillsRaw    as SkillDef[]

const charName  = (id: number) => CHARACTERS.find(c => c.id === id)?.name ?? `#${id}`
const skillName = (id: string) => SKILLS.find(s => s.id === id)?.name ?? id

const SPEED_MS: Record<string, number> = { '1x': 500, '2x': 220, '4x': 70 }

export default function BattlePage() {
  const { playerMatches, playerMatchIndex, activeSlot } = useGameStore()

  const matchInfo = playerMatches[playerMatchIndex]
  const match     = matchInfo?.matchResult

  const [logCursor, setLogCursor] = useState(0)
  const [speed, setSpeed]         = useState<'1x' | '2x' | '4x'>('1x')
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

  const pid   = activeSlot.characterId
  const oppId = match.char1Id === pid ? match.char2Id : match.char1Id

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

  return (
    <div style={s.root}>
      <div style={s.stageBar}>{matchInfo.stageLabel}</div>

      <div style={s.arena}>
        <CharPanel
          charId={pid}
          isPlayer
          hp={pidHp}
          maxHp={match.initialHp[pid]}
          mana={pidMana}
          maxMana={match.initialMana[pid]}
          isActing={entry?.actorId === pid}
        />
        <div style={s.vsDivider}>VS</div>
        <CharPanel
          charId={oppId}
          hp={oppHp}
          maxHp={match.initialHp[oppId]}
          mana={oppMana}
          maxMana={match.initialMana[oppId]}
          isActing={entry?.actorId === oppId}
        />
      </div>

      <div style={s.controlBar}>
        {(['1x', '2x', '4x'] as const).map(sp => (
          <button
            key={sp}
            style={{ ...s.speedBtn, ...(speed === sp ? s.speedActive : {}) }}
            onClick={() => setSpeed(sp)}
          >{sp}</button>
        ))}
        <button style={s.skipBtn} onClick={handleSkip} disabled={done}>스킵</button>
        <span style={s.turnCounter}>{logCursor} / {match.log.length} 턴</span>
      </div>

      <div style={s.logBox} ref={logRef}>
        {recentLog.map((e, i) => (
          <LogRow key={i} entry={e} pid={pid} />
        ))}
        {done && (
          <div style={s.logDone}>
            ── 전투 종료 · 승자: {charName(match.winnerId)} ──
          </div>
        )}
      </div>

      {done && (
        <button
          style={s.btnResult}
          onClick={() => useGameStore.setState({ phase: 'match_result' })}
        >
          결과 확인 →
        </button>
      )}
    </div>
  )
}

function CharPanel({
  charId, isPlayer, hp, maxHp, mana, maxMana, isActing,
}: {
  charId: number
  isPlayer?: boolean
  hp: number
  maxHp: number
  mana: number
  maxMana: number
  isActing: boolean
}) {
  const hpPct   = maxHp   > 0 ? (hp   / maxHp)   * 100 : 0
  const manaPct = maxMana > 0 ? (mana / maxMana) * 100 : 0
  const hpColor = hpPct > 60 ? '#44ff88' : hpPct > 30 ? '#ffaa44' : '#ff4444'

  return (
    <div style={{ ...s.charPanel, boxShadow: isActing ? '0 0 12px #ffd70066' : 'none' }}>
      {isPlayer && <div style={s.playerTag}>나</div>}
      <div style={s.charIcon}>
        <span style={{ fontSize: '2.5rem' }}>🃏</span>
      </div>
      <div style={s.charNameText}>{charName(charId)}</div>
      <div style={s.barGroup}>
        <div style={s.barLabelRow}>
          <span style={s.barLbl}>HP</span>
          <span style={s.barVal}>{Math.ceil(hp)}/{maxHp}</span>
        </div>
        <div style={s.barBg}>
          <div style={{ ...s.bar, width: `${hpPct}%`, background: hpColor, transition: 'width 0.25s ease' }} />
        </div>
        <div style={s.barLabelRow}>
          <span style={s.barLbl}>MP</span>
          <span style={s.barVal}>{Math.ceil(mana)}/{maxMana}</span>
        </div>
        <div style={s.barBg}>
          <div style={{ ...s.bar, width: `${manaPct}%`, background: '#44aaff', transition: 'width 0.25s ease' }} />
        </div>
      </div>
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
    <div style={{ ...s.logRow, background: isMyAction ? '#1a1a3e' : '#111' }}>
      <span style={s.logTurn}>T{entry.turn}</span>
      <span style={{ ...s.logActor, color: isMyAction ? '#c0aaff' : '#ff9966' }}>
        {charName(entry.actorId)}
      </span>
      <span style={s.logArrow}>→</span>
      <span style={s.logTarget}>{charName(entry.targetId)}</span>
      <span style={s.logAction}>{actionStr}</span>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:        { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', gap: '0.75rem' },
  stageBar:    { fontSize: '1rem', fontWeight: 700, color: '#ffd700', letterSpacing: '0.1em' },
  arena:       { display: 'flex', gap: '1rem', alignItems: 'flex-start', width: '100%', maxWidth: '560px' },
  vsDivider:   { fontSize: '1.2rem', fontWeight: 900, color: '#c0aaff', alignSelf: 'center', minWidth: '30px', textAlign: 'center' as const },
  charPanel:   { flex: 1, background: '#1a1a2e', border: '1px solid #333', borderRadius: '10px', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', position: 'relative' as const, transition: 'box-shadow 0.2s' },
  playerTag:   { position: 'absolute' as const, top: '4px', left: '6px', fontSize: '0.6rem', fontWeight: 700, background: '#7c5cfc', borderRadius: '3px', padding: '1px 5px' },
  charIcon:    { width: '52px', height: '52px', background: '#111', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  charNameText:{ fontSize: '0.8rem', fontWeight: 700, textAlign: 'center' as const },
  barGroup:    { display: 'flex', flexDirection: 'column', gap: '3px' },
  barLabelRow: { display: 'flex', justifyContent: 'space-between' },
  barLbl:      { fontSize: '0.6rem', color: '#666' },
  barVal:      { fontSize: '0.6rem', color: '#888' },
  barBg:       { height: '6px', background: '#111', borderRadius: '3px', overflow: 'hidden' },
  bar:         { height: '100%', borderRadius: '3px' },
  controlBar:  { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' },
  speedBtn:    { background: '#1a1a2e', border: '1px solid #444', borderRadius: '6px', color: '#aaa', padding: '4px 14px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700 },
  speedActive: { background: '#7c5cfc', border: '1px solid #7c5cfc', color: '#fff' },
  skipBtn:     { background: 'transparent', border: '1px solid #666', borderRadius: '6px', color: '#aaa', padding: '4px 14px', cursor: 'pointer', fontSize: '0.85rem' },
  turnCounter: { color: '#555', fontSize: '0.75rem' },
  logBox:      { width: '100%', maxWidth: '560px', background: '#080810', border: '1px solid #1a1a2e', borderRadius: '8px', padding: '0.5rem', height: '200px', overflowY: 'auto' as const, display: 'flex', flexDirection: 'column', gap: '2px' },
  logRow:      { display: 'flex', gap: '0.4rem', alignItems: 'center', padding: '2px 6px', borderRadius: '3px', fontSize: '0.72rem' },
  logTurn:     { color: '#444', minWidth: '28px', fontSize: '0.65rem' },
  logActor:    { fontWeight: 700, minWidth: '60px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  logArrow:    { color: '#444' },
  logTarget:   { color: '#aaa', minWidth: '60px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  logAction:   { color: '#ddd', flex: 1 },
  logDone:     { textAlign: 'center' as const, color: '#ffd700', fontSize: '0.8rem', padding: '6px', marginTop: '2px', letterSpacing: '0.05em' },
  btnResult:   { background: '#7c5cfc', border: 'none', borderRadius: '10px', color: '#fff', padding: '0.85rem 2.5rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 700 },
}
