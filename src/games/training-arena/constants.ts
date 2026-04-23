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

export const MAX_SKILL_SLOTS = 8
export const INITIAL_SKILL_COUNT = 3

// ─── Stats ────────────────────────────────────────────────────────────────────

export const MAX_GROWTH_STAT = 9999
export const INITIAL_PLAYER_STAT_POINTS = 20

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
export const REWARD_TOURNAMENT_OUT = 3
export const REWARD_DARKHORSE = 5
export const PLAYER_EXTRA_STAT_POINTS = 10
