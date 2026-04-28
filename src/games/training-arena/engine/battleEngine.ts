import type {
  BattleCharState,
  MatchResult,
  MatchLogEntry,
  ActionType,
  BuffEntry,
  PassiveSkillDef,
  DamageType,
} from '../types'
import {
  MAX_ATB_GAUGE,
  INITIAL_MANA_RATIO,
  MANA_REGEN_COEFF,
  MIN_DAMAGE,
  MAX_TURNS,
  INT_CD_REDUCTION_PER,
  HP_REGEN_PER_TURN_RATIO,
  SKILL_ENHANCE_MULT,
  DAMAGE_DEF_K,
  MIN_HIT_CHANCE,
} from '../constants'
import { SeededRng } from '../utils/rng'
import { deriveStats } from './statDeriver'
import { sumCombatEffect } from '../data/items'
import skillsData from '../data/skills.json'
import passiveSkillsData from '../data/passiveSkills.json'

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

function rawEffSpd(state: BattleCharState): number {
  const stats = deriveStats(state.baseCombat, state.growthStats, state.archetype)
  const lastStandSpd = lastStandActive(state) ? 30 : 0
  const spdMult = 1 + (sumEffect(state.buffs, 'spd_pct') + lastStandSpd) / 100
  return stats.spd * spdMult
}

// 속도 감쇠: effective_ratio = 1 + log₂(raw_ratio) — 2→2, 4→3, 8→4
function dampSpd(mySpd: number, oppSpd: number): number {
  if (mySpd <= oppSpd) return mySpd
  const ratio = mySpd / oppSpd
  return oppSpd * (1 + Math.log2(ratio))
}

function tickGauge(state: BattleCharState, oppRawSpd: number): BattleCharState {
  return { ...state, gauge: state.gauge + dampSpd(rawEffSpd(state), oppRawSpd) }
}

function regenMana(state: BattleCharState): BattleCharState {
  const stats = deriveStats(state.baseCombat, state.growthStats, state.archetype)
  const regenPct = sumEffect(state.buffs, 'mana_regen_pct')
  const regen = stats.maxMana * (stats.maxHp + stats.pAtk) * MANA_REGEN_COEFF * (1 + regenPct / 100)
  return { ...state, currentMana: Math.min(state.currentMana + regen, stats.maxMana) }
}

// 행동 시 자연 HP 회복 — maxHp × HP_REGEN_PER_TURN_RATIO (HP 높은 직업 유리)
function regenHpPerTurn(state: BattleCharState): BattleCharState {
  const stats = deriveStats(state.baseCombat, state.growthStats, state.archetype)
  const regen = Math.floor(stats.maxHp * HP_REGEN_PER_TURN_RATIO)
  if (regen <= 0) return state
  return { ...state, currentHp: Math.min(stats.maxHp, state.currentHp + regen) }
}

// v0.4.2 Phase 3 — 최후의 일격: HP ≤20%에서 활성
function lastStandActive(state: BattleCharState): boolean {
  if (!state.buffs.some(b => b.effectType === 'last_stand')) return false
  const stats = deriveStats(state.baseCombat, state.growthStats, state.archetype)
  return stats.maxHp > 0 && state.currentHp / stats.maxHp <= 0.2
}

function consumeBuff(state: BattleCharState, effectType: string): BattleCharState {
  return { ...state, buffs: state.buffs.filter(b => b.effectType !== effectType) }
}

// ─── Passive Helpers ──────────────────────────────────────────────────────────

function getPassiveDef(id: string): PassiveSkillDef | undefined {
  return (passiveSkillsData as PassiveSkillDef[]).find(p => p.id === id)
}

function getPassivesByType(state: BattleCharState, type: string): PassiveSkillDef[] {
  return state.passives
    .map(id => getPassiveDef(id))
    .filter((p): p is PassiveSkillDef => p?.effect.type === type)
}

