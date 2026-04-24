'use strict';

// ─── SeededRng (Mulberry32) ───────────────────────────────────────────────────
class SeededRng {
  constructor(seed) { this.seed = seed >>> 0; }
  next() {
    this.seed |= 0;
    this.seed = (this.seed + 0x6d2b79f5) | 0;
    let t = Math.imul(this.seed ^ (this.seed >>> 15), 1 | this.seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min, max) { return Math.floor(this.next() * (max - min)) + min; }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[this.int(0, arr.length)]; }
}

function shuffle(arr, rng) {
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) {
    const j = rng.int(0, i + 1);
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}
function pickN(arr, n, rng) { return shuffle(arr, rng).slice(0, n); }

// ─── Constants ────────────────────────────────────────────────────────────────
const GACHA_GRADES = ['C', 'B', 'A', 'S', 'SS', 'SSS'];
const GACHA_PROBABILITIES = { C: 0.40, B: 0.24, A: 0.14, S: 0.09, SS: 0.07, SSS: 0.06 };
const GACHA_STAT_RANGES   = { C: [1,2], B: [2,4], A: [4,6], S: [6,9], SS: [9,13], SSS: [13,18] };
const GROWTH_STAT_KEYS    = ['hp', 'str', 'agi', 'int', 'luk'];

const MAX_ATB_GAUGE         = 100;
const INITIAL_MANA_RATIO    = 0.5;
const MANA_REGEN_COEFF      = 0.001;
const CRIT_BASE_MULTIPLIER  = 1.5;
const CRIT_LUK_COEFF        = 0.001;
const CRIT_MULTIPLIER_CAP   = 3.0;
const MIN_DAMAGE            = 1;
const MAX_TURNS             = 50;
const DEF_FORMULA_BASE      = 100;
const INTER_MATCH_HP_REGEN_RATIO = 0.30;

const QUALIFIER_TARGET = 32;
const GROUP_COUNT      = 8;
const GROUP_SIZE       = 4;

const GOLD_BY_RESULT = { winner: 400, finalist: 200, tournament_out: 100, group_out: 60, qualifier_out: 30 };
const ITEM_TIERS     = ['common', 'rare', 'hero', 'legend'];
const ITEM_TIER_PROBS = { common: 0.50, rare: 0.30, hero: 0.15, legend: 0.05 };
const SHOP_SIZE      = 6;

const INITIAL_PLAYER_STAT = 1;
const NPC_BASE_GROWTH     = 10;

const INT_CD_REDUCTION_PER    = 40;
const AGI_EVA_COUNTER_COEFF   = 0.3;
const HP_REGEN_PER_TURN_RATIO = 0.008;

// ─── Archetype Coefficients ───────────────────────────────────────────────────
const DEFAULT_COEFFS = {
  hp_to_maxHp: 10, str_to_atk: 3, str_to_def: 1, agi_to_spd: 2,
  agi_to_eva: 0.5, luk_to_crit: 0.5, int_to_mana: 5,
  hp_to_def: 0, int_to_atk: 0, int_to_spd: 0, luk_to_eva: 0,
  str_to_crit: 0, int_to_maxHp: 0, str_to_spd: 0,
};
const ARCHETYPE_GROWTH_COEFFS = {
  tank:      { ...DEFAULT_COEFFS, hp_to_maxHp: 10, str_to_atk: 3.0, str_to_def: 1.5, hp_to_def: 0.1, str_to_spd: 0.3 },
  berserker: { ...DEFAULT_COEFFS, hp_to_maxHp: 8,  str_to_atk: 4,   luk_to_crit: 0.7, str_to_crit: 0.2 },
  assassin:  { ...DEFAULT_COEFFS, str_to_atk: 2.2, agi_to_spd: 2.0, luk_to_crit: 0.5, luk_to_eva: 0.4 },
  ranger:    { ...DEFAULT_COEFFS, luk_to_crit: 0.4 },
  mage:      { ...DEFAULT_COEFFS, str_to_atk: 1.5, int_to_mana: 8,  int_to_atk: 2.0, int_to_spd: 1.2 },
  paladin:   { ...DEFAULT_COEFFS, hp_to_maxHp: 12, str_to_atk: 2,   str_to_def: 2,   int_to_maxHp: 3, int_to_spd: 0.7 },
  support:   { ...DEFAULT_COEFFS, str_to_atk: 2.5, luk_to_crit: 0.3, int_to_mana: 7, int_to_spd: 0.8, luk_to_eva: 0.3, int_to_atk: 0.4 },
  warrior:   { ...DEFAULT_COEFFS, str_to_atk: 3.5 },
};

// ─── deriveStats ──────────────────────────────────────────────────────────────
function deriveStats(base, growth, archetype) {
  const c = ARCHETYPE_GROWTH_COEFFS[archetype] ?? ARCHETYPE_GROWTH_COEFFS['warrior'];
  const maxHp  = base.maxHp  + growth.hp  * c.hp_to_maxHp + growth.int * c.int_to_maxHp;
  const atk    = base.atk    + growth.str * c.str_to_atk   + growth.int * c.int_to_atk;
  const def    = base.def    + growth.str * c.str_to_def   + growth.hp  * c.hp_to_def;
  const spd    = base.spd    + growth.agi * c.agi_to_spd   + growth.int * c.int_to_spd + growth.str * c.str_to_spd;
  const crit   = Math.min(base.crit + growth.luk * c.luk_to_crit + growth.str * c.str_to_crit, 100);
  const eva    = Math.min(base.eva  + growth.agi * c.agi_to_eva  + growth.luk * c.luk_to_eva,  100);
  const maxMana = base.maxMana + growth.int * c.int_to_mana;
  const critMultiplier = Math.min(CRIT_BASE_MULTIPLIER + growth.luk * CRIT_LUK_COEFF, CRIT_MULTIPLIER_CAP);
  return { maxHp, atk, def, spd, crit, eva, maxMana, aggression: base.aggression, critMultiplier };
}

