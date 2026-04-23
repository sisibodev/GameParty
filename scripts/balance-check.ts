// Balance simulation script — not part of the build, run with: npx tsx scripts/balance-check.ts
import { runTournament } from '../src/games/training-arena/engine/tournamentEngine'
import { NPC_BASE_GROWTH, INITIAL_SKILL_COUNT } from '../src/games/training-arena/constants'
import type { CharacterDef, GrowthStats } from '../src/games/training-arena/types'
import { SeededRng } from '../src/games/training-arena/utils/rng'
import { pickN } from '../src/games/training-arena/utils/fisherYates'

import charactersRaw from '../src/games/training-arena/data/characters.json' with { type: 'json' }
import skillsRaw from '../src/games/training-arena/data/skills.json' with { type: 'json' }
const _cr = charactersRaw as unknown as CharacterDef[]
const _sr = skillsRaw as unknown as Array<{ id: string }>

const characters  = _cr.filter(c => c.ipId == null)
const allSkillIds = _sr.map(s => s.id)

function buildMaps(round: number) {
  const base   = NPC_BASE_GROWTH + (round - 1)
  const growth: GrowthStats = { hp: base, str: base, agi: base, int: base, luk: base }
  const growthMap: Record<number, GrowthStats> = {}
  const skillMap: Record<number, string[]>     = {}
  for (const c of characters) {
    growthMap[c.id] = growth
    skillMap[c.id]  = pickN(allSkillIds, INITIAL_SKILL_COUNT, new SeededRng(c.id * 1000 + round))
  }
  return { growthMap, skillMap }
}

function runCheck(label: string, round: number, runs: number) {
  const wins: Record<number, number>     = {}
  const top4: Record<number, number>     = {}
  const finalist: Record<number, number> = {}
  for (const c of characters) { wins[c.id] = 0; top4[c.id] = 0; finalist[c.id] = 0 }

  for (let i = 0; i < runs; i++) {
    const { growthMap, skillMap } = buildMaps(round)
    const result = runTournament(characters, growthMap, skillMap, i * 999983 + round * 7, round)
    wins[result.winner] = (wins[result.winner] ?? 0) + 1
    for (const [idStr, br] of Object.entries(result.bracketEliminations)) {
      const id = Number(idStr)
      if (br >= 3) top4[id] = (top4[id] ?? 0) + 1
      finalist[id] = (finalist[id] ?? 0) + 1
    }
    finalist[result.winner] = (finalist[result.winner] ?? 0) + 1
  }

  const archetypeWins: Record<string, number>  = {}
  const archetypeTop4: Record<string, number>  = {}
  const archetypeCount: Record<string, number> = {}
  for (const c of characters) {
    const a = c.archetype
    archetypeWins[a]  = (archetypeWins[a]  ?? 0) + wins[c.id]
    archetypeTop4[a]  = (archetypeTop4[a]  ?? 0) + top4[c.id]
    archetypeCount[a] = (archetypeCount[a] ?? 0) + 1
  }

  console.log(`\n══════ ${label} (${runs} runs) ══════`)
  console.log('Archetype    n    win%  fair%  top4/char%  status')
  const archetypes = Object.keys(archetypeWins).sort((a, b) => archetypeWins[b] - archetypeWins[a])
  for (const a of archetypes) {
    const cnt     = archetypeCount[a]
    const fairWin = cnt / characters.length
    const actualWin = archetypeWins[a] / runs
    const winPct  = (actualWin * 100).toFixed(1).padStart(5)
    const fairPct = (fairWin  * 100).toFixed(1).padStart(5)
    const top4Pct = ((archetypeTop4[a] / runs / cnt) * 100).toFixed(1).padStart(5)
    const ratio   = actualWin / fairWin
    const flag    = ratio > 1.8 ? '⚠️  OVER' : ratio < 0.3 ? '❌ UNDER' : ratio > 1.4 ? '△  HIGH' : ratio < 0.6 ? '▽  LOW ' : '✓  OK'
    console.log(`  ${a.padEnd(12)} ${String(cnt).padStart(2)}  ${winPct}% ${fairPct}%  ${top4Pct}%       ${flag}`)
  }

  console.log('\nTop 10 individual winners:')
  const sorted = characters.slice().sort((a, b) => wins[b.id] - wins[a.id]).slice(0, 10)
  for (const c of sorted) {
    if (wins[c.id] === 0) break
    console.log(`  ${c.name.padEnd(16)} [${c.archetype.padEnd(10)}] wins=${wins[c.id]} top4=${top4[c.id]}`)
  }
}

runCheck('Round 1  (growth=30)', 1, 1000)
runCheck('Round 5  (growth=34)', 5, 1000)
runCheck('Round 10 (growth=39)', 10, 1000)
