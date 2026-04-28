// Balance simulation script — not part of the build, run with: npx tsx scripts/balance-check.ts
import { runTournament } from '../src/games/training-arena/engine/tournamentEngine'
import { NPC_BASE_GROWTH, INITIAL_SKILL_COUNT } from '../src/games/training-arena/constants'
import type { CharacterDef, GrowthStats } from '../src/games/training-arena/types'
import { SeededRng } from '../src/games/training-arena/utils/rng'
import { pickN } from '../src/games/training-arena/utils/fisherYates'

import charactersRaw from '../src/games/training-arena/data/characters.json' with { type: 'json' }
import skillsRaw from '../src/games/training-arena/data/skills.json' with { type: 'json' }
const _cr = charactersRaw as unknown as CharacterDef[]
const _sr = skillsRaw as unknown as Array<{ id: string; category: string }>

const characters  = _cr.filter(c => c.ipId == null)
const allSkillIds = _sr.map(s => s.id)

// Archetype → skill prefix mapping for fair simulation
const ARCHETYPE_SKILL_PREFIX: Record<string, string> = {
  warrior:   'war',
  berserker: 'ber',
  assassin:  'ass',
  ranger:    'ran',
  mage:      'mag',
  paladin:   'pal',
  support:   'sup',
  tank:      'tnk',
}

// Filter to attack/special only so support/tank always get offensive skills in simulation
const skillPoolByArchetype: Record<string, string[]> = {}
for (const [arch, prefix] of Object.entries(ARCHETYPE_SKILL_PREFIX)) {
  const allForArch = _sr.filter(s => s.id.startsWith(prefix + '_'))
  const attackOnly = allForArch
    .filter(s => s.category === 'attack' || s.category === 'special')
    .map(s => s.id)
  const pool = attackOnly.length >= INITIAL_SKILL_COUNT ? attackOnly : allForArch.map(s => s.id)
  skillPoolByArchetype[arch] = pool.length >= INITIAL_SKILL_COUNT ? pool : allSkillIds
}

