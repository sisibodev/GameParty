import { useState, useCallback } from 'react'
import { useGameStore } from '../store/useGameStore'
import type {
  CharacterDef,
  GrowthStats,
  MatchResult,
  TournamentResult,
  NpcStat,
  SkillDef,
} from '../types'
import { runTournament } from '../engine/tournamentEngine'
import { deriveStats } from '../engine/statDeriver'
import { SeededRng } from '../utils/rng'
import { pickN } from '../utils/fisherYates'
import { NPC_BASE_GROWTH, INITIAL_SKILL_COUNT } from '../constants'
import charactersRaw from '../data/characters.json'
import skillsRaw from '../data/skills.json'

// ─── Constants ────────────────────────────────────────────────────────────────

const characters = (charactersRaw as CharacterDef[]).filter(c => c.ipId == null)
const allSkillIds = (skillsRaw as Array<{ id: string }>).map(s => s.id)
const skillDefsMap: Record<string, SkillDef> = Object.fromEntries(
  (skillsRaw as SkillDef[]).map(s => [s.id, s])
)

const ROUND_LABELS = ['16강', '8강', '4강', '결승']
const REPEAT_OPTIONS = [1, 5, 10, 20]
const HALF_COUNT = 8

const ARCHETYPE_COLOR: Record<string, string> = {
  tank: '#4a7fc1', berserker: '#c14a4a', assassin: '#7c5cfc',
  ranger: '#4ac17c', mage: '#c14ab0', paladin: '#c1a04a',
  warrior: '#c1714a', support: '#4ab0c1',
}

const TIER_COLOR: Record<string, string> = {
  common: '#888', rare: '#44aaff', hero: '#c09cff', legend: '#ffd700',
}