// skill enhancement multiplier: level 0 = 1.0, level 1 = 1.10, ..., level 10 = 2.90
function getEnhancementMult(skillId: string, enhancements: Record<string, number>): number {
  const level = enhancements?.[skillId] ?? 0
  if (level <= 0) return 1.0
  const idx = Math.min(level - 1, SKILL_ENHANCE_MULT.length - 1)
  return 1 + SKILL_ENHANCE_MULT[idx]
}

// Apply stat_boost passives to baseCombat at battle start
// Returns new state with modified baseCombat
function applyPassivesAtBattleStart(state: BattleCharState): BattleCharState {
  let s = { ...state }
  const bc = { ...s.baseCombat }
  const newBuffs: BuffEntry[] = [...s.buffs]

  for (const pid of s.passives) {
    const p = getPassiveDef(pid)
    if (!p) continue
    const eff = p.effect
    switch (eff.type) {
      case 'stat_boost': {
        const pct = eff.pct as number
        const stat = eff.stat as string
        if (stat === 'atk') { bc.pAtk = Math.floor(bc.pAtk * (1 + pct / 100)); bc.mAtk = Math.floor(bc.mAtk * (1 + pct / 100)) }
        if (stat === 'def') { bc.pDef = Math.floor(bc.pDef * (1 + pct / 100)); bc.mDef = Math.floor(bc.mDef * (1 + pct / 100)) }
        if (stat === 'spd')   bc.spd   = Math.floor(bc.spd   * (1 + pct / 100))
        if (stat === 'crit')  bc.crit  = Math.min(100, bc.crit  + pct)
        if (stat === 'eva')   bc.eva   = Math.min(100, bc.eva   + pct)
        if (stat === 'maxHp') bc.maxHp = Math.floor(bc.maxHp * (1 + pct / 100))
        break
      }
      case 'mana_affinity':
        newBuffs.push({ id: pid, effectType: 'mana_cost_pct', value: eff.cost_reduction as number, turnsLeft: 9999 })
        break
      case 'battle_focus':
        newBuffs.push({ id: pid, effectType: 'cd_reduction_extra', value: eff.cd_reduction as number, turnsLeft: 9999 })
        break
      case 'first_strike':
        newBuffs.push({ id: pid, effectType: 'first_strike_ready', value: eff.bonus_pct as number, turnsLeft: 9999 })
        break
      case 'crit_damage':
        newBuffs.push({ id: pid, effectType: 'crit_mult_bonus', value: eff.bonus_pct as number, turnsLeft: 9999 })
        break
      case 'def_break':
        newBuffs.push({ id: pid, effectType: 'def_break_pct', value: eff.pct as number, turnsLeft: 9999 })
        break
      case 'iron_will':
        s = { ...s, ironWillUsed: false }
        break
    }
  }

  return { ...s, baseCombat: bc, buffs: newBuffs }
}

// Apply iron_will passive death check — if HP <= 0 and passive present and not yet used, set HP = 1
function applyIronWill(state: BattleCharState): BattleCharState {
  if (state.currentHp > 0) return state
  if (state.ironWillUsed) return state
  const hasIronWill = state.passives.some(pid => getPassiveDef(pid)?.effect.type === 'iron_will')
  if (!hasIronWill) return state
  return { ...state, currentHp: 1, ironWillUsed: true }
}

