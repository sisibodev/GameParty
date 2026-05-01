import type { Archetype, TacticCard, TacticEffect } from '../types'

type CardSeed = {
  key: string
  name: string
  description: string
  hint: string
  goodAgainst: [Archetype, Archetype]
  effect: TacticEffect
}

const ARCHETYPE_ORDER: Archetype[] = [
  'warrior',
  'mage',
  'assassin',
  'tank',
  'support',
  'ranger',
  'berserker',
  'paladin',
]

const ARCHETYPE_LABEL: Record<Archetype, string> = {
  warrior: '전사',
  mage: '법사',
  assassin: '암살자',
  tank: '탱커',
  support: '지원형',
  ranger: '궁수',
  berserker: '버서커',
  paladin: '성기사',
}

const CARD_SEEDS: Record<Archetype, CardSeed[]> = {
  warrior: [
    { key: 'shield_break', name: '방패 쪼개기', description: '첫 공격 피해 +45%', hint: '탱커·성기사의 방어선을 빠르게 흔듭니다.', goodAgainst: ['tank', 'paladin'], effect: { kind: 'initiative', gauge: 55 } },
    { key: 'line_guard', name: '전열 고정', description: '첫 피격 피해 -72%', hint: '버서커·암살자의 초반 폭딜을 받아냅니다.', goodAgainst: ['berserker', 'assassin'], effect: { kind: 'barrier', reduction_pct: 72 } },
    { key: 'duel_roar', name: '결투 포효', description: '첫 공격 확정 치명 + 피해 1.35배', hint: '법사·궁수처럼 체력이 낮은 상대를 압박합니다.', goodAgainst: ['mage', 'ranger'], effect: { kind: 'ambush', damage_mult_pct: 35 } },
    { key: 'breath_cycle', name: '호흡 순환', description: '초기 마나 +70%, 마나 회복 +40% (5턴)', hint: '지원형·성기사처럼 긴 교환을 거는 상대에게 좋습니다.', goodAgainst: ['support', 'paladin'], effect: { kind: 'mana_burst', initial_mana_pct: 70, regen_pct: 40, turns: 5 } },
    { key: 'armor_sunder', name: '갑옷 분쇄', description: '상대 ATK -25%, DEF -25% (4턴)', hint: '탱커·전사의 스탯 싸움을 약화합니다.', goodAgainst: ['tank', 'warrior'], effect: { kind: 'curse', atk_pct: -25, def_pct: -25, turns: 4 } },
    { key: 'field_dressing', name: '응급 붕대', description: 'HP 30% 이하 시 HP 45% 회복 (1회)', hint: '궁수·법사의 누적 피해를 버팁니다.', goodAgainst: ['ranger', 'mage'], effect: { kind: 'potion', heal_pct: 45 } },
    { key: 'stance_read', name: '자세 읽기', description: '상대 회피 0, 내 치명 +25%', hint: '암살자·궁수의 회피형 운영을 잡습니다.', goodAgainst: ['assassin', 'ranger'], effect: { kind: 'insight', crit_flat: 25 } },
    { key: 'last_banner', name: '마지막 군기', description: 'HP 20% 이하에서 ATK +100%, SPD +30%', hint: '버서커·전사와의 난전에서 역전각을 만듭니다.', goodAgainst: ['berserker', 'warrior'], effect: { kind: 'last_stand' } },
  ],
  mage: [
    { key: 'arcane_start', name: '비전 선점', description: 'ATB +60으로 시작', hint: '궁수·암살자보다 먼저 주문 각을 잡습니다.', goodAgainst: ['ranger', 'assassin'], effect: { kind: 'initiative', gauge: 60 } },
    { key: 'mirror_ward', name: '거울 결계', description: '첫 피격 피해 -70%', hint: '버서커·전사의 돌진 피해를 흡수합니다.', goodAgainst: ['berserker', 'warrior'], effect: { kind: 'barrier', reduction_pct: 70 } },
    { key: 'spark_ambush', name: '섬광 기습', description: '첫 공격 확정 치명 + 피해 1.25배', hint: '법사·지원형의 낮은 방어를 찌릅니다.', goodAgainst: ['mage', 'support'], effect: { kind: 'ambush', damage_mult_pct: 25 } },
    { key: 'mana_overflow', name: '마나 범람', description: '초기 마나 +110%, 마나 회복 +55% (5턴)', hint: '탱커·성기사 장기전에 강합니다.', goodAgainst: ['tank', 'paladin'], effect: { kind: 'mana_burst', initial_mana_pct: 110, regen_pct: 55, turns: 5 } },
    { key: 'hex_field', name: '약화 장막', description: '상대 ATK -30%, DEF -15% (4턴)', hint: '전사·버서커의 화력을 늦춥니다.', goodAgainst: ['warrior', 'berserker'], effect: { kind: 'curse', atk_pct: -30, def_pct: -15, turns: 4 } },
    { key: 'mana_shell', name: '마력 보호막', description: 'HP 30% 이하 시 HP 40% 회복 (1회)', hint: '암살자·궁수의 마무리를 한 번 끊습니다.', goodAgainst: ['assassin', 'ranger'], effect: { kind: 'potion', heal_pct: 40 } },
    { key: 'true_sight', name: '진실의 눈', description: '상대 회피 0, 내 치명 +20%', hint: '암살자·궁수를 안정적으로 맞힙니다.', goodAgainst: ['assassin', 'ranger'], effect: { kind: 'insight', crit_flat: 20 } },
    { key: 'dying_spell', name: '최후 주문', description: 'HP 20% 이하에서 ATK +100%, SPD +30%', hint: '탱커·성기사에게 막혔을 때 뚫는 카드입니다.', goodAgainst: ['tank', 'paladin'], effect: { kind: 'last_stand' } },
  ],
  assassin: [
    { key: 'shadow_step', name: '그림자 선점', description: 'ATB +65로 시작', hint: '법사·지원형에게 턴을 주기 전에 들어갑니다.', goodAgainst: ['mage', 'support'], effect: { kind: 'initiative', gauge: 65 } },
    { key: 'smoke_guard', name: '연막 회피', description: '첫 피격 피해 -65%', hint: '궁수·암살자의 맞기습을 견딥니다.', goodAgainst: ['ranger', 'assassin'], effect: { kind: 'barrier', reduction_pct: 65 } },
    { key: 'throat_cut', name: '목줄 끊기', description: '첫 공격 확정 치명 + 피해 1.45배', hint: '법사·궁수 상대로 킬 압박이 큽니다.', goodAgainst: ['mage', 'ranger'], effect: { kind: 'ambush', damage_mult_pct: 45 } },
    { key: 'silent_breath', name: '무음 호흡', description: '초기 마나 +70%, 마나 회복 +35% (5턴)', hint: '탱커·성기사처럼 버티는 상대에게 스킬 빈도를 올립니다.', goodAgainst: ['tank', 'paladin'], effect: { kind: 'mana_burst', initial_mana_pct: 70, regen_pct: 35, turns: 5 } },
    { key: 'poison_mark', name: '독 표식', description: '상대 ATK -20%, DEF -30% (4턴)', hint: '전사·탱커의 교환 효율을 낮춥니다.', goodAgainst: ['warrior', 'tank'], effect: { kind: 'curse', atk_pct: -20, def_pct: -30, turns: 4 } },
    { key: 'hidden_vial', name: '은닉 약병', description: 'HP 30% 이하 시 HP 42% 회복 (1회)', hint: '버서커·전사의 한 방을 넘깁니다.', goodAgainst: ['berserker', 'warrior'], effect: { kind: 'potion', heal_pct: 42 } },
    { key: 'weak_spot', name: '약점 조준', description: '상대 회피 0, 내 치명 +35%', hint: '암살자·궁수 미러전에 강합니다.', goodAgainst: ['assassin', 'ranger'], effect: { kind: 'insight', crit_flat: 35 } },
    { key: 'blood_escape', name: '혈흔 탈출', description: 'HP 20% 이하에서 ATK +100%, SPD +30%', hint: '버서커·전사에게 물렸을 때 역습합니다.', goodAgainst: ['berserker', 'warrior'], effect: { kind: 'last_stand' } },
  ],
  tank: [
    { key: 'body_check', name: '몸통 박치기', description: 'ATB +50으로 시작', hint: '법사·지원형의 준비 턴을 늦춥니다.', goodAgainst: ['mage', 'support'], effect: { kind: 'initiative', gauge: 50 } },
    { key: 'iron_wall', name: '철벽 전개', description: '첫 피격 피해 -80%', hint: '버서커·암살자의 첫 폭발을 무력화합니다.', goodAgainst: ['berserker', 'assassin'], effect: { kind: 'barrier', reduction_pct: 80 } },
    { key: 'shield_bash', name: '방패 강타', description: '첫 공격 확정 치명 + 피해 1.20배', hint: '궁수·법사에게 초반 압박을 넣습니다.', goodAgainst: ['ranger', 'mage'], effect: { kind: 'ambush', damage_mult_pct: 20 } },
    { key: 'steady_core', name: '전열 순환', description: '초기 마나 +60%, 마나 회복 +45% (5턴)', hint: '탱커·성기사 장기전을 버팁니다.', goodAgainst: ['tank', 'paladin'], effect: { kind: 'mana_burst', initial_mana_pct: 60, regen_pct: 45, turns: 5 } },
    { key: 'crushing_weight', name: '압살 중량', description: '상대 ATK -25%, DEF -20% (4턴)', hint: '전사·버서커의 맞딜을 둔화합니다.', goodAgainst: ['warrior', 'berserker'], effect: { kind: 'curse', atk_pct: -25, def_pct: -20, turns: 4 } },
    { key: 'reserve_ration', name: '예비 보급', description: 'HP 30% 이하 시 HP 55% 회복 (1회)', hint: '법사·궁수의 누적 딜을 받아냅니다.', goodAgainst: ['mage', 'ranger'], effect: { kind: 'potion', heal_pct: 55 } },
    { key: 'lock_target', name: '표적 고정', description: '상대 회피 0, 내 치명 +18%', hint: '암살자·궁수의 회피를 지웁니다.', goodAgainst: ['assassin', 'ranger'], effect: { kind: 'insight', crit_flat: 18 } },
    { key: 'fortress_oath', name: '요새의 맹세', description: 'HP 20% 이하에서 ATK +100%, SPD +30%', hint: '전사·성기사와의 소모전 끝을 노립니다.', goodAgainst: ['warrior', 'paladin'], effect: { kind: 'last_stand' } },
  ],
  support: [
    { key: 'tempo_call', name: '템포 콜', description: 'ATB +58로 시작', hint: '법사·궁수보다 먼저 보조기를 준비합니다.', goodAgainst: ['mage', 'ranger'], effect: { kind: 'initiative', gauge: 58 } },
    { key: 'safety_zone', name: '안전지대', description: '첫 피격 피해 -70%', hint: '암살자·버서커의 초반 킬각을 지웁니다.', goodAgainst: ['assassin', 'berserker'], effect: { kind: 'barrier', reduction_pct: 70 } },
    { key: 'opening_note', name: '개전 신호', description: '첫 공격 확정 치명 + 피해 1.20배', hint: '법사·지원형 미러전에서 선공 보상을 줍니다.', goodAgainst: ['mage', 'support'], effect: { kind: 'ambush', damage_mult_pct: 20 } },
    { key: 'focus_channel', name: '집중 채널', description: '초기 마나 +95%, 마나 회복 +60% (5턴)', hint: '탱커·성기사 상대로 지속력을 확보합니다.', goodAgainst: ['tank', 'paladin'], effect: { kind: 'mana_burst', initial_mana_pct: 95, regen_pct: 60, turns: 5 } },
    { key: 'fatigue_song', name: '피로의 노래', description: '상대 ATK -30%, DEF -15% (4턴)', hint: '전사·버서커의 압박을 누그러뜨립니다.', goodAgainst: ['warrior', 'berserker'], effect: { kind: 'curse', atk_pct: -30, def_pct: -15, turns: 4 } },
    { key: 'emergency_care', name: '응급 처치', description: 'HP 30% 이하 시 HP 50% 회복 (1회)', hint: '궁수·법사의 포킹을 버팁니다.', goodAgainst: ['ranger', 'mage'], effect: { kind: 'potion', heal_pct: 50 } },
    { key: 'battle_analysis', name: '전장 분석', description: '상대 회피 0, 내 치명 +22%', hint: '암살자·궁수의 회피 플랜을 끊습니다.', goodAgainst: ['assassin', 'ranger'], effect: { kind: 'insight', crit_flat: 22 } },
    { key: 'final_hymn', name: '최후 찬가', description: 'HP 20% 이하에서 ATK +100%, SPD +30%', hint: '탱커·성기사 장기전의 마무리 카드입니다.', goodAgainst: ['tank', 'paladin'], effect: { kind: 'last_stand' } },
  ],
  ranger: [
    { key: 'quick_draw', name: '속사 개시', description: 'ATB +65로 시작', hint: '법사·지원형보다 먼저 압박합니다.', goodAgainst: ['mage', 'support'], effect: { kind: 'initiative', gauge: 65 } },
    { key: 'wind_screen', name: '바람 장막', description: '첫 피격 피해 -65%', hint: '암살자·버서커의 접근 피해를 줄입니다.', goodAgainst: ['assassin', 'berserker'], effect: { kind: 'barrier', reduction_pct: 65 } },
    { key: 'vital_arrow', name: '급소 화살', description: '첫 공격 확정 치명 + 피해 1.35배', hint: '법사·지원형에게 초반 체력 압박을 줍니다.', goodAgainst: ['mage', 'support'], effect: { kind: 'ambush', damage_mult_pct: 35 } },
    { key: 'rhythm_reload', name: '리듬 장전', description: '초기 마나 +75%, 마나 회복 +40% (5턴)', hint: '탱커·성기사에게 긴 교전을 준비합니다.', goodAgainst: ['tank', 'paladin'], effect: { kind: 'mana_burst', initial_mana_pct: 75, regen_pct: 40, turns: 5 } },
    { key: 'pinning_shot', name: '제압 사격', description: '상대 ATK -25%, DEF -20% (4턴)', hint: '전사·버서커의 접근전을 약화합니다.', goodAgainst: ['warrior', 'berserker'], effect: { kind: 'curse', atk_pct: -25, def_pct: -20, turns: 4 } },
    { key: 'trail_medicine', name: '야전 약초', description: 'HP 30% 이하 시 HP 42% 회복 (1회)', hint: '법사·궁수 미러전의 누적 피해를 회복합니다.', goodAgainst: ['mage', 'ranger'], effect: { kind: 'potion', heal_pct: 42 } },
    { key: 'eagle_eye', name: '매의 눈', description: '상대 회피 0, 내 치명 +30%', hint: '암살자·궁수를 안정적으로 맞힙니다.', goodAgainst: ['assassin', 'ranger'], effect: { kind: 'insight', crit_flat: 30 } },
    { key: 'last_quiver', name: '마지막 화살통', description: 'HP 20% 이하에서 ATK +100%, SPD +30%', hint: '전사·버서커에게 붙잡힌 뒤 반격합니다.', goodAgainst: ['warrior', 'berserker'], effect: { kind: 'last_stand' } },
  ],
  berserker: [
    { key: 'blood_start', name: '피의 선점', description: 'ATB +58로 시작', hint: '법사·지원형을 준비 전에 몰아칩니다.', goodAgainst: ['mage', 'support'], effect: { kind: 'initiative', gauge: 58 } },
    { key: 'pain_eater', name: '고통 포식', description: '첫 피격 피해 -68%', hint: '암살자·궁수의 첫 타를 먹고 진입합니다.', goodAgainst: ['assassin', 'ranger'], effect: { kind: 'barrier', reduction_pct: 68 } },
    { key: 'skull_split', name: '두개골 가르기', description: '첫 공격 확정 치명 + 피해 1.50배', hint: '법사·궁수에게 가장 위협적인 한 방입니다.', goodAgainst: ['mage', 'ranger'], effect: { kind: 'ambush', damage_mult_pct: 50 } },
    { key: 'rage_breath', name: '분노 호흡', description: '초기 마나 +65%, 마나 회복 +35% (5턴)', hint: '탱커·성기사에게 막힐 때 스킬 회전을 보강합니다.', goodAgainst: ['tank', 'paladin'], effect: { kind: 'mana_burst', initial_mana_pct: 65, regen_pct: 35, turns: 5 } },
    { key: 'terror_howl', name: '공포의 포효', description: '상대 ATK -25%, DEF -25% (4턴)', hint: '전사·탱커의 맞교환을 무너뜨립니다.', goodAgainst: ['warrior', 'tank'], effect: { kind: 'curse', atk_pct: -25, def_pct: -25, turns: 4 } },
    { key: 'red_flask', name: '붉은 약병', description: 'HP 30% 이하 시 HP 48% 회복 (1회)', hint: '버서커·전사 난전에서 한 번 더 버팁니다.', goodAgainst: ['berserker', 'warrior'], effect: { kind: 'potion', heal_pct: 48 } },
    { key: 'predator_eye', name: '포식자의 눈', description: '상대 회피 0, 내 치명 +28%', hint: '암살자·궁수의 회피를 찍어 누릅니다.', goodAgainst: ['assassin', 'ranger'], effect: { kind: 'insight', crit_flat: 28 } },
    { key: 'death_frenzy', name: '죽음의 광란', description: 'HP 20% 이하에서 ATK +100%, SPD +30%', hint: '탱커·성기사의 버티기를 마지막에 찢습니다.', goodAgainst: ['tank', 'paladin'], effect: { kind: 'last_stand' } },
  ],
  paladin: [
    { key: 'holy_charge', name: '성전 돌입', description: 'ATB +55로 시작', hint: '법사·지원형을 먼저 압박합니다.', goodAgainst: ['mage', 'support'], effect: { kind: 'initiative', gauge: 55 } },
    { key: 'divine_aegis', name: '신성 방패', description: '첫 피격 피해 -76%', hint: '버서커·암살자 폭딜을 받아냅니다.', goodAgainst: ['berserker', 'assassin'], effect: { kind: 'barrier', reduction_pct: 76 } },
    { key: 'judgement', name: '심판의 일격', description: '첫 공격 확정 치명 + 피해 1.25배', hint: '법사·궁수에게 초반 응징을 넣습니다.', goodAgainst: ['mage', 'ranger'], effect: { kind: 'ambush', damage_mult_pct: 25 } },
    { key: 'prayer_cycle', name: '기도 순환', description: '초기 마나 +90%, 마나 회복 +50% (5턴)', hint: '탱커·성기사 장기전에 맞춥니다.', goodAgainst: ['tank', 'paladin'], effect: { kind: 'mana_burst', initial_mana_pct: 90, regen_pct: 50, turns: 5 } },
    { key: 'repentance', name: '회개의 낙인', description: '상대 ATK -28%, DEF -18% (4턴)', hint: '전사·버서커의 공격성을 꺾습니다.', goodAgainst: ['warrior', 'berserker'], effect: { kind: 'curse', atk_pct: -28, def_pct: -18, turns: 4 } },
    { key: 'lay_on_hands', name: '축복의 손길', description: 'HP 30% 이하 시 HP 52% 회복 (1회)', hint: '법사·궁수의 누적 피해를 회복합니다.', goodAgainst: ['mage', 'ranger'], effect: { kind: 'potion', heal_pct: 52 } },
    { key: 'sacred_sight', name: '성스러운 시야', description: '상대 회피 0, 내 치명 +24%', hint: '암살자·궁수를 놓치지 않습니다.', goodAgainst: ['assassin', 'ranger'], effect: { kind: 'insight', crit_flat: 24 } },
    { key: 'martyr_oath', name: '순교 맹세', description: 'HP 20% 이하에서 ATK +100%, SPD +30%', hint: '탱커·성기사 소모전의 종결 카드입니다.', goodAgainst: ['tank', 'paladin'], effect: { kind: 'last_stand' } },
  ],
}

export const TACTIC_CARDS: readonly TacticCard[] = ARCHETYPE_ORDER.flatMap(archetype =>
  CARD_SEEDS[archetype].map(card => ({
    id: `${archetype}_${card.key}`,
    archetype,
    name: `${ARCHETYPE_LABEL[archetype]} · ${card.name}`,
    description: card.description,
    hint: card.hint,
    goodAgainst: [...card.goodAgainst],
    effect: card.effect,
  })),
)

export function getTacticCard(id: string): TacticCard | undefined {
  return TACTIC_CARDS.find(c => c.id === id)
}

export function getTacticCardsForArchetype(archetype: Archetype): readonly TacticCard[] {
  return TACTIC_CARDS.filter(c => c.archetype === archetype)
}
