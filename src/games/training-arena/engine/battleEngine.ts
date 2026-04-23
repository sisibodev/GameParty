import type {
  BattleCharState,
  MatchResult,
  MatchLogEntry,
  ActionType,
  BuffEntry,
} from '../types'
import {
  MAX_ATB_GAUGE,
  INITIAL_MANA_RATIO,
  MANA_REGEN_COEFF,
  MIN_DAMAGE,
  MAX_TURNS,
  DEF_FORMULA_BASE,
} from '../constants'
import { SeededRng } from '../utils/rng'
import { deriveStats } from './statDeriver'
import skillsData from '../data/skills.json'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function sumEffect(entries: BuffEntry[], effectType: string): number {
  return entries
    .filter(b => b.effectType === effectType)
    .reduce((sum, b) => sum + b.value, 0)
}

function tickEntries(entries: BuffEntry[]): BuffEntry[] {
  return entries
    .map(b => ({ ...b, turnsLeft: b.turnsLeft - 1 }))
    .filter(b => b.turnsLeft > 0)
}

function tickGauge(state: BattleCharState): BattleCharState {
  const stats = deriveStats(state.baseCombat, state.growthStats)
  const spdMult = 1 + sumEffect(state.buffs, 'spd_pct') / 100
  return { ...state, gauge: state.gauge + stats.spd * spdMult }
}

function regenMana(state: BattleCharState): BattleCharState {
  const stats = deriveStats(state.baseCombat, state.growthStats)
  const regen = stats.maxMana * (stats.maxHp + stats.atk) * MANA_REGEN_COEFF
  return { ...state, currentMana: Math.min(state.currentMana + regen, stats.maxMana) }
}

// ─── Skill Selection ──────────────────────────────────────────────────────────

function selectSkill(state: BattleCharState, rng: SeededRng): string | null {
  const stats = deriveStats(state.baseCombat, state.growthStats)
  const aggrBonus = sumEffect(state.debuffs, 'aggr_pct')
  const activationChance = clamp(0.5 + (stats.aggression + aggrBonus) * 0.005, 0, 1)

  if (!rng.chance(activationChance)) return null
  if (state.buffs.some(b => b.effectType === 'sealed')) return null

  const manaCostMult = 1 - sumEffect(state.buffs, 'mana_cost_pct') / 100

  const usable = skillsData.filter(s => {
    if (!state.skills.includes(s.id)) return false
    if ((state.cooldowns[s.id] ?? 0) > 0) return false
    if (state.currentMana < s.cost * manaCostMult) return false
    return true
  })

  if (usable.length === 0) return null

  usable.sort((a, b) => a.priority - b.priority)
  const topPriority = usable[0].priority
  const candidates = usable.filter(s => s.priority === topPriority)
  return rng.pick(candidates).id
}

// ─── Damage ───────────────────────────────────────────────────────────────────

interface HitResult { damage: number; critical: boolean; evaded: boolean }

function calcHit(
  actor: BattleCharState,
  defender: BattleCharState,
  multiplier: number,
  defIgnore: number,
  rng: SeededRng,
): HitResult {
  const atkStats = deriveStats(actor.baseCombat, actor.growthStats)
  const defStats = deriveStats(defender.baseCombat, defender.growthStats)

  const effectiveEva = clamp(
    defStats.eva + sumEffect(defender.buffs, 'eva_flat') + sumEffect(actor.debuffs, 'acc_pct'),
    0, 100,
  )
  if (rng.chance(effectiveEva / 100)) return { damage: 0, critical: false, evaded: true }

  const effectiveCrit = clamp(atkStats.crit + sumEffect(actor.buffs, 'crit_flat'), 0, 100)
  const critical = rng.chance(effectiveCrit / 100)

  const effectiveAtk  = atkStats.atk * (1 + sumEffect(actor.buffs, 'atk_pct') / 100)
  const effectiveDef  = defStats.def * (1 + sumEffect(defender.debuffs, 'def_pct') / 100) * (1 - defIgnore)
  const incomingMult  = 1 + sumEffect(defender.debuffs, 'incoming_dmg_pct') / 100
  const critMult      = critical ? atkStats.critMultiplier : 1

  const raw    = effectiveAtk * multiplier * DEF_FORMULA_BASE / (DEF_FORMULA_BASE + effectiveDef)
  const damage = Math.max(MIN_DAMAGE, Math.floor(raw * critMult * incomingMult))
  return { damage, critical, evaded: false }
}

