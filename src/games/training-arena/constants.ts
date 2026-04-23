import type { GachaGrade, GrowthStatKey } from './types'

// ─── Gacha ────────────────────────────────────────────────────────────────────

export const GACHA_PULL_COUNT = 100

export const GACHA_PROBABILITIES: Record<GachaGrade, number> = {
  C:   0.40,
  B:   0.24,
  A:   0.14,
  S:   0.09,
  SS:  0.07,
  SSS: 0.06,
}

export const GACHA_STAT_GAINS: Record<GachaGrade, number> = {
  C:   1,
  B:   2,
  A:   3,
  S:   4,
  SS:  5,
  SSS: 6,
}

export const GACHA_GRADES: readonly GachaGrade[] = ['C', 'B', 'A', 'S', 'SS', 'SSS']

// ─── Skill ────────────────────────────────────────────────────────────────────

export const MAX_SKILL_SLOTS = 5
export const INITIAL_SKILL_COUNT = 3

// ─── Stats ────────────────────────────────────────────────────────────────────

export const MAX_GROWTH_STAT = 9999
export const INITIAL_PLAYER_STAT_POINTS = 140

export const GROWTH_STAT_KEYS: GrowthStatKey[] = ['hp', 'str', 'agi', 'int', 'luk']

// ─── Combat ───────────────────────────────────────────────────────────────────

export const MAX_ATB_GAUGE = 100
export const INITIAL_MANA_RATIO = 0.5       // 전투 시작 시 최대 마나의 50%
export const MANA_REGEN_COEFF = 0.001       // 턴당: maxMana × (hp+int) × 0.001
export const CRIT_BASE_MULTIPLIER = 1.5
export const CRIT_LUK_COEFF = 0.001         // 크리 배율 = 1.5 + luk × 0.001
export const CRIT_MULTIPLIER_CAP = 3.0
export const MIN_DAMAGE = 1
export const MAX_TURNS = 50

// 데미지: atk × multiplier × DEF_FORMULA_BASE / (DEF_FORMULA_BASE + def)
export const DEF_FORMULA_BASE = 100

// ─── HP 회복 ──────────────────────────────────────────────────────────────────

export const INTER_MATCH_HP_REGEN_RATIO = 0.30  // 경기 사이 max HP × 30% 회복

// ─── Tournament ───────────────────────────────────────────────────────────────

export const QUALIFIER_TARGET = 32
export const GROUP_COUNT = 8
export const GROUP_SIZE = 4
export const GROUP_QUALIFIERS_PER_GROUP = 2
export const TOURNAMENT_SIZE = 16
export const DARKHORSE_RATIO = 0.30

// ─── Character Unlock ─────────────────────────────────────────────────────────

// 처음 선택 가능한 5캐릭터 (탱커/버서커/어쌔신/레인저/마법사)
export const INITIAL_UNLOCKED_CHAR_IDS = [1, 2, 3, 4, 5]

// NPC 초기 성장 스탯 기본값
export const NPC_BASE_GROWTH = 30

// ─── Save Slots ───────────────────────────────────────────────────────────────

export const MAX_SAVE_SLOTS = 3

// ─── Rewards ─────────────────────────────────────────────────────────────────

export const REWARD_WINNER = 10
export const REWARD_FINALIST = 7
export const REWARD_TOURNAMENT_OUT = 4
export const REWARD_DARKHORSE = 8
export const PLAYER_EXTRA_STAT_POINTS = 4

// ─── Archetype Growth Coefficients ───────────────────────────────────────────
// 각 계수의 의미:
//   hp_to_maxHp : HP 성장 1당 maxHp 증가
//   str_to_atk  : STR 성장 1당 ATK 증가
//   str_to_def  : STR 성장 1당 DEF 증가
//   agi_to_spd  : AGI 성장 1당 SPD 증가
//   agi_to_eva  : AGI 성장 1당 EVA 증가
//   luk_to_crit : LUK 성장 1당 CRIT 증가
//   int_to_mana : INT 성장 1당 maxMana 증가
//   hp_to_def   : HP 성장 1당 DEF 추가 보너스
//   int_to_atk  : INT 성장 1당 ATK 추가 보너스
//   int_to_spd  : INT 성장 1당 SPD 추가 보너스
//   luk_to_eva  : LUK 성장 1당 EVA 추가 보너스
//   str_to_crit : STR 성장 1당 CRIT 추가 보너스
//   int_to_maxHp: INT 성장 1당 maxHp 추가 보너스

export interface ArchetypeCoeffs {
  hp_to_maxHp: number
  str_to_atk:  number
  str_to_def:  number
  agi_to_spd:  number
  agi_to_eva:  number
  luk_to_crit: number
  int_to_mana: number
  hp_to_def:   number
  int_to_atk:  number
  int_to_spd:  number
  luk_to_eva:  number
  str_to_crit: number
  int_to_maxHp:number
  str_to_spd:  number
}

const DEFAULT_COEFFS: ArchetypeCoeffs = {
  hp_to_maxHp: 10, str_to_atk: 3, str_to_def: 1, agi_to_spd: 2,
  agi_to_eva: 0.5, luk_to_crit: 0.5, int_to_mana: 5,
  hp_to_def: 0, int_to_atk: 0, int_to_spd: 0, luk_to_eva: 0,
  str_to_crit: 0, int_to_maxHp: 0, str_to_spd: 0,
}

export const ARCHETYPE_GROWTH_COEFFS: Record<string, ArchetypeCoeffs> = {
  // 탱크: 체력·방어 중심, 공격력 보강
  tank:      { ...DEFAULT_COEFFS, hp_to_maxHp: 10, str_to_atk: 3.0, str_to_def: 1.5, hp_to_def: 0.1, str_to_spd: 0.3 },
  // 버서커: 높은 공격·크리 (과도한 폭발 억제)
  berserker: { ...DEFAULT_COEFFS, hp_to_maxHp: 8,  str_to_atk: 4, luk_to_crit: 0.7, str_to_crit: 0.2 },
  // 어쌔신: 기본 스탯이 이미 강해 성장 배율 완화, 회피 강화
  assassin:  { ...DEFAULT_COEFFS, str_to_atk: 2.2, agi_to_spd: 2.0, luk_to_crit: 0.5, luk_to_eva: 0.4 },
  // 레인저: 크리 계수 소폭 상향 (LOW 구간 탈출)
  ranger:    { ...DEFAULT_COEFFS, luk_to_crit: 0.4 },
  // 마법사: INT→공격·속도 보너스, 마나 대폭 증가, STR→공격 소폭 상향
  mage:      { ...DEFAULT_COEFFS, str_to_atk: 1.5, int_to_mana: 8, int_to_atk: 1.5, int_to_spd: 0.5 },
  // 성기사: 높은 체력·방어, INT→체력 보너스
  paladin:   { ...DEFAULT_COEFFS, hp_to_maxHp: 12, str_to_atk: 2, str_to_def: 2, int_to_maxHp: 3 },
  // 서포트: INT→속도·마나·공격, LUK→회피
  support:   { ...DEFAULT_COEFFS, str_to_atk: 2.5, luk_to_crit: 0.3, int_to_mana: 7, int_to_spd: 0.3, luk_to_eva: 0.3, int_to_atk: 0.4 },
  // 워리어: STR→공격 소폭 상향 (균형)
  warrior:   { ...DEFAULT_COEFFS, str_to_atk: 3.5 },
}