// ─── Characters data (from characters.json) ───────────────────────────────────
const CHARACTERS = [
  { id:  1, archetype: 'tank',      baseCombat: { maxHp: 60, atk: 20, def: 30, spd:  1, crit: 15, eva:  0, maxMana: 20, aggression: 15 } },
  { id:  2, archetype: 'berserker', baseCombat: { maxHp: 40, atk: 40, def: 10, spd:  6, crit: 25, eva:  0, maxMana: 15, aggression: 25 } },
  { id:  3, archetype: 'assassin',  baseCombat: { maxHp: 30, atk: 30, def:  5, spd: 16, crit: 35, eva: 20, maxMana: 15, aggression: 10 } },
  { id:  4, archetype: 'ranger',    baseCombat: { maxHp: 35, atk: 30, def: 10, spd: 21, crit: 30, eva: 10, maxMana: 15, aggression: 10 } },
  { id:  5, archetype: 'mage',      baseCombat: { maxHp: 30, atk: 15, def: 10, spd:  1, crit: 20, eva:  5, maxMana: 60, aggression: 20 } },
  { id:  6, archetype: 'paladin',   baseCombat: { maxHp: 50, atk: 20, def: 25, spd:  1, crit: 15, eva:  0, maxMana: 35, aggression: 15 } },
  { id:  7, archetype: 'assassin',  baseCombat: { maxHp: 35, atk: 25, def: 10, spd: 16, crit: 30, eva: 20, maxMana: 15, aggression: 10 } },
  { id:  8, archetype: 'warrior',   baseCombat: { maxHp: 40, atk: 30, def: 15, spd: 11, crit: 35, eva:  5, maxMana: 15, aggression: 10 } },
  { id:  9, archetype: 'ranger',    baseCombat: { maxHp: 35, atk: 35, def:  5, spd: 16, crit: 35, eva: 10, maxMana: 15, aggression: 10 } },
  { id: 10, archetype: 'support',   baseCombat: { maxHp: 35, atk: 20, def: 10, spd:  6, crit: 20, eva: 10, maxMana: 50, aggression: 10 } },
  { id: 11, archetype: 'tank',      baseCombat: { maxHp: 55, atk: 25, def: 30, spd:  1, crit: 15, eva:  0, maxMana: 20, aggression: 15 } },
  { id: 12, archetype: 'berserker', baseCombat: { maxHp: 45, atk: 40, def: 10, spd:  6, crit: 25, eva:  0, maxMana: 15, aggression: 20 } },
  { id: 13, archetype: 'support',   baseCombat: { maxHp: 45, atk: 20, def: 20, spd:  1, crit: 15, eva:  5, maxMana: 40, aggression: 15 } },
  { id: 14, archetype: 'warrior',   baseCombat: { maxHp: 50, atk: 30, def: 20, spd:  6, crit: 20, eva:  5, maxMana: 15, aggression: 15 } },
  { id: 15, archetype: 'mage',      baseCombat: { maxHp: 30, atk: 20, def: 10, spd:  1, crit: 20, eva:  5, maxMana: 60, aggression: 15 } },
  { id: 16, archetype: 'warrior',   baseCombat: { maxHp: 40, atk: 30, def: 20, spd: 16, crit: 25, eva: 10, maxMana: 10, aggression: 10 } },
  { id: 17, archetype: 'tank',      baseCombat: { maxHp: 70, atk: 30, def: 20, spd:  1, crit: 15, eva:  0, maxMana: 10, aggression: 15 } },
  { id: 18, archetype: 'mage',      baseCombat: { maxHp: 40, atk: 15, def: 15, spd:  1, crit: 15, eva:  5, maxMana: 55, aggression: 15 } },
  { id: 19, archetype: 'warrior',   baseCombat: { maxHp: 40, atk: 30, def: 15, spd: 11, crit: 30, eva: 10, maxMana: 15, aggression: 10 } },
  { id: 20, archetype: 'assassin',  baseCombat: { maxHp: 35, atk: 35, def:  5, spd: 16, crit: 30, eva: 20, maxMana: 10, aggression: 10 } },
  { id: 21, archetype: 'mage',      baseCombat: { maxHp: 35, atk: 15, def: 10, spd:  6, crit: 20, eva:  5, maxMana: 55, aggression: 15 } },
  { id: 22, archetype: 'warrior',   baseCombat: { maxHp: 55, atk: 35, def: 20, spd:  1, crit: 20, eva:  0, maxMana: 15, aggression: 15 } },
  { id: 23, archetype: 'assassin',  baseCombat: { maxHp: 30, atk: 30, def:  5, spd: 21, crit: 35, eva: 20, maxMana: 10, aggression: 10 } },
  { id: 24, archetype: 'warrior',   baseCombat: { maxHp: 40, atk: 35, def: 10, spd: 16, crit: 35, eva:  5, maxMana: 10, aggression: 10 } },
  { id: 25, archetype: 'mage',      baseCombat: { maxHp: 35, atk: 20, def: 10, spd:  1, crit: 20, eva:  5, maxMana: 55, aggression: 15 } },
  { id: 26, archetype: 'warrior',   baseCombat: { maxHp: 45, atk: 30, def: 20, spd: 11, crit: 20, eva:  5, maxMana: 20, aggression: 10 } },
  { id: 27, archetype: 'assassin',  baseCombat: { maxHp: 35, atk: 30, def: 10, spd: 21, crit: 30, eva: 15, maxMana: 10, aggression: 10 } },
  { id: 28, archetype: 'ranger',    baseCombat: { maxHp: 35, atk: 30, def: 10, spd: 11, crit: 30, eva: 10, maxMana: 25, aggression: 10 } },
  { id: 29, archetype: 'ranger',    baseCombat: { maxHp: 35, atk: 35, def: 10, spd: 16, crit: 35, eva: 10, maxMana: 10, aggression: 10 } },
  { id: 30, archetype: 'warrior',   baseCombat: { maxHp: 40, atk: 35, def: 15, spd: 11, crit: 25, eva: 10, maxMana: 10, aggression: 15 } },
  { id: 31, archetype: 'ranger',    baseCombat: { maxHp: 40, atk: 35, def: 15, spd: 16, crit: 25, eva: 10, maxMana: 10, aggression: 10 } },
  { id: 32, archetype: 'ranger',    baseCombat: { maxHp: 45, atk: 35, def: 15, spd: 11, crit: 25, eva: 10, maxMana: 10, aggression: 10 } },
  { id: 33, archetype: 'tank',      baseCombat: { maxHp: 55, atk: 30, def: 30, spd:  6, crit: 15, eva:  0, maxMana: 15, aggression: 10 } },
  { id: 34, archetype: 'support',   baseCombat: { maxHp: 35, atk: 15, def: 10, spd:  6, crit: 20, eva: 10, maxMana: 50, aggression: 15 } },
  { id: 35, archetype: 'warrior',   baseCombat: { maxHp: 45, atk: 35, def: 15, spd: 16, crit: 25, eva:  5, maxMana: 10, aggression: 10 } },
  { id: 36, archetype: 'warrior',   baseCombat: { maxHp: 35, atk: 25, def: 10, spd: 21, crit: 25, eva: 20, maxMana: 10, aggression: 15 } },
  { id: 37, archetype: 'tank',      baseCombat: { maxHp: 55, atk: 25, def: 25, spd:  6, crit: 15, eva:  0, maxMana: 20, aggression: 15 } },
  { id: 38, archetype: 'support',   baseCombat: { maxHp: 40, atk: 20, def: 15, spd:  6, crit: 20, eva:  5, maxMana: 45, aggression: 10 } },
  { id: 39, archetype: 'ranger',    baseCombat: { maxHp: 40, atk: 30, def: 10, spd: 16, crit: 35, eva: 10, maxMana: 10, aggression: 10 } },
  { id: 40, archetype: 'support',   baseCombat: { maxHp: 35, atk: 25, def: 10, spd: 16, crit: 25, eva: 20, maxMana: 20, aggression: 10 } },
  { id: 41, archetype: 'support',   baseCombat: { maxHp: 40, atk: 20, def: 15, spd:  6, crit: 20, eva:  5, maxMana: 45, aggression: 10 } },
  { id: 42, archetype: 'tank',      baseCombat: { maxHp: 60, atk: 25, def: 35, spd:  1, crit: 15, eva:  0, maxMana: 15, aggression: 10 } },
  { id: 43, archetype: 'mage',      baseCombat: { maxHp: 35, atk: 25, def: 10, spd:  6, crit: 25, eva:  5, maxMana: 45, aggression: 10 } },
  { id: 44, archetype: 'ranger',    baseCombat: { maxHp: 35, atk: 30, def: 10, spd: 11, crit: 30, eva: 10, maxMana: 25, aggression: 10 } },
  { id: 45, archetype: 'ranger',    baseCombat: { maxHp: 35, atk: 30, def: 10, spd: 16, crit: 30, eva: 15, maxMana: 15, aggression: 10 } },
  { id: 46, archetype: 'support',   baseCombat: { maxHp: 35, atk: 15, def: 10, spd: 11, crit: 15, eva: 15, maxMana: 50, aggression: 10 } },
  { id: 47, archetype: 'warrior',   baseCombat: { maxHp: 40, atk: 30, def: 15, spd: 16, crit: 25, eva: 10, maxMana: 15, aggression: 10 } },
  { id: 48, archetype: 'ranger',    baseCombat: { maxHp: 40, atk: 25, def: 10, spd: 16, crit: 25, eva: 15, maxMana: 20, aggression: 10 } },
  { id: 49, archetype: 'mage',      baseCombat: { maxHp: 30, atk: 15, def: 10, spd:  1, crit: 20, eva:  5, maxMana: 65, aggression: 15 } },
  { id: 50, archetype: 'tank',      baseCombat: { maxHp: 55, atk: 30, def: 30, spd:  1, crit: 15, eva:  0, maxMana: 15, aggression: 15 } },
  { id: 51, archetype: 'mage',      baseCombat: { maxHp: 40, atk: 30, def: 15, spd: 11, crit: 25, eva: 10, maxMana: 20, aggression: 10 } },
  { id: 52, archetype: 'tank',      baseCombat: { maxHp: 55, atk: 30, def: 25, spd:  6, crit: 20, eva:  0, maxMana: 15, aggression: 10 } },
  { id: 53, archetype: 'ranger',    baseCombat: { maxHp: 35, atk: 30, def: 10, spd: 16, crit: 30, eva: 15, maxMana: 15, aggression: 10 } },
  { id: 54, archetype: 'warrior',   baseCombat: { maxHp: 50, atk: 35, def: 15, spd:  6, crit: 20, eva:  5, maxMana: 20, aggression: 10 } },
  { id: 55, archetype: 'support',   baseCombat: { maxHp: 35, atk: 20, def: 10, spd: 11, crit: 20, eva: 10, maxMana: 45, aggression: 10 } },
  { id: 56, archetype: 'ranger',    baseCombat: { maxHp: 35, atk: 40, def:  5, spd:  6, crit: 40, eva: 10, maxMana: 15, aggression: 10 } },
  { id: 57, archetype: 'warrior',   baseCombat: { maxHp: 45, atk: 35, def: 20, spd: 11, crit: 25, eva:  5, maxMana: 10, aggression: 10 } },
  { id: 58, archetype: 'support',   baseCombat: { maxHp: 40, atk: 20, def: 15, spd:  6, crit: 15, eva: 10, maxMana: 45, aggression: 10 } },
  { id: 59, archetype: 'assassin',  baseCombat: { maxHp: 35, atk: 30, def: 10, spd: 16, crit: 30, eva: 20, maxMana: 10, aggression: 10 } },
  { id: 60, archetype: 'tank',      baseCombat: { maxHp: 55, atk: 35, def: 20, spd:  6, crit: 20, eva:  0, maxMana: 10, aggression: 15 } },
  { id: 61, archetype: 'assassin',  baseCombat: { maxHp: 40, atk: 35, def: 10, spd: 16, crit: 35, eva: 10, maxMana: 10, aggression:  5 } },
  { id: 62, archetype: 'berserker', baseCombat: { maxHp: 50, atk: 40, def: 15, spd: 11, crit: 25, eva:  0, maxMana: 10, aggression: 10 } },
  { id: 63, archetype: 'mage',      baseCombat: { maxHp: 35, atk: 20, def: 10, spd:  6, crit: 20, eva: 10, maxMana: 50, aggression: 10 } },
  { id: 64, archetype: 'ranger',    baseCombat: { maxHp: 40, atk: 35, def: 15, spd: 11, crit: 30, eva: 10, maxMana: 10, aggression: 10 } },
  { id: 65, archetype: 'warrior',   baseCombat: { maxHp: 50, atk: 40, def: 10, spd: 11, crit: 25, eva:  5, maxMana: 10, aggression: 10 } },
  { id: 66, archetype: 'mage',      baseCombat: { maxHp: 30, atk: 15, def:  5, spd: 11, crit: 25, eva: 20, maxMana: 45, aggression: 10 } },
  { id: 67, archetype: 'assassin',  baseCombat: { maxHp: 30, atk: 35, def:  5, spd: 16, crit: 35, eva: 20, maxMana: 10, aggression: 10 } },
  { id: 68, archetype: 'berserker', baseCombat: { maxHp: 50, atk: 40, def: 15, spd:  6, crit: 25, eva:  0, maxMana: 15, aggression: 10 } },
  { id: 69, archetype: 'support',   baseCombat: { maxHp: 40, atk: 20, def: 15, spd:  6, crit: 20, eva:  5, maxMana: 45, aggression: 10 } },
  { id: 70, archetype: 'mage',      baseCombat: { maxHp: 35, atk: 20, def: 10, spd:  6, crit: 25, eva:  5, maxMana: 50, aggression: 10 } },
  { id: 71, archetype: 'mage',      baseCombat: { maxHp: 35, atk: 30, def: 10, spd: 11, crit: 25, eva: 10, maxMana: 35, aggression:  5 } },
  { id: 72, archetype: 'mage',      baseCombat: { maxHp: 40, atk: 25, def: 15, spd:  6, crit: 20, eva:  5, maxMana: 40, aggression: 10 } },
  { id: 73, archetype: 'warrior',   baseCombat: { maxHp: 50, atk: 35, def: 20, spd:  6, crit: 20, eva:  5, maxMana: 15, aggression: 10 } },
  { id: 74, archetype: 'warrior',   baseCombat: { maxHp: 45, atk: 25, def: 25, spd:  6, crit: 20, eva: 10, maxMana: 20, aggression: 10 } },
  { id: 75, archetype: 'ranger',    baseCombat: { maxHp: 35, atk: 35, def: 10, spd: 16, crit: 35, eva: 10, maxMana: 10, aggression: 10 } },
  { id: 76, archetype: 'assassin',  baseCombat: { maxHp: 30, atk: 30, def:  5, spd: 26, crit: 30, eva: 20, maxMana: 10, aggression: 10 } },
  { id: 77, archetype: 'support',   baseCombat: { maxHp: 35, atk: 25, def: 10, spd: 11, crit: 25, eva: 10, maxMana: 35, aggression: 10 } },
  { id: 78, archetype: 'mage',      baseCombat: { maxHp: 35, atk: 25, def: 10, spd:  6, crit: 25, eva:  5, maxMana: 45, aggression: 10 } },
  { id: 79, archetype: 'warrior',   baseCombat: { maxHp: 45, atk: 40, def: 20, spd:  6, crit: 25, eva:  5, maxMana: 10, aggression: 10 } },
  { id: 80, archetype: 'tank',      baseCombat: { maxHp: 55, atk: 30, def: 30, spd:  1, crit: 20, eva:  0, maxMana: 20, aggression: 10 } },
];