// Apply per-turn passive effects for the acting character (regen, berserker_rage, last_stand_spd)
function applyPerTurnPassives(state: BattleCharState): BattleCharState {
  let s = state
  const stats = deriveStats(s.baseCombat, s.growthStats, s.archetype)
  const hpRatio = stats.maxHp > 0 ? s.currentHp / stats.maxHp : 1

  for (const pid of s.passives) {
    const p = getPassiveDef(pid)
    if (!p) continue
    const eff = p.effect
    switch (eff.type) {
      case 'regen': {
        const heal = Math.floor(stats.maxHp * ((eff.pct_per_turn as number) / 100))
        s = { ...s, currentHp: Math.min(stats.maxHp, s.currentHp + heal) }
        break
      }
      case 'berserker_rage': {
        const threshold = (eff.hp_threshold as number) / 100
        if (hpRatio <= threshold) {
          const filtered = s.buffs.filter(b => b.effectType !== 'berserker_rage_atk')
          s = { ...s, buffs: [...filtered, { id: pid, effectType: 'atk_pct', value: eff.atk_pct as number, turnsLeft: 2 }] }
        }
        break
      }
      case 'last_stand_spd': {
        const threshold = (eff.hp_threshold as number) / 100
        if (hpRatio <= threshold) {
          const filtered = s.buffs.filter(b => b.effectType !== 'passive_spd_pct')
          s = { ...s, buffs: [...filtered, { id: pid, effectType: 'spd_pct', value: eff.spd_pct as number, turnsLeft: 2 }] }
        }
        break
      }
    }
  }
  return s
}

// Apply thorns passive — when defender takes damage, deal pct% back to attacker
function applyThorns(defender: BattleCharState, actor: BattleCharState, damage: number): BattleCharState {
  if (damage <= 0) return actor
  const thorns = getPassivesByType(defender, 'thorns')
  if (thorns.length === 0) return actor
  const pct = thorns.reduce((sum, p) => sum + (p.effect.pct as number), 0)
  const reflected = Math.floor(damage * pct / 100)
  const aStats = deriveStats(actor.baseCombat, actor.growthStats, actor.archetype)
  const newHp = Math.max(0, actor.currentHp - reflected)
  return { ...actor, currentHp: Math.min(aStats.maxHp, newHp) }
}

// Apply lifesteal passive — heal pct% of damage dealt
function applyLifestealPassive(actor: BattleCharState, damage: number): BattleCharState {
  if (damage <= 0) return actor
  const lifesteals = getPassivesByType(actor, 'lifesteal')
  if (lifesteals.length === 0) return actor
  const pct = lifesteals.reduce((sum, p) => sum + (p.effect.pct as number), 0)
  const heal = Math.floor(damage * pct / 100)
  const aStats = deriveStats(actor.baseCombat, actor.growthStats, actor.archetype)
  return { ...actor, currentHp: Math.min(aStats.maxHp, actor.currentHp + heal) }
}

// ─── Skill Selection ──────────────────────────────────────────────────────────

