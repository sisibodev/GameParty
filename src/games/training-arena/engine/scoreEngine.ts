import type { GrowthStats, PlayerMatchInfo, RunRecord, SaveSlot, SkillDef, SkillTier, TournamentResult } from '../types'
import skillsRaw from '../data/skills.json'

const SKILL_SCORE: Record<SkillTier, number> = {
  common: 1,
  rare:   3,
  hero:   8,
  legend: 20,
}

const SKILLS_BY_ID: Record<string, SkillDef> = Object.fromEntries(
  (skillsRaw as SkillDef[]).map(s => [s.id, s]),
)

export const MAX_RUN_RECORDS = 20

function growthTotal(g: GrowthStats): number {
  return g.vit + g.str + g.agi + g.int + g.luk
}

function skillTierScore(skillIds: string[]): number {
  return skillIds.reduce((acc, id) => {
    const def = SKILLS_BY_ID[id]
    return acc + (def ? SKILL_SCORE[def.tier] : 0)
  }, 0)
}

export function calcScore(
  slot: SaveSlot,
  tournament: TournamentResult,
  overrides?: { wins: number; losses: number; rivalsDefeated: number },
): number {
  const pid   = slot.characterId
  const round = slot.currentRound

  const wins = overrides?.wins ?? tournament.allMatches.filter(
    m => (m.char1Id === pid || m.char2Id === pid) && m.winnerId === pid,
  ).length
  const losses = overrides?.losses ?? tournament.allMatches.filter(
    m => (m.char1Id === pid || m.char2Id === pid) && m.loserId === pid,
  ).length
  const rivalsDefeated = overrides?.rivalsDefeated ?? tournament.allMatches.filter(
    m => (m.char1Id === pid || m.char2Id === pid) &&
         m.winnerId === pid &&
         (slot.rivalIds ?? []).includes(m.loserId),
  ).length

  const allSkills = [...slot.initialSkills, ...slot.acquiredSkills]

  return Math.max(0,
    Math.max(0, 1000 - round * 50)
    + (wins * 10 - losses * 3)
    + Math.floor(growthTotal(slot.growthStats) * 0.5)
    + skillTierScore(allSkills)
    + (rivalsDefeated * 50),
  )
}

export function buildRunRecord(
  slot: SaveSlot,
  tournament: TournamentResult,
  actualMatches?: PlayerMatchInfo[],
): RunRecord {
  const pid = slot.characterId

  let wins: number, losses: number, rivalsDefeated: number
  if (actualMatches && actualMatches.length > 0) {
    wins = actualMatches.filter(m => m.playerWon).length
    losses = actualMatches.filter(m => !m.playerWon).length
    rivalsDefeated = actualMatches.filter(
      m => m.playerWon && (slot.rivalIds ?? []).includes(m.opponentId),
    ).length
  } else {
    wins = tournament.allMatches.filter(
      m => (m.char1Id === pid || m.char2Id === pid) && m.winnerId === pid,
    ).length
    losses = tournament.allMatches.filter(
      m => (m.char1Id === pid || m.char2Id === pid) && m.loserId === pid,
    ).length
    rivalsDefeated = tournament.allMatches.filter(
      m => (m.char1Id === pid || m.char2Id === pid) &&
           m.winnerId === pid &&
           (slot.rivalIds ?? []).includes(m.loserId),
    ).length
  }

  return {
    score:         calcScore(slot, tournament, { wins, losses, rivalsDefeated }),
    endRound:      slot.currentRound,
    finishedAt:    Date.now(),
    characterId:   pid,
    growthStats:   { ...slot.growthStats },
    skills:        [...slot.initialSkills, ...slot.acquiredSkills],
    items:         (slot.inventory ?? []).map(i => i.itemId),
    wins,
    losses,
    rivalsDefeated,
  }
}

// 기록 추가: 점수 내림차순, 최대 MAX_RUN_RECORDS건 유지
export function addRunRecord(existing: RunRecord[], record: RunRecord): RunRecord[] {
  return [...existing, record]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RUN_RECORDS)
}