// ─── Skills data (id, category, cost, cooldown, priority from skills.json) ────
const SKILLS_DATA = [
  { id: 'atk_01', category: 'attack',  cost: 10, cooldown: 2, priority: 5 },
  { id: 'atk_02', category: 'attack',  cost: 15, cooldown: 3, priority: 5 },
  { id: 'atk_03', category: 'attack',  cost: 12, cooldown: 2, priority: 5 },
  { id: 'atk_04', category: 'attack',  cost: 15, cooldown: 3, priority: 3 },
  { id: 'atk_05', category: 'attack',  cost: 20, cooldown: 4, priority: 3 },
  { id: 'atk_06', category: 'attack',  cost: 25, cooldown: 4, priority: 3 },
  { id: 'atk_07', category: 'attack',  cost: 25, cooldown: 5, priority: 2 },
  { id: 'atk_08', category: 'attack',  cost: 35, cooldown: 5, priority: 2 },
  { id: 'atk_09', category: 'attack',  cost: 50, cooldown: 7, priority: 1 },
  { id: 'atk_10', category: 'attack',  cost: 45, cooldown: 8, priority: 1 },
  { id: 'atk_11', category: 'attack',  cost:  8, cooldown: 1, priority: 5 },
  { id: 'atk_12', category: 'attack',  cost: 14, cooldown: 2, priority: 5 },
  { id: 'atk_13', category: 'attack',  cost: 13, cooldown: 2, priority: 5 },
  { id: 'atk_14', category: 'attack',  cost: 17, cooldown: 3, priority: 3 },
  { id: 'atk_15', category: 'attack',  cost: 22, cooldown: 4, priority: 3 },
  { id: 'atk_16', category: 'attack',  cost: 20, cooldown: 4, priority: 3 },
  { id: 'atk_17', category: 'attack',  cost: 28, cooldown: 5, priority: 2 },
  { id: 'atk_18', category: 'attack',  cost: 32, cooldown: 5, priority: 2 },
  { id: 'atk_19', category: 'attack',  cost: 48, cooldown: 7, priority: 1 },
  { id: 'atk_20', category: 'attack',  cost: 50, cooldown: 8, priority: 1 },
  { id: 'def_01', category: 'defense', cost: 10, cooldown: 3, priority: 5 },
  { id: 'def_02', category: 'defense', cost: 12, cooldown: 3, priority: 5 },
  { id: 'def_03', category: 'defense', cost: 18, cooldown: 4, priority: 3 },
  { id: 'def_04', category: 'defense', cost: 30, cooldown: 6, priority: 2 },
  { id: 'def_05', category: 'defense', cost: 40, cooldown: 8, priority: 1 },
  { id: 'def_06', category: 'defense', cost: 12, cooldown: 3, priority: 5 },
  { id: 'def_07', category: 'defense', cost: 16, cooldown: 4, priority: 3 },
  { id: 'def_08', category: 'defense', cost: 28, cooldown: 6, priority: 2 },
  { id: 'def_09', category: 'defense', cost: 42, cooldown: 9, priority: 1 },
  { id: 'buf_01', category: 'buff',    cost: 12, cooldown: 4, priority: 5 },
  { id: 'buf_02', category: 'buff',    cost: 15, cooldown: 4, priority: 3 },
  { id: 'buf_03', category: 'buff',    cost: 25, cooldown: 6, priority: 2 },
  { id: 'buf_04', category: 'buff',    cost: 45, cooldown: 8, priority: 1 },
  { id: 'buf_05', category: 'buff',    cost: 10, cooldown: 3, priority: 5 },
  { id: 'buf_06', category: 'buff',    cost: 16, cooldown: 4, priority: 3 },
  { id: 'buf_07', category: 'buff',    cost: 22, cooldown: 5, priority: 2 },
  { id: 'buf_08', category: 'buff',    cost: 55, cooldown:10, priority: 1 },
  { id: 'deb_01', category: 'debuff',  cost: 10, cooldown: 3, priority: 5 },
  { id: 'deb_02', category: 'debuff',  cost: 18, cooldown: 4, priority: 3 },
  { id: 'deb_03', category: 'debuff',  cost: 20, cooldown: 4, priority: 3 },
  { id: 'deb_04', category: 'debuff',  cost: 30, cooldown: 6, priority: 2 },
  { id: 'deb_05', category: 'debuff',  cost: 12, cooldown: 3, priority: 5 },
  { id: 'deb_06', category: 'debuff',  cost: 18, cooldown: 4, priority: 3 },
  { id: 'deb_07', category: 'debuff',  cost: 28, cooldown: 6, priority: 2 },
  { id: 'deb_08', category: 'debuff',  cost: 40, cooldown: 8, priority: 1 },
  { id: 'hel_01', category: 'heal',    cost: 15, cooldown: 3, priority: 5 },
  { id: 'hel_02', category: 'heal',    cost: 20, cooldown: 5, priority: 3 },
  { id: 'hel_03', category: 'heal',    cost: 50, cooldown: 8, priority: 1 },
  { id: 'hel_04', category: 'heal',    cost: 12, cooldown: 3, priority: 5 },
  { id: 'hel_05', category: 'heal',    cost:  0, cooldown: 4, priority: 3 },
  { id: 'hel_06', category: 'heal',    cost: 30, cooldown: 6, priority: 2 },
  { id: 'spc_01', category: 'special', cost: 18, cooldown: 3, priority: 3 },
  { id: 'spc_02', category: 'special', cost: 20, cooldown: 5, priority: 3 },
  { id: 'spc_03', category: 'special', cost: 25, cooldown: 5, priority: 2 },
];

