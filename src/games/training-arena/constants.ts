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

export const MAX_SKILL_SLOTS = 6
export const INITIAL_SKILL_COUNT = 3

// ─── Skill Enhancement (v0.5.0) ───────────────────────────────────────────────
// 골드 소비로 스킬 강화 (최대 10레벨)

export const MAX_SKILL_ENHANCE_LEVEL = 10
// 강화 비용: level 1→2, 2→3, ..., 9→10
export const SKILL_ENHANCE_COSTS: readonly number[] = [50, 100, 200, 350, 500, 700, 1000, 1400, 2000, 3000]
// 강화 효과 배율: level 1=+10%, 2=+20%, ..., 10=+190% (누적)
export const SKILL_ENHANCE_MULT: readonly number[] = [0.10, 0.20, 0.32, 0.46, 0.62, 0.80, 1.00, 1.25, 1.55, 1.90]

// ─── Passive Skill (v0.5.0) ──────────────────────────────────────────────────
// 캐릭터당 최대 6개 패시브 보유

export const MAX_PASSIVE_SLOTS = 6

// NPC 골드 시뮬레이션: 토너먼트 내 NPC가 이 이상 골드 보유 시 스킬 강화 시도
export const NPC_ENHANCE_GOLD_THRESHOLD = 200

// ─── Stats ────────────────────────────────────────────────────────────────────

export const MAX_GROWTH_STAT = 9999

// v0.5.0: 초기 스탯 고정 — 플레이어 1/1/1/1/1, NPC 1/1/1/1/1 (라운드마다 +1)
export const INITIAL_PLAYER_STAT = 1
export const INITIAL_NPC_STAT = 1

// v0.7.0: 성장 스탯 5개 — VIT/STR/AGI/INT/LUK (기존 hp → vit 마이그레이션)
export const GROWTH_STAT_KEYS: GrowthStatKey[] = ['vit', 'str', 'agi', 'int', 'luk']

// ─── Combat ───────────────────────────────────────────────────────────────────

export const MAX_ATB_GAUGE = 100
export const INITIAL_MANA_RATIO = 0.5       // 전투 시작 시 최대 마나의 50%
export const MANA_REGEN_COEFF = 0.001       // 턴당: maxMana × (hp+int) × 0.001
export const CRIT_BASE_MULTIPLIER = 1.5
export const CRIT_LUK_COEFF = 0.001         // 크리 배율 = 1.5 + luk × 0.001
export const CRIT_MULTIPLIER_CAP = 3.0
export const MIN_DAMAGE = 1
export const MAX_TURNS = 50

// INT → 스킬 쿨다운 감소: INT 성장치 INT_CD_REDUCTION_PER 당 -1턴 (최대 -3)
export const INT_CD_REDUCTION_PER = 40

// 데미지 공식: base = mult · ATK²/(ATK+oppATK), K/(K+DEF) 감쇠
// K가 클수록 DEF 영향 약함 (DEF=100 → 80% 감쇠, DEF=400 → 50% 감쇠)
export const DAMAGE_DEF_K = 400
// 최소 명중률 (회피 메커니즘)
export const MIN_HIT_CHANCE = 10  // 최소 10% 명중 보장

// 행동 시 자연 회복: maxHp × 이 비율 (HP가 높은 직업일수록 유리)
export const HP_REGEN_PER_TURN_RATIO = 0.008

// ─── HP 회복 ──────────────────────────────────────────────────────────────────

export const INTER_MATCH_HP_REGEN_RATIO = 0.10  // 경기 사이 max HP × 10% 회복 (단계 전환 시 풀피)

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
  winner:         800,
  finalist:       400,
  tournament_out: 200,
  group_out:      120,
  qualifier_out:   60,
}

// 경기별 즉시 지급 골드 (v0.8.0): 라운드 종료 보상과 별개로 경기 직후 지급
export const MATCH_BONUS_GOLD_WIN: Record<string, number> = {
  qualifier:   30,
  group:       60,
  bracket_r1:  80,
  bracket_r2: 120,
  bracket_r3: 160,
  bracket_r4: 200,
}
export const MATCH_BONUS_GOLD_LOSS = 10

// 상점 진열 수 및 리롤 비용 (UI 숨김)
export const SHOP_SIZE = 8
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

