// ─── 회사 ───────────────────────────────────────────────────────────────────

export type CompanyType = 'stable' | 'growth' | 'decline' | 'rollercoaster' | 'reversal'

export interface Company {
  id: string
  name: string
  type: CompanyType
  emoji: string
  priceHistory: number[]   // 인덱스 = 라운드 (0 = 시작가)
  delisted?: boolean       // 상장폐지 여부
}

// ─── 카드 ────────────────────────────────────────────────────────────────────

export type SpecialCardType =
  | 'small_surge'     // 소급등 +10%p
  | 'small_drop'      // 소급락 -10%p
  | 'surge'           // 급등 +20%p
  | 'drop'            // 급락 -20%p
  | 'boom'            // 폭등 ×2
  | 'crash'           // 폭락 ×0.5
  | 'reversal'        // 반전 부호 반전
  | 'card_nullifier'  // 특수카드 무효 — 대상 회사에 쌓인 특수 카드 모두 무효화
  // ── 플레이어 대상 ──
  | 'cash_burn'       // 현금 소각 — 대상 플레이어 현금 50% 소멸 (라운드 결산 시)
  | 'portfolio_snipe' // 포트폴리오 저격 — 대상의 비중 1위 종목에 -20%p 적용
  | 'profit_steal'    // 수익 강탈 — 대상의 이번 라운드 수익 30%를 흡수
  | 'focused_snipe'   // 집중 저격 — 대상 플레이어의 지정 종목에 -35%p 적용
  | 'forced_invest'   // 집중 투자 강제 — 대상이 현금 75%+ 한 종목에 투자해야 함
  | 'trade_freeze'    // 거래 정지 — 대상이 지정 종목 이번 라운드 매매 불가
  | 'hand_swap'       // 손바꿈 — 대상과 보유 현금 전액 즉시 교환

export type InfoCardType =
  | 'trend'           // 등락 예보
  | 'detect'          // 카드 탐지
  | 'shadow'          // 미행
  | 'whistleblower'   // 내부고발
  | 'market_scan'     // 시장 스캔
  | 'portfolio_scan'  // 포트폴리오 스캔
  | 'premium'              // 특급 카드
  | 'round_forecast'       // 라운드 이벤트 예보
  | 'round_card_choice'    // 라운드 카드 선택권 (9라운드 꼴등 전용)
  | 'rate_insight'         // 수익률 투시 — 선택 회사 순수 등락 % 수치까지 공개 (드래프트 낮은 확률)
  | 'card_appraise'        // 카드 감정 — 선택 회사에 적용된 특수 카드 종류 목록 공개 (드래프트 낮은 확률)

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
  refillTotal: number             // 파산 구제 누적 리필 금액 (최종 결산 시 차감)
  portfolio: Portfolio
  cards: Card[]
  rank: number
  usedSpecialThisRound: number
  usedInfoThisRound: number
  maxSpecialThisRound: number
  maxInfoThisRound: number
  draftChosen: string | null      // 이번 라운드 드래프트에서 선택한 카드 ID
  activeEffects?: {
    tradeFreezeCompanyId?: string  // 이번 라운드 거래 정지된 종목 ID
    forcedInvest?: boolean          // 이번 라운드 집중 투자 강제 대상
  }
}

// ─── 거래 / 카드 사용 ──────────────────────────────────────────────────────────

export interface Trade {
  action: 'buy' | 'sell'
  quantity: number
}

export interface CardPlay {
  playId: string
  userId: string
  companyId: string        // 회사 대상 카드는 companyId, 플레이어 대상만 카드는 ''
  targetUserId?: string    // 플레이어 대상 카드
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
  baseRates: { [companyId: string]: number }
  finalRates: { [companyId: string]: number }
  roundCardType: RoundCardType
  rankSnapshot: { uid: string; rank: number }[]
  taxRate: number
  taxApplied: { [uid: string]: number }
  delistedCompanies: string[]                  // 이번 라운드 상장폐지된 회사 ID 목록
  refillApplied: { [uid: string]: number }     // 파산 구제 적용된 플레이어별 리필 금액
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
  roundStartAt: number | null
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
  // 공유 드래프트 (2라운드부터)
  draftPool?: Card[]                       // 이번 라운드 드래프트 카드 풀 (플레이어수 +1장)
  draftOrder?: string[]                    // 선택 순서 (꼴지부터)
  draftPickIndex?: number                  // 현재 선택 차례 인덱스
  draftPickers?: { [uid: string]: string } // uid → 선택한 cardId
}