const INITIAL_PLAYER_SKILLS = ['atk_01', 'atk_02', 'def_01'];
const NPC_SKILLS = ['atk_01', 'atk_11', 'def_01'];

// ─── Items data (from items.ts) ───────────────────────────────────────────────
const ITEMS = [
  { id: 'hp_amulet_c',   tier: 'common', kind: 'stat',    price:  30, statBonus: { hp:  3 } },
  { id: 'str_gauntlet_c',tier: 'common', kind: 'stat',    price:  35, statBonus: { str: 3 } },
  { id: 'agi_boots_c',   tier: 'common', kind: 'stat',    price:  30, statBonus: { agi: 3 } },
  { id: 'int_scroll_c',  tier: 'common', kind: 'stat',    price:  35, statBonus: { int: 3 } },
  { id: 'luk_coin_c',    tier: 'common', kind: 'stat',    price:  40, statBonus: { luk: 3 } },
  { id: 'hp_shield_r',   tier: 'rare',   kind: 'stat',    price:  80, statBonus: { hp:  7 } },
  { id: 'str_sword_r',   tier: 'rare',   kind: 'stat',    price:  90, statBonus: { str: 7 } },
  { id: 'agi_cloak_r',   tier: 'rare',   kind: 'stat',    price:  80, statBonus: { agi: 7 } },
  { id: 'int_tome_r',    tier: 'rare',   kind: 'stat',    price:  90, statBonus: { int: 7 } },
  { id: 'luk_charm_r',   tier: 'rare',   kind: 'stat',    price: 100, statBonus: { luk: 7 } },
  { id: 'hp_heart_h',    tier: 'hero',   kind: 'stat',    price: 220, statBonus: { hp:  15 } },
  { id: 'str_hammer_h',  tier: 'hero',   kind: 'stat',    price: 250, statBonus: { str: 15 } },
  { id: 'agi_wind_h',    tier: 'hero',   kind: 'stat',    price: 220, statBonus: { agi: 15 } },
  { id: 'int_crown_h',   tier: 'hero',   kind: 'stat',    price: 250, statBonus: { int: 15 } },
  { id: 'luk_gem_h',     tier: 'hero',   kind: 'stat',    price: 280, statBonus: { luk: 15 } },
  { id: 'hp_titan_l',    tier: 'legend', kind: 'stat',    price: 600, statBonus: { hp:  30 } },
  { id: 'str_god_l',     tier: 'legend', kind: 'stat',    price: 650, statBonus: { str: 30 } },
  { id: 'agi_light_l',   tier: 'legend', kind: 'stat',    price: 600, statBonus: { agi: 30 } },
  { id: 'int_cosmos_l',  tier: 'legend', kind: 'stat',    price: 650, statBonus: { int: 30 } },
  { id: 'luk_fate_l',    tier: 'legend', kind: 'stat',    price: 750, statBonus: { luk: 30 } },
  { id: 'poison_dagger', tier: 'rare',   kind: 'combat',  price: 180, combatEffect: { poisonDot: 5 } },
  { id: 'mana_seal',     tier: 'hero',   kind: 'combat',  price: 280, combatEffect: { manaSealTurns: 1 } },
  { id: 'vampire_ring',  tier: 'hero',   kind: 'combat',  price: 320, combatEffect: { vampireHealPct: 10 } },
  { id: 'indomitable',   tier: 'legend', kind: 'combat',  price: 600, combatEffect: { indomitableDefPct: 50 } },
  { id: 'golden_glove',  tier: 'rare',   kind: 'utility', price: 220, goldMultiplier: 1.3 },
];

const ITEMS_BY_TIER = {
  common: ITEMS.filter(i => i.tier === 'common'),
  rare:   ITEMS.filter(i => i.tier === 'rare'),
  hero:   ITEMS.filter(i => i.tier === 'hero'),
  legend: ITEMS.filter(i => i.tier === 'legend'),
};

function getItemById(id) { return ITEMS.find(i => i.id === id); }

function sumCombatEffect(itemIds, field) {
  if (!itemIds || !itemIds.length) return 0;
  let total = 0;
  for (const id of itemIds) {
    const item = getItemById(id);
    const v = item?.combatEffect?.[field];
    if (typeof v === 'number') total += v;
  }
  return total;
}

// ─── Battle helpers ───────────────────────────────────────────────────────────
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function sumEffect(entries, effectType) {
  return entries.filter(b => b.effectType === effectType).reduce((s, b) => s + b.value, 0);
}