function buildMaps(round: number) {
  const base   = NPC_BASE_GROWTH + (round - 1)
  const growth: GrowthStats = { vit: base, str: base, agi: base, int: base, luk: base }
  const growthMap: Record<number, GrowthStats> = {}
  const skillMap: Record<number, string[]>     = {}
  for (const c of characters) {
    growthMap[c.id] = growth
    const pool = skillPoolByArchetype[c.archetype] ?? allSkillIds
    skillMap[c.id]  = pickN(pool, INITIAL_SKILL_COUNT, new SeededRng(c.id * 1000 + round))
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

runCheck('Round 1  (growth=1)',  1,  1000)
runCheck('Round 5  (growth=5)',  5,  1000)
runCheck('Round 10 (growth=10)', 10, 1000)
runCheck('Round 20 (growth=20)', 20, 1000)
runCheck('Round 30 (growth=30)', 30, 1000)
runCheck('Round 50 (growth=50)', 50, 1000)

// ─────────────────────────────────────────────────────────────────────────────
// STAT-ONLY 1v1 시뮬레이터  (스킬·아이템·패시브·성장치 전부 제외)
// ─────────────────────────────────────────────────────────────────────────────

import { simulateMatch } from '../src/games/training-arena/engine/battleEngine'
import type { BattleCharState } from '../src/games/training-arena/types'

const STAT_SIMS = 100

function makeStatState(char: CharacterDef): BattleCharState {
  return {
    charId:            char.id,
    currentHp:         0,
    currentMana:       0,
    gauge:             0,
    buffs:             [],
    debuffs:           [],
    cooldowns:         {},
    skills:            char.skills ? [...char.skills] : [],
    passives:          [],
    items:             [],
    skillEnhancements: {},
    growthStats:       { vit: 0, str: 0, agi: 0, int: 0, luk: 0 },
    baseCombat:        char.baseCombat,
    archetype:         char.archetype,
  }
}

function runStatOnlyBalance() {
  interface CR {
    id: number; name: string; archetype: string
    wins: number; losses: number; draws: number
    turns: number; dmgDealt: number; dmgTaken: number
    matchups: Map<number, { w: number; l: number }>
  }

  const res = new Map<number, CR>()
  for (const c of characters) {
    res.set(c.id, {
      id: c.id, name: c.name, archetype: c.archetype,
      wins: 0, losses: 0, draws: 0, turns: 0, dmgDealt: 0, dmgTaken: 0,
      matchups: new Map(),
    })
  }

  let seed = 1
  for (let i = 0; i < characters.length; i++) {
    for (let j = i + 1; j < characters.length; j++) {
      const c1 = characters[i]; const c2 = characters[j]
      const r1 = res.get(c1.id)!; const r2 = res.get(c2.id)!
      if (!r1.matchups.has(c2.id)) r1.matchups.set(c2.id, { w: 0, l: 0 })
      if (!r2.matchups.has(c1.id)) r2.matchups.set(c1.id, { w: 0, l: 0 })

      for (let s = 0; s < STAT_SIMS; s++) {
        const m = simulateMatch(makeStatState(c1), makeStatState(c2), seed++)
        const t = m.log.length
        r1.turns += t; r2.turns += t

        for (const e of m.log) {
          const dmg = (e as any).damage ?? 0
          if (e.actorId === c1.id) { r1.dmgDealt += dmg; r2.dmgTaken += dmg }
          else                     { r2.dmgDealt += dmg; r1.dmgTaken += dmg }
        }

        if (m.winnerId === c1.id) {
          r1.wins++; r2.losses++
          r1.matchups.get(c2.id)!.w++; r2.matchups.get(c1.id)!.l++
        } else if (m.winnerId === c2.id) {
          r2.wins++; r1.losses++
          r2.matchups.get(c1.id)!.w++; r1.matchups.get(c2.id)!.l++
        } else {
          r1.draws++; r2.draws++
        }
      }
    }
  }

  const sorted = Array.from(res.values()).sort((a, b) => {
    const ta = a.wins + a.losses + a.draws; const tb = b.wins + b.losses + b.draws
    return (b.wins / (tb || 1)) - (a.wins / (ta || 1))
  })

  const SEP = '═'.repeat(104)
  const DIV = '─'.repeat(104)
  const totalBattles = characters.length * (characters.length - 1) / 2 * STAT_SIMS
  console.log('\n' + SEP)
  console.log('  STAT-ONLY BALANCE REPORT  (스킬·아이템·패시브·성장치 없음)')
  console.log(`  캐릭터 ${characters.length}명  |  매치업당 ${STAT_SIMS}회  |  총 전투 ${totalBattles.toLocaleString()}회`)
  console.log(SEP)
  console.log('순위  이름              아키타입      승률     승     패    무   평균턴   딜/턴  피해/턴')
  console.log(DIV)

  for (let rank = 0; rank < sorted.length; rank++) {
    const r = sorted[rank]
    const total   = r.wins + r.losses + r.draws
    const wr      = total > 0 ? (r.wins / total * 100).toFixed(1) + '%' : '-'
    const avgTurn = total > 0 ? (r.turns / total).toFixed(1) : '-'
    const dpt     = r.turns > 0 ? (r.dmgDealt / r.turns).toFixed(1) : '-'
    const hpt     = r.turns > 0 ? (r.dmgTaken / r.turns).toFixed(1) : '-'
    const flag    = (() => {
      if (total < 1) return ''
      const w = r.wins / total * 100
      if (w >= 70) return '  ⚠ 과강'
      if (w <= 30) return '  ⚠ 과약'
      return ''
    })()
    console.log(
      `${String(rank + 1).padStart(3)}.  ${r.name.padEnd(16)}  ${r.archetype.padEnd(12)}` +
      `  ${wr.padStart(6)}  ${String(r.wins).padStart(5)}  ${String(r.losses).padStart(5)}` +
      `  ${String(r.draws).padStart(4)}  ${avgTurn.padStart(6)}  ${dpt.padStart(6)}  ${hpt.padStart(7)}${flag}`
    )
  }

  // 아키타입별 평균 승률
  const byArch = new Map<string, { w: number; t: number }>()
  for (const r of sorted) {
    const total = r.wins + r.losses + r.draws
    const a = byArch.get(r.archetype) ?? { w: 0, t: 0 }
    byArch.set(r.archetype, { w: a.w + r.wins, t: a.t + total })
  }
  const archSorted = Array.from(byArch.entries()).sort((a, b) => b[1].w / b[1].t - a[1].w / a[1].t)
  console.log('\n' + DIV)
  console.log('  아키타입별 평균 승률')
  console.log(DIV)
  for (const [arch, { w, t }] of archSorted) {
    const wr = (w / t * 100).toFixed(1)
    const bar = '█'.repeat(Math.round(w / t * 30))
    console.log(`  ${arch.padEnd(12)}  ${(wr + '%').padStart(6)}  ${bar}`)
  }

  // 극단적 매치업 TOP 15
  interface Pair { winner: string; wArch: string; loser: string; lArch: string; wr: number }
  const pairs: Pair[] = []
  for (let i = 0; i < characters.length; i++) {
    for (let j = i + 1; j < characters.length; j++) {
      const r1 = res.get(characters[i].id)!
      const mu = r1.matchups.get(characters[j].id)!
      const total = mu.w + mu.l
      if (total < 1) continue
      const aWr = mu.w / total * 100
      if (aWr >= 50) pairs.push({ winner: characters[i].name, wArch: characters[i].archetype, loser: characters[j].name, lArch: characters[j].archetype, wr: aWr })
      else           pairs.push({ winner: characters[j].name, wArch: characters[j].archetype, loser: characters[i].name, lArch: characters[i].archetype, wr: 100 - aWr })
    }
  }
  pairs.sort((a, b) => b.wr - a.wr)
  console.log('\n' + DIV)
  console.log('  가장 일방적인 상성 TOP 15')
  console.log(DIV)
  for (let k = 0; k < Math.min(15, pairs.length); k++) {
    const p = pairs[k]
    console.log(`  ${p.winner.padEnd(15)} [${p.wArch.padEnd(10)}]  →  ${p.loser.padEnd(15)} [${p.lArch.padEnd(10)}]  ${p.wr.toFixed(1)}%`)
  }

  // 이상치
  const over  = sorted.filter(r => { const t = r.wins+r.losses+r.draws; return t > 0 && r.wins/t >= 0.70 })
  const under = sorted.filter(r => { const t = r.wins+r.losses+r.draws; return t > 0 && r.wins/t <= 0.30 })
  console.log('\n' + DIV)
  console.log('  밸런스 이상치 (승률 70%↑ / 30%↓)')
  console.log(DIV)
  if (over.length)  over.forEach(r  => { const t=r.wins+r.losses+r.draws; console.log(`  ⚠ [과강] ${r.name.padEnd(16)} (${r.archetype})  승률 ${(r.wins/t*100).toFixed(1)}%`) })
  if (under.length) under.forEach(r => { const t=r.wins+r.losses+r.draws; console.log(`  ⚠ [과약] ${r.name.padEnd(16)} (${r.archetype})  승률 ${(r.wins/t*100).toFixed(1)}%`) })
  if (!over.length && !under.length) console.log('  이상치 없음 — 모든 캐릭터 30~70% 범위 내')

  console.log('\n' + SEP + '\n')
}

runStatOnlyBalance()