// ─── Skill Effects ────────────────────────────────────────────────────────────

interface ActionResult {
  actor: BattleCharState
  target: BattleCharState
  damage: number
  critical: boolean
  evaded: boolean
}

function applySkill(
  skillId: string,
  actor: BattleCharState,
  target: BattleCharState,
  rng: SeededRng,
): ActionResult {
  const skill = skillsData.find(s => s.id === skillId)
  if (!skill) return { actor, target, damage: 0, critical: false, evaded: false }

  const manaCostMult = 1 - sumEffect(actor.buffs, 'mana_cost_pct') / 100
  let a = { ...actor, currentMana: actor.currentMana - skill.cost * manaCostMult }
  a = { ...a, cooldowns: { ...a.cooldowns, [skillId]: skill.cooldown } }

  let t = { ...target }
  let damage = 0
  let critical = false
  let evaded = false

  const aStats = deriveStats(a.baseCombat, a.growthStats)

  if (skill.category === 'attack') {
    const hit = calcHit(a, t, 1.5, 0, rng)
    damage = hit.damage; critical = hit.critical; evaded = hit.evaded
    if (!evaded) t = { ...t, currentHp: t.currentHp - damage }

  } else if (skill.category === 'heal') {
    const healAmt = Math.floor(aStats.maxHp * 0.3)
    a = { ...a, currentHp: Math.min(aStats.maxHp, a.currentHp + healAmt) }

  } else if (skill.category === 'buff') {
    const buff: BuffEntry = { id: skillId, effectType: 'atk_pct', value: 25, turnsLeft: 3 }
    a = { ...a, buffs: [...a.buffs, buff] }

  } else if (skill.category === 'debuff') {
    const deb: BuffEntry = { id: skillId, effectType: 'def_pct', value: -20, turnsLeft: 2 }
    t = { ...t, debuffs: [...t.debuffs, deb] }

  } else if (skill.category === 'defense') {
    const shield: BuffEntry = { id: skillId, effectType: 'def_pct', value: 50, turnsLeft: 2 }
    a = { ...a, buffs: [...a.buffs, shield] }

  } else if (skill.category === 'special') {
    const hit = calcHit(a, t, 1.2, 0, rng)
    damage = hit.damage; critical = hit.critical; evaded = hit.evaded
    if (!evaded) {
      t = { ...t, currentHp: t.currentHp - damage }
      const lifeSteal = Math.floor(damage * 0.5)
      a = { ...a, currentHp: Math.min(aStats.maxHp, a.currentHp + lifeSteal) }
    }
  }

  return { actor: a, target: t, damage, critical, evaded }
}

