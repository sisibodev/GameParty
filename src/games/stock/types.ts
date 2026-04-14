// ─── 회사 ───────────────────────────────────────────────────────────────────

export type CompanyType = 'stable' | 'growth' | 'decline' | 'rollercoaster' | 'reversal'

export interface Company {
  id: string
  name: string
  type: CompanyType
  emoji: string
  priceHistory: number[]   // 인덱스 = 라운드 (0 = 시작가)
}

// ─── 카드 ────────────────────────────────────────────────────────────────────

export type SpecialCardType =
  | 'small_surge'   // 소급등 +10%p
  | 'small_drop'    // 소급락 -10%p
  | 'surge'         // 급등 +20%p
  | 'drop'          // 급락 -20%p
  | 'boom'          // 폭등 ×2
  | 'crash'         // 폭락 ×0.5
  | 'reversal'      // 반전 부호 반전

export type InfoCardType =
  | 'trend'           // 등락 예보
  | 'detect'          // 카드 탐지
  | 'shadow'          // 미행
  | 'whistleblower'   // 내부고발
  | 'market_scan'     // 시장 스캔
  | 'portfolio_scan'  // 포트폴리오 스캔
  | 'premium'         // 특급 카드
  | 'round_forecast'  // 라운드 이벤트 예보

export type RoundCardType =
  | 'market_boom'       // 시장 활황 +10%p
  | 'market_crash'      // 시장 폭락 -10%p
  | 'big_boom'          // 대호재 +25%p
  | 'big_crash'         // 대폭락 -25%p
  | 'volatility_up'     // 변동성 확대 ×1.5
  | 'volatility_down'   // 변동성 축소 ×0.5
  | 'reversal_day'      // 역전의 날 부호 반전
  | 'calm'              // 무풍지대 0% (특수카드 무효)
  | 'polarization'      // 양극화
  | 'bubble'            // 버블
  | 'panic'             // 공황
  | 'rate_hike'         // 금리 인상
  | 'liquidity'         // 유동성 장세
  | 'news_blackout'     // 뉴스 블랙아웃

export type CardCategory = 'special' | 'info'

export interface Card {
  id: string
  type: SpecialCardType | InfoCardType
  category: CardCategory
  used: boolean
}

// ─── 플레이어 ─────────────────────────────────────────────────────────────────

export interface Portfolio {
  [companyId: string]: number  // 보유 수량
}

export interface Player {
  uid: string
  name: string
  photoURL: string
  ready: boolean
  cash: number
  portfolio: Portfolio
  cards: Card[]
  rank: number
  usedSpecialThisRound: number    // 이번 라운드 사용한 특수 카드 수
  usedInfoThisRound: number       // 이번 라운드 사용한 정보 카드 수
  maxSpecialThisRound: number     // 이번 라운드 사용 가능한 특수 카드 한도
  maxInfoThisRound: number        // 이번 라운드 사용 가능한 정보 카드 한도
  draftChosen: string | null      // 이번 라운드 드래프트 선택
  draftOptions: Card[]            // 이번 라운드 드래프트 선택지
}

// ─── 거래 / 카드 사용 ──────────────────────────────────────────────────────────

export interface Trade {
  action: 'buy' | 'sell'
  quantity: number
}

export interface CardPlay {
  playId: string
  userId: string
  companyId: string
  cardType: SpecialCardType
  cardId: string
}

// ─── 방 설정 ──────────────────────────────────────────────────────────────────

export interface RoomSettings {
  rounds: number            // 총 라운드 수
  timerSeconds: number      // 라운드 제한 시간 (초)
  startCash: number         // 시작 자금
  companyMode: 'auto' | 'manual'
  companyCount: number
}

// ─── 라운드 결과 ──────────────────────────────────────────────────────────────

export interface RoundResult {
  round: number
  baseRates: { [companyId: string]: number }   // 카드 적용 전 등락률
  finalRates: { [companyId: string]: number }  // 최종 등락률 (카드 모두 적용 후)
  roundCardType: RoundCardType
  rankSnapshot: { uid: string; rank: number }[]
  taxRate: number                              // 이번 라운드 현금 보유세율
  taxApplied: { [uid: string]: number }        // 플레이어별 차감된 세금
}

// ─── 방 상태 ──────────────────────────────────────────────────────────────────

export type RoomStatus = 'waiting' | 'playing' | 'round_result' | 'ended'

export interface Room {
  roomId: string
  status: RoomStatus
  settings: RoomSettings
  host: string
  players: { [uid: string]: Player }
  companies: { [id: string]: Company }
  currentRound: number
  roundStartAt: number | null   // 서버 타임스탬프
  trades: {
    [round: number]: {
      [uid: string]: {
        [companyId: string]: Trade
      }
    }
  }
  cardPlays: {
    [round: number]: {
      [playId: string]: CardPlay
    }
  }
  roundCard: { [round: number]: RoundCardType }
  roundResults: { [round: number]: RoundResult }
  roundReady?: { [uid: string]: boolean }
}
