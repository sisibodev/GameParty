import { useCallback, useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import type {
  CharacterDef,
  CombatStats,
  GroupResult,
  GrowthStatKey,
  GrowthStats,
  MatchLogEntry,
  MatchResult,
  SkillDef,
  TournamentResult,
} from '../types'
import { runTournament } from '../engine/tournamentEngine'
import { deriveStats } from '../engine/statDeriver'
import { SeededRng } from '../utils/rng'
import { pickN } from '../utils/fisherYates'
import {
  GACHA_GRADES,
  GACHA_PROBABILITIES,
  GACHA_STAT_GAINS,
  INITIAL_SKILL_COUNT,
  NPC_BASE_GROWTH,
} from '../constants'
import charactersRaw from '../data/characters.json'
import skillsRaw from '../data/skills.json'

// ─── Constants ────────────────────────────────────────────────────────────────

const originalChars = (charactersRaw as CharacterDef[]).filter(c => c.ipId == null)
const allCharsArr   = charactersRaw as CharacterDef[]
const allSkillIds   = (skillsRaw as Array<{ id: string }>).map(s => s.id)
const skillDefsMap: Record<string, SkillDef> = Object.fromEntries(
  (skillsRaw as SkillDef[]).map(s => [s.id, s])
)
const charLookup: Record<number, CharacterDef> = Object.fromEntries(
  allCharsArr.map(c => [c.id, c])
)
const charName  = (id: number) => charLookup[id]?.name ?? `#${id}`
const charDef   = (id: number) => charLookup[id]
const skillName = (id: string) => skillDefsMap[id]?.name ?? id

const SPEED_MS: Record<string, number> = { '1x': 500, '2x': 200, '4x': 60, '8x': 15 }
type SpeedKey = '1x' | '2x' | '4x' | '8x'

const GACHA_GRADE_COLOR: Record<string, string> = {
  C: '#888', B: '#44ff44', A: '#44aaff', S: '#ffd700', SS: '#ff88ff', SSS: '#ff4444',
}
const STAGE_ORDER: Record<string, number> = {
  '예선 탈락': 0, '본선 그룹 탈락': 1, '16강': 2, '8강': 3, '4강': 4, '준우승': 5, '우승': 6,
}
const ARCHETYPE_COLOR: Record<string, string> = {
  tank: '#4a7fc1', berserker: '#c14a4a', assassin: '#7c5cfc',
  ranger: '#4ac17c', mage: '#c14ab0', paladin: '#c1a04a',
  warrior: '#c1714a', support: '#4ab0c1',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SimRecord {
  wins: number; losses: number; bestStage: string; bestStageCount: number
}
interface RoundMatchRecord {
  char1Id: number; char2Id: number; winnerId: number; label: string
}
interface RoundHistory {
  round: number; winner: number; matches: RoundMatchRecord[]
}
interface SimPersist {
  round: number
  growthMap: Record<number, GrowthStats>
  skillMap:  Record<number, string[]>
  recordMap: Record<number, SimRecord>
  h2hMap:    Record<string, [number, number]>
  prevFinalists:  number[]
  prevDarkhorses: number[]
  useIpChars:  boolean
  roundHistory: RoundHistory[]
}
interface ResumeData {
  seed: number; round: number
  growthMapAfterGacha: Record<number, GrowthStats>
  skillMap: Record<number, string[]>
  useIpChars: boolean
}
type WatchPhase = 'idle' | 'gacha' | 'bracket_view' | 'match_battle' | 'round_summary'
interface GachaCardEntry {
  charId: number; statKey: GrowthStatKey; grade: string; gain: number
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const SIM_STATE_KEY  = 'ta-sim-state-v2'
const SIM_RESUME_KEY = 'ta-sim-resume-v2'

function saveSimState(st: SimPersist) {
  try { localStorage.setItem(SIM_STATE_KEY, JSON.stringify(st)) } catch { /* noop */ }
}
function loadSimState(): SimPersist | null {
  try { const s = localStorage.getItem(SIM_STATE_KEY); return s ? JSON.parse(s) : null } catch { return null }
}
function saveResume(d: ResumeData) {
  try { localStorage.setItem(SIM_RESUME_KEY, JSON.stringify(d)) } catch { /* noop */ }
}
function loadResume(): ResumeData | null {
  try { const s = localStorage.getItem(SIM_RESUME_KEY); return s ? JSON.parse(s) : null } catch { return null }
}
function clearResume() {
  try { localStorage.removeItem(SIM_RESUME_KEY) } catch { /* noop */ }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function h2hKey(a: number, b: number) { return a < b ? `${a}_${b}` : `${b}_${a}` }
function getActiveChars(useIp: boolean) { return useIp ? allCharsArr : originalChars }

function buildInitialSimState(useIpChars: boolean): SimPersist {
  const chars = getActiveChars(useIpChars)
  const growthMap: Record<number, GrowthStats> = {}
  const skillMap:  Record<number, string[]>    = {}
  const recordMap: Record<number, SimRecord>   = {}
  for (const c of chars) {
    growthMap[c.id] = { hp: NPC_BASE_GROWTH, str: NPC_BASE_GROWTH, agi: NPC_BASE_GROWTH, int: NPC_BASE_GROWTH, luk: NPC_BASE_GROWTH }
    skillMap[c.id]  = pickN(allSkillIds, INITIAL_SKILL_COUNT, new SeededRng(c.id * 7919))
    recordMap[c.id] = { wins: 0, losses: 0, bestStage: '예선 탈락', bestStageCount: 0 }
  }
  return { round: 1, growthMap, skillMap, recordMap, h2hMap: {}, prevFinalists: [], prevDarkhorses: [], useIpChars, roundHistory: [] }
}

function applyGacha(
  growthMap: Record<number, GrowthStats>, chars: CharacterDef[], seed: number,
): { newGrowthMap: Record<number, GrowthStats>; cards: GachaCardEntry[] } {
  const rng = new SeededRng(seed)
  const newMap: Record<number, GrowthStats> = {}
  for (const c of chars) newMap[c.id] = { ...growthMap[c.id] }
  const cards: GachaCardEntry[] = []
  const statKeys: GrowthStatKey[] = ['hp', 'str', 'agi', 'int', 'luk']
  for (let i = 0; i < 100; i++) {
    const charId  = chars[rng.int(0, chars.length)].id
    const statKey = statKeys[rng.int(0, statKeys.length)]
    const roll    = rng.next()
    let cumul = 0; let grade = GACHA_GRADES[0]
    for (const g of GACHA_GRADES) { cumul += GACHA_PROBABILITIES[g]; if (roll < cumul) { grade = g; break } }
    const gain = GACHA_STAT_GAINS[grade]
    newMap[charId][statKey] = (newMap[charId][statKey] ?? NPC_BASE_GROWTH) + gain
    cards.push({ charId, statKey, grade, gain })
  }
  return { newGrowthMap: newMap, cards }
}

function stageLabelFromResult(result: TournamentResult, charId: number): string {
  if (charId === result.winner) return '우승'
  const r = result.bracketEliminations[charId]
  if (r === 4) return '준우승'
  if (r === 3) return '4강'
  if (r === 2) return '8강'
  if (r === 1) return '16강'
  if (result.qualifiers.includes(charId)) return '본선 그룹 탈락'
  return '예선 탈락'
}

function mergeBestStage(prev: string, next: string): string {
  return (STAGE_ORDER[next] ?? 0) > (STAGE_ORDER[prev] ?? 0) ? next : prev
}

function computeMatchLabel(m: MatchResult, allMatches: MatchResult[], idx: number): string {
  if (m.stage === 'qualifier') {
    const n = allMatches.slice(0, idx + 1).filter(x => x.stage === 'qualifier').length
    return `예선 ${n}경기`
  }
  if (m.stage === 'group') {
    if (m.groupMatchType === 'initial') {
      const prev = allMatches.slice(0, idx).filter(x => x.stage === 'group' && x.groupId === m.groupId && x.groupMatchType === 'initial').length
      return `본선 ${m.groupId}조 ${prev + 1}경기`
    }
    const typeMap: Record<string, string> = { winners: '승자전', losers: '패자전', decider: '최종전' }
    return `본선 ${m.groupId}조 ${typeMap[m.groupMatchType ?? ''] ?? ''}`
  }
  const roundLabels = ['16강', '8강', '4강', '결승']
  return `본선 토너먼트 ${roundLabels[(m.bracketRound ?? 1) - 1]}`
}

// ─── GachaPhaseView ───────────────────────────────────────────────────────────

function GachaPhaseView({ cards, speed, onDone }: { cards: GachaCardEntry[]; speed: SpeedKey; onDone: () => void }) {
  const [shown, setShown] = useState(speed === '8x' ? cards.length : 0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (speed === '8x') { setShown(cards.length); return }
    const ms = Math.max(20, SPEED_MS[speed] / 5)
    intervalRef.current = setInterval(() => {
      setShown(prev => { const next = prev + 1; if (next >= cards.length && intervalRef.current) clearInterval(intervalRef.current); return next })
    }, ms)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [cards.length, speed])

  useEffect(() => {
    if (shown < cards.length) return
    const t = setTimeout(onDone, speed === '8x' ? 300 : 1500)
    return () => clearTimeout(t)
  }, [shown, cards.length, onDone, speed])

  return (
    <div style={s.gachaPhase}>
      <div style={s.gachaTitle}>가챠 결과 — 100회 뽑기</div>
      <div style={s.gachaCardList}>
        {cards.slice(0, shown).map((card, i) => {
          const color = GACHA_GRADE_COLOR[card.grade] ?? '#888'
          return (
            <div key={i} style={{ ...s.gachaCard, borderColor: color + '66' }}>
              <span style={{ ...s.gachaGrade, color }}>{card.grade}</span>
              <span style={s.gachaCharName}>{charName(card.charId)}</span>
              <span style={s.gachaStatKey}>{card.statKey.toUpperCase()}</span>
              <span style={{ ...s.gachaGain, color }}>+{card.gain}</span>
            </div>
          )
        })}
      </div>
      <div style={s.gachaCount}>{shown} / {cards.length}</div>
      <button style={s.skipBtn} onClick={onDone}>스킵 →</button>
    </div>
  )
}

// ─── BracketPreviewView ───────────────────────────────────────────────────────

function QualifierBracketView({ currentMatch, allQualMatches }: {
  currentMatch: MatchResult; allQualMatches: MatchResult[]
}) {
  return (
    <div style={s.bpSection}>
      <div style={s.bpSectionTitle}>예선 대진표 ({allQualMatches.length}경기)</div>
      <div style={s.qualList}>
        {allQualMatches.map((m, i) => {
          const isCurrent = m.matchId === currentMatch.matchId
          const ac1 = ARCHETYPE_COLOR[charDef(m.char1Id)?.archetype ?? ''] ?? '#888'
          const ac2 = ARCHETYPE_COLOR[charDef(m.char2Id)?.archetype ?? ''] ?? '#888'
          return (
            <div key={m.matchId} style={{ ...s.qualRow, ...(isCurrent ? s.qualRowActive : {}) }}>
              <span style={s.qualIdx}>{i + 1}</span>
              <span style={{ ...s.qualChar, color: ac1 }}>{charName(m.char1Id)}</span>
              <span style={s.qualVs}>vs</span>
              <span style={{ ...s.qualChar, color: ac2 }}>{charName(m.char2Id)}</span>
              {isCurrent && <span style={s.qualLive}>▶ LIVE</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function GroupBracketView({ currentMatch, groups, allMatches }: {
  currentMatch: MatchResult; groups: GroupResult[]; allMatches: MatchResult[]
}) {
  const group = groups.find(g => g.groupId === currentMatch.groupId)
  if (!group) return null
  const groupMatches = allMatches.filter(m => m.stage === 'group' && m.groupId === group.groupId)
  let initCount = 0

  return (
    <div style={s.bpSection}>
      <div style={s.bpSectionTitle}>{group.groupId}조 대진표</div>
      <div style={s.groupMemberRow}>
        {group.players.map(id => {
          const ac = ARCHETYPE_COLOR[charDef(id)?.archetype ?? ''] ?? '#888'
          return <span key={id} style={{ ...s.groupMemberChip, background: ac + '22', color: ac, border: `1px solid ${ac}44` }}>{charName(id)}</span>
        })}
      </div>
      <div style={s.groupMatchList}>
        {groupMatches.map(m => {
          const isCurrent = m.matchId === currentMatch.matchId
          let typeLabel: string
          if (m.groupMatchType === 'initial') { initCount++; typeLabel = `${initCount}경기` }
          else if (m.groupMatchType === 'winners') typeLabel = '승자전'
          else if (m.groupMatchType === 'losers')  typeLabel = '패자전'
          else typeLabel = '최종전'
          const ac1 = ARCHETYPE_COLOR[charDef(m.char1Id)?.archetype ?? ''] ?? '#888'
          const ac2 = ARCHETYPE_COLOR[charDef(m.char2Id)?.archetype ?? ''] ?? '#888'
          return (
            <div key={m.matchId} style={{ ...s.groupMatchRow, ...(isCurrent ? s.qualRowActive : {}) }}>
              <span style={s.groupMatchTypeLabel}>{typeLabel}</span>
              <span style={{ color: ac1, fontWeight: isCurrent ? 700 : 400, fontSize: '0.7rem' }}>{charName(m.char1Id)}</span>
              <span style={s.qualVs}>vs</span>
              <span style={{ color: ac2, fontWeight: isCurrent ? 700 : 400, fontSize: '0.7rem' }}>{charName(m.char2Id)}</span>
              {isCurrent && <span style={s.qualLive}>▶ LIVE</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TournamentBracketView({ currentMatch, allMatches }: {
  currentMatch: MatchResult; allMatches: MatchResult[]
}) {
  const ROUND_LABELS = ['16강', '8강', '4강', '결승']
  const bracketMatches = allMatches.filter(m => m.stage === 'bracket')
  const rounds: MatchResult[][] = [[], [], [], []]
  for (const m of bracketMatches) {
    const ri = (m.bracketRound ?? 1) - 1
    if (ri >= 0 && ri < 4) rounds[ri].push(m)
  }
  return (
    <div style={s.bpSection}>
      <div style={s.bpSectionTitle}>토너먼트 대진표</div>
      <div style={s.bracketGrid}>
        {rounds.map((rMatches, ri) => (
          <div key={ri} style={s.bracketCol}>
            <div style={s.bracketColLabel}>{ROUND_LABELS[ri]}</div>
            {rMatches.map(m => {
              const isCurrent = m.matchId === currentMatch.matchId
              const ac1 = ARCHETYPE_COLOR[charDef(m.char1Id)?.archetype ?? ''] ?? '#888'
              const ac2 = ARCHETYPE_COLOR[charDef(m.char2Id)?.archetype ?? ''] ?? '#888'
              return (
                <div key={m.matchId} style={{ ...s.bracketMatchCard, ...(isCurrent ? s.bracketMatchActive : {}) }}>
                  <div style={{ color: ac1, fontSize: '0.62rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{charName(m.char1Id)}</div>
                  <div style={{ color: ac2, fontSize: '0.62rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{charName(m.char2Id)}</div>
                  {isCurrent && <div style={s.bracketLive}>▶ LIVE</div>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function BracketPreviewView({ currentMatch, matchLabel, currentResult, speed, onDone, onSkip }: {
  currentMatch: MatchResult; matchLabel: string; currentResult: TournamentResult
  speed: SpeedKey; onDone: () => void; onSkip: () => void
}) {
  const delay = speed === '8x' ? 400 : speed === '4x' ? 900 : speed === '2x' ? 1800 : 3200
  useEffect(() => { const t = setTimeout(onDone, delay); return () => clearTimeout(t) }, [onDone, delay])

  const { char1Id, char2Id } = currentMatch
  const ac1 = ARCHETYPE_COLOR[charDef(char1Id)?.archetype ?? ''] ?? '#888'
  const ac2 = ARCHETYPE_COLOR[charDef(char2Id)?.archetype ?? ''] ?? '#888'
  const allQualMatches = currentResult.allMatches.filter(m => m.stage === 'qualifier')

  return (
    <div style={s.bpWrap}>
      <div style={s.bpHeader}>
        <div style={s.bpStageLabel}>{matchLabel}</div>
        <div style={s.bpVsRow}>
          <span style={{ color: ac1, fontWeight: 700, fontSize: '1.05rem' }}>{charName(char1Id)}</span>
          <span style={s.bpVs}>VS</span>
          <span style={{ color: ac2, fontWeight: 700, fontSize: '1.05rem' }}>{charName(char2Id)}</span>
        </div>
      </div>
      {currentMatch.stage === 'qualifier' && <QualifierBracketView currentMatch={currentMatch} allQualMatches={allQualMatches} />}
      {currentMatch.stage === 'group'     && <GroupBracketView currentMatch={currentMatch} groups={currentResult.groups} allMatches={currentResult.allMatches} />}
      {currentMatch.stage === 'bracket'   && <TournamentBracketView currentMatch={currentMatch} allMatches={currentResult.allMatches} />}
      <button style={s.bpSkipBtn} onClick={onSkip}>전투 바로 시작 →</button>
    </div>
  )
}

// ─── LogRowSim ────────────────────────────────────────────────────────────────

function LogRowSim({ entry, char1Id }: { entry: MatchLogEntry; char1Id: number }) {
  const isChar1 = entry.actorId === char1Id
  const actionStr = entry.evaded
    ? '회피!'
    : entry.action === 'skill'
      ? `${skillName(entry.skillId ?? '')} ${entry.damage}dmg${entry.critical ? ' !' : ''}`
      : `${entry.damage}dmg${entry.critical ? ' !' : ''}`
  return (
    <div style={{ ...s.logRow, background: isChar1 ? '#1a1a3e' : '#111' }}>
      <span style={s.logTurn}>T{entry.turn}</span>
      <span style={{ ...s.logActor, color: isChar1 ? '#c0aaff' : '#ff9966' }}>{charName(entry.actorId)}</span>
      <span style={s.logArrow}>→</span>
      <span style={s.logTarget}>{charName(entry.targetId)}</span>
      <span style={s.logAction}>{actionStr}</span>
    </div>
  )
}

// ─── CharPanelSim ─────────────────────────────────────────────────────────────

function CharPanelSim({ charId, hp, maxHp, mana, maxMana, isActing, stats, skills, isFavored, isDarkhorse }: {
  charId: number; hp: number; maxHp: number; mana: number; maxMana: number
  isActing: boolean; stats: CombatStats | null; skills: string[]
  isFavored?: boolean; isDarkhorse?: boolean
}) {
  const hpPct   = maxHp  > 0 ? (hp   / maxHp)  * 100 : 0
  const manaPct = maxMana > 0 ? (mana / maxMana) * 100 : 0
  const hpColor = hpPct > 60 ? '#44ff88' : hpPct > 30 ? '#ffaa44' : '#ff4444'
  const def = charDef(charId)
  const ac  = ARCHETYPE_COLOR[def?.archetype ?? ''] ?? '#888'
  return (
    <div style={{ ...s.charPanel, boxShadow: isActing ? '0 0 14px #ffd70066' : 'none' }}>
      <div style={{ ...s.charPanelAccent, background: ac }} />
      <div style={s.charIcon}><span style={{ fontSize: '1.8rem' }}>⚔️</span></div>
      <div style={s.charNameText}>{charName(charId)}</div>
      {def && <div style={{ ...s.archBadgeSim, background: ac + '33', color: ac }}>{def.archetype}</div>}
      {isFavored   && <div style={s.favoredBadge}>⭐ 우승 후보</div>}
      {isDarkhorse && <div style={s.darkhorseSimBadge}>🐴 다크호스</div>}
      <div style={s.barGroup}>
        <div style={s.barLabelRow}><span style={s.barLbl}>HP</span><span style={s.barVal}>{Math.ceil(hp)}/{maxHp}</span></div>
        <div style={s.barBg}><div style={{ ...s.bar, width: `${hpPct}%`, background: hpColor }} /></div>
        <div style={s.barLabelRow}><span style={s.barLbl}>MP</span><span style={s.barVal}>{Math.ceil(mana)}/{maxMana}</span></div>
        <div style={s.barBg}><div style={{ ...s.bar, width: `${manaPct}%`, background: '#44aaff' }} /></div>
      </div>
      {stats && (
        <div style={s.simStatGrid}>
          {([['ATK', Math.round(stats.pAtk)], ['DEF', Math.round(stats.pDef)], ['SPD', Math.round(stats.spd)]] as [string, number][]).map(([lbl, val]) => (
            <div key={lbl} style={s.simStatChip}><span style={s.simStatLbl}>{lbl}</span><span style={s.simStatVal}>{val}</span></div>
          ))}
        </div>
      )}
      {skills.length > 0 && (
        <div style={s.simSkillList}>
          {skills.map(id => {
            const sk = skillDefsMap[id]; if (!sk) return null
            const tc = sk.tier === 'legend' ? '#ffd700' : sk.tier === 'hero' ? '#c09cff' : sk.tier === 'rare' ? '#44aaff' : '#666'
            return <div key={id} style={{ ...s.simSkillTag, borderColor: tc + '55', color: tc }}>{sk.name}</div>
          })}
        </div>
      )}
    </div>
  )
}

// ─── BattleViewer ─────────────────────────────────────────────────────────────

function BattleViewer({ match, char1, char2, growth1, growth2, speed, isPausedRef, prevFinalists, prevDarkhorses, onDone }: {
  match: MatchResult; char1: CharacterDef; char2: CharacterDef
  growth1: GrowthStats; growth2: GrowthStats; speed: SpeedKey
  isPausedRef: React.MutableRefObject<boolean>
  prevFinalists: number[]; prevDarkhorses: number[]
  onDone: () => void
}) {
  const [logCursor, setLogCursor] = useState(0)
  const [done, setDone] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const skills1 = match.char1Id === char1.id ? (match.char1Skills ?? []) : (match.char2Skills ?? [])
  const skills2 = match.char1Id === char2.id ? (match.char1Skills ?? []) : (match.char2Skills ?? [])
  const stats1  = deriveStats(char1.baseCombat, growth1, char1.archetype)
  const stats2  = deriveStats(char2.baseCombat, growth2, char2.archetype)

  useEffect(() => {
    if (done) return
    const id = setInterval(() => {
      if (isPausedRef.current) return
      setLogCursor(c => { const next = c + 1; if (next >= match.log.length) { clearInterval(id); setDone(true) } return next })
    }, SPEED_MS[speed])
    return () => clearInterval(id)
  }, [done, speed, match.log.length, isPausedRef])

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [logCursor])
  useEffect(() => { if (!done) return; const t = setTimeout(onDone, 800); return () => clearTimeout(t) }, [done, onDone])

  const entry = logCursor > 0 ? match.log[logCursor - 1] : null
  const hp1  = Math.max(0, entry ? (entry.hpAfter[char1.id]   ?? match.initialHp[char1.id])   : match.initialHp[char1.id])
  const hp2  = Math.max(0, entry ? (entry.hpAfter[char2.id]   ?? match.initialHp[char2.id])   : match.initialHp[char2.id])
  const mp1  = Math.max(0, entry ? (entry.manaAfter[char1.id] ?? match.initialMana[char1.id]) : match.initialMana[char1.id])
  const mp2  = Math.max(0, entry ? (entry.manaAfter[char2.id] ?? match.initialMana[char2.id]) : match.initialMana[char2.id])
  const recentLog = match.log.slice(Math.max(0, logCursor - 10), logCursor)

  return (
    <div style={s.battleViewer}>
      <div style={s.arena}>
        <CharPanelSim charId={char1.id} hp={hp1} maxHp={match.initialHp[char1.id]} mana={mp1} maxMana={match.initialMana[char1.id]}
          isActing={entry?.actorId === char1.id} stats={stats1} skills={skills1}
          isFavored={prevFinalists.includes(char1.id)} isDarkhorse={prevDarkhorses.includes(char1.id)} />
        <div style={s.vsDivider}>VS</div>
        <CharPanelSim charId={char2.id} hp={hp2} maxHp={match.initialHp[char2.id]} mana={mp2} maxMana={match.initialMana[char2.id]}
          isActing={entry?.actorId === char2.id} stats={stats2} skills={skills2}
          isFavored={prevFinalists.includes(char2.id)} isDarkhorse={prevDarkhorses.includes(char2.id)} />
      </div>
      <div style={s.turnCounter}>{logCursor} / {match.log.length} 턴</div>
      <div style={s.logBox} ref={logRef}>
        {recentLog.map((e, i) => <LogRowSim key={i} entry={e} char1Id={char1.id} />)}
        {done && <div style={s.logDone}>── 전투 종료 · 승자: {charName(match.winnerId)} ──</div>}
      </div>
    </div>
  )
}

// ─── FullRecordsPanel ─────────────────────────────────────────────────────────

function FullRecordsPanel({ recordMap, roundHistory, useIpChars, onClose }: {
  recordMap: Record<number, SimRecord>; roundHistory: RoundHistory[]
  useIpChars: boolean; onClose: () => void
}) {
  const [tab, setTab] = useState<'overall' | number>('overall')
  const chars = getActiveChars(useIpChars)
  const sortedChars = chars
    .map(c => ({ c, rec: recordMap[c.id] }))
    .sort((a, b) => {
      const sa = STAGE_ORDER[a.rec?.bestStage ?? '예선 탈락'] ?? 0
      const sb = STAGE_ORDER[b.rec?.bestStage ?? '예선 탈락'] ?? 0
      return sb !== sa ? sb - sa : (b.rec?.wins ?? 0) - (a.rec?.wins ?? 0)
    })

  return (
    <div style={s.statsOverlay} onClick={onClose}>
      <div style={s.statsPanel} onClick={e => e.stopPropagation()}>
        <div style={s.statsPanelHeader}>
          <span style={s.statsPanelTitle}>전체 기록</span>
          <button style={s.statsPanelClose} onClick={onClose}>✕</button>
        </div>
        {/* Tabs */}
        <div style={s.tabRow}>
          <button style={{ ...s.tabBtn, ...(tab === 'overall' ? s.tabActive : {}) }} onClick={() => setTab('overall')}>전체</button>
          {roundHistory.map(rh => (
            <button key={rh.round} style={{ ...s.tabBtn, ...(tab === rh.round ? s.tabActive : {}) }} onClick={() => setTab(rh.round)}>R{rh.round}</button>
          ))}
        </div>
        {/* Overall */}
        {tab === 'overall' && (
          <div style={s.fullRecordList}>
            {sortedChars.map(({ c, rec }, rank) => {
              const ac = ARCHETYPE_COLOR[c.archetype] ?? '#888'
              const isTop = rank === 0
              return (
                <div key={c.id} style={{ ...s.fullRecordRow, background: isTop ? '#1a1400' : '#0d0d1a', border: `1px solid ${isTop ? '#ffd70044' : '#1a1a2e'}` }}>
                  <span style={{ ...s.lbRank, color: isTop ? '#ffd700' : '#555' }}>#{rank + 1}</span>
                  <span style={{ ...s.lbArchip, background: ac + '33', color: ac }}>{c.archetype}</span>
                  <span style={s.lbName}>{c.name}</span>
                  <span style={s.lbWins}>{rec?.wins ?? 0}승</span>
                  <span style={s.lbLosses}>{rec?.losses ?? 0}패</span>
                  <span style={{ ...s.lbBest, color: rec?.bestStage === '우승' ? '#ffd700' : '#aaa' }}>{rec?.bestStage ?? '예선 탈락'}</span>
                  {(rec?.bestStageCount ?? 0) > 0 && <span style={s.lbCount}>{rec.bestStageCount}회</span>}
                </div>
              )
            })}
          </div>
        )}
        {/* Round detail */}
        {typeof tab === 'number' && (() => {
          const rh = roundHistory.find(r => r.round === tab)
          if (!rh) return null
          const ac = ARCHETYPE_COLOR[charDef(rh.winner)?.archetype ?? ''] ?? '#888'
          return (
            <div style={s.roundHistoryBody}>
              <div style={s.roundHistoryWinner}>
                <span style={{ ...s.lbArchip, background: ac + '33', color: ac }}>{charDef(rh.winner)?.archetype}</span>
                <span style={{ color: '#ffd700', fontWeight: 700 }}>🏆 {charName(rh.winner)}</span>
              </div>
              <div style={s.roundMatchList}>
                {rh.matches.map((m, i) => {
                  const ac1 = ARCHETYPE_COLOR[charDef(m.char1Id)?.archetype ?? ''] ?? '#888'
                  const ac2 = ARCHETYPE_COLOR[charDef(m.char2Id)?.archetype ?? ''] ?? '#888'
                  return (
                    <div key={i} style={s.roundMatchRow}>
                      <span style={s.roundMatchLabel}>{m.label}</span>
                      <span style={{ color: m.winnerId === m.char1Id ? '#44ff88' : ac1, fontSize: '0.68rem' }}>{charName(m.char1Id)}</span>
                      <span style={s.qualVs}>vs</span>
                      <span style={{ color: m.winnerId === m.char2Id ? '#44ff88' : ac2, fontSize: '0.68rem' }}>{charName(m.char2Id)}</span>
                      <span style={{ fontSize: '0.6rem', color: '#555', marginLeft: '4px' }}>→ {charName(m.winnerId)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// ─── LeaderboardView (compact) ────────────────────────────────────────────────

function LeaderboardView({ recordMap, chars }: { recordMap: Record<number, SimRecord>; chars: CharacterDef[] }) {
  const rows = chars
    .map(c => ({ c, rec: recordMap[c.id] }))
    .filter(r => r.rec && (r.rec.wins + r.rec.losses) > 0)
    .sort((a, b) => {
      const sa = STAGE_ORDER[a.rec.bestStage] ?? 0
      const sb = STAGE_ORDER[b.rec.bestStage] ?? 0
      return sb !== sa ? sb - sa : b.rec.wins - a.rec.wins
    })
  if (rows.length === 0) return null
  return (
    <div style={s.leaderboard}>
      <div style={s.leaderboardTitle}>통산 랭킹 TOP 10</div>
      <div style={s.leaderboardGrid}>
        {rows.slice(0, 10).map(({ c, rec }, rank) => {
          const ac = ARCHETYPE_COLOR[c.archetype] ?? '#888'
          const isBest = rank === 0
          return (
            <div key={c.id} style={{ ...s.leaderboardRow, background: isBest ? '#1a1400' : '#0d0d1a', border: `1px solid ${isBest ? '#ffd70044' : '#1a1a2e'}` }}>
              <span style={{ ...s.lbRank, color: isBest ? '#ffd700' : '#555' }}>#{rank + 1}</span>
              <span style={{ ...s.lbArchip, background: ac + '33', color: ac }}>{c.archetype}</span>
              <span style={s.lbName}>{c.name}</span>
              <span style={s.lbWins}>{rec.wins}승</span>
              <span style={s.lbLosses}>{rec.losses}패</span>
              <span style={{ ...s.lbBest, color: rec.bestStage === '우승' ? '#ffd700' : '#aaa' }}>{rec.bestStage}</span>
              <span style={s.lbCount}>{rec.bestStageCount > 0 ? `${rec.bestStageCount}회` : ''}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── RoundSummaryView ─────────────────────────────────────────────────────────

function RoundSummaryView({ result, round, recordMap, chars, countdown, onNextRound, onStop }: {
  result: TournamentResult; round: number; recordMap: Record<number, SimRecord>
  chars: CharacterDef[]; countdown: number; onNextRound: () => void; onStop: () => void
}) {
  const winDef = charDef(result.winner)
  const ac     = ARCHETYPE_COLOR[winDef?.archetype ?? ''] ?? '#888'
  const top4Ids = [
    result.winner,
    ...Object.entries(result.bracketEliminations).filter(([, r]) => r >= 3).map(([id]) => Number(id)).filter(id => id !== result.winner),
  ]
  return (
    <div style={s.roundSummary}>
      <div style={s.summaryRound}>Round {round} 완료</div>
      <div style={s.summaryWinner}>
        <span style={{ ...s.summaryArchip, background: ac + '33', color: ac }}>{winDef?.archetype}</span>
        <span style={s.summaryWinnerName}>🏆 {charName(result.winner)}</span>
      </div>
      {top4Ids.length > 1 && (
        <div style={s.summaryTop4}>
          <span style={s.summaryTop4Label}>4강:</span>
          {top4Ids.map(id => <span key={id} style={{ ...s.summaryTop4Name, color: id === result.winner ? '#ffd700' : '#aaa' }}>{charName(id)}</span>)}
        </div>
      )}
      <div style={s.summaryStats}>
        <span>총 경기: {result.allMatches.length}</span>
        <span>다크호스: {result.darkhorses.map(id => charName(id)).join(', ') || '없음'}</span>
      </div>
      <LeaderboardView recordMap={recordMap} chars={chars} />
      <div style={s.summaryCountdown}>다음 라운드 자동 시작: {countdown}s</div>
      <div style={s.summaryBtns}>
        <button style={s.btnNextRound} onClick={onNextRound}>지금 시작</button>
        <button style={s.btnStop}      onClick={onStop}>정지</button>
      </div>
    </div>
  )
}

// ─── SimulationPage ───────────────────────────────────────────────────────────

export default function SimulationPage() {
  const savedState = loadSimState()
  const [simState, setSimState]   = useState<SimPersist>(() => savedState ?? buildInitialSimState(false))
  const [watchPhase, setWatchPhase] = useState<WatchPhase>('idle')
  const [speed, setSpeed]           = useState<SpeedKey>('1x')
  const [isPaused, setIsPaused]     = useState(false)
  const [showRecords, setShowRecords] = useState(false)
  const [resumeData]                = useState<ResumeData | null>(loadResume)
  const isPausedRef = useRef(false)

  const [gachaCards, setGachaCards]         = useState<GachaCardEntry[]>([])
  const [matchQueue, setMatchQueue]         = useState<MatchResult[]>([])
  const [matchLabels, setMatchLabels]       = useState<string[]>([])
  const [matchIndex, setMatchIndex]         = useState(0)
  const [currentResult, setCurrentResult]   = useState<TournamentResult | null>(null)
  const [roundGrowthMap, setRoundGrowthMap] = useState<Record<number, GrowthStats>>({})
  const [roundSkillMap, setRoundSkillMap]   = useState<Record<number, string[]>>({})
  const [summaryCountdown, setSummaryCountdown] = useState(3)
  const summaryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { isPausedRef.current = isPaused }, [isPaused])
  useEffect(() => { saveSimState(simState) }, [simState])

  const activeChars = getActiveChars(simState.useIpChars)

  // ── Internal: fire up a tournament given pre-computed gacha output ───────────

  function startRound(growthMap: Record<number, GrowthStats>, skillMap: Record<number, string[]>, seed: number, chars: CharacterDef[]) {
    const result = runTournament(chars, growthMap, skillMap, seed, simState.round)
    const labels = result.allMatches.map((m, i) => computeMatchLabel(m, result.allMatches, i))
    setCurrentResult(result)
    setMatchQueue(result.allMatches)
    setMatchLabels(labels)
    setMatchIndex(0)
    setRoundGrowthMap(growthMap)
    setRoundSkillMap(skillMap)
  }

  // ── Start a new round (with gacha) ─────────────────────────────────────────

  function handleStart() {
    const { growthMap, skillMap, round, useIpChars } = simState
    const chars = getActiveChars(useIpChars)
    const gachaSeed = Date.now() + round * 31337
    const { newGrowthMap, cards } = applyGacha(growthMap, chars, gachaSeed)
    setGachaCards(cards)
    const skillMapCopy: Record<number, string[]> = {}
    for (const c of chars) skillMapCopy[c.id] = [...(skillMap[c.id] ?? [])]
    const tournSeed = Date.now() + round * 99991
    saveResume({ seed: tournSeed, round, growthMapAfterGacha: newGrowthMap, skillMap: skillMapCopy, useIpChars })
    setSimState(prev => ({ ...prev, growthMap: newGrowthMap }))
    startRound(newGrowthMap, skillMapCopy, tournSeed, chars)
    setWatchPhase('gacha')
  }

  // ── Resume an interrupted round ─────────────────────────────────────────────

  function handleResume(rd: ResumeData) {
    const chars = getActiveChars(rd.useIpChars)
    startRound(rd.growthMapAfterGacha, rd.skillMap, rd.seed, chars)
    setWatchPhase('bracket_view')
  }

  // ── Phase transitions ───────────────────────────────────────────────────────

  const handleGachaDone   = useCallback(() => setWatchPhase('bracket_view'), [])
  const handleBracketDone = useCallback(() => setWatchPhase('match_battle'),  [])

  const handleBattleDone = useCallback(() => {
    setMatchIndex(prev => {
      const finishedIdx = prev

      // ── Real-time record + H2H update ──
      if (currentResult && finishedIdx < currentResult.allMatches.length) {
        const m   = currentResult.allMatches[finishedIdx]
        const key = h2hKey(m.char1Id, m.char2Id)
        const minId  = Math.min(m.char1Id, m.char2Id)
        const minWon = m.winnerId === minId
        setSimState(st => {
          const rm = { ...st.recordMap }
          const wr = rm[m.winnerId] ?? { wins: 0, losses: 0, bestStage: '예선 탈락', bestStageCount: 0 }
          const lr = rm[m.loserId]  ?? { wins: 0, losses: 0, bestStage: '예선 탈락', bestStageCount: 0 }
          rm[m.winnerId] = { ...wr, wins: wr.wins + 1 }
          rm[m.loserId]  = { ...lr, losses: lr.losses + 1 }
          const existing = st.h2hMap[key] ?? ([0, 0] as [number, number])
          return {
            ...st,
            recordMap: rm,
            h2hMap: { ...st.h2hMap, [key]: [existing[0] + (minWon ? 1 : 0), existing[1] + (minWon ? 0 : 1)] as [number, number] },
          }
        })
      }

      if (!currentResult || prev + 1 >= currentResult.allMatches.length) {
        setWatchPhase('round_summary')
        return prev
      }
      setWatchPhase('bracket_view')
      return prev + 1
    })
  }, [currentResult])

  const handleSkipBattle = useCallback(() => handleBattleDone(), [handleBattleDone])

  // ── Round summary: finalise bestStage + round history ──────────────────────

  useEffect(() => {
    if (watchPhase !== 'round_summary' || !currentResult) return
    setSimState(prev => {
      const rm = { ...prev.recordMap }
      for (const c of activeChars) {
        const stage    = stageLabelFromResult(currentResult, c.id)
        const existing = rm[c.id] ?? { wins: 0, losses: 0, bestStage: '예선 탈락', bestStageCount: 0 }
        const newBest  = mergeBestStage(existing.bestStage, stage)
        const changed  = newBest !== existing.bestStage
        rm[c.id] = {
          ...existing,
          bestStage:      newBest,
          bestStageCount: changed ? 1 : (newBest === stage ? existing.bestStageCount + 1 : existing.bestStageCount),
        }
      }
      const roundMatches: RoundMatchRecord[] = currentResult.allMatches.map((m, i) => ({
        char1Id: m.char1Id, char2Id: m.char2Id, winnerId: m.winnerId,
        label: matchLabels[i] ?? computeMatchLabel(m, currentResult.allMatches, i),
      }))
      const runnerUp = Object.entries(currentResult.bracketEliminations).filter(([, r]) => r === 4).map(([id]) => Number(id))[0]
      return {
        ...prev,
        recordMap:      rm,
        skillMap:       roundSkillMap,
        prevFinalists:  [currentResult.winner, ...(runnerUp != null ? [runnerUp] : [])],
        prevDarkhorses: [...currentResult.darkhorses],
        roundHistory:   [...prev.roundHistory, { round: prev.round, winner: currentResult.winner, matches: roundMatches }],
      }
    })
  }, [watchPhase, currentResult, roundSkillMap, matchLabels, activeChars])

  // ── Summary countdown ───────────────────────────────────────────────────────

  useEffect(() => {
    if (watchPhase !== 'round_summary') return
    setSummaryCountdown(3)
    summaryTimerRef.current = setInterval(() => {
      setSummaryCountdown(c => { if (c <= 1) { if (summaryTimerRef.current) clearInterval(summaryTimerRef.current); return 0 } return c - 1 })
    }, 1000)
    return () => { if (summaryTimerRef.current) clearInterval(summaryTimerRef.current) }
  }, [watchPhase])

  useEffect(() => {
    if (watchPhase !== 'round_summary' || summaryCountdown > 0) return
    handleNextRound()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryCountdown, watchPhase])

  function handleNextRound() {
    if (summaryTimerRef.current) clearInterval(summaryTimerRef.current)
    setSimState(prev => ({ ...prev, round: prev.round + 1 }))
    setWatchPhase('idle')
    setTimeout(() => handleStart(), 50)
  }

  function handleStop() {
    if (summaryTimerRef.current) clearInterval(summaryTimerRef.current)
    clearResume()
    setWatchPhase('idle')
  }

  function handleReset() {
    if (summaryTimerRef.current) clearInterval(summaryTimerRef.current)
    clearResume()
    const fresh = buildInitialSimState(simState.useIpChars)
    setSimState(fresh)
    saveSimState(fresh)
    setWatchPhase('idle')
    setIsPaused(false)
    setGachaCards([]); setMatchQueue([]); setMatchLabels([]); setMatchIndex(0); setCurrentResult(null)
  }

  const currentMatch = matchQueue[matchIndex] ?? null
  const currentLabel = matchLabels[matchIndex] ?? ''
  const currentChar1 = currentMatch ? charDef(currentMatch.char1Id) ?? null : null
  const currentChar2 = currentMatch ? charDef(currentMatch.char2Id) ?? null : null
  const isRound1Idle = watchPhase === 'idle' && simState.round === 1

  return (
    <div style={s.root}>
      {/* ── Top bar ── */}
      <div style={s.topBar}>
        <button style={s.btnBack} onClick={() => useGameStore.setState({ phase: 'slot_select' })}>← 메인</button>
        <div style={s.roundBadge}>R{simState.round}</div>
        <div style={s.topSpacer} />
        <div style={s.speedRow}>
          {(['1x', '2x', '4x', '8x'] as SpeedKey[]).map(sp => (
            <button key={sp} style={{ ...s.speedBtn, ...(speed === sp ? s.speedActive : {}) }} onClick={() => setSpeed(sp)}>{sp}</button>
          ))}
        </div>
        {watchPhase !== 'idle' && watchPhase !== 'round_summary' && (
          <button
            style={{ ...s.pauseBtn, background: isPaused ? '#1a3050' : '#1a1a2e', borderColor: isPaused ? '#44aaff' : '#444', color: isPaused ? '#44aaff' : '#aaa' }}
            onClick={() => setIsPaused(p => !p)}
          >{isPaused ? '▶ 재생' : '⏸ 정지'}</button>
        )}
        {watchPhase === 'match_battle' && <button style={s.skipBtnTop} onClick={handleSkipBattle}>스킵</button>}
        <button style={s.statsBtn}  onClick={() => setShowRecords(p => !p)}>📊 기록</button>
        <button style={s.resetBtn}  onClick={handleReset}>리셋</button>
      </div>

      {/* ── Records overlay ── */}
      {showRecords && (
        <FullRecordsPanel
          recordMap={simState.recordMap}
          roundHistory={simState.roundHistory}
          useIpChars={simState.useIpChars}
          onClose={() => setShowRecords(false)}
        />
      )}

      {/* ── Idle ── */}
      {watchPhase === 'idle' && (
        <div style={s.idleBody}>
          <div style={s.idleRound}>Round {simState.round}</div>

          {/* Character set toggle — only before round 1 */}
          {isRound1Idle && (
            <div style={s.ipToggleRow}>
              <span style={s.ipToggleLabel}>참가 캐릭터</span>
              <button
                style={{ ...s.ipToggleBtn, ...(simState.useIpChars ? s.ipToggleActive : {}) }}
                onClick={() => setSimState(buildInitialSimState(!simState.useIpChars))}
              >
                {simState.useIpChars
                  ? `전체 ${allCharsArr.length}명 (IP 포함)`
                  : `오리지널 ${originalChars.length}명`}
              </button>
              <span style={s.ipToggleHint}>← 탭으로 전환</span>
            </div>
          )}

          {/* Resume prompt */}
          {resumeData && resumeData.round === simState.round && (
            <div style={s.resumeBox}>
              <span style={s.resumeText}>R{resumeData.round} 관람이 중단된 기록이 있습니다.</span>
              <button style={s.resumeBtn} onClick={() => handleResume(resumeData)}>이어서 보기</button>
            </div>
          )}

          <p style={s.idleHint}>
            {activeChars.length}명의 AI 대전을 관람 모드로 감상합니다.<br />
            라운드마다 가챠가 적용되고 스탯·스킬·전적이 누적됩니다.
          </p>
          {Object.values(simState.recordMap).some(r => r.wins + r.losses > 0) && (
            <LeaderboardView recordMap={simState.recordMap} chars={activeChars} />
          )}
          <button style={s.btnStart} onClick={handleStart}>▶ 관람 시작</button>
        </div>
      )}

      {/* ── Gacha ── */}
      {watchPhase === 'gacha' && <GachaPhaseView cards={gachaCards} speed={speed} onDone={handleGachaDone} />}

      {/* ── Bracket preview ── */}
      {watchPhase === 'bracket_view' && currentMatch && currentResult && !isPaused && (
        <BracketPreviewView
          currentMatch={currentMatch} matchLabel={currentLabel} currentResult={currentResult}
          speed={speed} onDone={handleBracketDone} onSkip={handleBracketDone}
        />
      )}
      {watchPhase === 'bracket_view' && isPaused && currentMatch && (
        <div style={s.pausedCard}>
          <div style={s.pausedLabel}>⏸ 일시정지</div>
          <div style={s.pausedMatch}>{currentLabel}</div>
          <div style={s.pausedVs}>{charName(currentMatch.char1Id)} vs {charName(currentMatch.char2Id)}</div>
          <button style={s.btnResume} onClick={() => setIsPaused(false)}>▶ 재개</button>
        </div>
      )}

      {/* ── Battle ── */}
      {watchPhase === 'match_battle' && currentMatch && currentChar1 && currentChar2 && (
        <div style={s.battleWrap}>
          <div style={s.battleLabel}>{currentLabel}</div>
          <div style={s.battleProgress}>{matchIndex + 1} / {matchQueue.length} 경기</div>
          <BattleViewer
            key={currentMatch.matchId}
            match={currentMatch} char1={currentChar1} char2={currentChar2}
            growth1={roundGrowthMap[currentChar1.id] ?? simState.growthMap[currentChar1.id]}
            growth2={roundGrowthMap[currentChar2.id] ?? simState.growthMap[currentChar2.id]}
            speed={speed} isPausedRef={isPausedRef}
            prevFinalists={simState.prevFinalists} prevDarkhorses={simState.prevDarkhorses}
            onDone={handleBattleDone}
          />
        </div>
      )}

      {/* ── Round summary ── */}
      {watchPhase === 'round_summary' && currentResult && (
        <RoundSummaryView
          result={currentResult} round={simState.round} recordMap={simState.recordMap}
          chars={activeChars} countdown={summaryCountdown}
          onNextRound={handleNextRound} onStop={handleStop}
        />
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root:             { display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', padding: '0.75rem', gap: '0.75rem' },

  topBar:           { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', background: '#0a0a16', border: '1px solid #1a1a2e', borderRadius: '8px', padding: '0.5rem 0.75rem' },
  btnBack:          { background: 'transparent', border: '1px solid #333', borderRadius: '5px', color: '#888', padding: '0.3rem 0.6rem', cursor: 'pointer', fontSize: '0.75rem', whiteSpace: 'nowrap' },
  roundBadge:       { background: '#7c5cfc22', border: '1px solid #7c5cfc66', borderRadius: '5px', color: '#c0aaff', padding: '0.25rem 0.6rem', fontSize: '0.82rem', fontWeight: 700 },
  topSpacer:        { flex: 1 },
  speedRow:         { display: 'flex', gap: '0.25rem' },
  speedBtn:         { background: '#1a1a2e', border: '1px solid #333', borderRadius: '4px', color: '#888', padding: '0.25rem 0.6rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 },
  speedActive:      { background: '#7c5cfc', borderColor: '#7c5cfc', color: '#fff' },
  pauseBtn:         { border: '1px solid', borderRadius: '5px', padding: '0.3rem 0.7rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 },
  skipBtnTop:       { background: 'transparent', border: '1px solid #555', borderRadius: '5px', color: '#888', padding: '0.3rem 0.6rem', cursor: 'pointer', fontSize: '0.75rem' },
  statsBtn:         { background: 'transparent', border: '1px solid #44aa7744', borderRadius: '5px', color: '#44aa77', padding: '0.3rem 0.6rem', cursor: 'pointer', fontSize: '0.75rem' },
  resetBtn:         { background: 'transparent', border: '1px solid #c14a4a44', borderRadius: '5px', color: '#c14a4a', padding: '0.3rem 0.6rem', cursor: 'pointer', fontSize: '0.75rem' },

  idleBody:         { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', padding: '1rem 0' },
  idleRound:        { fontSize: '1.5rem', fontWeight: 700, color: '#c0aaff' },
  idleHint:         { color: '#666', fontSize: '0.82rem', lineHeight: 1.7, margin: 0, textAlign: 'center' },
  btnStart:         { background: 'linear-gradient(135deg,#7c5cfc,#c05cfc)', border: 'none', borderRadius: '10px', color: '#fff', padding: '0.85rem 2.75rem', cursor: 'pointer', fontSize: '1.05rem', fontWeight: 700 },

  ipToggleRow:      { display: 'flex', alignItems: 'center', gap: '0.6rem', background: '#0d0d1a', border: '1px solid #1a1a2e', borderRadius: '8px', padding: '0.5rem 0.85rem' },
  ipToggleLabel:    { fontSize: '0.72rem', color: '#666' },
  ipToggleBtn:      { background: '#1a1a2e', border: '1px solid #333', borderRadius: '6px', color: '#888', padding: '0.3rem 0.85rem', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 },
  ipToggleActive:   { background: '#1a2a3e', borderColor: '#44aaff', color: '#44aaff' },
  ipToggleHint:     { fontSize: '0.65rem', color: '#444' },

  resumeBox:        { display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#0a1a2e', border: '1px solid #44aaff44', borderRadius: '8px', padding: '0.6rem 1rem' },
  resumeText:       { fontSize: '0.78rem', color: '#aaa', flex: 1 },
  resumeBtn:        { background: '#1a3050', border: '1px solid #44aaff', borderRadius: '5px', color: '#44aaff', padding: '0.3rem 0.85rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 },

  // Bracket preview
  bpWrap:           { display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: '600px', margin: '0 auto', padding: '0.25rem 0' },
  bpHeader:         { background: '#14142a', border: '1px solid #2a2a4e', borderRadius: '10px', padding: '0.85rem 1rem', textAlign: 'center' },
  bpStageLabel:     { fontSize: '0.75rem', color: '#888', fontWeight: 700, letterSpacing: '0.06em', marginBottom: '0.4rem' },
  bpVsRow:          { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' },
  bpVs:             { fontSize: '1.1rem', fontWeight: 900, color: '#c0aaff' },
  bpSection:        { background: '#0d0d1a', border: '1px solid #1a1a2e', borderRadius: '8px', padding: '0.75rem' },
  bpSectionTitle:   { fontSize: '0.68rem', color: '#666', fontWeight: 700, letterSpacing: '0.07em', marginBottom: '0.5rem' },
  bpSkipBtn:        { background: 'transparent', border: '1px solid #7c5cfc66', borderRadius: '6px', color: '#c0aaff', padding: '0.45rem 1.25rem', cursor: 'pointer', fontSize: '0.8rem', alignSelf: 'center' },

  qualList:         { display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '44vh', overflowY: 'auto' },
  qualRow:          { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '3px 6px', borderRadius: '4px', background: '#0a0a14', fontSize: '0.68rem' },
  qualRowActive:    { background: '#14142e', border: '1px solid #7c5cfc66', boxShadow: '0 0 8px #7c5cfc44' },
  qualIdx:          { color: '#444', minWidth: '20px', fontSize: '0.6rem' },
  qualChar:         { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  qualVs:           { color: '#444', fontSize: '0.6rem', flexShrink: 0 },
  qualLive:         { color: '#ffd700', fontSize: '0.6rem', fontWeight: 700, flexShrink: 0 },

  groupMemberRow:   { display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.5rem' },
  groupMemberChip:  { fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: '4px' },
  groupMatchList:   { display: 'flex', flexDirection: 'column', gap: '3px' },
  groupMatchRow:    { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '3px 6px', borderRadius: '4px', background: '#0a0a14' },
  groupMatchTypeLabel:{ minWidth: '44px', color: '#888', fontSize: '0.6rem', fontWeight: 600 },

  bracketGrid:      { display: 'flex', gap: '0.4rem', overflowX: 'auto' },
  bracketCol:       { display: 'flex', flexDirection: 'column', minWidth: '88px', flex: '1 1 0', gap: '0.3rem' },
  bracketColLabel:  { textAlign: 'center', fontSize: '0.6rem', fontWeight: 700, color: '#666', padding: '2px 0', borderBottom: '1px solid #1e1e30', marginBottom: '2px' },
  bracketMatchCard: { background: '#0a0a14', border: '1px solid #1a1a2e', borderRadius: '4px', padding: '4px 5px', display: 'flex', flexDirection: 'column', gap: '2px' },
  bracketMatchActive:{ borderColor: '#7c5cfc88', background: '#14142e', boxShadow: '0 0 8px #7c5cfc44' },
  bracketLive:      { color: '#ffd700', fontSize: '0.55rem', fontWeight: 700 },

  gachaPhase:       { display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' },
  gachaTitle:       { fontSize: '1rem', fontWeight: 700, color: '#ffd700' },
  gachaCardList:    { display: 'flex', flexWrap: 'wrap', gap: '0.3rem', justifyContent: 'center', maxHeight: '50vh', overflowY: 'auto', width: '100%', padding: '0.25rem' },
  gachaCard:        { display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#0d0d1a', border: '1px solid', borderRadius: '4px', padding: '3px 8px', fontSize: '0.7rem' },
  gachaGrade:       { fontWeight: 700, minWidth: '28px', fontSize: '0.65rem' },
  gachaCharName:    { color: '#ccc' },
  gachaStatKey:     { color: '#888', fontSize: '0.62rem' },
  gachaGain:        { fontWeight: 700 },
  gachaCount:       { fontSize: '0.72rem', color: '#555' },
  skipBtn:          { background: 'transparent', border: '1px solid #444', borderRadius: '5px', color: '#777', padding: '0.3rem 1rem', cursor: 'pointer', fontSize: '0.78rem' },

  pausedCard:       { background: '#14142a', border: '1px solid #44aaff44', borderRadius: '12px', padding: '1.5rem', maxWidth: '400px', margin: '2rem auto', width: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' },
  pausedLabel:      { fontSize: '1rem', color: '#44aaff', fontWeight: 700 },
  pausedMatch:      { fontSize: '0.78rem', color: '#888' },
  pausedVs:         { fontSize: '0.95rem', color: '#e8e8ff', fontWeight: 700 },
  btnResume:        { background: '#1a3050', border: '1px solid #44aaff', borderRadius: '6px', color: '#44aaff', padding: '0.5rem 1.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700 },

  battleWrap:       { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', width: '100%' },
  battleLabel:      { fontSize: '0.88rem', fontWeight: 700, color: '#ffd700', letterSpacing: '0.06em' },
  battleProgress:   { fontSize: '0.7rem', color: '#555' },
  battleViewer:     { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', width: '100%', maxWidth: '600px' },
  arena:            { display: 'flex', gap: '0.75rem', alignItems: 'flex-start', width: '100%' },
  vsDivider:        { fontSize: '1.1rem', fontWeight: 900, color: '#c0aaff', alignSelf: 'center', minWidth: '28px', textAlign: 'center' as const },
  turnCounter:      { fontSize: '0.7rem', color: '#555' },

  charPanel:        { flex: 1, background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: '10px', padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', position: 'relative' as const, overflow: 'hidden', transition: 'box-shadow 0.2s' },
  charPanelAccent:  { position: 'absolute' as const, top: 0, left: 0, width: '3px', height: '100%' },
  charIcon:         { width: '40px', height: '40px', background: '#111', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  charNameText:     { fontSize: '0.72rem', fontWeight: 700, textAlign: 'center' as const },
  archBadgeSim:     { fontSize: '0.56rem', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', alignSelf: 'center' },
  favoredBadge:     { fontSize: '0.54rem', fontWeight: 700, background: '#2a1a00', border: '1px solid #ffd70055', borderRadius: '3px', padding: '1px 5px', color: '#ffd700', alignSelf: 'center', textAlign: 'center' as const },
  darkhorseSimBadge:{ fontSize: '0.54rem', fontWeight: 700, background: '#1a0a2a', border: '1px solid #aa44ff55', borderRadius: '3px', padding: '1px 5px', color: '#aa44ff', alignSelf: 'center', textAlign: 'center' as const },
  barGroup:         { display: 'flex', flexDirection: 'column', gap: '2px' },
  barLabelRow:      { display: 'flex', justifyContent: 'space-between' },
  barLbl:           { fontSize: '0.54rem', color: '#555' },
  barVal:           { fontSize: '0.54rem', color: '#777' },
  barBg:            { height: '5px', background: '#111', borderRadius: '3px', overflow: 'hidden' },
  bar:              { height: '100%', borderRadius: '3px', transition: 'width 0.2s ease' },
  simStatGrid:      { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2px' },
  simStatChip:      { background: '#0d0d1a', borderRadius: '3px', padding: '2px 3px', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '1px' },
  simStatLbl:       { fontSize: '0.5rem', color: '#555' },
  simStatVal:       { fontSize: '0.56rem', color: '#aaa', fontWeight: 700 },
  simSkillList:     { display: 'flex', flexDirection: 'column' as const, gap: '2px' },
  simSkillTag:      { fontSize: '0.52rem', border: '1px solid', borderRadius: '3px', padding: '1px 4px', textAlign: 'center' as const, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },

  logBox:           { width: '100%', maxWidth: '600px', background: '#080810', border: '1px solid #1a1a2e', borderRadius: '7px', padding: '0.4rem', height: '180px', overflowY: 'auto' as const, display: 'flex', flexDirection: 'column', gap: '2px' },
  logRow:           { display: 'flex', gap: '0.35rem', alignItems: 'center', padding: '2px 5px', borderRadius: '3px', fontSize: '0.68rem' },
  logTurn:          { color: '#444', minWidth: '26px', fontSize: '0.6rem' },
  logActor:         { fontWeight: 700, minWidth: '56px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  logArrow:         { color: '#444' },
  logTarget:        { color: '#aaa', minWidth: '56px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  logAction:        { color: '#ddd', flex: 1 },
  logDone:          { textAlign: 'center' as const, color: '#ffd700', fontSize: '0.75rem', padding: '5px', letterSpacing: '0.04em' },

  roundSummary:     { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '1rem 0' },
  summaryRound:     { fontSize: '0.78rem', color: '#888', fontWeight: 700, letterSpacing: '0.08em' },
  summaryWinner:    { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  summaryArchip:    { fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: '4px' },
  summaryWinnerName:{ fontSize: '1.4rem', fontWeight: 700, color: '#ffd700' },
  summaryTop4:      { display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center' },
  summaryTop4Label: { fontSize: '0.68rem', color: '#666', fontWeight: 700 },
  summaryTop4Name:  { fontSize: '0.75rem', background: '#1a1a2e', borderRadius: '4px', padding: '2px 7px' },
  summaryStats:     { display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: '#666' },
  summaryCountdown: { fontSize: '0.82rem', color: '#44aaff', background: '#0a1a2a', border: '1px solid #44aaff33', borderRadius: '6px', padding: '0.4rem 1rem' },
  summaryBtns:      { display: 'flex', gap: '0.75rem' },
  btnNextRound:     { background: '#1a3050', border: '1px solid #44aaff', borderRadius: '7px', color: '#44aaff', padding: '0.55rem 1.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700 },
  btnStop:          { background: 'transparent', border: '1px solid #555', borderRadius: '7px', color: '#888', padding: '0.55rem 1.25rem', cursor: 'pointer', fontSize: '0.85rem' },

  // Records panel
  statsOverlay:     { position: 'fixed' as const, inset: 0, background: '#00000099', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '3rem' },
  statsPanel:       { background: '#0d0d1a', border: '1px solid #2a2a4e', borderRadius: '12px', padding: '1rem', width: '94%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto' as const },
  statsPanelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' },
  statsPanelTitle:  { fontSize: '0.88rem', fontWeight: 700, color: '#c0aaff' },
  statsPanelClose:  { background: 'transparent', border: 'none', color: '#666', fontSize: '1rem', cursor: 'pointer', padding: '0 0.25rem' },

  tabRow:           { display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.75rem' },
  tabBtn:           { background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: '5px', color: '#666', padding: '0.25rem 0.6rem', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600 },
  tabActive:        { background: '#1a2a3e', borderColor: '#44aaff', color: '#44aaff' },

  fullRecordList:   { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  fullRecordRow:    { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '4px 7px', borderRadius: '5px' },

  roundHistoryBody: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  roundHistoryWinner:{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0' },
  roundMatchList:   { display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '55vh', overflowY: 'auto' as const },
  roundMatchRow:    { display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '3px 6px', borderRadius: '3px', background: '#0a0a14' },
  roundMatchLabel:  { fontSize: '0.6rem', color: '#888', minWidth: '72px', fontWeight: 600, flexShrink: 0 },

  leaderboard:      { width: '100%', maxWidth: '600px', background: '#0d0d1a', border: '1px solid #1a1a2e', borderRadius: '8px', padding: '0.75rem' },
  leaderboardTitle: { fontSize: '0.7rem', color: '#555', fontWeight: 700, marginBottom: '0.5rem', letterSpacing: '0.06em' },
  leaderboardGrid:  { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  leaderboardRow:   { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '4px 8px', borderRadius: '5px' },
  lbRank:           { fontWeight: 700, fontSize: '0.7rem', minWidth: '24px' },
  lbArchip:         { fontSize: '0.58rem', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', whiteSpace: 'nowrap' as const },
  lbName:           { flex: 1, fontSize: '0.72rem', color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  lbWins:           { fontSize: '0.7rem', color: '#44aaff', minWidth: '32px' },
  lbLosses:         { fontSize: '0.7rem', color: '#555', minWidth: '32px' },
  lbBest:           { fontSize: '0.68rem', minWidth: '60px', textAlign: 'right' as const },
  lbCount:          { fontSize: '0.65rem', color: '#555', minWidth: '26px', textAlign: 'right' as const },
}