function tickEntries(entries) {
  return entries.map(b => ({ ...b, turnsLeft: b.turnsLeft - 1 })).filter(b => b.turnsLeft > 0);
}

function tickGauge(state) {
  const stats = deriveStats(state.baseCombat, state.growthStats, state.archetype);
  const spdMult = 1 + sumEffect(state.buffs, 'spd_pct') / 100;
  return { ...state, gauge: state.gauge + stats.spd * spdMult };
}

function regenMana(state) {
  const stats = deriveStats(state.baseCombat, state.growthStats, state.archetype);
  const regenPct = sumEffect(state.buffs, 'mana_regen_pct');
  const regen = stats.maxMana * (stats.maxHp + stats.atk) * MANA_REGEN_COEFF * (1 + regenPct / 100);
  return { ...state, currentMana: Math.min(state.currentMana + regen, stats.maxMana) };
}

function regenHpPerTurn(state) {
  const stats = deriveStats(state.baseCombat, state.growthStats, state.archetype)
  const regen = Math.floor(stats.maxHp * HP_REGEN_PER_TURN_RATIO)
  if (regen <= 0) return state
  return { ...state, currentHp: Math.min(stats.maxHp, state.currentHp + regen) }
}

function consumeBuff(state, effectType) {
  return { ...state, buffs: state.buffs.filter(b => b.effectType !== effectType) };
}

function selectSkill(state, rng) {
  const stats = deriveStats(state.baseCombat, state.growthStats, state.archetype);
  const aggrBonus = sumEffect(state.debuffs, 'aggr_pct');
  const activationChance = clamp(0.5 + (stats.aggression + aggrBonus) * 0.005, 0, 1);
  if (!rng.chance(activationChance)) return null;
  if (state.buffs.some(b => b.effectType === 'sealed')) return null;

  const manaCostMult = 1 - sumEffect(state.buffs, 'mana_cost_pct') / 100;
  const usable = SKILLS_DATA.filter(s => {
    if (!state.skills.includes(s.id)) return false;
    if ((state.cooldowns[s.id] ?? 0) > 0) return false;
    if (state.currentMana < s.cost * manaCostMult) return false;
    return true;
  });
  if (usable.length === 0) return null;
  usable.sort((a, b) => a.priority - b.priority);
  const topPriority = usable[0].priority;
  const candidates = usable.filter(s => s.priority === topPriority);
  return rng.pick(candidates).id;
}

function applyVampire(actor, damage) {
  const pct = sumCombatEffect(actor.items, 'vampireHealPct');
  if (pct <= 0 || damage <= 0) return actor;
  const stats = deriveStats(actor.baseCombat, actor.growthStats, actor.archetype);
  const heal = Math.floor(damage * pct / 100);
  return { ...actor, currentHp: Math.min(stats.maxHp, actor.currentHp + heal) };
}

function applyBarrier(defender, damage) {
  if (damage <= 0) return { defender, damage };
  if (!defender.buffs.some(b => b.effectType === 'barrier_ready')) return { defender, damage };
  const reduced = Math.max(MIN_DAMAGE, Math.floor(damage * 0.3));
  return { defender: consumeBuff(defender, 'barrier_ready'), damage: reduced };
}

function applyPotion(defender) {
  if (!defender.buffs.some(b => b.effectType === 'potion_ready')) return defender;
  const stats = deriveStats(defender.baseCombat, defender.growthStats, defender.archetype);
  if (stats.maxHp <= 0 || defender.currentHp <= 0) return defender;
  if (defender.currentHp > stats.maxHp * 0.3) return defender;
  const healed = Math.min(stats.maxHp, defender.currentHp + Math.floor(stats.maxHp * 0.5));
  return consumeBuff({ ...defender, currentHp: healed }, 'potion_ready');
}

function calcHit(actor, defender, multiplier, rng) {
  const atkStats = deriveStats(actor.baseCombat, actor.growthStats, actor.archetype);
  const defStats = deriveStats(defender.baseCombat, defender.growthStats, defender.archetype);

  const evaForceZero = defender.debuffs.some(b => b.effectType === 'eva_force_zero');
  const effectiveEva = evaForceZero ? 0 : Math.min(100, Math.max(0,
    defStats.eva + sumEffect(defender.buffs, 'eva_flat') + sumEffect(actor.debuffs, 'acc_pct') - atkStats.spd * AGI_EVA_COUNTER_COEFF
  ));
  if (rng.chance(effectiveEva / 100)) return { damage: 0, critical: false, evaded: true, ambushConsumed: false };

  const ambushConsumed = actor.buffs.some(b => b.effectType === 'ambush_ready');
  const effectiveCrit = clamp(atkStats.crit + sumEffect(actor.buffs, 'crit_flat'), 0, 100);
  const critical = ambushConsumed || rng.chance(effectiveCrit / 100);

  const atkPctTotal = sumEffect(actor.buffs, 'atk_pct') + sumEffect(actor.debuffs, 'atk_pct');
  const effectiveAtk = atkStats.atk * (1 + atkPctTotal / 100);
  const hpRatio = defStats.maxHp > 0 ? defender.currentHp / defStats.maxHp : 1;
  const indomitable = hpRatio <= 0.2 ? sumCombatEffect(defender.items, 'indomitableDefPct') : 0;
  const effectiveDef = defStats.def * (1 + sumEffect(defender.debuffs, 'def_pct') / 100 + indomitable / 100);
  const incomingMult = 1 + sumEffect(defender.debuffs, 'incoming_dmg_pct') / 100;
  const critMult = critical ? atkStats.critMultiplier : 1;

  const raw = effectiveAtk * multiplier * DEF_FORMULA_BASE / (DEF_FORMULA_BASE + effectiveDef);
  const ambushDmgMult = ambushConsumed ? 1.3 : 1;
  const damage = Math.max(MIN_DAMAGE, Math.floor(raw * critMult * incomingMult * ambushDmgMult));
  return { damage, critical, evaded: false, ambushConsumed };
}

function applySkill(skillId, actor, target, rng) {
  const skill = SKILLS_DATA.find(s => s.id === skillId);
  if (!skill) return { actor, target, damage: 0, critical: false, evaded: false };

  const manaCostMult = 1 - sumEffect(actor.buffs, 'mana_cost_pct') / 100;
  let a = { ...actor, currentMana: actor.currentMana - skill.cost * manaCostMult };
  const intGrowth = actor.growthStats.int || 0;
  const cdReduction = Math.min(3, Math.floor(intGrowth / INT_CD_REDUCTION_PER));
  a = { ...a, cooldowns: { ...a.cooldowns, [skillId]: Math.max(1, skill.cooldown - cdReduction) } };
  let t = { ...target };
  let damage = 0, critical = false, evaded = false;
  const aStats = deriveStats(a.baseCombat, a.growthStats, a.archetype);

  if (skill.category === 'attack') {
    const hit = calcHit(a, t, 1.5, rng);
    damage = hit.damage; critical = hit.critical; evaded = hit.evaded;
    if (hit.ambushConsumed) a = consumeBuff(a, 'ambush_ready');
    if (!evaded) {
      const br = applyBarrier(t, damage); t = br.defender; damage = br.damage;
      t = { ...t, currentHp: t.currentHp - damage };
      t = applyPotion(t);
      a = applyVampire(a, damage);
    }
  } else if (skill.category === 'heal') {
    const healAmt = Math.floor(aStats.maxHp * 0.3);
    a = { ...a, currentHp: Math.min(aStats.maxHp, a.currentHp + healAmt) };
  } else if (skill.category === 'buff') {
    a = { ...a, buffs: [...a.buffs, { id: skillId, effectType: 'atk_pct', value: 25, turnsLeft: 3 }] };
  } else if (skill.category === 'debuff') {
    t = { ...t, debuffs: [...t.debuffs, { id: skillId, effectType: 'def_pct', value: -20, turnsLeft: 2 }] };
  } else if (skill.category === 'defense') {
    a = { ...a, buffs: [...a.buffs, { id: skillId, effectType: 'def_pct', value: 50, turnsLeft: 2 }] };
  } else if (skill.category === 'special') {
    const hit = calcHit(a, t, 1.2, rng);
    damage = hit.damage; critical = hit.critical; evaded = hit.evaded;
    if (hit.ambushConsumed) a = consumeBuff(a, 'ambush_ready');
    if (!evaded) {
      const br = applyBarrier(t, damage); t = br.defender; damage = br.damage;
      t = { ...t, currentHp: t.currentHp - damage };
      t = applyPotion(t);
      const lifeSteal = Math.floor(damage * 0.5);
      a = { ...a, currentHp: Math.min(aStats.maxHp, a.currentHp + lifeSteal) };
      a = applyVampire(a, damage);
    }
  }
  return { actor: a, target: t, damage, critical, evaded };
}

