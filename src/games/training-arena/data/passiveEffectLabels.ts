export const PASSIVE_EFFECT_LABELS: Record<string, string> = {
  execute_bonus:    '약자 처형',
  stat_boost:       '스탯 강화',
  lifesteal:        '생명력 흡수',
  thorns:           '가시 반격',
  iron_will:        '불굴의 의지',
  berserker_rage:   '광전사의 분노',
  regen:            'HP 재생',
  last_stand_spd:   '최후의 질주',
  battle_focus:     '전투 집중',
  crit_boost:       '치명타 강화',
  mana_shield:      '마나 보호막',
  counter_attack:   '반격',
  evasion_boost:    '회피 강화',
  vampiric:         '흡혈',
  elemental_boost:  '원소 강화',
}

export function getPassiveEffectLabel(type: string): string {
  return PASSIVE_EFFECT_LABELS[type] ?? type
}
