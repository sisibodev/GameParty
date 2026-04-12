import type { Card, SpecialCardType, InfoCardType, RoundCardType } from '../types'

let _cardSeq = 0
function newCardId() { return `c${Date.now()}-${_cardSeq++}` }

// ─── 기본 지급 특수 카드 (8장) ────────────────────────────────────────────────

export function createStarterCards(): Card[] {
  const types: [SpecialCardType, number][] = [
    ['surge', 3],
    ['drop', 2],
    ['boom', 1],
    ['crash', 1],
    ['reversal', 1],
  ]
  const cards: Card[] = []
  for (const [type, count] of types) {
    for (let i = 0; i < count; i++) {
      cards.push({ id: newCardId(), type, category: 'special', used: false })
    }
  }
  return cards
}

// ─── 드래프트 / 보너스 풀 ────────────────────────────────────────────────────

const DRAFT_SPECIAL_POOL: SpecialCardType[] = [
  'small_surge', 'small_surge',
  'small_drop', 'small_drop',
  'surge', 'surge',
  'drop', 'drop',
  'boom',
  'crash',
  'reversal',
]

const DRAFT_INFO_POOL: InfoCardType[] = [
  'trend', 'trend',
  'detect', 'detect',
  'shadow',
  'whistleblower',
  'market_scan',
  'portfolio_scan',
  'premium',
]

export function drawDraftOptions(): [Card, Card] {
  const pool = [...DRAFT_SPECIAL_POOL, ...DRAFT_INFO_POOL]
  const shuffled = pool.sort(() => Math.random() - 0.5)
  const a = shuffled[0] as SpecialCardType | InfoCardType
  const b = shuffled[1] as SpecialCardType | InfoCardType
  const catA = DRAFT_SPECIAL_POOL.includes(a as SpecialCardType) ? 'special' : 'info'
  const catB = DRAFT_SPECIAL_POOL.includes(b as SpecialCardType) ? 'special' : 'info'
  return [
    { id: newCardId(), type: a, category: catA as 'special' | 'info', used: false },
    { id: newCardId(), type: b, category: catB as 'special' | 'info', used: false },
  ]
}

export function drawBonusCards(count: number): Card[] {
  const pool = [...DRAFT_SPECIAL_POOL, ...DRAFT_INFO_POOL]
  const shuffled = pool.sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count).map(type => {
    const cat = DRAFT_SPECIAL_POOL.includes(type as SpecialCardType) ? 'special' : 'info'
    return { id: newCardId(), type: type as SpecialCardType | InfoCardType, category: cat as 'special' | 'info', used: false }
  })
}

// ─── 라운드 카드 ─────────────────────────────────────────────────────────────

const ROUND_CARD_POOL: RoundCardType[] = [
  'market_boom', 'market_crash',
  'big_boom', 'big_crash',
  'volatility_up', 'volatility_down',
  'reversal_day', 'calm',
  'polarization', 'bubble',
  'panic', 'rate_hike',
  'liquidity', 'news_blackout',
]

export function drawRoundCard(): RoundCardType {
  return ROUND_CARD_POOL[Math.floor(Math.random() * ROUND_CARD_POOL.length)]
}

// ─── 카드 표시 이름 / 설명 ────────────────────────────────────────────────────

export const CARD_LABEL: Record<string, string> = {
  small_surge: '소급등',
  small_drop: '소급락',
  surge: '급등',
  drop: '급락',
  boom: '폭등',
  crash: '폭락',
  reversal: '반전',
  trend: '등락 예보',
  detect: '카드 탐지',
  shadow: '미행',
  whistleblower: '내부고발',
  market_scan: '시장 스캔',
  portfolio_scan: '포트폴리오 스캔',
  premium: '특급 카드',
  market_boom: '시장 활황',
  market_crash: '시장 폭락',
  big_boom: '대호재',
  big_crash: '대폭락',
  volatility_up: '변동성 확대',
  volatility_down: '변동성 축소',
  reversal_day: '역전의 날',
  calm: '무풍지대',
  polarization: '양극화',
  bubble: '버블',
  panic: '공황',
  rate_hike: '금리 인상',
  liquidity: '유동성 장세',
  news_blackout: '뉴스 블랙아웃',
}

export const CARD_DESC: Record<string, string> = {
  small_surge: '이번 라운드 수익률 +10%p',
  small_drop: '이번 라운드 수익률 -10%p',
  surge: '이번 라운드 수익률 +20%p',
  drop: '이번 라운드 수익률 -20%p',
  boom: '이번 라운드 수익률 ×2',
  crash: '이번 라운드 수익률 ×0.5',
  reversal: '이번 라운드 수익률 부호 반전',
  trend: '선택한 회사의 순수 등락 방향 공개 (▲/▼)',
  detect: '선택한 회사에 사용된 특수 카드 총 장수 공개',
  shadow: '선택한 플레이어가 투자한 회사 목록 공개',
  whistleblower: '특수 카드가 가장 많이 쌓인 회사 1곳 공개',
  market_scan: '전체 회사 순수 등락 상위 2개 / 하위 2개 공개',
  portfolio_scan: '선택한 플레이어의 보유 종목 목록 공개',
  premium: '이번 라운드 특수 카드 +1장, 정보 카드 +1장',
  market_boom: '전 종목 수익률 +10%p',
  market_crash: '전 종목 수익률 -10%p',
  big_boom: '전 종목 수익률 +25%p',
  big_crash: '전 종목 수익률 -25%p',
  volatility_up: '전 종목 수익률 절댓값 ×1.5',
  volatility_down: '전 종목 수익률 절댓값 ×0.5',
  reversal_day: '전 종목 수익률 부호 반전',
  calm: '전 종목 수익률 0% 고정 (특수카드 무효)',
  polarization: '등락 상위 절반 +15%p, 하위 절반 -15%p',
  bubble: '가장 많이 오른 종목 추가 ×2',
  panic: '가장 많이 내린 종목 추가 ×2',
  rate_hike: '전 종목 -5%p + 보유 현금 +2% 이자',
  liquidity: '거래량 비례 추가 등락',
  news_blackout: '이번 라운드 특수 카드 연출 없이 최종 수익률만 표시',
}

export const CARD_COLOR: Record<string, string> = {
  small_surge: '#4caf50',
  surge: '#2e7d32',
  boom: '#1b5e20',
  small_drop: '#f44336',
  drop: '#c62828',
  crash: '#7f0000',
  reversal: '#9c27b0',
  trend: '#2196f3',
  detect: '#2196f3',
  shadow: '#2196f3',
  whistleblower: '#2196f3',
  market_scan: '#2196f3',
  portfolio_scan: '#2196f3',
  premium: '#ff9800',
}
