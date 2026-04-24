import type { GachaGrade, GrowthStatKey, ItemTier, PlayerTournamentResult, SkillTier } from './types'

// ─── Gacha ────────────────────────────────────────────────────────────────────

// v0.4.1: 본 게임은 매 라운드 시작 시 모든 캐릭터가 1장씩 뽑음 (등급별 수치 범위).
// 시뮬레이션 모드는 기존 로직(GACHA_STAT_GAINS 고정값) 유지.

export const GACHA_PROBABILITIES: Record<GachaGrade, number> = {
  C:   0.40,
  B:   0.24,
  A:   0.14,
  S:   0.09,
  SS:  0.07,
  SSS: 0.06,
}

// 본 게임 v0.4.1 — 등급별 스탯 증가 범위 [min, max]
export const GACHA_STAT_RANGES: Record<GachaGrade, readonly [number, number]> = {
  C:   [1, 2],
  B:   [2, 4],
  A:   [4, 6],
  S:   [6, 9],
  SS:  [9, 13],
  SSS: [13, 18],
}

// 레거시 (시뮬레이션 모드 전용) — 고정값
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

// v0.4.1: 초기 스탯 고정 — 플레이어 1/1/1/1/1, NPC 10/10/10/10/10
export const INITIAL_PLAYER_STAT = 1
export const INITIAL_NPC_STAT = 10

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

// INT → 스킬 쿨다운 감소: INT 성장치 INT_CD_REDUCTION_PER 당 -1턴 (최대 -3)
export const INT_CD_REDUCTION_PER = 40

// 회피 상쇄: 공격자 SPD × 이 계수만큼 수비자 EVA 감소
export const AGI_EVA_COUNTER_COEFF = 0.3

// 행동 시 자연 회복: maxHp × 이 비율 (HP가 높은 직업일수록 유리)
export const HP_REGEN_PER_TURN_RATIO = 0.008

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

// v0.4.1: NPC 초기 성장 스탯 — 10 (전 스탯 공통, 라운드마다 +1씩 추가)
export const NPC_BASE_GROWTH = INITIAL_NPC_STAT

// ─── Save Slots ───────────────────────────────────────────────────────────────

export const MAX_SAVE_SLOTS = 3

// ─── Rewards ─────────────────────────────────────────────────────────────────

export const REWARD_WINNER = 10
export const REWARD_FINALIST = 7
export const REWARD_TOURNAMENT_OUT = 4
export const REWARD_DARKHORSE = 8
// v0.4.1: PLAYER_EXTRA_STAT_POINTS 제거 (스탯 배분 UI 삭제)

// ─── Gold / Shop (v0.4.2) ────────────────────────────────────────────────────
// 라운드 종료 시 플레이어 성적에 따른 일괄 골드 지급 (MVP: per-match 아님)

export const GOLD_BY_RESULT: Record<PlayerTournamentResult, number> = {
  winner:         400,
  finalist:       200,
  tournament_out: 100,
  group_out:       60,
  qualifier_out:   30,
}

// 상점 진열 수 및 리롤 비용 (UI 숨김)
export const SHOP_SIZE = 6
export const SHOP_REROLL_COST = 30

// 등급별 진열 확률 (라운드에 따라 상위 등급 확률 증가 로직은 Phase 2.5에서)
export const ITEM_TIER_PROBS: Record<ItemTier, number> = {
  common: 0.50,
  rare:   0.30,
  hero:   0.15,
  legend: 0.05,
}

export const ITEM_TIERS: readonly ItemTier[] = ['common', 'rare', 'hero', 'legend']

export const MAX_INVENTORY_SIZE = 100

// ─── Rival System (v0.4.3) ───────────────────────────────────────────────────
// 캐릭터 선택 시 랜덤 NPC 3명을 라이벌로 지정.
// 라이벌은 매 라운드 +5 스탯 누적 (라운드 N에서 누적 +5N).
// 라이벌전 승리 시 최종 골드 보상 ×2 배율 (MVP: 라운드 골드에 적용).

export const RIVAL_COUNT = 3
export const RIVAL_STAT_PER_ROUND = 5
export const RIVAL_GOLD_MULTIPLIER = 2

// ─── Skill Learn (v0.4.3) ────────────────────────────────────────────────────
// 전투 횟수 기반 학습 대기 (전투 1회 = 1차감)
export const SKILL_LEARN_TURNS: Record<SkillTier, number> = {
  common: 1,
  rare:   3,
  hero:   5,
  legend: 10,
}

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
  // 마법사: INT쌓을수록 속도·공격 증가 (느린 초반 → 강한 후반)
  mage:      { ...DEFAULT_COEFFS, str_to_atk: 1.5, int_to_mana: 8, int_to_atk: 2.0, int_to_spd: 1.2 },
  // 성기사: 높은 체력·방어, INT→체력·속도 보너스
  paladin:   { ...DEFAULT_COEFFS, hp_to_maxHp: 12, str_to_atk: 2, str_to_def: 2, int_to_maxHp: 3, int_to_spd: 0.7 },
  // 서포트: INT→속도·마나·공격, LUK→회피
  support:   { ...DEFAULT_COEFFS, str_to_atk: 2.5, luk_to_crit: 0.3, int_to_mana: 7, int_to_spd: 0.8, luk_to_eva: 0.3, int_to_atk: 0.4 },
  // 워리어: STR→공격 소폭 상향 (균형)
  warrior:   { ...DEFAULT_COEFFS, str_to_atk: 3.5 },
}