const STAGE_ORDER: Record<string, number> = {
  '예선 탈락': 0, '본선 그룹 탈락': 1, '16강': 2, '8강': 3, '4강': 4, '준우승': 5, '우승': 6,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function charName(id: number): string {
  return characters.find(c => c.id === id)?.name ?? `#${id}`
}

function charDef(id: number): CharacterDef | undefined {
  return characters.find(c => c.id === id)
}

function buildMaps(round: number) {
  const base = NPC_BASE_GROWTH + (round - 1)
  const growth: GrowthStats = { hp: base, str: base, agi: base, int: base, luk: base }
  const growthMap: Record<number, GrowthStats> = {}
  const skillMap: Record<number, string[]> = {}
  for (const c of characters) {
    growthMap[c.id] = growth
    skillMap[c.id] = pickN(allSkillIds, INITIAL_SKILL_COUNT, new SeededRng(c.id * 1000 + round))
  }
  return { growthMap, skillMap }
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

function accumulateNpcStats(
  prev: Record<number, NpcStat>,
  result: TournamentResult,
): Record<number, NpcStat> {
  const next = { ...prev }
  const wins: Record<number, number> = {}
  const losses: Record<number, number> = {}
  for (const m of result.allMatches) {
    wins[m.winnerId] = (wins[m.winnerId] ?? 0) + 1
    losses[m.loserId] = (losses[m.loserId] ?? 0) + 1
  }
  for (const c of characters) {
    const stage = stageLabelFromResult(result, c.id)
    const existing = next[c.id] ?? {
      totalWins: 0,
      totalLosses: 0,
      bestStage: '예선 탈락',
      bestStageCount: 0,
    }
    const newBest = mergeBestStage(existing.bestStage, stage)
    const bestChanged = newBest !== existing.bestStage
    next[c.id] = {
      totalWins: existing.totalWins + (wins[c.id] ?? 0),
      totalLosses: existing.totalLosses + (losses[c.id] ?? 0),
      bestStage: newBest,
      bestStageCount: bestChanged ? 1 : (newBest === stage ? existing.bestStageCount + 1 : existing.bestStageCount),
    }
  }
  return next
}

// ─── CharDetailModal ──────────────────────────────────────────────────────────

interface CharDetailModalProps {
  charId: number
  growthMap: Record<number, GrowthStats>
  skillMap: Record<number, string[]>
  npcStats: Record<number, NpcStat>
  onClose: () => void
}

function CharDetailModal({ charId, growthMap, skillMap, npcStats, onClose }: CharDetailModalProps) {
  const def = charDef(charId)
  if (!def) return null
  const growth = growthMap[charId] ?? { hp: 30, str: 30, agi: 30, int: 30, luk: 30 }
  const combat = deriveStats(def.baseCombat, growth, def.archetype)
  const skills = skillMap[charId] ?? []
  const stat = npcStats[charId]
  const archColor = ARCHETYPE_COLOR[def.archetype] ?? '#888'

  return (
    <div style={s.modalOverlay} onClick={onClose}>
      <div style={s.modalBox} onClick={e => e.stopPropagation()}>
        <button style={s.modalClose} onClick={onClose}>✕</button>
        <div style={s.modalHeader}>
          <span style={{ ...s.archBadge, background: archColor + '33', color: archColor, border: `1px solid ${archColor}66` }}>
            {def.archetype}
          </span>
          <span style={s.modalName}>{def.name}</span>
        </div>

        <div style={s.modalSection}>
          <div style={s.modalSectionTitle}>성장 스탯</div>
          <div style={s.statRow2}>
            {(['hp', 'str', 'agi', 'int', 'luk'] as const).map(k => (
              <div key={k} style={s.statCell2}>
                <span style={s.statLabel2}>{k.toUpperCase()}</span>
                <span style={s.statVal2}>{growth[k]}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={s.modalSection}>
          <div style={s.modalSectionTitle}>전투 스탯</div>
          <div style={s.statRow2}>
            {(
              [
                ['최대 HP', Math.round(combat.maxHp)],
                ['공격력', Math.round(combat.atk)],
                ['방어력', Math.round(combat.def)],
                ['속도', Math.round(combat.spd)],
                ['크리율', `${Math.round(combat.crit)}%`],
                ['회피율', `${Math.round(combat.eva)}%`],
                ['최대 마나', Math.round(combat.maxMana)],
              ] as [string, string | number][]
            ).map(([label, val]) => (
              <div key={label} style={s.statCell2}>
                <span style={s.statLabel2}>{label}</span>
                <span style={s.statVal2}>{val}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={s.modalSection}>
          <div style={s.modalSectionTitle}>스킬 ({skills.length}개)</div>
          <div style={s.skillList}>
            {skills.map(sid => {
              const sk = skillDefsMap[sid]
              if (!sk) return null
              const tc = TIER_COLOR[sk.tier] ?? '#888'
              return (
                <div key={sid} style={s.skillRow}>
                  <span style={{ ...s.skillTierBadge, color: tc, border: `1px solid ${tc}55` }}>
                    {sk.tier}
                  </span>
                  <span style={s.skillName}>{sk.name}</span>
                  <span style={s.skillDesc}>{sk.description}</span>
                </div>
              )
            })}
          </div>
        </div>

        {stat && (
          <div style={s.modalSection}>
            <div style={s.modalSectionTitle}>토너먼트 기록</div>
            <div style={s.statRow2}>
              {(
                [
                  ['총 승리', stat.totalWins],
                  ['총 패배', stat.totalLosses],
                  ['최고 성적', stat.bestStage],
                  ['최고 횟수', `${stat.bestStageCount}회`],
                ] as [string, string | number][]
              ).map(([label, val]) => (
                <div key={label} style={s.statCell2}>
                  <span style={s.statLabel2}>{label}</span>
                  <span style={{ ...s.statVal2, color: '#ffd700' }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── QualifierView ────────────────────────────────────────────────────────────

interface QualifierViewProps {
  matches: MatchResult[]
  onCharClick: (id: number) => void
}

function QualifierView({ matches, onCharClick }: QualifierViewProps) {
  const mid = Math.ceil(matches.length / 2)
  const phases = [matches.slice(0, mid), matches.slice(mid)]

  return (
    <div style={s.sectionWrap}>
      <div style={s.sectionHead}>예선전</div>
      {phases.map((phase, pi) =>
        phase.length === 0 ? null : (
          <div key={pi} style={s.phaseWrap}>
            <div style={s.phaseLabel}>예선전 라운드 {pi + 1}</div>
            <div style={s.qualGrid}>
              {phase.map(m => {
                const wDef = charDef(m.winnerId)
                const lDef = charDef(m.loserId)
                const wColor = ARCHETYPE_COLOR[wDef?.archetype ?? ''] ?? '#888'
                const lColor = ARCHETYPE_COLOR[lDef?.archetype ?? ''] ?? '#888'
                return (
                  <div key={m.matchId} style={s.qualCard}>
                    <span
                      style={{ ...s.qualName, color: '#e8e8ff', fontWeight: 700, cursor: 'pointer' }}
                      onClick={() => onCharClick(m.winnerId)}
                    >
                      {charName(m.winnerId)}
                    </span>
                    <span style={{ ...s.archChipSm, background: wColor + '33', color: wColor }}>
                      {wDef?.archetype}
                    </span>
                    <span style={s.vsLabel}>vs</span>
                    <span
                      style={{ ...s.qualName, color: '#555', cursor: 'pointer' }}
                      onClick={() => onCharClick(m.loserId)}
                    >
                      {charName(m.loserId)}
                    </span>
                    <span style={{ ...s.archChipSm, background: lColor + '22', color: '#555' }}>
                      {lDef?.archetype}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      )}
    </div>
  )
}

// ─── GroupView ────────────────────────────────────────────────────────────────

interface GroupViewProps {
  result: TournamentResult
  onCharClick: (id: number) => void
}

function GroupView({ result, onCharClick }: GroupViewProps) {
  const groupMatches = result.allMatches.filter(m => m.stage === 'group')

  return (
    <div style={s.sectionWrap}>
      <div style={s.sectionHead}>본선 조별 리그</div>
      <div style={s.groupGrid}>
        {result.groups.map(g => {
          const gMatches = groupMatches.filter(m => m.groupId === g.groupId)
          return (
            <div key={g.groupId} style={s.groupCard}>
              <div style={s.groupTitle}>조 {g.groupId}</div>
              <div style={s.groupMembers}>
                {g.players.map(pid => {
                  const isAdv = pid === g.rank1 || pid === g.rank2
                  const def = charDef(pid)
                  const ac = ARCHETYPE_COLOR[def?.archetype ?? ''] ?? '#888'
                  return (
                    <div
                      key={pid}
                      style={{ ...s.groupMember, color: isAdv ? '#e8e8ff' : '#555', cursor: 'pointer' }}
                      onClick={() => onCharClick(pid)}
                    >
                      <span style={{ ...s.dot, background: isAdv ? ac : '#333' }} />
                      <span style={{ flex: 1, fontSize: '0.72rem' }}>{charName(pid)}</span>
                      {isAdv && <span style={s.advBadge}>진출</span>}
                    </div>
                  )
                })}
              </div>
              <div style={s.groupMatches}>
                {gMatches.map(m => (
                  <div key={m.matchId} style={s.groupMatchRow}>
                    <span
                      style={{ color: m.winnerId === m.char1Id ? '#e8e8ff' : '#444', fontSize: '0.65rem', cursor: 'pointer' }}
                      onClick={() => onCharClick(m.char1Id)}
                    >
                      {charName(m.char1Id)}
                    </span>
                    <span style={{ fontSize: '0.6rem', color: '#444' }}>vs</span>
                    <span
                      style={{ color: m.winnerId === m.char2Id ? '#e8e8ff' : '#444', fontSize: '0.65rem', cursor: 'pointer' }}
                      onClick={() => onCharClick(m.char2Id)}
                    >
                      {charName(m.char2Id)}
                    </span>
                  </div>
                ))}
              </div>
              <div style={s.groupResult}>
                <span style={s.groupRank}>1위: <span style={{ color: '#ffd700' }}>{charName(g.rank1)}</span></span>
                <span style={s.groupRank}>2위: <span style={{ color: '#44aaff' }}>{charName(g.rank2)}</span></span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── SVG Bracket ─────────────────────────────────────────────────────────────

const SLOT_H = 36
const SLOT_GAP = 4
const COL_W = 120
const COL_GAP = 36

interface BracketViewProps {
  result: TournamentResult
  onCharClick: (id: number) => void
  stepMatches?: Set<string>
}

function BracketView({ result, onCharClick, stepMatches }: BracketViewProps) {
  const pool = result.finalists.slice(0, 16)
  while (pool.length < 16) pool.push(-1)

  const bracketMatches = result.allMatches.filter(m => m.stage === 'bracket')

  function isRevealed(m: MatchResult | undefined): boolean {
    if (!stepMatches) return true
    if (!m) return false
    return stepMatches.has(m.matchId)
  }

  function findMatch(a: number, b: number, round: number): MatchResult | undefined {
    if (a < 0 || b < 0) return undefined
    return bracketMatches.find(
      m => m.bracketRound === round &&
        ((m.char1Id === a && m.char2Id === b) || (m.char1Id === b && m.char2Id === a))
    )
  }

  // Returns the winner of R1 match for pool pair index (0..7 for left, 8..11 for right)
  function r1Winner(pairIdx: number): number {
    const a = pool[pairIdx * 2]
    const b = pool[pairIdx * 2 + 1]
    const m = findMatch(a, b, 1)
    if (!m || !isRevealed(m)) return -1
    return m.winnerId
  }

  // pairIdx 0..1 within a half's R2 (offset: 0 for left, 4 for right pool pairs)
  function r2Winner(halfOffset: number, pairIdx: number): number {
    const w0 = r1Winner(halfOffset + pairIdx * 2)
    const w1 = r1Winner(halfOffset + pairIdx * 2 + 1)
    if (w0 < 0 || w1 < 0) return -1
    const m = findMatch(w0, w1, 2)
    if (!m || !isRevealed(m)) return -1
    return m.winnerId
  }

  // halfOffset: 0 = left, 4 = right
  function r3Winner(halfOffset: number): number {
    const w0 = r2Winner(halfOffset, 0)
    const w1 = r2Winner(halfOffset, 1)
    if (w0 < 0 || w1 < 0) return -1
    const m = findMatch(w0, w1, 3)
    if (!m || !isRevealed(m)) return -1
    return m.winnerId
  }

  function finalWinner(): number {
    const wL = r3Winner(0)
    const wR = r3Winner(4)
    if (wL < 0 || wR < 0) return -1
    const m = findMatch(wL, wR, 4)
    if (!m || !isRevealed(m)) return -1
    return m.winnerId
  }

  // Column x positions: L-R1=0, L-R2=1, L-R3=2, L-R4=3, Finals=4, R-R3=5, R-R2=6, R-R1=7
  const cols = 9
  const colX = (i: number) => i * (COL_W + COL_GAP)

  // Heights per round column (number of slots)
  const rowCounts = [8, 4, 2, 1]
  const totalH = rowCounts[0] * SLOT_H + (rowCounts[0] - 1) * SLOT_GAP + 40 // +40 for label

  function yCenter(slotIndex: number, slotCount: number): number {
    const blockH = slotCount * SLOT_H + (slotCount - 1) * SLOT_GAP
    const startY = (totalH - 40 - blockH) / 2 + 20 // 20 = top label offset
    return startY + slotIndex * (SLOT_H + SLOT_GAP) + SLOT_H / 2
  }

  function yTop(slotIndex: number, slotCount: number): number {
    return yCenter(slotIndex, slotCount) - SLOT_H / 2
  }

  const svgW = cols * COL_W + (cols - 1) * COL_GAP

  const lines: React.ReactElement[] = []
  const slotEls: React.ReactElement[] = []

  let keyIdx = 0
  function k() { return `k${keyIdx++}` }

  function addLine(x1: number, y1: number, x2: number, y2: number, color: string) {
    lines.push(<line key={k()} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1.5} />)
  }

  function addSlot(charId: number, cx: number, slotIdx: number, slotCount: number, isWinner: boolean) {
    const x = cx
    const y = yTop(slotIdx, slotCount)
    const def = charId >= 0 ? charDef(charId) : undefined
    const ac = def ? (ARCHETYPE_COLOR[def.archetype] ?? '#888') : '#333'
    const dimmed = charId < 0 || !isWinner
    const fg = charId < 0 ? '#2a2a3e' : isWinner ? '#e8e8ff' : '#555'
    const bg = charId < 0 ? '#0a0a16' : isWinner ? '#1a1a3a' : '#0d0d1a'
    const bd = charId < 0 ? '#1a1a2e' : isWinner ? '#44aaff' : '#1e1e30'

    slotEls.push(
      <g
        key={k()}
        onClick={charId >= 0 ? () => onCharClick(charId) : undefined}
        style={{ cursor: charId >= 0 ? 'pointer' : 'default' }}
      >
        <rect x={x} y={y} width={COL_W} height={SLOT_H} rx={4} fill={bg} stroke={bd} />
        {charId >= 0 && (
          <rect x={x} y={y} width={4} height={SLOT_H} rx={2} fill={ac} opacity={dimmed ? 0.3 : 1} />
        )}
        <text x={x + 10} y={y + SLOT_H / 2 + 4} fill={fg} fontSize={11} fontWeight={isWinner ? 700 : 400}>
          {charId >= 0 ? charName(charId) : '—'}
        </text>
      </g>
    )
  }

  // ── Left half ──────────────────────────────────────────────────────────────

  const LR1 = colX(0)
  const LR2 = colX(1)
  const LR3 = colX(2)
  const LR4 = colX(3)
  const FIN = colX(4)
  const RR3 = colX(5)
  const RR2 = colX(6)
  const RR1 = colX(7)

  const CONN = '#2a2a3e'
  const WIN  = '#44aaff'
  const GOLD = '#ffd700'

  // Left R1 (col 0): pool[0..7]
  for (let i = 0; i < HALF_COUNT; i++) {
    const cid = pool[i]
    const pairIdx = Math.floor(i / 2)
    const winner = r1Winner(pairIdx)
    const isWin = winner === cid && cid >= 0
    addSlot(cid, LR1, i, HALF_COUNT, isWin)

    const midX = LR1 + COL_W + COL_GAP / 2
    const cy = yCenter(i, HALF_COUNT)
    addLine(LR1 + COL_W, cy, midX, cy, isWin ? WIN : CONN)

    if (i % 2 === 1) {
      const cy0 = yCenter(i - 1, HALF_COUNT)
      const cy1 = yCenter(i, HALF_COUNT)
      const hasWin = winner >= 0
      addLine(midX, cy0, midX, cy1, hasWin ? WIN : CONN)
      const r2Y = yCenter(pairIdx, 4)
      addLine(midX, (cy0 + cy1) / 2, LR2, r2Y, hasWin ? WIN : CONN)
    }
  }

  // Left R2 (col 1): 4 slots
  for (let i = 0; i < 4; i++) {
    const cid = r1Winner(i)
    const pairIdx = Math.floor(i / 2)
    const winner = r2Winner(0, pairIdx)
    const isWin = winner === cid && cid >= 0
    addSlot(cid < 0 ? -1 : cid, LR2, i, 4, isWin)

    const midX = LR2 + COL_W + COL_GAP / 2
    const cy = yCenter(i, 4)
    addLine(LR2 + COL_W, cy, midX, cy, isWin ? WIN : CONN)

    if (i % 2 === 1) {
      const cy0 = yCenter(i - 1, 4)
      const cy1 = yCenter(i, 4)
      const hasWin = winner >= 0
      addLine(midX, cy0, midX, cy1, hasWin ? WIN : CONN)
      const r3Y = yCenter(pairIdx, 2)
      addLine(midX, (cy0 + cy1) / 2, LR3, r3Y, hasWin ? WIN : CONN)
    }
  }

  // Left R3 (col 2): 2 slots
  for (let i = 0; i < 2; i++) {
    const cid = r2Winner(0, i)
    const winner = r3Winner(0)
    const isWin = winner === cid && cid >= 0
    addSlot(cid < 0 ? -1 : cid, LR3, i, 2, isWin)

    const midX = LR3 + COL_W + COL_GAP / 2
    const cy = yCenter(i, 2)
    addLine(LR3 + COL_W, cy, midX, cy, isWin ? WIN : CONN)

    if (i === 1) {
      const cy0 = yCenter(0, 2)
      const cy1 = yCenter(1, 2)
      const hasWin = winner >= 0
      addLine(midX, cy0, midX, cy1, hasWin ? WIN : CONN)
      const r4Y = yCenter(0, 1)
      addLine(midX, (cy0 + cy1) / 2, LR4, r4Y, hasWin ? WIN : CONN)
    }
  }

  // Left finalist (col 3)
  {
    const cid = r3Winner(0)
    const fw = finalWinner()
    const isWin = fw === cid && cid >= 0
    addSlot(cid < 0 ? -1 : cid, LR4, 0, 1, isWin)
    if (cid >= 0) {
      const midX = LR4 + COL_W + COL_GAP / 2
      const cy = yCenter(0, 1)
      addLine(LR4 + COL_W, cy, midX, cy, isWin ? GOLD : CONN)
      addLine(midX, cy, FIN, cy, isWin ? GOLD : CONN)
    }
  }

  // Finals (col 4)
  {
    const fw = finalWinner()
    slotEls.push(
      <text key={k()} x={FIN + COL_W / 2} y={yTop(0, 1) - 6} fill="#ffd700"
        fontSize={10} textAnchor="middle" fontWeight={700}>🏆 결승</text>
    )
    addSlot(fw < 0 ? -1 : fw, FIN, 0, 1, fw >= 0)
    if (fw >= 0) {
      const midX = FIN + COL_W + COL_GAP / 2
      const cy = yCenter(0, 1)
      addLine(FIN + COL_W, cy, midX, cy, GOLD)
      addLine(midX, cy, RR3, cy, GOLD)
    }
  }

  // Right R3 (col 5): 2 slots
  for (let i = 0; i < 2; i++) {
    const cid = r2Winner(4, i)
    const winner = r3Winner(4)
    const isWin = winner === cid && cid >= 0
    addSlot(cid < 0 ? -1 : cid, RR3, i, 2, isWin)

    const midX = RR3 + COL_W + COL_GAP / 2
    const cy = yCenter(i, 2)
    addLine(RR3 + COL_W, cy, midX, cy, isWin ? WIN : CONN)

    if (i === 1) {
      const cy0 = yCenter(0, 2)
      const cy1 = yCenter(1, 2)
      const hasWin = winner >= 0
      addLine(midX, cy0, midX, cy1, hasWin ? WIN : CONN)
      const r2Y = yCenter(0, 1)
      addLine(midX, (cy0 + cy1) / 2, RR2, r2Y, hasWin ? WIN : CONN)
    }
  }

  // Right R2 (col 6): 4 slots
  for (let i = 0; i < 4; i++) {
    const cid = r1Winner(HALF_COUNT + i)
    const pairIdx = Math.floor(i / 2)
    const winner = r2Winner(4, pairIdx)
    const isWin = winner === cid && cid >= 0
    addSlot(cid < 0 ? -1 : cid, RR2, i, 4, isWin)

    const midX = RR2 + COL_W + COL_GAP / 2
    const cy = yCenter(i, 4)
    addLine(RR2 + COL_W, cy, midX, cy, isWin ? WIN : CONN)

    if (i % 2 === 1) {
      const cy0 = yCenter(i - 1, 4)
      const cy1 = yCenter(i, 4)
      const hasWin = winner >= 0
      addLine(midX, cy0, midX, cy1, hasWin ? WIN : CONN)
      const r3Y = yCenter(pairIdx, 2)
      addLine(midX, (cy0 + cy1) / 2, RR3, r3Y, hasWin ? WIN : CONN)
    }
  }

  // Right R1 (col 7): pool[8..15]
  for (let i = 0; i < HALF_COUNT; i++) {
    const cid = pool[HALF_COUNT + i]
    const pairIdx = HALF_COUNT + Math.floor(i / 2)
    const winner = r1Winner(pairIdx)
    const isWin = winner === cid && cid >= 0
    addSlot(cid, RR1, i, HALF_COUNT, isWin)

    const midX = RR1 + COL_W + COL_GAP / 2
    const cy = yCenter(i, HALF_COUNT)
    addLine(RR1 + COL_W, cy, midX, cy, isWin ? WIN : CONN)

    if (i % 2 === 1) {
      const cy0 = yCenter(i - 1, HALF_COUNT)
      const cy1 = yCenter(i, HALF_COUNT)
      const hasWin = winner >= 0
      addLine(midX, cy0, midX, cy1, hasWin ? WIN : CONN)
      const r2Y = yCenter(Math.floor(i / 2), 4)
      addLine(midX, (cy0 + cy1) / 2, RR2, r2Y, hasWin ? WIN : CONN)
    }
  }

  const colLabels: [number, string][] = [
    [LR1, '16강'], [LR2, '8강'], [LR3, '4강'], [LR4, '결승'], [FIN, ''], [RR3, '4강'], [RR2, '8강'], [RR1, '16강'],
  ]

  return (
    <div style={s.sectionWrap}>
      <div style={s.sectionHead}>토너먼트 대진표</div>
      <div style={s.bracketContainer}>
        <div style={{ overflowX: 'auto' }}>
          <svg width={svgW} height={totalH} style={{ display: 'block', overflow: 'visible' }}>
            {colLabels.map(([lx, label]) => label ? (
              <text key={`lbl-${lx}`} x={lx + COL_W / 2} y={14} fill="#555" fontSize={10} textAnchor="middle" fontWeight={700}>
                {label}
              </text>
            ) : null)}
            {lines}
            {slotEls}
          </svg>
        </div>
      </div>
    </div>
  )
}

// ─── NpcStatsTable ────────────────────────────────────────────────────────────

interface NpcStatsTableProps {
  npcStats: Record<number, NpcStat>
  onCharClick: (id: number) => void
}

function NpcStatsTable({ npcStats, onCharClick }: NpcStatsTableProps) {
  const rows = characters
    .map(c => ({ c, stat: npcStats[c.id] }))
    .filter(r => r.stat != null)
    .sort((a, b) => {
      const sa = STAGE_ORDER[a.stat!.bestStage] ?? 0
      const sb = STAGE_ORDER[b.stat!.bestStage] ?? 0
      return sb !== sa ? sb - sa : (b.stat!.totalWins - a.stat!.totalWins)
    })

  if (rows.length === 0) return null

  return (
    <div style={s.sectionWrap}>
      <div style={s.sectionHead}>캐릭터 누적 전적</div>
      <div style={s.statsTableWrap}>
        <table style={s.statsTable}>
          <thead>
            <tr>
              {['캐릭터', '직업', '총 승', '총 패', '최고 성적', '횟수'].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, stat }) => {
              if (!stat) return null
              const ac = ARCHETYPE_COLOR[c.archetype] ?? '#888'
              return (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => onCharClick(c.id)}>
                  <td style={s.td}>{c.name}</td>
                  <td style={s.td}>
                    <span style={{ ...s.archChipSm, background: ac + '33', color: ac }}>{c.archetype}</span>
                  </td>
                  <td style={{ ...s.td, color: '#44aaff' }}>{stat.totalWins}</td>
                  <td style={{ ...s.td, color: '#666' }}>{stat.totalLosses}</td>
                  <td style={{ ...s.td, color: '#ffd700' }}>{stat.bestStage}</td>
                  <td style={{ ...s.td, color: '#aaa' }}>{stat.bestStageCount}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── TournamentSummary ────────────────────────────────────────────────────────

interface TournamentSummaryProps {
  result: TournamentResult
  onCharClick: (id: number) => void
}

function TournamentSummary({ result, onCharClick }: TournamentSummaryProps) {
  const winChar = charDef(result.winner)
  const archColor = ARCHETYPE_COLOR[winChar?.archetype ?? ''] ?? '#888'
  const top4Ids = [
    result.winner,
    ...Object.entries(result.bracketEliminations)
      .filter(([, r]) => r >= 3)
      .map(([id]) => Number(id))
      .filter(id => id !== result.winner),
  ]

  return (
    <div style={s.statsBox}>
      <div style={s.statGrid}>
        {(
          [
            ['총 경기', `${result.allMatches.length}`],
            ['예선 통과', `${result.qualifiers.length}명`],
            ['본선 진출', `${result.finalists.length}명`],
            ['다크호스', `${result.darkhorses.length}명`],
          ] as [string, string][]
        ).map(([label, val]) => (
          <div key={label} style={s.statCell}>
            <span style={s.statLabel}>{label}</span>
            <span style={s.statVal}>{val}</span>
          </div>
        ))}
      </div>
      <div style={s.winnerRow}>
        <span style={{ ...s.archChip, background: archColor + '33', color: archColor }}>
          {winChar?.archetype}
        </span>
        <span
          style={{ ...s.winnerLabel, cursor: 'pointer' }}
          onClick={() => onCharClick(result.winner)}
        >
          🏆 {charName(result.winner)}
        </span>
      </div>
      {top4Ids.length > 1 && (
        <div style={s.top4Row}>
          <span style={s.top4Title}>4강</span>
          {top4Ids.map(id => (
            <span
              key={id}
              style={{ ...s.top4Name, color: id === result.winner ? '#ffd700' : '#aaa', cursor: 'pointer' }}
              onClick={() => onCharClick(id)}
            >
              {charName(id)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── StepView ─────────────────────────────────────────────────────────────────

interface StepViewProps {
  result: TournamentResult
  growthMap: Record<number, GrowthStats>
  skillMap: Record<number, string[]>
  npcStats: Record<number, NpcStat>
  onCharClick: (id: number) => void
}

function StepView({ result, growthMap, skillMap, npcStats, onCharClick }: StepViewProps) {
  const [step, setStep] = useState(0)
  const allMatches = result.allMatches
  const totalSteps = allMatches.length
  const revealedMatches = new Set(allMatches.slice(0, step).map(m => m.matchId))
  const currentMatch = step < totalSteps ? allMatches[step] : null
  const prevMatch = step > 0 ? allMatches[step - 1] : null
  const stageChanged = prevMatch != null && currentMatch != null && prevMatch.stage !== currentMatch.stage

  function matchStageLabel(m: MatchResult): string {
    if (m.stage === 'qualifier') return '예선전'
    if (m.stage === 'group') return `본선 조별 – 조 ${m.groupId ?? ''}`
    if (m.stage === 'bracket') return `토너먼트 ${ROUND_LABELS[(m.bracketRound ?? 1) - 1]}`
    return ''
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={s.stepControls}>
        <button
          style={{ ...s.stepBtn, opacity: step === 0 ? 0.4 : 1 }}
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
        >
          ← 이전
        </button>
        <span style={s.stepCounter}>{step} / {totalSteps}</span>
        <button
          style={{ ...s.stepBtn, opacity: step >= totalSteps ? 0.4 : 1 }}
          onClick={() => setStep(Math.min(totalSteps, step + 1))}
          disabled={step >= totalSteps}
        >
          다음 →
        </button>
      </div>

      {stageChanged && currentMatch && (
        <div style={s.stageTransitionCard}>▶ 다음 단계: {matchStageLabel(currentMatch)}</div>
      )}

      {currentMatch && (
        <div style={s.currentMatchCard}>
          <div style={s.currentMatchLabel}>{matchStageLabel(currentMatch)}</div>
          <div style={s.currentMatchPlayers}>
            <span
              style={{ ...s.currentMatchName, cursor: 'pointer' }}
              onClick={() => onCharClick(currentMatch.char1Id)}
            >
              {charName(currentMatch.char1Id)}
            </span>
            <span style={s.vsLabelLg}>VS</span>
            <span
              style={{ ...s.currentMatchName, cursor: 'pointer' }}
              onClick={() => onCharClick(currentMatch.char2Id)}
            >
              {charName(currentMatch.char2Id)}
            </span>
          </div>
        </div>
      )}

      {step >= totalSteps && (
        <TournamentSummary result={result} onCharClick={onCharClick} />
      )}

      <BracketView result={result} onCharClick={onCharClick} stepMatches={revealedMatches} />

      <NpcStatsTable
        npcStats={npcStats}
        onCharClick={onCharClick}
      />

      {/* Pass growthMap and skillMap to avoid lint warnings */}
      {(growthMap && skillMap) ? null : null}
    </div>
  )
}

// ─── SimulationPage ───────────────────────────────────────────────────────────

type PageStage = 'idle' | 'running' | 'done' | 'error'
type ViewMode = 'full' | 'step'
type ActiveTab = 'summary' | 'qualifier' | 'group' | 'bracket' | 'stats'

export default function SimulationPage() {
  const [round, setRound] = useState(1)
  const [repeatCount, setRepeatCount] = useState(1)
  const [viewMode, setViewMode] = useState<ViewMode>('full')
  const [pageStage, setPageStage] = useState<PageStage>('idle')
  const [result, setResult] = useState<TournamentResult | null>(null)
  const [errMsg, setErrMsg] = useState('')
  const [npcStats, setNpcStats] = useState<Record<number, NpcStat>>({})
  const [finalSkillMap, setFinalSkillMap] = useState<Record<number, string[]>>({})
  const [finalGrowthMap, setFinalGrowthMap] = useState<Record<number, GrowthStats>>({})
  const [modalCharId, setModalCharId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<ActiveTab>('summary')

  const handleCharClick = useCallback((id: number) => setModalCharId(id), [])

  async function handleStart() {
    setPageStage('running')
    setResult(null)
    setErrMsg('')
    setNpcStats({})
    await new Promise(r => setTimeout(r, 50))

    try {
      let accumulated: Record<number, NpcStat> = {}
      let lastResult: TournamentResult | null = null
      let lastSkillMap: Record<number, string[]> = {}
      let lastGrowthMap: Record<number, GrowthStats> = {}

      for (let i = 0; i < repeatCount; i++) {
        const currentRound = round + i
        const { growthMap, skillMap } = buildMaps(currentRound)
        const seed = Date.now() + i * 31337
        const r = runTournament(characters, growthMap, skillMap, seed, currentRound)
        accumulated = accumulateNpcStats(accumulated, r)
        lastResult = r
        lastSkillMap = skillMap
        lastGrowthMap = growthMap
        if (i % 5 === 4) await new Promise(r2 => setTimeout(r2, 0))
      }

      if (lastResult) {
        setResult(lastResult)
        setFinalSkillMap(lastSkillMap)
        setFinalGrowthMap(lastGrowthMap)
        setNpcStats(accumulated)
        setPageStage('done')
        setActiveTab('summary')
      }
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e))
      setPageStage('error')
    }
  }

  return (
    <div style={s.root}>
      {/* Top Bar */}
      <div style={s.topBar}>
        <button style={s.btnBack} onClick={() => useGameStore.setState({ phase: 'slot_select' })}>
          ← 메인으로
        </button>
        <h2 style={s.title}>시뮬레이션</h2>
        <div style={s.topControls}>
          <div style={s.controlGroup}>
            <span style={s.controlLabel}>라운드</span>
            <input
              type="range"
              min={1}
              max={20}
              value={round}
              onChange={e => setRound(Number(e.target.value))}
              style={s.roundSlider}
            />
            <span style={s.roundBadge}>R{round}</span>
          </div>
          <div style={s.controlGroup}>
            <span style={s.controlLabel}>반복</span>
            {REPEAT_OPTIONS.map(n => (
              <button
                key={n}
                style={{
                  ...s.repeatBtn,
                  background: repeatCount === n ? '#1a3050' : '#1a1a2e',
                  border: `1px solid ${repeatCount === n ? '#44aaff' : '#333'}`,
                  color: repeatCount === n ? '#44aaff' : '#888',
                }}
                onClick={() => setRepeatCount(n)}
              >
                {n}회
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Idle */}
      {pageStage === 'idle' && (
        <div style={s.idleBody}>
          <p style={s.hint}>
            전체 {characters.length}명이 참가하는 AI 자동 토너먼트.<br />
            라운드가 높을수록 전원 스탯이 올라갑니다 (R당 +1).
          </p>
          <button style={s.btnStart} onClick={handleStart}>▶ 시뮬레이션 시작</button>
        </div>
      )}

      {/* Running */}
      {pageStage === 'running' && (
        <div style={s.running}>
          <div style={s.spinner} />
          <p>시뮬레이션 진행 중… ({repeatCount}회)</p>
        </div>
      )}

      {/* Error */}
      {pageStage === 'error' && (
        <div style={s.idleBody}>
          <p style={{ color: '#ff5555', fontSize: '0.85rem' }}>오류: {errMsg}</p>
          <button style={s.btnStart} onClick={handleStart}>↺ 다시 시도</button>
        </div>
      )}

      {/* Done */}
      {pageStage === 'done' && result && (
        <>
          <div style={s.viewModeRow}>
            {(['full', 'step'] as ViewMode[]).map(m => (
              <button
                key={m}
                style={{
                  ...s.viewModeBtn,
                  background: viewMode === m ? '#44aaff22' : 'transparent',
                  border: `1px solid ${viewMode === m ? '#44aaff' : '#333'}`,
                  color: viewMode === m ? '#44aaff' : '#888',
                }}
                onClick={() => setViewMode(m)}
              >
                {m === 'full' ? '전체 보기' : '단계별'}
              </button>
            ))}
          </div>

          {viewMode === 'step' ? (
            <StepView
              result={result}
              growthMap={finalGrowthMap}
              skillMap={finalSkillMap}
              npcStats={npcStats}
              onCharClick={handleCharClick}
            />
          ) : (
            <>
              <div style={s.tabRow}>
                {(
                  [
                    ['summary', '요약'],
                    ['qualifier', '예선'],
                    ['group', '조별'],
                    ['bracket', '대진표'],
                    ['stats', '전적'],
                  ] as [ActiveTab, string][]
                ).map(([tab, label]) => (
                  <button
                    key={tab}
                    style={{
                      ...s.tabBtn,
                      background: activeTab === tab ? '#1a1a3a' : 'transparent',
                      borderBottom: `2px solid ${activeTab === tab ? '#c0aaff' : 'transparent'}`,
                      color: activeTab === tab ? '#c0aaff' : '#666',
                    }}
                    onClick={() => setActiveTab(tab)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {activeTab === 'summary' && (
                <TournamentSummary result={result} onCharClick={handleCharClick} />
              )}
              {activeTab === 'qualifier' && (
                <QualifierView
                  matches={result.allMatches.filter(m => m.stage === 'qualifier')}
                  onCharClick={handleCharClick}
                />
              )}
              {activeTab === 'group' && (
                <GroupView result={result} onCharClick={handleCharClick} />
              )}
              {activeTab === 'bracket' && (
                <BracketView result={result} onCharClick={handleCharClick} />
              )}
              {activeTab === 'stats' && (
                <NpcStatsTable npcStats={npcStats} onCharClick={handleCharClick} />
              )}
            </>
          )}

          <div style={s.bottomBtns}>
            <button style={s.btnRetry} onClick={handleStart}>↺ 다시 하기</button>
            <button style={s.btnBack} onClick={() => useGameStore.setState({ phase: 'slot_select' })}>
              ← 메인으로
            </button>
          </div>
        </>
      )}

      {/* Character Detail Modal */}
      {modalCharId !== null && (
        <CharDetailModal
          charId={modalCharId}
          growthMap={finalGrowthMap}
          skillMap={finalSkillMap}
          npcStats={npcStats}
          onClose={() => setModalCharId(null)}
        />
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root:              { display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', padding: '1rem 1.25rem', gap: '1rem' },
  topBar:            { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' },
  title:             { fontSize: '1.2rem', fontWeight: 700, color: '#c0aaff', margin: 0, flex: 1, textAlign: 'center' },
  btnBack:           { background: 'transparent', border: '1px solid #333', borderRadius: '6px', color: '#aaa', padding: '0.35rem 0.7rem', cursor: 'pointer', fontSize: '0.82rem', whiteSpace: 'nowrap' },
  topControls:       { display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' },
  controlGroup:      { display: 'flex', alignItems: 'center', gap: '6px' },
  controlLabel:      { fontSize: '0.72rem', color: '#666', whiteSpace: 'nowrap' },
  roundSlider:       { width: '80px', accentColor: '#7c5cfc' },
  roundBadge:        { fontSize: '0.8rem', color: '#c0aaff', fontWeight: 700, minWidth: '28px' },
  repeatBtn:         { padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 },

  idleBody:          { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', marginTop: '3rem' },
  hint:              { color: '#777', fontSize: '0.85rem', textAlign: 'center', lineHeight: 1.7, margin: 0 },
  btnStart:          { background: 'linear-gradient(135deg,#7c5cfc,#c05cfc)', border: 'none', borderRadius: '10px', color: '#fff', padding: '0.9rem 3rem', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700 },

  running:           { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginTop: '4rem', color: '#888' },
  spinner:           { width: '40px', height: '40px', border: '4px solid #333', borderTopColor: '#7c5cfc', borderRadius: '50%' },

  viewModeRow:       { display: 'flex', gap: '0.5rem' },
  viewModeBtn:       { padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700 },

  tabRow:            { display: 'flex', gap: 0, borderBottom: '1px solid #1e1e30' },
  tabBtn:            { padding: '8px 16px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, border: 'none', borderRadius: '4px 4px 0 0' },

  statsBox:          { background: '#14142a', border: '1px solid #2a2a3e', borderRadius: '10px', padding: '1rem' },
  statGrid:          { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' },
  statCell:          { background: '#0d0d1a', borderRadius: '6px', padding: '0.4rem 0.6rem', display: 'flex', flexDirection: 'column', gap: '2px' },
  statLabel:         { fontSize: '0.65rem', color: '#555', fontWeight: 700 },
  statVal:           { fontSize: '0.9rem', color: '#aaa', fontWeight: 600 },
  winnerRow:         { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' },
  winnerLabel:       { fontSize: '1.1rem', fontWeight: 700, color: '#ffd700' },
  archChip:          { fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', border: '1px solid transparent' },
  top4Row:           { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' },
  top4Title:         { fontSize: '0.7rem', color: '#666', fontWeight: 700 },
  top4Name:          { fontSize: '0.75rem', background: '#1a1a2e', borderRadius: '4px', padding: '2px 7px' },

  sectionWrap:       { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  sectionHead:       { fontSize: '0.75rem', color: '#666', fontWeight: 700, letterSpacing: '0.08em', padding: '4px 0', borderBottom: '1px solid #1e1e30' },

  phaseWrap:         { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  phaseLabel:        { fontSize: '0.68rem', color: '#555', fontWeight: 700 },
  qualGrid:          { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.3rem' },
  qualCard:          { background: '#0d0d1a', border: '1px solid #1a1a2e', borderRadius: '5px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' },
  qualName:          { fontSize: '0.7rem', whiteSpace: 'nowrap' },
  vsLabel:           { fontSize: '0.6rem', color: '#444' },
  archChipSm:        { fontSize: '0.58rem', padding: '1px 5px', borderRadius: '3px', border: '1px solid transparent', whiteSpace: 'nowrap' },

  groupGrid:         { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.5rem' },
  groupCard:         { background: '#0d0d1a', border: '1px solid #1a1a2e', borderRadius: '7px', padding: '0.6rem' },
  groupTitle:        { fontSize: '0.75rem', color: '#c0aaff', fontWeight: 700, marginBottom: '0.35rem' },
  groupMembers:      { display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '0.4rem' },
  groupMember:       { display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem' },
  dot:               { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 },
  advBadge:          { fontSize: '0.56rem', background: '#44aaff22', color: '#44aaff', padding: '1px 4px', borderRadius: '3px', border: '1px solid #44aaff44' },
  groupMatches:      { display: 'flex', flexDirection: 'column', gap: '2px', borderTop: '1px solid #1a1a2e', paddingTop: '0.3rem', marginBottom: '0.3rem' },
  groupMatchRow:     { display: 'flex', gap: '4px', alignItems: 'center', justifyContent: 'center' },
  groupResult:       { display: 'flex', flexDirection: 'column', gap: '2px', borderTop: '1px solid #1a1a2e', paddingTop: '0.3rem' },
  groupRank:         { fontSize: '0.65rem', color: '#666' },

  bracketContainer:  { overflowX: 'auto', background: '#0a0a16', borderRadius: '8px', padding: '1rem' },

  bottomBtns:        { display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '0.5rem' },
  btnRetry:          { background: '#1a2a3e', border: '1px solid #44aaff', borderRadius: '8px', color: '#44aaff', padding: '0.65rem 1.75rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 700 },

  stepControls:      { display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'center' },
  stepBtn:           { background: '#1a2a3e', border: '1px solid #44aaff', borderRadius: '6px', color: '#44aaff', padding: '0.5rem 1.25rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700 },
  stepCounter:       { fontSize: '0.85rem', color: '#888', minWidth: '100px', textAlign: 'center' },
  stageTransitionCard: { background: '#1a1400', border: '1px solid #ffd700', borderRadius: '8px', padding: '0.6rem 1rem', color: '#ffd700', fontSize: '0.85rem', fontWeight: 700, textAlign: 'center' },
  currentMatchCard:  { background: '#14142a', border: '1px solid #2a2a4e', borderRadius: '8px', padding: '0.75rem 1rem' },
  currentMatchLabel: { fontSize: '0.65rem', color: '#666', fontWeight: 700, marginBottom: '0.4rem' },
  currentMatchPlayers: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' },
  currentMatchName:  { fontSize: '0.9rem', color: '#e8e8ff', fontWeight: 700 },
  vsLabelLg:         { fontSize: '0.75rem', color: '#555', fontWeight: 700 },

  statsTableWrap:    { overflowX: 'auto' },
  statsTable:        { width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' },
  th:                { padding: '6px 8px', color: '#555', fontWeight: 700, borderBottom: '1px solid #1e1e30', textAlign: 'left', whiteSpace: 'nowrap' },
  td:                { padding: '5px 8px', borderBottom: '1px solid #111', color: '#aaa', whiteSpace: 'nowrap' },

  modalOverlay:      { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modalBox:          { background: '#14142a', border: '1px solid #2a2a4e', borderRadius: '12px', padding: '1.25rem', maxWidth: '480px', width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative' },
  modalClose:        { position: 'absolute', top: '0.75rem', right: '0.75rem', background: 'transparent', border: 'none', color: '#666', fontSize: '1rem', cursor: 'pointer' },
  modalHeader:       { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' },
  modalName:         { fontSize: '1.1rem', fontWeight: 700, color: '#e8e8ff' },
  archBadge:         { fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' },
  modalSection:      { marginBottom: '0.85rem' },
  modalSectionTitle: { fontSize: '0.65rem', color: '#555', fontWeight: 700, marginBottom: '0.4rem', letterSpacing: '0.06em' },
  statRow2:          { display: 'flex', flexWrap: 'wrap', gap: '0.4rem' },
  statCell2:         { background: '#0d0d1a', borderRadius: '5px', padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '60px' },
  statLabel2:        { fontSize: '0.62rem', color: '#555', fontWeight: 700 },
  statVal2:          { fontSize: '0.85rem', color: '#aaa', fontWeight: 600 },
  skillList:         { display: 'flex', flexDirection: 'column', gap: '0.35rem' },
  skillRow:          { display: 'flex', alignItems: 'flex-start', gap: '0.5rem', background: '#0d0d1a', borderRadius: '5px', padding: '5px 8px' },
  skillTierBadge:    { fontSize: '0.58rem', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', whiteSpace: 'nowrap', flexShrink: 0 },
  skillName:         { fontSize: '0.72rem', color: '#e8e8ff', fontWeight: 600, whiteSpace: 'nowrap' },
  skillDesc:         { fontSize: '0.65rem', color: '#666', lineHeight: 1.4 },
}
