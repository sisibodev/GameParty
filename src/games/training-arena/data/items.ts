import type { ItemDef } from '../types'

// v0.4.2 Phase 2 MVP — 스탯 아이템만
// 등급별 가격대: common 20–50 / rare 60–120 / hero 150–300 / legend 400–800
// 스탯 보너스(영구): common +3 / rare +7 / hero +15 / legend +30

export const ITEMS: ItemDef[] = [
  // ─── Common ─────────────────────────────────────────────
  { id: 'hp_amulet_c',  name: '튼튼 부적',      tier: 'common', kind: 'stat', price: 30,  description: 'VIT +3', statBonus: { vit: 3 } },
  { id: 'str_gauntlet_c', name: '가죽 장갑',    tier: 'common', kind: 'stat', price: 35,  description: 'STR +3', statBonus: { str: 3 } },
  { id: 'agi_boots_c',  name: '가벼운 신발',    tier: 'common', kind: 'stat', price: 30,  description: 'AGI +3', statBonus: { agi: 3 } },
  { id: 'int_scroll_c', name: '수련 두루마리',  tier: 'common', kind: 'stat', price: 35,  description: 'INT +3', statBonus: { int: 3 } },
  { id: 'luk_coin_c',   name: '행운의 동전',    tier: 'common', kind: 'stat', price: 40,  description: 'LUK +3', statBonus: { luk: 3 } },

  // ─── Rare ───────────────────────────────────────────────
  { id: 'hp_shield_r',   name: '은제 방패',     tier: 'rare',   kind: 'stat', price: 80,  description: 'VIT +7', statBonus: { vit: 7 } },
  { id: 'str_sword_r',   name: '강철 검',       tier: 'rare',   kind: 'stat', price: 90,  description: 'STR +7', statBonus: { str: 7 } },
  { id: 'agi_cloak_r',   name: '민첩의 망토',   tier: 'rare',   kind: 'stat', price: 80,  description: 'AGI +7', statBonus: { agi: 7 } },
  { id: 'int_tome_r',    name: '마법서',        tier: 'rare',   kind: 'stat', price: 90,  description: 'INT +7', statBonus: { int: 7 } },
  { id: 'luk_charm_r',   name: '네잎 클로버',   tier: 'rare',   kind: 'stat', price: 100, description: 'LUK +7', statBonus: { luk: 7 } },

  // ─── Hero ───────────────────────────────────────────────
  { id: 'hp_heart_h',    name: '거인의 심장',   tier: 'hero',   kind: 'stat', price: 220, description: 'VIT +15', statBonus: { vit: 15 } },
  { id: 'str_hammer_h',  name: '전쟁의 망치',   tier: 'hero',   kind: 'stat', price: 250, description: 'STR +15', statBonus: { str: 15 } },
  { id: 'agi_wind_h',    name: '바람의 신발',   tier: 'hero',   kind: 'stat', price: 220, description: 'AGI +15', statBonus: { agi: 15 } },
  { id: 'int_crown_h',   name: '지혜의 관',     tier: 'hero',   kind: 'stat', price: 250, description: 'INT +15', statBonus: { int: 15 } },
  { id: 'luk_gem_h',     name: '행운의 보석',   tier: 'hero',   kind: 'stat', price: 280, description: 'LUK +15', statBonus: { luk: 15 } },

  // ─── Legend ─────────────────────────────────────────────
  { id: 'hp_titan_l',    name: '타이탄의 심장', tier: 'legend', kind: 'stat', price: 600, description: 'VIT +30', statBonus: { vit: 30 } },
  { id: 'str_god_l',     name: '신의 완력',     tier: 'legend', kind: 'stat', price: 650, description: 'STR +30', statBonus: { str: 30 } },
  { id: 'agi_light_l',   name: '빛의 속도',     tier: 'legend', kind: 'stat', price: 600, description: 'AGI +30', statBonus: { agi: 30 } },
  { id: 'int_cosmos_l',  name: '우주의 지식',   tier: 'legend', kind: 'stat', price: 650, description: 'INT +30', statBonus: { int: 30 } },
  { id: 'luk_fate_l',    name: '운명의 주사위', tier: 'legend', kind: 'stat', price: 750, description: 'LUK +30', statBonus: { luk: 30 } },

  // ─── Combat (v0.4.2 Phase 2.5) ─────────────────────────
  { id: 'poison_dagger',  name: '독 단검',       tier: 'rare',   kind: 'combat', price: 180, description: '내 턴 시작 시 상대에게 고정 5 피해', combatEffect: { poisonDot: 5 } },
  { id: 'mana_seal',      name: '마력 봉인',     tier: 'hero',   kind: 'combat', price: 280, description: '경기 시작 시 상대 스킬 1턴 봉인',   combatEffect: { manaSealTurns: 1 } },
  { id: 'vampire_ring',   name: '흡혈 반지',     tier: 'hero',   kind: 'combat', price: 320, description: '가한 피해의 10% 회복',              combatEffect: { vampireHealPct: 10 } },
  { id: 'indomitable',    name: '불굴의 투지',   tier: 'legend', kind: 'combat', price: 600, description: 'HP 20% 이하일 때 DEF +50%',         combatEffect: { indomitableDefPct: 50 } },

  // ─── Utility (v0.4.2 Phase 2.5) ────────────────────────
  { id: 'golden_glove',   name: '황금 장갑',     tier: 'rare',   kind: 'utility', price: 220, description: '라운드 종료 골드 ×1.3', goldMultiplier: 1.3 },
]

// v0.4.2 Phase 2.5 — 전투 발동 아이템 효과 합산 (복수 장착 시 누적)
export function sumCombatEffect(
  itemIds: readonly string[] | undefined,
  field: keyof NonNullable<ItemDef['combatEffect']>,
): number {
  if (!itemIds || itemIds.length === 0) return 0
  let total = 0
  for (const id of itemIds) {
    const item = getItemById(id)
    const v = item?.combatEffect?.[field]
    if (typeof v === 'number') total += v
  }
  return total
}

export function sumGoldMultiplier(itemIds: readonly string[] | undefined): number {
  if (!itemIds || itemIds.length === 0) return 1
  let mult = 1
  for (const id of itemIds) {
    const item = getItemById(id)
    if (typeof item?.goldMultiplier === 'number') mult *= item.goldMultiplier
  }
  return mult
}

export function getItemById(id: string): ItemDef | undefined {
  return ITEMS.find(it => it.id === id)
}

export function itemsByTier(tier: ItemDef['tier']): ItemDef[] {
  return ITEMS.filter(it => it.tier === tier)
}
