import type { Company, CompanyType } from '../types'

const COMPANY_NAMES = [
  '알파테크', '베타에너지', '감마바이오', '델타푸드', '엡실론게임',
  '제타모빌', '에타파이낸스', '세타로봇', '이오타미디어', '카파헬스',
]

const COMPANY_EMOJIS = ['🔵', '🟢', '🔴', '🟠', '🟡', '🟣', '⚪', '🟤', '🔷', '🔶']

const COMPANY_TYPES: CompanyType[] = [
  'stable', 'growth', 'decline', 'rollercoaster', 'reversal',
  'stable', 'growth', 'decline', 'rollercoaster', 'reversal',
]

/** 회사 유형별 기본 변동폭 범위 */
const TYPE_CONFIG: Record<CompanyType, {
  baseMin: number
  baseMax: number
  dopamineChance: number
  dopamineMin: number
  dopamineMax: number
  trend: number   // 라운드당 누적 추세 (+: 상승, -: 하락)
}> = {
  stable:       { baseMin: 0.05, baseMax: 0.12, dopamineChance: 0.08, dopamineMin: 0.30, dopamineMax: 0.45, trend: 0.005 },
  growth:       { baseMin: 0.03, baseMax: 0.15, dopamineChance: 0.15, dopamineMin: 0.30, dopamineMax: 0.55, trend: 0.015 },
  decline:      { baseMin: 0.05, baseMax: 0.15, dopamineChance: 0.08, dopamineMin: 0.25, dopamineMax: 0.40, trend: -0.02 },
  rollercoaster:{ baseMin: 0.08, baseMax: 0.20, dopamineChance: 0.30, dopamineMin: 0.35, dopamineMax: 0.60, trend: 0 },
  reversal:     { baseMin: 0.05, baseMax: 0.18, dopamineChance: 0.12, dopamineMin: 0.35, dopamineMax: 0.55, trend: -0.015 },
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

/** 단일 회사의 라운드별 가격 변동률 배열 생성 */
function generateRates(type: CompanyType, rounds: number): number[] {
  const cfg = TYPE_CONFIG[type]
  const rates: number[] = []

  for (let r = 0; r < rounds; r++) {
    const isDopamine = Math.random() < cfg.dopamineChance
    let rate: number

    if (isDopamine) {
      rate = rand(cfg.dopamineMin, cfg.dopamineMax)
      if (Math.random() < 0.5) rate = -rate
    } else {
      rate = rand(cfg.baseMin, cfg.baseMax)
      if (type === 'decline') {
        rate = -Math.abs(rate)
      } else if (type === 'stable' || type === 'growth') {
        if (Math.random() < 0.35) rate = -rate
      } else {
        if (Math.random() < 0.5) rate = -rate
      }
    }

    // 추세 보정 (reversal: 후반에 반등)
    if (type === 'reversal' && r >= Math.floor(rounds * 0.6)) {
      rate += 0.03
    } else {
      rate += cfg.trend
    }

    rates.push(parseFloat(rate.toFixed(4)))
  }

  return rates
}

/** 시작 가격 → 라운드별 가격 히스토리 생성 */
function generatePriceHistory(startPrice: number, rates: number[]): number[] {
  const history = [startPrice]
  let cur = startPrice
  for (const rate of rates) {
    cur = Math.max(100, Math.round(cur * (1 + rate)))
    history.push(cur)
  }
  return history
}

/** 게임에 사용할 회사 목록 생성 */
export function generateCompanies(count: number, rounds: number): Company[] {
  const shuffledNames = [...COMPANY_NAMES].sort(() => Math.random() - 0.5).slice(0, count)
  const shuffledTypes = [...COMPANY_TYPES].sort(() => Math.random() - 0.5).slice(0, count)

  return shuffledNames.map((name, i) => {
    const type = shuffledTypes[i]
    const startPrice = Math.round(rand(5000, 20000) / 1000) * 1000
    const rates = generateRates(type, rounds)
    const priceHistory = generatePriceHistory(startPrice, rates)

    return {
      id: `company-${i}`,
      name,
      type,
      emoji: COMPANY_EMOJIS[i],
      priceHistory,
    }
  })
}

/** 플레이어 수에 따른 자동 회사 수 계산 */
export function autoCompanyCount(playerCount: number): number {
  if (playerCount <= 3) return 4
  if (playerCount <= 5) return 5
  if (playerCount <= 7) return 6
  return 7
}

/** 금액 포맷 (₩1,000,000) */
export function formatKRW(amount: number): string {
  return `₩${amount.toLocaleString('ko-KR')}`
}

/** 등락률 포맷 (+15.2%) */
export function formatRate(rate: number): string {
  const pct = (rate * 100).toFixed(1)
  return rate >= 0 ? `+${pct}%` : `${pct}%`
}

/** 라운드별 현금 보유세율 */
export function getTaxRate(round: number): number {
  if (round <= 2) return 0.01
  if (round <= 4) return 0.02
  if (round <= 6) return 0.03
  if (round <= 8) return 0.04
  return 0.05
}
