import { useCallback, useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import type {
  CharacterDef,
  CombatStats,
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

const characters = (charactersRaw as CharacterDef[]).filter(c => c.ipId == null)
const allSkillIds = (skillsRaw as Array<{ id: string }>).map(s => s.id)
const skillDefsMap: Record<string, SkillDef> = Object.fromEntries(
  (skillsRaw as SkillDef[]).map(s => [s.id, s])
)

const charName  = (id: number) => characters.find(c => c.id === id)?.name ?? `#${id}`
const charDef   = (id: number) => characters.find(c => c.id === id)
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
  wins: number
  losses: number
  bestStage: string
  bestStageCount: number
}

interface SimPersist {
  round: number
  growthMap: Record<number, GrowthStats>
  skillMap: Record<number, string[]>
  recordMap: Record<number, SimRecord>
  h2hMap: Record<string, [number, number]>
}

type WatchPhase = 'idle' | 'gacha' | 'match_preview' | 'match_battle' | 'round_summary'

interface GachaCardEntry {
  charId: number
  statKey: GrowthStatKey
  grade: string
  gain: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function h2hKey(a: number, b: number): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`
}

function buildInitialSimState(): SimPersist {
  const growthMap: Record<number, GrowthStats> = {}
  const skillMap: Record<number, string[]> = {}
  const recordMap: Record<number, SimRecord> = {}
  for (const c of characters) {
    growthMap[c.id] = { hp: NPC_BASE_GROWTH, str: NPC_BASE_GROWTH, agi: NPC_BASE_GROWTH, int: NPC_BASE_GROWTH, luk: NPC_BASE_GROWTH }
    skillMap[c.id] = pickN(allSkillIds, INITIAL_SKILL_COUNT, new SeededRng(c.id * 7919))
    recordMap[c.id] = { wins: 0, losses: 0, bestStage: '예선 탈락', bestStageCount: 0 }
  }
  return { round: 1, growthMap, skillMap, recordMap, h2hMap: {} }
}

function applyGacha(
  growthMap: Record<number, GrowthStats>,
  round: number,
): { newGrowthMap: Record<number, GrowthStats>; cards: GachaCardEntry[] } {
  const rng = new SeededRng(Date.now() + round * 999)
  const newMap: Record<number, GrowthStats> = {}
  for (const c of characters) newMap[c.id] = { ...growthMap[c.id] }

  const cards: GachaCardEntry[] = []
  const PULL_COUNT = 100
  const statKeys: GrowthStatKey[] = ['hp', 'str', 'agi', 'int', 'luk']

  for (let i = 0; i < PULL_COUNT; i++) {
    const charId = characters[rng.int(0, characters.length)].id
    const statKey = statKeys[rng.int(0, statKeys.length)]
    const roll = rng.next()
    let cumul = 0
    let grade = GACHA_GRADES[0]
    for (const g of GACHA_GRADES) {
      cumul += GACHA_PROBABILITIES[g]
      if (roll < cumul) { grade = g; break }
    }
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

function matchStageLabel(m: MatchResult, idx: number): string {
  if (m.stage === 'qualifier') return `예선 ${idx + 1}경기`
  if (m.stage === 'group') return `본선 조별 조 ${m.groupId ?? ''}`
  const roundLabels = ['16강', '8강', '4강', '결승']
  return `본선 토너먼트 ${roundLabels[(m.bracketRound ?? 1) - 1]}`
}

// ─── GachaPhaseView ───────────────────────────────────────────────────────────

function GachaPhaseView({
  cards, speed, onDone,
}: { cards: GachaCardEntry[]; speed: SpeedKey; onDone: () => void }) {
  const [shown, setShown] = useState(speed === '8x' ? cards.length : 0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (speed === '8x') { setShown(cards.length); return }
    const ms = Math.max(20, SPEED_MS[speed] / 5)
    intervalRef.current = setInterval(() => {
      setShown(prev => {
        const next = prev + 1
        if (next >= cards.length && intervalRef.current) clearInterval(intervalRef.current)
        return next
      })
    }, ms)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [cards.length, speed])

  useEffect(() => {
    if (shown < cards.length) return
    const delay = speed === '8x' ? 300 : 1500
    const t = setTimeout(onDone, delay)
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

// ─── MatchPreviewCard ─────────────────────────────────────────────────────────

function MatchPreviewCard({
  match, label, h2hMap, onDone,
}: { match: MatchResult; label: string; h2hMap: Record<string, [number, number]>; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1500)
    return () => clearTimeout(t)
  }, [onDone])

  const { char1Id, char2Id } = match
  const key = h2hKey(char1Id, char2Id)
  const h2h = h2hMap[key] ?? ([0, 0] as [number, number])
  const isChar1Min = char1Id < char2Id
  const char1Wins = isChar1Min ? h2h[0] : h2h[1]
  const char2Wins = isChar1Min ? h2h[1] : h2h[0]
  const total = char1Wins + char2Wins

  let desc = '첫 대결'
  if (total > 0) {
    if (char1Wins > char2Wins) desc = `${charName(char1Id)} 우위`
    else if (char2Wins > char1Wins) desc = `${charName(char2Id)} 우위`
    else desc = '대등'
  }

  const def1 = charDef(char1Id)
  const def2 = charDef(char2Id)
  const ac1 = ARCHETYPE_COLOR[def1?.archetype ?? ''] ?? '#888'
  const ac2 = ARCHETYPE_COLOR[def2?.archetype ?? ''] ?? '#888'

  return (
    <div style={s.previewCard}>
      <div style={s.previewLabel}>{label}</div>
      <div style={s.previewMatchRow}>
        <div style={s.previewChar}>
          <span style={{ ...s.previewArchip, background: ac1 + '33', color: ac1 }}>{def1?.archetype}</span>
          <span style={s.previewCharName}>{charName(char1Id)}</span>
        </div>
        <div style={s.previewVs}>VS</div>
        <div style={s.previewChar}>
          <span style={s.previewCharName}>{charName(char2Id)}</span>
          <span style={{ ...s.previewArchip, background: ac2 + '33', color: ac2 }}>{def2?.archetype}</span>
        </div>
      </div>
      <div style={s.previewH2H}>
        상대 전적: {char1Wins}승 {char2Wins}패 · {desc}
      </div>
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

function CharPanelSim({
  charId, hp, maxHp, mana, maxMana, isActing, stats, skills,
}: {
  charId: number; hp: number; maxHp: number; mana: number; maxMana: number
  isActing: boolean; stats: CombatStats | null; skills: string[]
}) {
  const hpPct = maxHp > 0 ? (hp / maxHp) * 100 : 0
  const manaPct = maxMana > 0 ? (mana / maxMana) * 100 : 0
  const hpColor = hpPct > 60 ? '#44ff88' : hpPct > 30 ? '#ffaa44' : '#ff4444'
  const def = charDef(charId)
  const ac = ARCHETYPE_COLOR[def?.archetype ?? ''] ?? '#888'

  return (
    <div style={{ ...s.charPanel, boxShadow: isActing ? '0 0 14px #ffd70066' : 'none' }}>
      <div style={{ ...s.charPanelAccent, background: ac }} />
      <div style={s.charIcon}><span style={{ fontSize: '1.8rem' }}>⚔️</span></div>
      <div style={s.charNameText}>{charName(charId)}</div>
      {def && <div style={{ ...s.archBadgeSim, background: ac + '33', color: ac }}>{def.archetype}</div>}
      <div style={s.barGroup}>
        <div style={s.barLabelRow}>
          <span style={s.barLbl}>HP</span>
          <span style={s.barVal}>{Math.ceil(hp)}/{maxHp}</span>
        </div>
        <div style={s.barBg}><div style={{ ...s.bar, width: `${hpPct}%`, background: hpColor }} /></div>
        <div style={s.barLabelRow}>
          <span style={s.barLbl}>MP</span>
          <span style={s.barVal}>{Math.ceil(mana)}/{maxMana}</span>
        </div>
        <div style={s.barBg}><div style={{ ...s.bar, width: `${manaPct}%`, background: '#44aaff' }} /></div>
      </div>
      {stats && (
        <div style={s.simStatGrid}>
          {([['ATK', Math.round(stats.atk)], ['DEF', Math.round(stats.def)], ['SPD', Math.round(stats.spd)]] as [string, number][]).map(([lbl, val]) => (
            <div key={lbl} style={s.simStatChip}>
              <span style={s.simStatLbl}>{lbl}</span>
              <span style={s.simStatVal}>{val}</span>
            </div>
          ))}
        </div>
      )}
      {skills.length > 0 && (
        <div style={s.simSkillList}>
          {skills.map(id => {
            const sk = skillDefsMap[id]
            if (!sk) return null
            const tc = sk.tier === 'legend' ? '#ffd700' : sk.tier === 'hero' ? '#c09cff' : sk.tier === 'rare' ? '#44aaff' : '#666'
            return <div key={id} style={{ ...s.simSkillTag, borderColor: tc + '55', color: tc }}>{sk.name}</div>
          })}
        </div>
      )}
    </div>
  )
}

// ─── BattleViewer ─────────────────────────────────────────────────────────────

function BattleViewer({
  match, char1, char2, growth1, growth2, speed, isPausedRef, onDone,
}: {
  match: MatchResult
  char1: CharacterDef
  char2: CharacterDef
  growth1: GrowthStats
  growth2: GrowthStats
  speed: SpeedKey
  isPausedRef: React.MutableRefObject<boolean>
  onDone: () => void
}) {
  const [logCursor, setLogCursor] = useState(0)
  const [done, setDone] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  const skills1 = match.char1Id === char1.id ? (match.char1Skills ?? []) : (match.char2Skills ?? [])
  const skills2 = match.char1Id === char2.id ? (match.char1Skills ?? []) : (match.char2Skills ?? [])
  const stats1 = deriveStats(char1.baseCombat, growth1, char1.archetype)
  const stats2 = deriveStats(char2.baseCombat, growth2, char2.archetype)

  useEffect(() => {
    if (done) return
    const ms = SPEED_MS[speed]
    const id = setInterval(() => {
      if (isPausedRef.current) return
      setLogCursor(c => {
        const next = c + 1
        if (next >= match.log.length) { clearInterval(id); setDone(true) }
        return next
      })
    }, ms)
    return () => clearInterval(id)
  }, [done, speed, match.log.length, isPausedRef])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logCursor])

  useEffect(() => {
    if (!done) return
    const t = setTimeout(onDone, 800)
    return () => clearTimeout(t)
  }, [done, onDone])

  const entry = logCursor > 0 ? match.log[logCursor - 1] : null
  const hp1  = Math.max(0, entry ? (entry.hpAfter[char1.id]   ?? match.initialHp[char1.id])   : match.initialHp[char1.id])
  const hp2  = Math.max(0, entry ? (entry.hpAfter[char2.id]   ?? match.initialHp[char2.id])   : match.initialHp[char2.id])
  const mp1  = Math.max(0, entry ? (entry.manaAfter[char1.id] ?? match.initialMana[char1.id]) : match.initialMana[char1.id])
  const mp2  = Math.max(0, entry ? (entry.manaAfter[char2.id] ?? match.initialMana[char2.id]) : match.initialMana[char2.id])
  const recentLog = match.log.slice(Math.max(0, logCursor - 10), logCursor)

  return (
    <div style={s.battleViewer}>
      <div style={s.arena}>
        <CharPanelSim charId={char1.id} hp={hp1} maxHp={match.initialHp[char1.id]}
          mana={mp1} maxMana={match.initialMana[char1.id]}
          isActing={entry?.actorId === char1.id} stats={stats1} skills={skills1} />
        <div style={s.vsDivider}>VS</div>
        <CharPanelSim charId={char2.id} hp={hp2} maxHp={match.initialHp[char2.id]}
          mana={mp2} maxMana={match.initialMana[char2.id]}
          isActing={entry?.actorId === char2.id} stats={stats2} skills={skills2} />
      </div>
      <div style={s.turnCounter}>{logCursor} / {match.log.length} 턴</div>
      <div style={s.logBox} ref={logRef}>
        {recentLog.map((e, i) => <LogRowSim key={i} entry={e} char1Id={char1.id} />)}
        {done && <div style={s.logDone}>── 전투 종료 · 승자: {charName(match.winnerId)} ──</div>}
      </div>
    </div>
  )
}

// ─── LeaderboardView ──────────────────────────────────────────────────────────

function LeaderboardView({ recordMap }: { recordMap: Record<number, SimRecord> }) {
  const rows = characters
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
      <div style={s.leaderboardTitle}>통산 랭킹</div>
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
              <span style={s.lbCount}>{rec.bestStageCount}회</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── RoundSummaryView ─────────────────────────────────────────────────────────

function RoundSummaryView({
  result, round, recordMap, countdown, onNextRound, onStop,
}: {
  result: TournamentResult
  round: number
  recordMap: Record<number, SimRecord>
  countdown: number
  onNextRound: () => void
  onStop: () => void
}) {
  const winDef = charDef(result.winner)
  const ac = ARCHETYPE_COLOR[winDef?.archetype ?? ''] ?? '#888'
  const top4Ids = [
    result.winner,
    ...Object.entries(result.bracketEliminations)
      .filter(([, r]) => r >= 3)
      .map(([id]) => Number(id))
      .filter(id => id !== result.winner),
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
          {top4Ids.map(id => (
            <span key={id} style={{ ...s.summaryTop4Name, color: id === result.winner ? '#ffd700' : '#aaa' }}>
              {charName(id)}
            </span>
          ))}
        </div>
      )}
      <div style={s.summaryStats}>
        <span>총 경기: {result.allMatches.length}</span>
        <span>다크호스: {result.darkhorses.map(id => charName(id)).join(', ') || '없음'}</span>
      </div>
      <LeaderboardView recordMap={recordMap} />
      <div style={s.summaryCountdown}>다음 라운드 자동 시작: {countdown}s</div>
      <div style={s.summaryBtns}>
        <button style={s.btnNextRound} onClick={onNextRound}>지금 시작</button>
        <button style={s.btnStop} onClick={onStop}>정지</button>
      </div>
    </div>
  )
}

// ─── SimulationPage ───────────────────────────────────────────────────────────

export default function SimulationPage() {
  const [simState, setSimState] = useState<SimPersist>(buildInitialSimState)
  const [watchPhase, setWatchPhase] = useState<WatchPhase>('idle')
  const [speed, setSpeed] = useState<SpeedKey>('1x')
  const [isPaused, setIsPaused] = useState(false)
  const isPausedRef = useRef(false)

  const [gachaCards, setGachaCards] = useState<GachaCardEntry[]>([])
  const [matchQueue, setMatchQueue] = useState<MatchResult[]>([])
  const [matchIndex, setMatchIndex] = useState(0)
  const [currentResult, setCurrentResult] = useState<TournamentResult | null>(null)
  const [roundGrowthMap, setRoundGrowthMap] = useState<Record<number, GrowthStats>>({})
  const [roundSkillMap, setRoundSkillMap] = useState<Record<number, string[]>>({})
  const [summaryCountdown, setSummaryCountdown] = useState(3)
  const summaryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { isPausedRef.current = isPaused }, [isPaused])

  // ── Start a new round ───────────────────────────────────────────────────────

  function handleStart() {
    const { growthMap, skillMap, round } = simState
    const { newGrowthMap, cards } = applyGacha(growthMap, round)
    setGachaCards(cards)

    const skillMapCopy: Record<number, string[]> = {}
    for (const c of characters) skillMapCopy[c.id] = [...(skillMap[c.id] ?? [])]

    const seed = Date.now() + round * 31337
    const result = runTournament(characters, newGrowthMap, skillMapCopy, seed, round)
    setCurrentResult(result)
    setMatchQueue(result.allMatches)
    setMatchIndex(0)
    setRoundGrowthMap(newGrowthMap)
    setRoundSkillMap(skillMapCopy)
    setSimState(prev => ({ ...prev, growthMap: newGrowthMap }))
    setWatchPhase('gacha')
  }

  // ── Phase transitions ───────────────────────────────────────────────────────

  const handleGachaDone = useCallback(() => { setWatchPhase('match_preview') }, [])

  const handlePreviewDone = useCallback(() => { setWatchPhase('match_battle') }, [])

  const handleBattleDone = useCallback(() => {
    setMatchIndex(prev => {
      const finishedIdx = prev
      const next = prev + 1

      // Update H2H for the finished match
      if (currentResult && finishedIdx < currentResult.allMatches.length) {
        const m = currentResult.allMatches[finishedIdx]
        const key = h2hKey(m.char1Id, m.char2Id)
        const minId = Math.min(m.char1Id, m.char2Id)
        const minWon = m.winnerId === minId
        setSimState(s => {
          const existing = s.h2hMap[key] ?? ([0, 0] as [number, number])
          return {
            ...s,
            h2hMap: {
              ...s.h2hMap,
              [key]: [existing[0] + (minWon ? 1 : 0), existing[1] + (minWon ? 0 : 1)] as [number, number],
            },
          }
        })
      }

      if (!currentResult || next >= currentResult.allMatches.length) {
        setWatchPhase('round_summary')
        return prev
      }
      setWatchPhase('match_preview')
      return next
    })
  }, [currentResult])

  const handleSkipBattle = useCallback(() => {
    handleBattleDone()
  }, [handleBattleDone])

  // ── Round summary: update records, persist skillMap ─────────────────────────

  useEffect(() => {
    if (watchPhase !== 'round_summary' || !currentResult) return

    setSimState(prev => {
      const newRecordMap = { ...prev.recordMap }
      for (const c of characters) {
        const stage = stageLabelFromResult(currentResult, c.id)
        const wins = currentResult.allMatches.filter(m => m.winnerId === c.id).length
        const losses = currentResult.allMatches.filter(m => m.loserId === c.id).length
        const existing = newRecordMap[c.id] ?? { wins: 0, losses: 0, bestStage: '예선 탈락', bestStageCount: 0 }
        const newBest = mergeBestStage(existing.bestStage, stage)
        const bestChanged = newBest !== existing.bestStage
        newRecordMap[c.id] = {
          wins: existing.wins + wins,
          losses: existing.losses + losses,
          bestStage: newBest,
          bestStageCount: bestChanged ? 1 : (newBest === stage ? existing.bestStageCount + 1 : existing.bestStageCount),
        }
      }
      return { ...prev, recordMap: newRecordMap, skillMap: roundSkillMap }
    })
  }, [watchPhase, currentResult, roundSkillMap])

  // ── Summary countdown ───────────────────────────────────────────────────────

  useEffect(() => {
    if (watchPhase !== 'round_summary') return
    setSummaryCountdown(3)
    summaryTimerRef.current = setInterval(() => {
      setSummaryCountdown(c => {
        if (c <= 1) { if (summaryTimerRef.current) clearInterval(summaryTimerRef.current); return 0 }
        return c - 1
      })
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
    setWatchPhase('idle')
  }

  function handleReset() {
    if (summaryTimerRef.current) clearInterval(summaryTimerRef.current)
    setSimState(buildInitialSimState())
    setWatchPhase('idle')
    setIsPaused(false)
    setGachaCards([])
    setMatchQueue([])
    setMatchIndex(0)
    setCurrentResult(null)
  }

  const currentMatch = matchQueue[matchIndex] ?? null
  const currentChar1 = currentMatch ? charDef(currentMatch.char1Id) ?? null : null
  const currentChar2 = currentMatch ? charDef(currentMatch.char2Id) ?? null : null
  const currentLabel = currentMatch ? matchStageLabel(currentMatch, matchIndex) : ''

  return (
    <div style={s.root}>
      {/* ── Top bar ── */}
      <div style={s.topBar}>
        <button style={s.btnBack} onClick={() => useGameStore.setState({ phase: 'slot_select' })}>
          ← 메인
        </button>
        <div style={s.roundBadge}>R{simState.round}</div>
        <div style={s.topSpacer} />
        <div style={s.speedRow}>
          {(['1x', '2x', '4x', '8x'] as SpeedKey[]).map(sp => (
            <button key={sp}
              style={{ ...s.speedBtn, ...(speed === sp ? s.speedActive : {}) }}
              onClick={() => setSpeed(sp)}
            >{sp}</button>
          ))}
        </div>
        {watchPhase !== 'idle' && watchPhase !== 'round_summary' && (
          <button
            style={{ ...s.pauseBtn, background: isPaused ? '#1a3050' : '#1a1a2e', borderColor: isPaused ? '#44aaff' : '#444', color: isPaused ? '#44aaff' : '#aaa' }}
            onClick={() => setIsPaused(p => !p)}
          >
            {isPaused ? '▶ 재생' : '⏸ 일시정지'}
          </button>
        )}
        {watchPhase === 'match_battle' && (
          <button style={s.skipBtnTop} onClick={handleSkipBattle}>스킵</button>
        )}
        <button style={s.resetBtn} onClick={handleReset}>리셋</button>
      </div>

      {/* ── Idle ── */}
      {watchPhase === 'idle' && (
        <div style={s.idleBody}>
          <div style={s.idleRound}>Round {simState.round}</div>
          <p style={s.idleHint}>
            전체 {characters.length}명의 AI 대전을 관람 모드로 감상합니다.<br />
            라운드마다 가챠가 적용되고 캐릭터 스탯·스킬·전적이 누적됩니다.
          </p>
          {Object.values(simState.recordMap).some(r => r.wins + r.losses > 0) && (
            <LeaderboardView recordMap={simState.recordMap} />
          )}
          <button style={s.btnStart} onClick={handleStart}>▶ 관람 시작</button>
        </div>
      )}

      {/* ── Gacha Phase ── */}
      {watchPhase === 'gacha' && (
        <GachaPhaseView cards={gachaCards} speed={speed} onDone={handleGachaDone} />
      )}

      {/* ── Match Preview ── */}
      {watchPhase === 'match_preview' && currentMatch && !isPaused && (
        <MatchPreviewCard match={currentMatch} label={currentLabel} h2hMap={simState.h2hMap} onDone={handlePreviewDone} />
      )}
      {watchPhase === 'match_preview' && isPaused && currentMatch && (
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
            match={currentMatch}
            char1={currentChar1}
            char2={currentChar2}
            growth1={roundGrowthMap[currentChar1.id] ?? simState.growthMap[currentChar1.id]}
            growth2={roundGrowthMap[currentChar2.id] ?? simState.growthMap[currentChar2.id]}
            speed={speed}
            isPausedRef={isPausedRef}
            onDone={handleBattleDone}
          />
        </div>
      )}

      {/* ── Round Summary ── */}
      {watchPhase === 'round_summary' && currentResult && (
        <RoundSummaryView
          result={currentResult}
          round={simState.round}
          recordMap={simState.recordMap}
          countdown={summaryCountdown}
          onNextRound={handleNextRound}
          onStop={handleStop}
        />
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root:              { display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', padding: '0.75rem', gap: '0.75rem' },

  topBar:            { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', background: '#0a0a16', border: '1px solid #1a1a2e', borderRadius: '8px', padding: '0.5rem 0.75rem' },
  btnBack:           { background: 'transparent', border: '1px solid #333', borderRadius: '5px', color: '#888', padding: '0.3rem 0.6rem', cursor: 'pointer', fontSize: '0.75rem', whiteSpace: 'nowrap' },
  roundBadge:        { background: '#7c5cfc22', border: '1px solid #7c5cfc66', borderRadius: '5px', color: '#c0aaff', padding: '0.25rem 0.6rem', fontSize: '0.82rem', fontWeight: 700 },
  topSpacer:         { flex: 1 },
  speedRow:          { display: 'flex', gap: '0.25rem' },
  speedBtn:          { background: '#1a1a2e', border: '1px solid #333', borderRadius: '4px', color: '#888', padding: '0.25rem 0.6rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 },
  speedActive:       { background: '#7c5cfc', borderColor: '#7c5cfc', color: '#fff' },
  pauseBtn:          { border: '1px solid', borderRadius: '5px', padding: '0.3rem 0.7rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 },
  skipBtnTop:        { background: 'transparent', border: '1px solid #555', borderRadius: '5px', color: '#888', padding: '0.3rem 0.6rem', cursor: 'pointer', fontSize: '0.75rem' },
  resetBtn:          { background: 'transparent', border: '1px solid #c14a4a44', borderRadius: '5px', color: '#c14a4a', padding: '0.3rem 0.6rem', cursor: 'pointer', fontSize: '0.75rem' },

  idleBody:          { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', padding: '1rem 0' },
  idleRound:         { fontSize: '1.5rem', fontWeight: 700, color: '#c0aaff' },
  idleHint:          { color: '#666', fontSize: '0.82rem', lineHeight: 1.7, margin: 0, textAlign: 'center' },
  btnStart:          { background: 'linear-gradient(135deg,#7c5cfc,#c05cfc)', border: 'none', borderRadius: '10px', color: '#fff', padding: '0.85rem 2.75rem', cursor: 'pointer', fontSize: '1.05rem', fontWeight: 700 },

  gachaPhase:        { display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' },
  gachaTitle:        { fontSize: '1rem', fontWeight: 700, color: '#ffd700' },
  gachaCardList:     { display: 'flex', flexWrap: 'wrap', gap: '0.3rem', justifyContent: 'center', maxHeight: '50vh', overflowY: 'auto', width: '100%', padding: '0.25rem' },
  gachaCard:         { display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#0d0d1a', border: '1px solid', borderRadius: '4px', padding: '3px 8px', fontSize: '0.7rem' },
  gachaGrade:        { fontWeight: 700, minWidth: '28px', fontSize: '0.65rem' },
  gachaCharName:     { color: '#ccc' },
  gachaStatKey:      { color: '#888', fontSize: '0.62rem' },
  gachaGain:         { fontWeight: 700 },
  gachaCount:        { fontSize: '0.72rem', color: '#555' },
  skipBtn:           { background: 'transparent', border: '1px solid #444', borderRadius: '5px', color: '#777', padding: '0.3rem 1rem', cursor: 'pointer', fontSize: '0.78rem' },

  previewCard:       { background: '#14142a', border: '1px solid #2a2a4e', borderRadius: '12px', padding: '1.5rem', maxWidth: '480px', margin: '2rem auto', width: '100%', textAlign: 'center' },
  previewLabel:      { fontSize: '0.82rem', color: '#888', fontWeight: 700, marginBottom: '1rem', letterSpacing: '0.06em' },
  previewMatchRow:   { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '1rem' },
  previewChar:       { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' },
  previewArchip:     { fontSize: '0.62rem', fontWeight: 700, padding: '2px 6px', borderRadius: '3px' },
  previewCharName:   { fontSize: '1rem', fontWeight: 700, color: '#e8e8ff' },
  previewVs:         { fontSize: '1.2rem', fontWeight: 900, color: '#c0aaff', minWidth: '36px', textAlign: 'center' as const },
  previewH2H:        { fontSize: '0.8rem', color: '#ffd700', background: '#1a1400', border: '1px solid #ffd70033', borderRadius: '6px', padding: '0.4rem 0.75rem', display: 'inline-block' },

  pausedCard:        { background: '#14142a', border: '1px solid #44aaff44', borderRadius: '12px', padding: '1.5rem', maxWidth: '400px', margin: '2rem auto', width: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' },
  pausedLabel:       { fontSize: '1rem', color: '#44aaff', fontWeight: 700 },
  pausedMatch:       { fontSize: '0.78rem', color: '#888' },
  pausedVs:          { fontSize: '0.95rem', color: '#e8e8ff', fontWeight: 700 },
  btnResume:         { background: '#1a3050', border: '1px solid #44aaff', borderRadius: '6px', color: '#44aaff', padding: '0.5rem 1.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700 },

  battleWrap:        { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', width: '100%' },
  battleLabel:       { fontSize: '0.88rem', fontWeight: 700, color: '#ffd700', letterSpacing: '0.06em' },
  battleProgress:    { fontSize: '0.7rem', color: '#555' },
  battleViewer:      { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', width: '100%', maxWidth: '600px' },
  arena:             { display: 'flex', gap: '0.75rem', alignItems: 'flex-start', width: '100%' },
  vsDivider:         { fontSize: '1.1rem', fontWeight: 900, color: '#c0aaff', alignSelf: 'center', minWidth: '28px', textAlign: 'center' as const },
  turnCounter:       { fontSize: '0.7rem', color: '#555' },

  charPanel:         { flex: 1, background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: '10px', padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', position: 'relative' as const, overflow: 'hidden', transition: 'box-shadow 0.2s' },
  charPanelAccent:   { position: 'absolute' as const, top: 0, left: 0, width: '3px', height: '100%' },
  charIcon:          { width: '40px', height: '40px', background: '#111', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  charNameText:      { fontSize: '0.72rem', fontWeight: 700, textAlign: 'center' as const },
  archBadgeSim:      { fontSize: '0.56rem', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', alignSelf: 'center' },
  barGroup:          { display: 'flex', flexDirection: 'column', gap: '2px' },
  barLabelRow:       { display: 'flex', justifyContent: 'space-between' },
  barLbl:            { fontSize: '0.54rem', color: '#555' },
  barVal:            { fontSize: '0.54rem', color: '#777' },
  barBg:             { height: '5px', background: '#111', borderRadius: '3px', overflow: 'hidden' },
  bar:               { height: '100%', borderRadius: '3px', transition: 'width 0.2s ease' },
  simStatGrid:       { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2px' },
  simStatChip:       { background: '#0d0d1a', borderRadius: '3px', padding: '2px 3px', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '1px' },
  simStatLbl:        { fontSize: '0.5rem', color: '#555' },
  simStatVal:        { fontSize: '0.56rem', color: '#aaa', fontWeight: 700 },
  simSkillList:      { display: 'flex', flexDirection: 'column' as const, gap: '2px' },
  simSkillTag:       { fontSize: '0.52rem', border: '1px solid', borderRadius: '3px', padding: '1px 4px', textAlign: 'center' as const, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },

  logBox:            { width: '100%', maxWidth: '600px', background: '#080810', border: '1px solid #1a1a2e', borderRadius: '7px', padding: '0.4rem', height: '180px', overflowY: 'auto' as const, display: 'flex', flexDirection: 'column', gap: '2px' },
  logRow:            { display: 'flex', gap: '0.35rem', alignItems: 'center', padding: '2px 5px', borderRadius: '3px', fontSize: '0.68rem' },
  logTurn:           { color: '#444', minWidth: '26px', fontSize: '0.6rem' },
  logActor:          { fontWeight: 700, minWidth: '56px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  logArrow:          { color: '#444' },
  logTarget:         { color: '#aaa', minWidth: '56px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  logAction:         { color: '#ddd', flex: 1 },
  logDone:           { textAlign: 'center' as const, color: '#ffd700', fontSize: '0.75rem', padding: '5px', letterSpacing: '0.04em' },

  roundSummary:      { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '1rem 0' },
  summaryRound:      { fontSize: '0.78rem', color: '#888', fontWeight: 700, letterSpacing: '0.08em' },
  summaryWinner:     { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  summaryArchip:     { fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: '4px' },
  summaryWinnerName: { fontSize: '1.4rem', fontWeight: 700, color: '#ffd700' },
  summaryTop4:       { display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center' },
  summaryTop4Label:  { fontSize: '0.68rem', color: '#666', fontWeight: 700 },
  summaryTop4Name:   { fontSize: '0.75rem', background: '#1a1a2e', borderRadius: '4px', padding: '2px 7px' },
  summaryStats:      { display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: '#666' },
  summaryCountdown:  { fontSize: '0.82rem', color: '#44aaff', background: '#0a1a2a', border: '1px solid #44aaff33', borderRadius: '6px', padding: '0.4rem 1rem' },
  summaryBtns:       { display: 'flex', gap: '0.75rem' },
  btnNextRound:      { background: '#1a3050', border: '1px solid #44aaff', borderRadius: '7px', color: '#44aaff', padding: '0.55rem 1.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700 },
  btnStop:           { background: 'transparent', border: '1px solid #555', borderRadius: '7px', color: '#888', padding: '0.55rem 1.25rem', cursor: 'pointer', fontSize: '0.85rem' },

  leaderboard:       { width: '100%', maxWidth: '600px', background: '#0d0d1a', border: '1px solid #1a1a2e', borderRadius: '8px', padding: '0.75rem' },
  leaderboardTitle:  { fontSize: '0.7rem', color: '#555', fontWeight: 700, marginBottom: '0.5rem', letterSpacing: '0.06em' },
  leaderboardGrid:   { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  leaderboardRow:    { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '4px 8px', borderRadius: '5px' },
  lbRank:            { fontWeight: 700, fontSize: '0.7rem', minWidth: '24px' },
  lbArchip:          { fontSize: '0.58rem', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', whiteSpace: 'nowrap' as const },
  lbName:            { flex: 1, fontSize: '0.72rem', color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  lbWins:            { fontSize: '0.7rem', color: '#44aaff', minWidth: '36px' },
  lbLosses:          { fontSize: '0.7rem', color: '#555', minWidth: '36px' },
  lbBest:            { fontSize: '0.68rem', minWidth: '64px', textAlign: 'right' as const },
  lbCount:           { fontSize: '0.65rem', color: '#555', minWidth: '30px', textAlign: 'right' as const },
}