function normalAttack(actor, target, rng) {
  const hit = calcHit(actor, target, 1.0, rng);
  let a = hit.ambushConsumed ? consumeBuff(actor, 'ambush_ready') : actor;
  if (hit.evaded) return { actor: a, target, damage: 0, critical: hit.critical, evaded: true };
  const br = applyBarrier(target, hit.damage);
  let t = br.defender;
  const dmg = br.damage;
  t = { ...t, currentHp: t.currentHp - dmg };
  t = applyPotion(t);
  a = applyVampire(a, dmg);
  return { actor: a, target: t, damage: dmg, critical: hit.critical, evaded: false };
}

function simulateMatch(char1, char2, seed) {
  const rng = new SeededRng(seed);
  const st1 = deriveStats(char1.baseCombat, char1.growthStats, char1.archetype);
  const st2 = deriveStats(char2.baseCombat, char2.growthStats, char2.archetype);

  const seal1 = sumCombatEffect(char2.items, 'manaSealTurns');
  const seal2 = sumCombatEffect(char1.items, 'manaSealTurns');
  const sealedBuff = (turns) => turns > 0 ? [{ id: 'mana_seal', effectType: 'sealed', value: 1, turnsLeft: turns }] : [];

  let s1 = {
    ...char1,
    currentHp:   st1.maxHp,
    currentMana: Math.floor(st1.maxMana * INITIAL_MANA_RATIO),
    gauge:       rng.int(0, MAX_ATB_GAUGE),
    buffs:       sealedBuff(seal1),
    debuffs:     [],
    cooldowns:   {},
  };
  let s2 = {
    ...char2,
    currentHp:   st2.maxHp,
    currentMana: Math.floor(st2.maxMana * INITIAL_MANA_RATIO),
    gauge:       rng.int(0, MAX_ATB_GAUGE),
    buffs:       sealedBuff(seal2),
    debuffs:     [],
    cooldowns:   {},
  };

  let turn = 0;
  while (s1.currentHp > 0 && s2.currentHp > 0 && turn < MAX_TURNS) {
    while (s1.gauge < MAX_ATB_GAUGE && s2.gauge < MAX_ATB_GAUGE) {
      s1 = tickGauge(s1);
      s2 = tickGauge(s2);
    }

    const spd1 = deriveStats(s1.baseCombat, s1.growthStats, s1.archetype).spd;
    const spd2 = deriveStats(s2.baseCombat, s2.growthStats, s2.archetype).spd;
    const actor1Acts = s1.gauge >= MAX_ATB_GAUGE &&
      (s2.gauge < MAX_ATB_GAUGE || spd1 >= spd2 || rng.chance(0.5));

    let actor    = actor1Acts ? s1 : s2;
    let defender = actor1Acts ? s2 : s1;
    turn++;

    actor = regenMana(actor);
    actor = regenHpPerTurn(actor);

    const poison = sumCombatEffect(actor.items, 'poisonDot');
    if (poison > 0) {
      defender = { ...defender, currentHp: defender.currentHp - poison };
      if (defender.currentHp <= 0) {
        if (actor1Acts) { s1 = actor; s2 = defender; } else { s2 = actor; s1 = defender; }
        break;
      }
    }

    const skillId = selectSkill(actor, rng);
    let result;
    if (skillId) {
      result = applySkill(skillId, actor, defender, rng);
    } else {
      result = normalAttack(actor, defender, rng);
    }

    actor    = result.actor;
    defender = result.target;

    const newCds = {};
    for (const [id, cd] of Object.entries(actor.cooldowns)) {
      if (cd > 1) newCds[id] = cd - 1;
    }
    actor = {
      ...actor,
      gauge:     actor.gauge - MAX_ATB_GAUGE,
      cooldowns: newCds,
      buffs:     tickEntries(actor.buffs),
      debuffs:   tickEntries(actor.debuffs),
    };

    if (actor1Acts) { s1 = actor; s2 = defender; } else { s2 = actor; s1 = defender; }
    if (s1.currentHp <= 0 || s2.currentHp <= 0) break;
  }

  const winnerId = s1.currentHp > s2.currentHp ? s1.charId : s2.charId;
  const loserId  = winnerId === s1.charId ? s2.charId : s1.charId;
  return { winnerId, loserId };
}

function regenHpBetweenMatches(currentHp, maxHp, ratio) {
  return Math.min(maxHp, currentHp + maxHp * ratio);
}

// ─── Tournament ───────────────────────────────────────────────────────────────
function makeCharState(char, growth, skills, items) {
  items = items || [];
  return {
    charId:      char.id,
    currentHp:   deriveStats(char.baseCombat, growth, char.archetype).maxHp,
    currentMana: 0,
    gauge:       0,
    buffs:       [],
    debuffs:     [],
    cooldowns:   {},
    skills,
    growthStats: growth,
    baseCombat:  char.baseCombat,
    archetype:   char.archetype,
    items,
  };
}

function runQualifier(participants, growthMap, skillMap, itemsMap, rng) {
  let pool = participants.map(c => c.id);
  const charById = Object.fromEntries(participants.map(c => [c.id, c]));
  const hpMap = {};
  for (const c of participants) {
    hpMap[c.id] = deriveStats(c.baseCombat, growthMap[c.id], c.archetype).maxHp;
  }

  while (pool.length > QUALIFIER_TARGET) {
    const matchCount = Math.min(pool.length - QUALIFIER_TARGET, Math.floor(pool.length / 2));
    const shuffled = shuffle(pool, rng);
    const losers = [];

    for (let i = 0; i < matchCount; i++) {
      const id1 = shuffled[i * 2];
      const id2 = shuffled[i * 2 + 1];
      const seed = rng.int(0, 1_000_000);

      const s1 = { ...makeCharState(charById[id1], growthMap[id1], skillMap[id1], itemsMap[id1] || []), currentHp: hpMap[id1] };
      const s2 = { ...makeCharState(charById[id2], growthMap[id2], skillMap[id2], itemsMap[id2] || []), currentHp: hpMap[id2] };

      const result = simulateMatch(s1, s2, seed);
      const maxHp = deriveStats(charById[result.winnerId].baseCombat, growthMap[result.winnerId], charById[result.winnerId].archetype).maxHp;
      hpMap[result.winnerId] = regenHpBetweenMatches(hpMap[result.winnerId], maxHp, INTER_MATCH_HP_REGEN_RATIO);
      losers.push(result.loserId);
    }
    pool = pool.filter(id => !losers.includes(id));
  }
  return pool;
}

function playGroupMatch(id1, id2, charById, growthMap, skillMap, itemsMap, rng) {
  const s1 = makeCharState(charById[id1], growthMap[id1], skillMap[id1], itemsMap[id1] || []);
  const s2 = makeCharState(charById[id2], growthMap[id2], skillMap[id2], itemsMap[id2] || []);
  return simulateMatch(s1, s2, rng.int(0, 1_000_000));
}