function normalAttack(
  actor: BattleCharState,
  target: BattleCharState,
  rng: SeededRng,
): ActionResult {
  const hit = calcHit(actor, target, 1.0, 0, rng)
  const newTarget = hit.evaded ? target : { ...target, currentHp: target.currentHp - hit.damage }
  return { actor, target: newTarget, damage: hit.damage, critical: hit.critical, evaded: hit.evaded }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function simulateMatch(
  char1: BattleCharState,
  char2: BattleCharState,
  seed: number,
): MatchResult {
  const rng   = new SeededRng(seed)
  const st1   = deriveStats(char1.baseCombat, char1.growthStats)
  const st2   = deriveStats(char2.baseCombat, char2.growthStats)

  let s1: BattleCharState = {
    ...char1,
    currentHp:   st1.maxHp,
    currentMana: Math.floor(st1.maxMana * INITIAL_MANA_RATIO),
    gauge:        rng.int(0, MAX_ATB_GAUGE),
    buffs:        [],
    debuffs:      [],
    cooldowns:    {},
  }
  let s2: BattleCharState = {
    ...char2,
    currentHp:   st2.maxHp,
    currentMana: Math.floor(st2.maxMana * INITIAL_MANA_RATIO),
    gauge:        rng.int(0, MAX_ATB_GAUGE),
    buffs:        [],
    debuffs:      [],
    cooldowns:    {},
  }

  const initialHp: Record<number, number> = {
    [char1.charId]: st1.maxHp,
    [char2.charId]: st2.maxHp,
  }
  const initialMana: Record<number, number> = {
    [char1.charId]: Math.floor(st1.maxMana * INITIAL_MANA_RATIO),
    [char2.charId]: Math.floor(st2.maxMana * INITIAL_MANA_RATIO),
  }

  const log: MatchLogEntry[] = []
  let turn = 0

  while (s1.currentHp > 0 && s2.currentHp > 0 && turn < MAX_TURNS) {
    while (s1.gauge < MAX_ATB_GAUGE && s2.gauge < MAX_ATB_GAUGE) {
      s1 = tickGauge(s1)
      s2 = tickGauge(s2)
    }

    const spd1 = deriveStats(s1.baseCombat, s1.growthStats).spd
    const spd2 = deriveStats(s2.baseCombat, s2.growthStats).spd
    const actor1Acts =
      s1.gauge >= MAX_ATB_GAUGE &&
      (s2.gauge < MAX_ATB_GAUGE || spd1 >= spd2 || rng.chance(0.5))

    let actor    = actor1Acts ? s1 : s2
    let defender = actor1Acts ? s2 : s1
    turn++

    actor = regenMana(actor)

    const skillId = selectSkill(actor, rng)
    let result: ActionResult
    let actionType: ActionType

    if (skillId) {
      actionType = 'skill'
      result = applySkill(skillId, actor, defender, rng)
    } else {
      actionType = 'normal_attack'
      result = normalAttack(actor, defender, rng)
    }

    actor    = result.actor
    defender = result.target

    // Tick cooldowns
    const newCds: Record<string, number> = {}
    for (const [id, cd] of Object.entries(actor.cooldowns)) {
      if (cd > 1) newCds[id] = cd - 1
    }
    actor = {
      ...actor,
      gauge:     actor.gauge - MAX_ATB_GAUGE,
      cooldowns: newCds,
      buffs:     tickEntries(actor.buffs),
      debuffs:   tickEntries(actor.debuffs),
    }

    if (actor1Acts) { s1 = actor; s2 = defender }
    else            { s2 = actor; s1 = defender }

    log.push({
      turn,
      actorId:  actor.charId,
      action:   actionType,
      skillId:  skillId ?? undefined,
      targetId: defender.charId,
      damage:   result.damage,
      critical: result.critical,
      evaded:   result.evaded,
      hpAfter:   { [s1.charId]: Math.max(0, s1.currentHp), [s2.charId]: Math.max(0, s2.currentHp) },
      manaAfter: { [s1.charId]: s1.currentMana,             [s2.charId]: s2.currentMana },
    })

    if (s1.currentHp <= 0 || s2.currentHp <= 0) break
  }

  const winnerId = s1.currentHp > s2.currentHp ? s1.charId : s2.charId
  const loserId  = winnerId === s1.charId ? s2.charId : s1.charId

  return {
    matchId:    `match_${seed}_${char1.charId}_${char2.charId}`,
    seed,
    char1Id:    char1.charId,
    char2Id:    char2.charId,
    winnerId,
    loserId,
    totalTurns: turn,
    log,
    initialHp,
    initialMana,
  }
}

export function regenHpBetweenMatches(
  currentHp: number,
  maxHp: number,
  ratio: number,
): number {
  return Math.min(maxHp, currentHp + maxHp * ratio)
}