// ─── Archetype Growth Coefficients (v0.7.0) ──────────────────────────────────
// 각 계수의 의미 (성장 1포인트당 해당 전투 스탯 증가):
//   1차 변환 (스탯 정의):
//     vit_to_maxHp, vit_to_pDef        : VIT → 체력·물리방어
//     str_to_pAtk,  str_to_pDef        : STR → 물리공격·물리방어
//     int_to_mAtk,  int_to_mDef        : INT → 마법공격·마법방어
//     int_to_maxMana                   : INT → 마나
//     agi_to_spd,   agi_to_acc, agi_to_eva : AGI → 속도·명중·회피
//     luk_to_crit,  luk_to_critDmg     : LUK → 치명타·치명타배율
//   보조 (Phase 4 에서 직군별로 부여, 영점 시작):
//     vit_to_pAtk, vit_to_mAtk, vit_to_mDef
//     str_to_mAtk, str_to_crit, str_to_spd
//     agi_to_pAtk, agi_to_critDmg
//     int_to_pAtk, int_to_spd, int_to_pDef
//     luk_to_eva,  luk_to_acc

export interface ArchetypeCoeffs {
  // 1차
  vit_to_maxHp:  number
  vit_to_pDef:   number
  str_to_pAtk:   number
  str_to_pDef:   number
  int_to_mAtk:   number
  int_to_mDef:   number
  int_to_maxMana:number
  agi_to_spd:    number
  agi_to_acc:    number
  agi_to_eva:    number
  luk_to_crit:   number
  luk_to_critDmg:number
  // 보조 (Phase 4 부여)
  vit_to_pAtk:   number
  vit_to_mAtk:   number
  vit_to_mDef:   number
  str_to_mAtk:   number
  str_to_crit:   number
  str_to_spd:    number
  agi_to_pAtk:   number
  agi_to_critDmg:number
  int_to_pAtk:   number
  int_to_spd:    number
  int_to_pDef:   number
  luk_to_eva:    number
  luk_to_acc:    number
}

// v0.7.0 영점 베이스 — 1차 변환만 활성, 보조는 모두 0
const DEFAULT_COEFFS_V2: ArchetypeCoeffs = {
  // 1차
  vit_to_maxHp:   10,
  vit_to_pDef:    0.5,
  str_to_pAtk:    3,
  str_to_pDef:    0.5,
  int_to_mAtk:    3,
  int_to_mDef:    1,
  int_to_maxMana: 5,
  agi_to_spd:     2,
  agi_to_acc:     0.5,
  agi_to_eva:     0.5,
  luk_to_crit:    0.5,
  luk_to_critDmg: 0.001,
  // 보조 (Phase 4 부여)
  vit_to_pAtk:    0,
  vit_to_mAtk:    0,
  vit_to_mDef:    0.5,
  str_to_mAtk:    0,
  str_to_crit:    0,
  str_to_spd:     0,
  agi_to_pAtk:    0,
  agi_to_critDmg: 0,
  int_to_pAtk:    0,
  int_to_spd:     0,
  int_to_pDef:    0,
  luk_to_eva:     0,
  luk_to_acc:     0,
}

// Phase 4 직군별 보조 계수 튜닝
export const ARCHETYPE_GROWTH_COEFFS: Record<string, ArchetypeCoeffs> = {
  warrior:   { ...DEFAULT_COEFFS_V2 },
  berserker: { ...DEFAULT_COEFFS_V2, str_to_crit: 0.5 },
  assassin:  { ...DEFAULT_COEFFS_V2 },                           // 순수 속도 정체성 (base AGI로만)
  ranger:    { ...DEFAULT_COEFFS_V2, luk_to_acc: 0.3 },
  mage:      { ...DEFAULT_COEFFS_V2, int_to_mAtk: 3.0, int_to_spd: 0.15 },
  paladin:   { ...DEFAULT_COEFFS_V2, int_to_mAtk: 2.5, vit_to_pAtk: 0.5 },
  support:   { ...DEFAULT_COEFFS_V2, int_to_mAtk: 3.0, int_to_spd: 0 },
  tank:      { ...DEFAULT_COEFFS_V2, vit_to_pAtk: 0.5 },
}