function runGroup(groupId, memberIds, charById, growthMap, skillMap, itemsMap, rng) {
  const [a, b, c, d] = memberIds;
  const play = (id1, id2) => playGroupMatch(id1, id2, charById, growthMap, skillMap, itemsMap, rng);

  const m1 = play(a, b);
  const m2 = play(c, d);
  const [w1, l1] = [m1.winnerId, m1.loserId];
  const [w2, l2] = [m2.winnerId, m2.loserId];
  const m3 = play(w1, w2);
  const m4 = play(l1, l2);
  const rank1        = m3.winnerId;
  const winnersLoser = m3.loserId;
  const losersWinner = m4.winnerId;
  const eliminated1  = m4.loserId;
  const m5 = play(winnersLoser, losersWinner);
  const rank2       = m5.winnerId;
  const eliminated2 = m5.loserId;
  return { rank1, rank2, eliminated: [eliminated1, eliminated2] };
}

function runBracket(finalists, charById, growthMap, skillMap, itemsMap, rng) {
  let pool = shuffle(finalists, rng);
  const bracketEliminations = {};
  let bracketRound = 1;

  while (pool.length > 1) {
    const next = [];
    for (let i = 0; i < pool.length; i += 2) {
      if (i + 1 >= pool.length) { next.push(pool[i]); continue; }
      const seed = rng.int(0, 1_000_000);
      const s1 = makeCharState(charById[pool[i]],     growthMap[pool[i]],     skillMap[pool[i]],     itemsMap[pool[i]]     || []);
      const s2 = makeCharState(charById[pool[i + 1]], growthMap[pool[i + 1]], skillMap[pool[i + 1]], itemsMap[pool[i + 1]] || []);
      const result = simulateMatch(s1, s2, seed);
      bracketEliminations[result.loserId] = bracketRound;
      next.push(result.winnerId);
    }
    pool = next;
    bracketRound++;
  }
  return { winner: pool[0], bracketEliminations };
}

function runTournament(participants, growthMap, skillMap, seed, itemsMap) {
  itemsMap = itemsMap || {};
  const rng = new SeededRng(seed);
  const charById = Object.fromEntries(participants.map(c => [c.id, c]));

  const qualifiers = runQualifier(participants, growthMap, skillMap, itemsMap, rng);

  const shuffledQ = shuffle(qualifiers, rng);
  const groups = [];
  const finalists = [];
  const groupLabels = 'ABCDEFGH';

  for (let g = 0; g < GROUP_COUNT; g++) {
    const memberIds = shuffledQ.slice(g * GROUP_SIZE, g * GROUP_SIZE + GROUP_SIZE);
    const result = runGroup(groupLabels[g], memberIds, charById, growthMap, skillMap, itemsMap, rng);
    groups.push(result);
    finalists.push(result.rank1, result.rank2);
  }

  const { winner, bracketEliminations } = runBracket(finalists, charById, growthMap, skillMap, itemsMap, rng);
  return { qualifiers, finalists, groups, bracketEliminations, winner };
}

// ─── Gacha ────────────────────────────────────────────────────────────────────
function rollGrade(rng) {
  let roll = rng.next();
  for (const grade of GACHA_GRADES) {
    const prob = GACHA_PROBABILITIES[grade];
    if (roll < prob) return grade;
    roll -= prob;
  }
  return 'C';
}

function runGacha(playerCharId, allCharIds, seed) {
  const rng = new SeededRng(seed);
  const playerGains = [];
  for (const targetCharId of allCharIds) {
    const grade   = rollGrade(rng);
    const statKey = rng.pick(GROWTH_STAT_KEYS);
    const [min, max] = GACHA_STAT_RANGES[grade];
    const statGain = min + Math.floor(rng.next() * (max - min + 1));
    if (targetCharId === playerCharId) {
      playerGains.push({ grade, statKey, statGain });
    }
  }
  return playerGains;
}

// ─── Shop ─────────────────────────────────────────────────────────────────────
function rollTier(rng, probs) {
  probs = probs || ITEM_TIER_PROBS;
  let roll = rng.next();
  for (const tier of ITEM_TIERS) {
    const prob = probs[tier];
    if (roll < prob) return tier;
    roll -= prob;
  }
  return 'common';
}

function rollShopItems(seed) {
  const rng = new SeededRng(seed);
  const result = [];
  for (let i = 0; i < SHOP_SIZE; i++) {
    const tier = rollTier(rng);
    const pool = ITEMS_BY_TIER[tier];
    if (pool.length === 0) continue;
    result.push(rng.pick(pool));
  }
  return result;
}

function npcTierProbs(round) {
  if (round <= 2) return { common: 0.60, rare: 0.30, hero: 0.08, legend: 0.02 };
  if (round <= 4) return { common: 0.40, rare: 0.35, hero: 0.20, legend: 0.05 };
  if (round <= 6) return { common: 0.25, rare: 0.35, hero: 0.30, legend: 0.10 };
  return              { common: 0.15, rare: 0.30, hero: 0.35, legend: 0.20 };
}

function rollNpcItems(count, round, seed) {
  if (count <= 0) return [];
  const rng = new SeededRng(seed);
  const probs = npcTierProbs(round);
  const result = [];
  for (let i = 0; i < count; i++) {
    const tier = rollTier(rng, probs);
    const pool = ITEMS_BY_TIER[tier].length > 0 ? ITEMS_BY_TIER[tier] : ITEMS_BY_TIER.common;
    if (pool.length === 0) continue;
    result.push(rng.pick(pool).id);
  }
  return result;
}

// ─── Player result determination ─────────────────────────────────────────────
function getPlayerResult(playerId, qualifiers, finalists, bracketEliminations, winner) {
  if (!qualifiers.includes(playerId)) return 'qualifier_out';
  if (!finalists.includes(playerId))  return 'group_out';
  if (winner === playerId) return 'winner';
  const bracketRound = bracketEliminations[playerId];
  // bracketRound 1=R16, 2=R8, 3=semifinal, 4=final
  if (bracketRound >= 3) return 'finalist';
  return 'tournament_out';
}

// ─── Spend gold on cheapest affordable stat items ─────────────────────────────
function buyItems(gold, shopSeed, growthStats) {
  const shopItems = rollShopItems(shopSeed);
  const statItems = shopItems.filter(i => i.kind === 'stat' && i.statBonus).sort((a, b) => a.price - b.price);
  let remaining = gold;
  const gs = { ...growthStats };
  for (const item of statItems) {
    if (remaining >= item.price) {
      remaining -= item.price;
      for (const [key, val] of Object.entries(item.statBonus)) {
        gs[key] = (gs[key] || 0) + val;
      }
    }
  }
  return { newStats: gs, spent: gold - remaining };
}

