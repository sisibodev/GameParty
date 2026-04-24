import type { TacticCard } from '../types'

// v0.4.2 Phase 3 — 전술 카드 고정 8종 (매 전투 1장 선택 or 미사용, 소모 없음)
export const TACTIC_CARDS: readonly TacticCard[] = [
  { id: 'first_strike', name: '선제 공격',   description: '내 ATB +60으로 시작',                       hint: '스피드 열세 극복' },
  { id: 'barrier',      name: '방벽 전개',   description: '첫 피격 데미지 -70%',                       hint: '버스트 딜러 카운터' },
  { id: 'ambush',       name: '기습',        description: '내 첫 공격 크리 확정 + 데미지 ×1.3',        hint: '한 방 역전' },
  { id: 'mana_burst',   name: '마나 폭주',   description: '마나 초기치 +100%, 마나 리젠 +50% (5턴)',   hint: '스킬 난사형' },
  { id: 'curse',        name: '저주',        description: '상대 ATK -30%, DEF -20% (4턴)',             hint: '강캐 공격력 억제' },
  { id: 'potion',       name: '회복 물약',   description: 'HP 30% 이하 진입 시 HP 50% 자동 회복 (1회)', hint: '장기전 생존' },
  { id: 'insight',      name: '간파',        description: '상대 회피율 0, 내 크리율 +30% (전투 내내)',  hint: '회피형 카운터' },
  { id: 'last_stand',   name: '최후의 일격', description: 'HP 20% 이하에서 ATK +100%, SPD +30%',       hint: '빈사 역전' },
]

export function getTacticCard(id: string): TacticCard | undefined {
  return TACTIC_CARDS.find(c => c.id === id)
}
