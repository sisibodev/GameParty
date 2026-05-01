import type { TacticCard } from '../types'

// v0.4.2 Phase 3 — 전술 카드 (매 전투 1장 선택 or 미사용, 소모 없음)
// v0.10.0 — validFor 필드 추가, 아케타입별 전용 카드 6종 추가
export const TACTIC_CARDS: readonly TacticCard[] = [
  { id: 'first_strike',    name: '선제 공격',   validFor: ['warrior', 'assassin', 'ranger', 'berserker'],    description: '내 ATB +60으로 시작',                          hint: '스피드 열세 극복' },
  { id: 'barrier',         name: '방벽 전개',   validFor: ['warrior', 'tank', 'paladin'],                    description: '첫 피격 데미지 -70%',                          hint: '버스트 딜러 카운터' },
  { id: 'ambush',          name: '기습',        validFor: ['warrior', 'assassin', 'berserker'],              description: '내 첫 공격 크리 확정 + 데미지 ×1.3',          hint: '한 방 역전' },
  { id: 'mana_burst',      name: '마나 폭주',   validFor: ['mage', 'support'],                               description: '마나 초기치 +100%, 마나 리젠 +50% (5턴)',      hint: '스킬 난사형' },
  { id: 'curse',           name: '저주',        validFor: ['mage', 'support', 'ranger'],                     description: '상대 ATK -30%, DEF -20% (4턴)',                 hint: '강캐 공격력 억제' },
  { id: 'potion',          name: '회복 물약',   validFor: ['warrior', 'tank', 'paladin', 'support'],         description: 'HP 30% 이하 진입 시 HP 50% 자동 회복 (1회)',   hint: '장기전 생존' },
  { id: 'insight',         name: '간파',        validFor: ['mage', 'assassin', 'ranger'],                    description: '상대 회피율 0, 내 크리율 +30% (전투 내내)',     hint: '회피형 카운터' },
  { id: 'last_stand',      name: '최후의 일격', validFor: ['warrior', 'berserker', 'paladin'],               description: 'HP 20% 이하에서 ATK +100%, SPD +30%',          hint: '빈사 역전' },
  { id: 'berserker_fury',  name: '광폭화',      validFor: ['berserker'],                                     description: 'HP 50% 이하 진입 시 ATK +50%, 받는 피해 +20%', hint: '빈사 역전 특화' },
  { id: 'arcane_amplify',  name: '마법 증폭',   validFor: ['mage'],                                          description: '마법 ATK +40%, 마법 관통 +20% (전투 내내)',     hint: '마법 딜 극대화' },
  { id: 'shadow_walk',     name: '그림자 걸음', validFor: ['assassin'],                                      description: '회피율 +25%, 첫 3턴 공격 크리 확정',            hint: '기습 연속 크리' },
  { id: 'fortress_stance', name: '요새 자세',   validFor: ['tank'],                                          description: 'DEF +60%, ATK -15%, HP 자연 회복 2배',         hint: '극한 방어 특화' },
  { id: 'holy_aura',       name: '신성 기운',   validFor: ['paladin', 'support'],                            description: '매 턴 HP 1.5% 회복, 디버프 지속시간 -1',       hint: '지속전 생존 특화' },
  { id: 'rapid_shot',      name: '신속 사격',   validFor: ['ranger'],                                        description: '상대 회피율 0, 첫 공격 2회 연속 (각 70% 위력)', hint: '회피 무력화' },
]

export function getTacticCard(id: string): TacticCard | undefined {
  return TACTIC_CARDS.find(c => c.id === id)
}