// ─── Single simulation run ────────────────────────────────────────────────────
function simulateRun(runIndex) {
  const PLAYER_ID = 1;
  const playerChar = CHARACTERS.find(c => c.id === PLAYER_ID);
  const allChars   = CHARACTERS;
  const allCharIds = allChars.map(c => c.id);

  let playerGrowth = { hp: INITIAL_PLAYER_STAT, str: INITIAL_PLAYER_STAT, agi: INITIAL_PLAYER_STAT, int: INITIAL_PLAYER_STAT, luk: INITIAL_PLAYER_STAT };
  let playerGold   = 0;
  let firstWinRound = null;
  const stagesPerRound = [];

  const baseSeed = runIndex * 99991; // large prime to spread seeds

  for (let round = 1; round <= 20; round++) {
    const roundSeed = baseSeed + round * 1009;

    // 1. Gacha — player gets stat from gacha
    const gachaSeed   = (roundSeed * 7 + 1) & 0x7FFFFFFF;
    const playerGains = runGacha(PLAYER_ID, allCharIds, gachaSeed);
    for (const gain of playerGains) {
      playerGrowth[gain.statKey] = (playerGrowth[gain.statKey] || 0) + gain.statGain;
    }

    // 2. Build maps
    const npcGrowthValue = NPC_BASE_GROWTH + (round - 1);
    const growthMap = {};
    const skillMap  = {};
    const itemsMap  = {};

    for (const c of allChars) {
      if (c.id === PLAYER_ID) {
        growthMap[c.id] = { ...playerGrowth };
        skillMap[c.id]  = [...INITIAL_PLAYER_SKILLS];
        itemsMap[c.id]  = [];
      } else {
        growthMap[c.id] = { hp: npcGrowthValue, str: npcGrowthValue, agi: npcGrowthValue, int: npcGrowthValue, luk: npcGrowthValue };
        skillMap[c.id]  = [...NPC_SKILLS];
        const npcItemSeed = (roundSeed * 13 + c.id * 7) & 0x7FFFFFFF;
        itemsMap[c.id]  = rollNpcItems(round - 1, round, npcItemSeed);
      }
    }

    // 3. Run tournament
    const tournSeed = (roundSeed * 3 + 2) & 0x7FFFFFFF;
    const { qualifiers, finalists, bracketEliminations, winner } =
      runTournament(allChars, growthMap, skillMap, tournSeed, itemsMap);

    // 4. Player result
    const result = getPlayerResult(PLAYER_ID, qualifiers, finalists, bracketEliminations, winner);
    stagesPerRound.push(result);

    if (result === 'winner' && firstWinRound === null) {
      firstWinRound = round;
    }

    // 5. Gold + shop
    const earnedGold = GOLD_BY_RESULT[result] || 0;
    playerGold += earnedGold;
    const shopSeed = (roundSeed * 5 + 3) & 0x7FFFFFFF;
    const { newStats, spent } = buyItems(playerGold, shopSeed, playerGrowth);
    playerGrowth = newStats;
    playerGold  -= spent;

    if (firstWinRound !== null) break;
  }

  return {
    firstWinRound,
    stagesPerRound,
    finalGrowth: { ...playerGrowth },
    finalRound:  stagesPerRound.length,
  };
}

// ─── Main simulation ──────────────────────────────────────────────────────────
const NUM_RUNS   = 1000;
const MAX_ROUNDS = 20;

console.log(`Running ${NUM_RUNS} simulations...`);
const startTime = Date.now();

const results = [];
for (let i = 0; i < NUM_RUNS; i++) {
  if (i > 0 && i % 200 === 0) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stdout.write(`  ${i}/${NUM_RUNS} (${elapsed}s elapsed)\n`);
  }
  results.push(simulateRun(i));
}

const totalMs = Date.now() - startTime;
console.log(`Completed ${NUM_RUNS} runs in ${(totalMs / 1000).toFixed(1)}s\n`);

// ─── Report ───────────────────────────────────────────────────────────────────
const wonAtLeastOnce = results.filter(r => r.firstWinRound !== null);
const winRounds      = wonAtLeastOnce.map(r => r.firstWinRound);
const winRatePct     = (wonAtLeastOnce.length / NUM_RUNS * 100).toFixed(1);
const avgRound       = winRounds.length > 0
  ? (winRounds.reduce((a, b) => a + b, 0) / winRounds.length).toFixed(2)
  : 'N/A';

const sorted = [...winRounds].sort((a, b) => a - b);
const median = winRounds.length > 0
  ? (winRounds.length % 2 === 0
    ? ((sorted[winRounds.length / 2 - 1] + sorted[winRounds.length / 2]) / 2).toFixed(1)
    : String(sorted[Math.floor(winRounds.length / 2)]))
  : 'N/A';

console.log('═══════════════════════════════════════════════════════════════');
console.log('         Training Arena — 1000-Run Simulation Report           ');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`Player: id=1 (강철기사 / tank) | Starting growthStats: all ${INITIAL_PLAYER_STAT}`);
console.log(`NPC growthStats round N: all ${NPC_BASE_GROWTH}+(N-1) per stat (=10 at R1, 29 at R20)`);
console.log('');

console.log('─── Overall ────────────────────────────────────────────────────');
console.log(`Runs with at least 1 win (≤20 rounds): ${wonAtLeastOnce.length} / ${NUM_RUNS}  (${winRatePct}%)`);
console.log(`Average round of first win:  ${avgRound}`);
console.log(`Median  round of first win:  ${median}`);
console.log('');

console.log('─── Win Distribution (first win per round) ─────────────────────');
console.log('  Rnd | # Wins | Run%  | Cum%   | Bar');
let cumulative = 0;
for (let r = 1; r <= MAX_ROUNDS; r++) {
  const count = winRounds.filter(x => x === r).length;
  cumulative += count;
  const pct    = (count / NUM_RUNS * 100).toFixed(1).padStart(5);
  const cumPct = (cumulative / NUM_RUNS * 100).toFixed(1).padStart(5);
  const bar    = '█'.repeat(Math.round(count / NUM_RUNS * 200));
  const rStr   = String(r).padStart(3);
  console.log(`  ${rStr} | ${String(count).padStart(6)} | ${pct}% | ${cumPct}% | ${bar}`);
}
console.log('');

console.log('─── Stage Reached Per Round (% of runs that reached that round) ─');
console.log('  Rnd | qual_out | grp_out | tourn_out | finalist | winner | #runs');
const STAGE_KEYS = ['qualifier_out', 'group_out', 'tournament_out', 'finalist', 'winner'];
for (let r = 1; r <= MAX_ROUNDS; r++) {
  const roundResults = results
    .filter(res => res.stagesPerRound.length >= r)
    .map(res => res.stagesPerRound[r - 1]);
  const total = roundResults.length;
  if (total === 0) break;
  const counts = {};
  for (const s of roundResults) counts[s] = (counts[s] || 0) + 1;
  const fmt = (k) => ((counts[k] || 0) / total * 100).toFixed(1).padStart(5) + '%';
  const rStr = String(r).padStart(3);
  console.log(`  ${rStr} | ${fmt('qualifier_out')}  | ${fmt('group_out')} | ${fmt('tournament_out')}    | ${fmt('finalist')} | ${fmt('winner')} | ${total}`);
}
console.log('');

console.log('─── Player Stats at Time of First Win ──────────────────────────');
if (wonAtLeastOnce.length > 0) {
  const avgStat = (key) => {
    const vals = wonAtLeastOnce.map(r => r.finalGrowth[key] || 0);
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
  };
  const avgWinRound = parseFloat(avgRound);
  const npcAtAvgRound = NPC_BASE_GROWTH + (Math.round(avgWinRound) - 1);
  console.log(`  (avg across ${wonAtLeastOnce.length} winning runs at time of win/run-end)`);
  console.log(`  Player — HP: ${avgStat('hp')}  STR: ${avgStat('str')}  AGI: ${avgStat('agi')}  INT: ${avgStat('int')}  LUK: ${avgStat('luk')}`);
  const playerTotal = GROWTH_STAT_KEYS.map(k => parseFloat(avgStat(k))).reduce((a, b) => a + b, 0);
  console.log(`  Player total growth sum: ${playerTotal.toFixed(1)}`);
  console.log(`  NPC at avg win round (r≈${Math.round(avgWinRound)}): all ${npcAtAvgRound} each → total ${npcAtAvgRound * 5}`);
  console.log(`  Player/NPC total ratio: ${(playerTotal / (npcAtAvgRound * 5)).toFixed(2)}x`);
} else {
  console.log('  No wins recorded.');
}
console.log('');

console.log('─── Runs That Never Won ────────────────────────────────────────');
const neverWon = results.filter(r => r.firstWinRound === null);
console.log(`  Count: ${neverWon.length} / ${NUM_RUNS} (${(neverWon.length / NUM_RUNS * 100).toFixed(1)}%)`);
if (neverWon.length > 0) {
  const bestStages = {};
  for (const r of neverWon) {
    const last = r.stagesPerRound[r.stagesPerRound.length - 1] || 'unknown';
    bestStages[last] = (bestStages[last] || 0) + 1;
  }
  for (const [stage, cnt] of Object.entries(bestStages).sort((a, b) => b[1] - a[1])) {
    console.log(`    Best stage reached: ${stage.padEnd(15)} × ${cnt} runs (${(cnt / neverWon.length * 100).toFixed(1)}%)`);
  }
}
console.log('');
console.log('═══════════════════════════════════════════════════════════════');
