// Player progression simulation — run with: npx tsx scripts/player-progression.ts
import { simulateMatch } from '../src/games/training-arena/engine/battleEngine'
import { deriveStats } from '../src/games/training-arena/engine/statDeriver'
import {
  NPC_BASE_GROWTH,
  INITIAL_PLAYER_STAT_POINTS,
  PLAYER_EXTRA_STAT_POINTS,
  REWARD_WINNER,
  REWARD_FINALIST,
  REWARD_TOURNAMENT_OUT,
} from '../src/games/training-arena/constants'
import type { CharacterDef, GrowthStats, BattleCharState } from '../src/games/training-arena/types'
import { SeededRng } from '../src/games/training-arena/utils/rng'
import { pickN } from '../src/games/training-arena/utils/fisherYates'

import charactersRaw from '../src/games/training-arena/data/characters.json' with { type: 'json' }
import skillsRaw    from '../src/games/training-arena/data/skills.json'    with { type: 'json' }

const characters  = (charactersRaw as unknown as CharacterDef[]).filter(c => c.ipId == null)
const allSkillIds = (skillsRaw as unknown as Array<{ id: string }>).map(s => s.id)

function npcGrowth(round: number): GrowthStats {
  const b = NPC_BASE_GROWTH + (round - 1)
  return { hp: b, str: b, agi: b, int: b, luk: b }
}

function spreadGrowth(totalPoints: number, archetype: string): GrowthStats {
  const base = Math.floor(totalPoints / 5)
  const bonus = totalPoints - base * 5
  const g: GrowthStats = { hp: base, str: base, agi: base, int: base, luk: base }
  const priorities: Record<string, (keyof GrowthStats)[]> = {
    warrior:   ['str', 'hp'],
    tank:      ['hp', 'str'],
    assassin:  ['agi', 'luk'],
    mage:      ['int', 'str'],
    support:   ['str', 'int'],
    berserker: ['str', 'luk'],
    ranger:    ['luk', 'agi'],
    paladin:   ['hp', 'str'],
  }
  const prio = priorities[archetype] ?? ['str', 'hp']
  g[prio[0]] += bonus
  return g
}

function makeState(
  char: CharacterDef,
  growth: GrowthStats,
  skills: string[],
  seed: number,
): BattleCharState {
  const rng   = new SeededRng(seed)
  const stats = deriveStats(char.baseCombat, growth, char.archetype)
  return {
    charId:      char.id,
    currentHp:   stats.maxHp,
    currentMana: Math.floor(stats.maxMana * 0.5),
    gauge:       rng.int(0, 100),
    buffs:       [],
    debuffs:     [],
    cooldowns:   {},
    skills,
    growthStats: growth,
    baseCombat:  char.baseCombat,
    archetype:   char.archetype,
  }
}

function measureWinRate(
  playerChar: CharacterDef,
  playerGrowth: GrowthStats,
  playerSkills: string[],
  round: number,
  trials: number,
  baseSeed: number,
): number {
  let wins = 0
  const npcG = npcGrowth(round)
  for (let i = 0; i < trials; i++) {
    const seed      = baseSeed + i * 131
    const rng       = new SeededRng(seed + 1)
    const npcChar   = rng.pick(characters.filter(c => c.id !== playerChar.id))
    const npcSkills = pickN(allSkillIds, 3, new SeededRng(seed + 2))
    const p = makeState(playerChar, playerGrowth, playerSkills, seed + 3)
    const n = makeState(npcChar,   npcG,          npcSkills,   seed + 4)
    const result = simulateMatch(p, n, seed + 5)
    if (result.winnerId === playerChar.id) wins++
  }
  return wins / trials
}

interface Scenario {
  label:         string
  initPoints:    number
  extraPerRound: number
  resultGain:    number
}

function buildStatCurve(sc: Scenario, rounds: number): number[] {
  const GACHA_EXPECTED = 2.37
  const curve: number[] = []
  let total = sc.initPoints
  for (let r = 1; r <= rounds; r++) {
    curve.push(total)
    if (r < rounds) total += sc.extraPerRound + sc.resultGain + GACHA_EXPECTED
  }
  return curve
}

const ROUNDS = 10
const TRIALS = 300

// warrior 기준 (game start pick 1)
const playerChar   = characters.find(c => c.archetype === 'warrior' && c.name === '바람의 검사')
                  ?? characters.find(c => c.archetype === 'warrior')!
const playerSkills = pickN(allSkillIds, 3, new SeededRng(42))

const scenarios: Scenario[] = [
  // ── 현재 설정 (기준선) ──
  { label: '★현재 / 계속 우승 (winner=10)',        initPoints: INITIAL_PLAYER_STAT_POINTS, extraPerRound: PLAYER_EXTRA_STAT_POINTS, resultGain: REWARD_WINNER },
  // ── 최종 후보 ──
  { label: '◆init=130 extra=4 winner=5 / 계속 우승',   initPoints: 130, extraPerRound: 4, resultGain: 5  },
  { label: '◆init=130 extra=4 winner=5 / 계속 패배',   initPoints: 130, extraPerRound: 4, resultGain: 1  },
  { label: '◆init=140 extra=4 winner=5 / 계속 우승',   initPoints: 140, extraPerRound: 4, resultGain: 5  },
  { label: '◆init=140 extra=4 winner=5 / 계속 패배',   initPoints: 140, extraPerRound: 4, resultGain: 1  },
  { label: '◆init=140 extra=4 winner=5 / 평균 (grp=3)', initPoints: 140, extraPerRound: 4, resultGain: 3  },
]

console.log('\n══════ 플레이어 성장 진행 분석 (캐릭터: ' + playerChar.name + ' [' + playerChar.archetype + '], 라운드당 ' + TRIALS + '회 시뮬레이션) ══════')
console.log('\nNPC 성장 (모든 스탯 동일):')
process.stdout.write('  총 스탯: ')
for (let r = 1; r <= ROUNDS; r++) {
  process.stdout.write(`R${r}=${5 * (NPC_BASE_GROWTH + r - 1)}  `)
}
console.log('\n')

for (const sc of scenarios) {
  const statCurve = buildStatCurve(sc, ROUNDS)
  console.log(`── ${sc.label}`)
  process.stdout.write('  플레이어 총 스탯: ')
  statCurve.forEach((v, i) => process.stdout.write(`R${i+1}=${Math.round(v).toString().padStart(3)}  `))
  console.log()

  process.stdout.write('  NPC 대비 비율  : ')
  statCurve.forEach((v, i) => {
    const npcTotal = 5 * (NPC_BASE_GROWTH + i)
    process.stdout.write(`R${i+1}=${(v / npcTotal * 100).toFixed(0).padStart(2)}%  `)
  })
  console.log()

  process.stdout.write('  실제 1v1 승률  : ')
  for (let r = 1; r <= ROUNDS; r++) {
    const growth = spreadGrowth(Math.round(statCurve[r - 1]), playerChar.archetype)
    const wr     = measureWinRate(playerChar, growth, playerSkills, r, TRIALS, r * 10000 + sc.initPoints)
    const pct    = (wr * 100).toFixed(0)
    const flag   = Number(pct) < 30 ? '❌' : Number(pct) < 45 ? '▽' : Number(pct) > 70 ? '⚠️' : Number(pct) > 60 ? '△' : '✓'
    process.stdout.write(`R${r}=${pct.padStart(2)}%${flag}  `)
  }
  console.log('\n')
}

console.log('판정 기준: ❌<30%  ▽30~45%  ✓45~60%  △60~70%  ⚠️>70%')
console.log('목표 커브: R1=35~45%  R5=45~55%  R10=55~65%')