function selectSkill(state: BattleCharState, rng: SeededRng): string | null {
  const stats = deriveStats(state.baseCombat, state.growthStats, state.archetype)
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

interface HitResult {
  damage: number
  critical: boolean
  evaded: boolean
  ambushConsumed: boolean
  firstStrikeConsumed: boolean
}

function calcHit(
  actor: BattleCharState,
  defender: BattleCharState,
  multiplier: number,
  defIgnore: number,
  rng: SeededRng,
  damageType: DamageType = 'physical',
): HitResult {
  const atkStats = deriveStats(actor.baseCombat, actor.growthStats, actor.archetype)
  const defStats = deriveStats(defender.baseCombat, defender.growthStats, defender.archetype)

  // 명중/회피: acc - eva, 최소 MIN_HIT_CHANCE 보장
  const evaForceZero = defender.debuffs.some(b => b.effectType === 'eva_force_zero')
  const effectiveEva = evaForceZero ? 0 : clamp(
    defStats.eva + sumEffect(defender.buffs, 'eva_flat'),
    0, 100,
  )
  const effectiveAcc = clamp(
    atkStats.acc + sumEffect(actor.buffs, 'acc_flat'),
    0, 100,
  )
  // 간파: eva_force_zero 는 명중 100% 강제
  const hitChance = evaForceZero ? 100 : clamp(effectiveAcc - effectiveEva, MIN_HIT_CHANCE, 100)
  if (!rng.chance(hitChance / 100)) {
    return { damage: 0, critical: false, evaded: true, ambushConsumed: false, firstStrikeConsumed: false }
  }

  // 기습: 첫 공격 크리 확정 + 1.3x
  const ambushConsumed = actor.buffs.some(b => b.effectType === 'ambush_ready')
  const effectiveCrit = clamp(atkStats.crit + sumEffect(actor.buffs, 'crit_flat'), 0, 100)
  const critical = ambushConsumed || rng.chance(effectiveCrit / 100)

  // 물리/마법 분리 ATK 선택
  const myAtk     = damageType === 'magical' ? atkStats.mAtk : atkStats.pAtk
  const oppAtk    = damageType === 'magical' ? defStats.mAtk : defStats.pAtk
  const baseDef   = damageType === 'magical' ? defStats.mDef : defStats.pDef

  // 최후의 일격: HP ≤20%에서 ATK +100%
  const lastStandAtk = lastStandActive(actor) ? 100 : 0
  const atkPctTotal = sumEffect(actor.buffs, 'atk_pct') + sumEffect(actor.debuffs, 'atk_pct') + lastStandAtk
  const effectiveAtk = myAtk * (1 + atkPctTotal / 100)
  const effectiveOppAtk = Math.max(1, oppAtk)

  // 불굴의 투지: HP ≤ 20%일 때 DEF 추가 증가
  const hpRatio     = defStats.maxHp > 0 ? defender.currentHp / defStats.maxHp : 1
  const indomitable = hpRatio <= 0.2 ? sumCombatEffect(defender.items, 'indomitableDefPct') : 0

  // def_break 패시브 + pen: 방어 관통
  const defBreakPct = sumEffect(actor.buffs, 'def_break_pct') / 100
  const totalPen    = clamp(defIgnore + defBreakPct + atkStats.pen, 0, 1)
  const effectiveDef = baseDef * (1 + sumEffect(defender.debuffs, 'def_pct') / 100 + indomitable / 100) * (1 - totalPen)
  const incomingMult = 1 + sumEffect(defender.debuffs, 'incoming_dmg_pct') / 100

  // 데미지 공식: ATK²/(myAtk+oppAtk) × K/(K+DEF)
  const base = multiplier * effectiveAtk * effectiveAtk / (effectiveAtk + effectiveOppAtk)
  const defFactor = DAMAGE_DEF_K / (DAMAGE_DEF_K + Math.max(0, effectiveDef))

  // crit_damage 패시브: 치명타 배율 보너스
  const critBonusPct = sumEffect(actor.buffs, 'crit_mult_bonus')
  const critMult     = critical ? atkStats.critDmg + critBonusPct / 100 : 1

  // execute_bonus 패시브: 대상 HP 낮을 때 추가 피해
  let executeMult = 1
  for (const pid of actor.passives) {
    const p = getPassiveDef(pid)
    if (p?.effect.type === 'execute_bonus') {
      const threshold = (p.effect.hp_threshold as number) / 100
      const targetHpRatio = defStats.maxHp > 0 ? defender.currentHp / defStats.maxHp : 1
      if (targetHpRatio <= threshold) {
        executeMult += (p.effect.bonus_pct as number) / 100
      }
    }
  }

  // first_strike 패시브: 첫 공격 보너스 배율
  const firstStrikeValue = sumEffect(actor.buffs, 'first_strike_ready')
  const firstStrikeMult = firstStrikeValue > 0 ? (1 + firstStrikeValue / 100) : 1
  const firstStrikeConsumed = firstStrikeValue > 0

  const ambushDmgMult = ambushConsumed ? 1.3 : 1
  const raw    = base * defFactor
  const damage = Math.max(MIN_DAMAGE, Math.floor(raw * critMult * incomingMult * ambushDmgMult * executeMult * firstStrikeMult))
  return { damage, critical, evaded: false, ambushConsumed, firstStrikeConsumed }
}

// v0.4.2 Phase 3 — 전술 카드: 방벽(-70% 첫 피격) / 회복 물약(HP ≤30% 시 50% 회복)
function applyBarrier(defender: BattleCharState, damage: number): { defender: BattleCharState; damage: number } {
  if (damage <= 0) return { defender, damage }
  if (!defender.buffs.some(b => b.effectType === 'barrier_ready')) return { defender, damage }
  const reduced = Math.max(MIN_DAMAGE, Math.floor(damage * 0.3))
  return { defender: consumeBuff(defender, 'barrier_ready'), damage: reduced }
}

function applyPotion(defender: BattleCharState): BattleCharState {
  if (!defender.buffs.some(b => b.effectType === 'potion_ready')) return defender
  const stats = deriveStats(defender.baseCombat, defender.growthStats, defender.archetype)
  if (stats.maxHp <= 0) return defender
  if (defender.currentHp > stats.maxHp * 0.3) return defender
  if (defender.currentHp <= 0) return defender
  const healed = Math.min(stats.maxHp, defender.currentHp + Math.floor(stats.maxHp * 0.5))
  return consumeBuff({ ...defender, currentHp: healed }, 'potion_ready')
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

  // INT → 쿨다운 감소: INT 성장치 INT_CD_REDUCTION_PER당 -1턴, 최대 -3
  // battle_focus 패시브: cd_reduction_extra 추가 감소
  const cdExtra = sumEffect(a.buffs, 'cd_reduction_extra')
  const cdReduction = Math.min(3, Math.floor(a.growthStats.int / INT_CD_REDUCTION_PER) + Math.floor(cdExtra))
  const effectiveCd  = Math.max(1, skill.cooldown - cdReduction)
  a = { ...a, cooldowns: { ...a.cooldowns, [skillId]: effectiveCd } }

  let t = { ...target }
  let damage = 0
  let critical = false
  let evaded = false

  const aStats = deriveStats(a.baseCombat, a.growthStats, a.archetype)
  const enhMult = getEnhancementMult(skillId, a.skillEnhancements)

  if (skill.category === 'attack') {
    const hit = calcHit(a, t, 1.5, 0, rng, (skill.damageType as DamageType | undefined) ?? 'physical')
    critical = hit.critical; evaded = hit.evaded
    if (hit.ambushConsumed) a = consumeBuff(a, 'ambush_ready')
    if (hit.firstStrikeConsumed) a = consumeBuff(a, 'first_strike_ready')
    if (!evaded) {
      damage = Math.max(MIN_DAMAGE, Math.floor(hit.damage * enhMult))
      const br = applyBarrier(t, damage)
      t = br.defender; damage = br.damage
      t = { ...t, currentHp: t.currentHp - damage }
      t = applyPotion(t)
      a = applyVampire(a, damage)
    }

  } else if (skill.category === 'heal') {
    const healAmt = Math.floor(aStats.maxHp * 0.3)
    a = { ...a, currentHp: Math.min(aStats.maxHp, a.currentHp + healAmt) }

  } else if (skill.category === 'buff') {
    const buff: BuffEntry = { id: skillId, effectType: 'atk_pct', value: 25, turnsLeft: 3 }
    a = { ...a, buffs: [...a.buffs, buff] }

  } else if (skill.category === 'debuff') {
    // tenacity 패시브: 디버프 지속 시간 감소
    const tenacityPct = getPassivesByType(t, 'tenacity').reduce((sum, p) => sum + (p.effect.pct as number), 0)
    const baseTurns = 2
    const effectiveTurns = tenacityPct > 0 ? Math.max(1, Math.floor(baseTurns * (1 - tenacityPct / 100))) : baseTurns
    const deb: BuffEntry = { id: skillId, effectType: 'def_pct', value: -20, turnsLeft: effectiveTurns }
    t = { ...t, debuffs: [...t.debuffs, deb] }

  } else if (skill.category === 'defense') {
    const shield: BuffEntry = { id: skillId, effectType: 'def_pct', value: 50, turnsLeft: 2 }
    a = { ...a, buffs: [...a.buffs, shield] }

  } else if (skill.category === 'special') {
    const hit = calcHit(a, t, 1.2, 0, rng, (skill.damageType as DamageType | undefined) ?? 'physical')
    critical = hit.critical; evaded = hit.evaded
    if (hit.ambushConsumed) a = consumeBuff(a, 'ambush_ready')
    if (hit.firstStrikeConsumed) a = consumeBuff(a, 'first_strike_ready')
    if (!evaded) {
      damage = Math.max(MIN_DAMAGE, Math.floor(hit.damage * enhMult))
      const br = applyBarrier(t, damage)
      t = br.defender; damage = br.damage
      t = { ...t, currentHp: t.currentHp - damage }
      t = applyPotion(t)
      const lifeSteal = Math.floor(damage * 0.5)
      a = { ...a, currentHp: Math.min(aStats.maxHp, a.currentHp + lifeSteal) }
      a = applyVampire(a, damage)
    }
  }

  return { actor: a, target: t, damage, critical, evaded }
}

// 흡혈 반지: 가한 피해의 일정 비율 회복
function applyVampire(actor: BattleCharState, damage: number): BattleCharState {
  const pct = sumCombatEffect(actor.items, 'vampireHealPct')
  if (pct <= 0 || damage <= 0) return actor
  const stats = deriveStats(actor.baseCombat, actor.growthStats, actor.archetype)
  const heal  = Math.floor(damage * pct / 100)
  return { ...actor, currentHp: Math.min(stats.maxHp, actor.currentHp + heal) }
}

function normalAttack(
  actor: BattleCharState,
  target: BattleCharState,
  rng: SeededRng,
): ActionResult {
  const normalDmgType: DamageType = (actor.archetype === 'mage' || actor.archetype === 'support') ? 'magical' : 'physical'
  const hit = calcHit(actor, target, 1.0, 0, rng, normalDmgType)
  let a = hit.ambushConsumed ? consumeBuff(actor, 'ambush_ready') : actor
  if (hit.firstStrikeConsumed) a = consumeBuff(a, 'first_strike_ready')
  if (hit.evaded) return { actor: a, target, damage: 0, critical: hit.critical, evaded: true }
  const br = applyBarrier(target, hit.damage)
  let t = br.defender
  const dmg = br.damage
  t = { ...t, currentHp: t.currentHp - dmg }
  t = applyPotion(t)
  a = applyVampire(a, dmg)
  return { actor: a, target: t, damage: dmg, critical: hit.critical, evaded: false }
}

// ─── Tactic Card Init (v0.4.2 Phase 3) ───────────────────────────────────────
// 전술 카드를 전투 시작 상태에 적용한다. self는 카드 사용자, opp는 상대.
// 반환: [self, opp]
function applyTactic(
  self: BattleCharState,
  opp: BattleCharState,
): [BattleCharState, BattleCharState] {
  const card = self.tactic?.cardId
  if (!card) return [self, opp]

  switch (card) {
    case 'first_strike':
      return [{ ...self, gauge: Math.max(self.gauge, 60) }, opp]

    case 'barrier':
      return [{
        ...self,
        buffs: [...self.buffs, { id: 'barrier', effectType: 'barrier_ready', value: 1, turnsLeft: 99 }],
      }, opp]

    case 'ambush':
      return [{
        ...self,
        buffs: [...self.buffs, { id: 'ambush', effectType: 'ambush_ready', value: 1, turnsLeft: 99 }],
      }, opp]

    case 'mana_burst': {
      const stats = deriveStats(self.baseCombat, self.growthStats, self.archetype)
      const bumped = Math.min(stats.maxMana, self.currentMana + Math.floor(stats.maxMana * 1.0))
      return [{
        ...self,
        currentMana: bumped,
        buffs: [...self.buffs, { id: 'mana_burst', effectType: 'mana_regen_pct', value: 50, turnsLeft: 5 }],
      }, opp]
    }

    case 'curse':
      return [self, {
        ...opp,
        debuffs: [
          ...opp.debuffs,
          { id: 'curse_atk', effectType: 'atk_pct', value: -30, turnsLeft: 4 },
          { id: 'curse_def', effectType: 'def_pct', value: -20, turnsLeft: 4 },
        ],
      }]

    case 'potion':
      return [{
        ...self,
        buffs: [...self.buffs, { id: 'potion', effectType: 'potion_ready', value: 1, turnsLeft: 99 }],
      }, opp]

    case 'insight':
      return [
        { ...self, buffs: [...self.buffs, { id: 'insight_crit', effectType: 'crit_flat', value: 30, turnsLeft: 99 }] },
        { ...opp, debuffs: [...opp.debuffs, { id: 'insight_eva', effectType: 'eva_force_zero', value: 1, turnsLeft: 99 }] },
      ]

    case 'last_stand':
      return [{
        ...self,
        buffs: [...self.buffs, { id: 'last_stand', effectType: 'last_stand', value: 1, turnsLeft: 99 }],
      }, opp]
  }
  return [self, opp]
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function simulateMatch(
  char1: BattleCharState,
  char2: BattleCharState,
  seed: number,
): MatchResult {
  const rng   = new SeededRng(seed)
  const st1   = deriveStats(char1.baseCombat, char1.growthStats, char1.archetype)
  const st2   = deriveStats(char2.baseCombat, char2.growthStats, char2.archetype)

  // 마력 봉인: 상대가 이 아이템을 가지고 있으면 내게 sealed 버프(턴수만큼)가 걸림
  const seal1 = sumCombatEffect(char2.items, 'manaSealTurns')  // char2가 가진 봉인 → char1에 적용
  const seal2 = sumCombatEffect(char1.items, 'manaSealTurns')
  const sealedBuff = (turns: number): BuffEntry[] =>
    turns > 0 ? [{ id: 'mana_seal', effectType: 'sealed', value: 1, turnsLeft: turns }] : []

  let s1: BattleCharState = {
    ...char1,
    currentHp:   st1.maxHp,
    currentMana: Math.floor(st1.maxMana * INITIAL_MANA_RATIO),
    gauge:        0,
    buffs:        sealedBuff(seal1),
    debuffs:      [],
    cooldowns:    {},
  }
  let s2: BattleCharState = {
    ...char2,
    currentHp:   st2.maxHp,
    currentMana: Math.floor(st2.maxMana * INITIAL_MANA_RATIO),
    gauge:        0,
    buffs:        sealedBuff(seal2),
    debuffs:      [],
    cooldowns:    {},
  }

  // v0.5.0: 패시브 스킬 전투 시작 적용 (stat_boost 등 영구 효과)
  s1 = applyPassivesAtBattleStart(s1)
  s2 = applyPassivesAtBattleStart(s2)

  // 패시브 적용 후 maxHp 재산출 → 초기 HP/MP 재설정
  const postPassiveSt1 = deriveStats(s1.baseCombat, s1.growthStats, s1.archetype)
  const postPassiveSt2 = deriveStats(s2.baseCombat, s2.growthStats, s2.archetype)
  s1 = { ...s1, currentHp: postPassiveSt1.maxHp, currentMana: Math.floor(postPassiveSt1.maxMana * INITIAL_MANA_RATIO) }
  s2 = { ...s2, currentHp: postPassiveSt2.maxHp, currentMana: Math.floor(postPassiveSt2.maxMana * INITIAL_MANA_RATIO) }

  // 전술 카드 적용 (플레이어·NPC 공용, tactic 필드가 있는 쪽만 효과 발동)
  ;[s1, s2] = applyTactic(s1, s2)
  ;[s2, s1] = applyTactic(s2, s1)

  const initialHp: Record<number, number> = {
    [char1.charId]: postPassiveSt1.maxHp,
    [char2.charId]: postPassiveSt2.maxHp,
  }
  const initialMana: Record<number, number> = {
    [char1.charId]: s1.currentMana,
    [char2.charId]: s2.currentMana,
  }

  const log: MatchLogEntry[] = []
  let turn = 0

  while (s1.currentHp > 0 && s2.currentHp > 0 && turn < MAX_TURNS) {
    while (s1.gauge < MAX_ATB_GAUGE && s2.gauge < MAX_ATB_GAUGE) {
      const spd1 = rawEffSpd(s1)
      const spd2 = rawEffSpd(s2)
      s1 = tickGauge(s1, spd2)
      s2 = tickGauge(s2, spd1)
    }

    const spd1 = deriveStats(s1.baseCombat, s1.growthStats, s1.archetype).spd
    const spd2 = deriveStats(s2.baseCombat, s2.growthStats, s2.archetype).spd
    const actor1Acts =
      s1.gauge >= MAX_ATB_GAUGE &&
      (s2.gauge < MAX_ATB_GAUGE ||
       s1.gauge > s2.gauge ||
       (s1.gauge === s2.gauge && (spd1 > spd2 || (spd1 === spd2 && rng.chance(0.5)))))

    let actor    = actor1Acts ? s1 : s2
    let defender = actor1Acts ? s2 : s1
    turn++

    actor = regenMana(actor)
    actor = regenHpPerTurn(actor)

    // v0.5.0: 턴 시작 시 패시브 효과 적용 (regen, berserker_rage, last_stand_spd)
    actor = applyPerTurnPassives(actor)

    // 독 단검: 내 턴 시작 시 상대에게 고정 피해
    const poison = sumCombatEffect(actor.items, 'poisonDot')
    if (poison > 0) {
      defender = { ...defender, currentHp: defender.currentHp - poison }
      // iron_will 체크 (독 피해)
      defender = applyIronWill(defender)
      if (defender.currentHp <= 0) {
        if (actor1Acts) { s1 = actor; s2 = defender }
        else            { s2 = actor; s1 = defender }
        log.push({
          turn,
          actorId:  actor.charId,
          action:   'normal_attack',
          targetId: defender.charId,
          damage:   poison,
          critical: false,
          evaded:   false,
          hpAfter:   { [s1.charId]: Math.max(0, s1.currentHp), [s2.charId]: Math.max(0, s2.currentHp) },
          manaAfter: { [s1.charId]: s1.currentMana,             [s2.charId]: s2.currentMana },
        })
        break
      }
    }

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

    // v0.5.0: 가시 패시브 (defender의 가시 → actor에게 반사 피해)
    if (result.damage > 0) {
      actor = applyThorns(defender, actor, result.damage)
      // 흡혈 패시브 (아이템 흡혈과 별도)
      actor = applyLifestealPassive(actor, result.damage)
      // iron_will: 수비자 사망 방지
      defender = applyIronWill(defender)
      // iron_will: 가시 반사로 actor 사망 방지
      actor = applyIronWill(actor)
    }

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
    matchId:     `match_${seed}_${char1.charId}_${char2.charId}`,
    seed,
    char1Id:     char1.charId,
    char2Id:     char2.charId,
    winnerId,
    loserId,
    totalTurns:  turn,
    log,
    initialHp,
    initialMana,
    char1Skills: char1.skills,
    char2Skills: char2.skills,
  }
}

export function regenHpBetweenMatches(
  currentHp: number,
  maxHp: number,
  ratio: number,
): number {
  return Math.min(maxHp, currentHp + maxHp * ratio)
}
