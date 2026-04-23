import {
  ref, set, get, update, remove, onValue, off, serverTimestamp,
} from 'firebase/database'
import type { DatabaseReference } from 'firebase/database'
import { rtdb } from '../../../firebase/config'
import type { Room, RoomSettings, Player, Card, Trade, RoundResult, RoundCardType } from '../types'
import { generateCompanies, autoCompanyCount, getTaxRate } from './scenario'
import { createStarterCards, drawDraftPool, drawRoundCard, drawBonusCards, drawNullifierCard, drawRoundCardChoiceCard } from './cards'

function db() {
  if (!rtdb) throw new Error('Realtime Database가 초기화되지 않았습니다.')
  return rtdb
}

/** 6자리 랜덤 방 코드 생성 */
export function generateRoomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

/** 방 생성 */
export async function createRoom(
  host: Player,
  settings: RoomSettings,
): Promise<string> {
  const roomId = generateRoomCode()
  const playerCount = 1
  const companyCount =
    settings.companyMode === 'auto'
      ? autoCompanyCount(playerCount)
      : settings.companyCount

  const companies = generateCompanies(companyCount, settings.rounds)
  const companiesObj = Object.fromEntries(companies.map(c => [c.id, c]))

  const hostPlayer: Player = {
    ...host,
    ready: false,
    cash: settings.startCash,
    refillTotal: 0,
    portfolio: {},
    cards: createStarterCards(),
    rank: 0,
    usedSpecialThisRound: 0,
    usedInfoThisRound: 0,
    maxSpecialThisRound: 2,
    maxInfoThisRound: 1,
    draftChosen: null,
  }

  const room: Room = {
    roomId,
    status: 'waiting',
    settings,
    host: host.uid,
    players: { [host.uid]: hostPlayer },
    companies: companiesObj,
    currentRound: 0,
    roundStartAt: null,
    trades: {},
    cardPlays: {},
    roundCard: {},
    roundResults: {},
  }

  await set(ref(db(), `rooms/${roomId}`), room)
  return roomId
}

/** 방 입장 */
export async function joinRoom(roomId: string, player: Player): Promise<void> {
  const roomRef = ref(db(), `rooms/${roomId}`)
  const snap = await get(roomRef)
  if (!snap.exists()) throw new Error('존재하지 않는 방입니다.')

  const room = snap.val() as Room
  if (room.status !== 'waiting') throw new Error('이미 게임이 시작된 방입니다.')
  if (room.players && Object.keys(room.players).length >= 8) throw new Error('방이 가득 찼습니다.')

  const newPlayer: Player = {
    ...player,
    ready: false,
    cash: room.settings.startCash,
    refillTotal: 0,
    portfolio: {},
    cards: createStarterCards(),
    rank: 0,
    usedSpecialThisRound: 0,
    usedInfoThisRound: 0,
    maxSpecialThisRound: 2,
    maxInfoThisRound: 1,
    draftChosen: null,
  }

  await update(ref(db(), `rooms/${roomId}/players`), { [player.uid]: newPlayer })
}

/** 준비 상태 토글 */
export async function setReady(roomId: string, uid: string, ready: boolean) {
  await update(ref(db(), `rooms/${roomId}/players/${uid}`), { ready })
}

/** 게임 시작 (방장만) */
export async function startGame(roomId: string) {
  const snap = await get(ref(db(), `rooms/${roomId}`))
  const room = snap.val() as Room
  const playerCount = Object.keys(room.players).length

  // 회사 수 재계산 (인원 기반)
  const companyCount =
    room.settings.companyMode === 'auto'
      ? autoCompanyCount(playerCount)
      : room.settings.companyCount
  const companies = generateCompanies(companyCount, room.settings.rounds)
  const companiesObj = Object.fromEntries(companies.map(c => [c.id, c]))

  // 드래프트 옵션 (1라운드는 없음, 2라운드부터)
  const updates: Record<string, unknown> = {
    [`rooms/${roomId}/status`]: 'playing',
    [`rooms/${roomId}/currentRound`]: 1,
    [`rooms/${roomId}/roundStartAt`]: serverTimestamp(),
    [`rooms/${roomId}/companies`]: companiesObj,
    [`rooms/${roomId}/roundReady`]: {},
    [`rooms/${roomId}/roundCard/1`]: drawRoundCard(),  // 1라운드 카드 미리 추첨
  }
  await update(ref(db()), updates)
}

/** 매매 기록 + 즉시 cash/portfolio 반영 */
export async function recordTrade(
  roomId: string,
  round: number,
  uid: string,
  companyId: string,
  trade: Trade,
) {
  const [playerSnap, priceSnap] = await Promise.all([
    get(ref(db(), `rooms/${roomId}/players/${uid}`)),
    get(ref(db(), `rooms/${roomId}/companies/${companyId}/priceHistory`)),
  ])
  const player = playerSnap.val() as Player
  const priceHistory = priceSnap.val() as number[]
  const price = priceHistory[round - 1] ?? priceHistory[0]

  // 거래 정지 체크
  if (player.activeEffects?.tradeFreezeCompanyId === companyId) {
    throw new Error('거래 정지: 이번 라운드 이 종목은 거래할 수 없습니다.')
  }

  const holding = (player.portfolio?.[companyId] ?? 0)
  const newHolding = trade.action === 'buy'
    ? holding + trade.quantity
    : holding - trade.quantity
  const newCash = trade.action === 'buy'
    ? player.cash - price * trade.quantity
    : player.cash + price * trade.quantity

  await Promise.all([
    set(ref(db(), `rooms/${roomId}/trades/${round}/${uid}/${companyId}`), trade),
    update(ref(db(), `rooms/${roomId}/players/${uid}`), {
      cash: newCash,
      [`portfolio/${companyId}`]: newHolding,
    }),
  ])
}

/** 라운드 결과 계산 및 저장 (방장만 호출) */
export async function calculateRoundResult(roomId: string, round: number) {
  const snap = await get(ref(db(), `rooms/${roomId}`))
  const room = snap.val() as Room

  // 라운드 시작 시 미리 추첨된 카드 사용 (없으면 새로 추첨)
  const roundCard: RoundCardType = (room.roundCard?.[round] as RoundCardType) ?? drawRoundCard()
  const companies = Object.values(room.companies)
  const cardPlaysThisRound = room.cardPlays?.[round] ?? {}

  // ── forced_invest 자동 집행 (라운드 결산 전에 포트폴리오 강제 조정) ────────────
  const forcedInvestPlays = Object.values(cardPlaysThisRound).filter(p => p.cardType === 'forced_invest')
  const forcedInvestUpdates: Record<string, unknown> = {}
  for (const play of forcedInvestPlays) {
    const targetUid = play.targetUserId
    if (!targetUid || !room.players[targetUid]) continue
    const tp = room.players[targetUid]
    const prevPrices: Record<string, number> = {}
    for (const c of companies) {
      prevPrices[c.id] = c.priceHistory[round - 1] ?? c.priceHistory[0]
    }
    const portfolioValue = Object.entries(tp.portfolio ?? {}).reduce((s, [cid, qty]) =>
      s + (prevPrices[cid] ?? 0) * (qty as number), 0)
    const totalAssets = tp.cash + portfolioValue
    const target75 = totalAssets * 0.75

    // 비중 1위 종목 찾기
    const topEntry = Object.entries(tp.portfolio ?? {})
      .filter(([, qty]) => (qty as number) > 0)
      .sort(([aId, aQty], [bId, bQty]) =>
        (prevPrices[bId] ?? 0) * (bQty as number) - (prevPrices[aId] ?? 0) * (aQty as number)
      )[0]
    const topCompanyId = topEntry?.[0]
    const topQty = topEntry ? (topEntry[1] as number) : 0
    const topValue = topCompanyId ? (prevPrices[topCompanyId] ?? 0) * topQty : 0

    if (topValue >= target75) continue  // 이미 75% 충족

    // 자동 집행: 비중 1위 외 전부 매도
    let newCash = tp.cash
    const newPortfolio = { ...tp.portfolio }
    for (const [cid, qty] of Object.entries(newPortfolio)) {
      if (cid === topCompanyId || (qty as number) <= 0) continue
      newCash += (prevPrices[cid] ?? 0) * (qty as number)
      newPortfolio[cid] = 0
    }
    // 1위 종목 추가 매수
    if (topCompanyId && prevPrices[topCompanyId] > 0) {
      let curTopValue = (prevPrices[topCompanyId] ?? 0) * (newPortfolio[topCompanyId] as number ?? 0)
      while (newCash >= prevPrices[topCompanyId] && curTopValue < target75) {
        newCash -= prevPrices[topCompanyId]
        newPortfolio[topCompanyId] = ((newPortfolio[topCompanyId] as number) ?? 0) + 1
        curTopValue += prevPrices[topCompanyId]
      }
    }
    // RTDB에 적용 (room 로컬 상태도 업데이트)
    forcedInvestUpdates[`rooms/${roomId}/players/${targetUid}/cash`] = newCash
    forcedInvestUpdates[`rooms/${roomId}/players/${targetUid}/portfolio`] = newPortfolio
    forcedInvestUpdates[`rooms/${roomId}/players/${targetUid}/activeEffects/forcedInvest`] = false
    room.players[targetUid].cash = newCash
    room.players[targetUid].portfolio = newPortfolio
  }
  if (Object.keys(forcedInvestUpdates).length > 0) {
    await update(ref(db()), forcedInvestUpdates)
  }

  // 기본 등락률 (카드 적용 전) 저장
  const baseRates: Record<string, number> = {}
  for (const company of companies) {
    const prevPrice = company.priceHistory[round - 1] ?? company.priceHistory[0]
    const seededPrice = company.priceHistory[round] ?? prevPrice
    baseRates[company.id] = prevPrice > 0 ? (seededPrice - prevPrice) / prevPrice : 0
  }

  // ── 플레이어 대상 카드 → 회사 등락률에 영향 ──────────────────────────────────
  const extraRates: Record<string, number> = {}

  // portfolio_snipe: 대상의 prevPrice 기준 비중 1위 종목에 -20%p
  for (const play of Object.values(cardPlaysThisRound).filter(p => p.cardType === 'portfolio_snipe')) {
    const tp = room.players[play.targetUserId ?? '']
    if (!tp) continue
    const topCid = Object.entries(tp.portfolio ?? {})
      .filter(([, qty]) => (qty as number) > 0)
      .sort(([aId, aQty], [bId, bQty]) => {
        const prevA = companies.find(c => c.id === aId)?.priceHistory[round - 1] ?? 0
        const prevB = companies.find(c => c.id === bId)?.priceHistory[round - 1] ?? 0
        return prevB * (bQty as number) - prevA * (aQty as number)
      })[0]?.[0]
    if (topCid) extraRates[topCid] = (extraRates[topCid] ?? 0) - 0.20
  }

  // focused_snipe: 대상 플레이어의 지정 종목에 -35%p
  for (const play of Object.values(cardPlaysThisRound).filter(p => p.cardType === 'focused_snipe')) {
    if (play.companyId) extraRates[play.companyId] = (extraRates[play.companyId] ?? 0) - 0.35
  }

  // 각 회사별 유효 등락률 계산
  const effectiveRates: Record<string, number> = { ...baseRates }
  for (const company of companies) {
    if (company.delisted) continue  // 이미 상장폐지된 회사 스킵
    let rate = effectiveRates[company.id]

    // 특수 카드 적용
    const playsOnThis = Object.values(cardPlaysThisRound).filter(p => p.companyId === company.id)
    // card_nullifier가 있으면 다른 특수 카드 무효
    const hasNullifier = playsOnThis.some(p => p.cardType === 'card_nullifier')
    if (!hasNullifier) {
      for (const play of playsOnThis) {
        switch (play.cardType) {
          case 'surge': rate += 0.20; break
          case 'drop': rate -= 0.20; break
          case 'small_surge': rate += 0.10; break
          case 'small_drop': rate -= 0.10; break
          case 'boom': rate = rate * 2; break
          case 'crash': rate = rate * 0.5; break
          case 'reversal': rate = -rate; break
        }
      }
      // 플레이어 대상 카드에서 온 추가 조정
      rate += extraRates[company.id] ?? 0
    }
    effectiveRates[company.id] = rate
  }

  // 라운드 카드 적용
  const ids = Object.keys(effectiveRates)
  if (roundCard !== 'calm' && roundCard !== 'news_blackout') {
    switch (roundCard) {
      case 'market_boom': ids.forEach(id => { effectiveRates[id] += 0.10 }); break
      case 'market_crash': ids.forEach(id => { effectiveRates[id] -= 0.10 }); break
      case 'big_boom': ids.forEach(id => { effectiveRates[id] += 0.25 }); break
      case 'big_crash': ids.forEach(id => { effectiveRates[id] -= 0.25 }); break
      case 'volatility_up': ids.forEach(id => { effectiveRates[id] *= 1.5 }); break
      case 'volatility_down': ids.forEach(id => { effectiveRates[id] *= 0.5 }); break
      case 'reversal_day': ids.forEach(id => { effectiveRates[id] = -effectiveRates[id] }); break
      case 'polarization': {
        const sorted = [...ids].sort((a, b) => effectiveRates[b] - effectiveRates[a])
        const half = Math.ceil(sorted.length / 2)
        sorted.slice(0, half).forEach(id => { effectiveRates[id] += 0.15 })
        sorted.slice(half).forEach(id => { effectiveRates[id] -= 0.15 })
        break
      }
      case 'bubble': ids.forEach(id => { if (effectiveRates[id] > 0) effectiveRates[id] *= 1.3 }); break
      case 'panic': ids.forEach(id => { effectiveRates[id] *= 0.7 }); break
      case 'rate_hike': ids.forEach(id => { effectiveRates[id] -= 0.05 }); break
      case 'liquidity': ids.forEach(id => { effectiveRates[id] += 0.05 }); break
    }
  }

  // 실제 가격 계산 + 상장폐지 판별
  const newPrices: Record<string, number> = {}
  const delistedCompanies: string[] = []
  for (const company of companies) {
    if (company.delisted) continue
    const prevPrice = company.priceHistory[round - 1] ?? company.priceHistory[0]
    const rawPrice = Math.round(prevPrice * (1 + effectiveRates[company.id]))
    if (rawPrice < 100) {
      // 상장폐지
      delistedCompanies.push(company.id)
      newPrices[company.id] = 0
    } else {
      newPrices[company.id] = rawPrice
    }
  }

  // 플레이어 자산 총액 계산 → 순위 산정
  const playerRankings = Object.values(room.players)
    .map(p => {
      const portfolioValue = Object.entries(p.portfolio ?? {}).reduce((sum, [cid, qty]) => {
        return sum + (newPrices[cid] ?? 0) * (qty as number)
      }, 0)
      return { uid: p.uid, totalAssets: p.cash + portfolioValue }
    })
    .sort((a, b) => b.totalAssets - a.totalAssets)

  const rankSnapshot = playerRankings.map((p, i) => ({ uid: p.uid, rank: i + 1 }))

  // 현금 보유세 계산
  const taxRate = getTaxRate(round)
  const taxApplied: Record<string, number> = {}
  for (const player of Object.values(room.players)) {
    taxApplied[player.uid] = Math.floor(player.cash * taxRate)
  }

  // ── profit_steal: 대상의 이번 라운드 수익 30% 흡수 ──────────────────────────
  // 수익 = Σ(보유량 × (새가격 - 이전가격))
  const roundProfit: Record<string, number> = {}
  for (const player of Object.values(room.players)) {
    let profit = 0
    for (const [cid, qty] of Object.entries(player.portfolio ?? {})) {
      const prev = companies.find(c => c.id === cid)?.priceHistory[round - 1] ?? 0
      const next = newPrices[cid] ?? prev
      profit += (next - prev) * (qty as number)
    }
    roundProfit[player.uid] = profit
  }
  const profitStealCashDelta: Record<string, number> = {}  // uid → 현금 증감
  for (const play of Object.values(cardPlaysThisRound).filter(p => p.cardType === 'profit_steal')) {
    const targetUid = play.targetUserId ?? ''
    const targetProfit = roundProfit[targetUid] ?? 0
    if (targetProfit <= 0) continue  // 손실이면 훔칠 것 없음
    const stolen = Math.floor(targetProfit * 0.3)
    profitStealCashDelta[play.userId] = (profitStealCashDelta[play.userId] ?? 0) + stolen
    profitStealCashDelta[targetUid] = (profitStealCashDelta[targetUid] ?? 0) - stolen
  }

  // 파산 구제: 세후 현금으로 아무 주식도 못 사면 100만원 리필
  const minPrice = Math.min(...Object.values(newPrices).filter(p => p > 0))
  const refillApplied: Record<string, number> = {}
  const cashAfterTax: Record<string, number> = {}
  for (const player of Object.values(room.players)) {
    let afterTax = Math.max(0, player.cash - taxApplied[player.uid])
    // cash_burn: 현금 50% 소각
    const hasCashBurn = Object.values(cardPlaysThisRound)
      .some(p => p.cardType === 'cash_burn' && p.targetUserId === player.uid)
    if (hasCashBurn) afterTax = Math.floor(afterTax * 0.5)
    // profit_steal 반영
    afterTax = Math.max(0, afterTax + (profitStealCashDelta[player.uid] ?? 0))
    // 파산 구제: 주식 없음 AND 현금으로 아무 주식도 못 사는 경우
    const hasStock = Object.values(player.portfolio ?? {}).some(qty => (qty as number) > 0)
    if (!hasStock && afterTax < (isFinite(minPrice) ? minPrice : Infinity)) {
      refillApplied[player.uid] = 1000000
      cashAfterTax[player.uid] = afterTax + 1000000
    } else {
      refillApplied[player.uid] = 0
      cashAfterTax[player.uid] = afterTax
    }
  }

  const roundResult: RoundResult = {
    round,
    baseRates,
    finalRates: effectiveRates,
    roundCardType: roundCard,
    rankSnapshot,
    taxRate,
    taxApplied,
    delistedCompanies,
    refillApplied,
  }

  // RTDB 일괄 업데이트
  const allUpdates: Record<string, unknown> = {
    [`rooms/${roomId}/roundCard/${round}`]: roundCard,
    [`rooms/${roomId}/roundResults/${round}`]: roundResult,
  }
  // 가격 업데이트 (상장폐지 회사는 0원으로, delisted 플래그 설정)
  for (const company of companies) {
    if (company.delisted) continue
    allUpdates[`rooms/${roomId}/companies/${company.id}/priceHistory/${round}`] = newPrices[company.id]
    if (delistedCompanies.includes(company.id)) {
      allUpdates[`rooms/${roomId}/companies/${company.id}/delisted`] = true
      // 상장폐지된 회사 보유 주식 강제 0
      for (const player of Object.values(room.players)) {
        if ((player.portfolio?.[company.id] ?? 0) > 0) {
          allUpdates[`rooms/${roomId}/players/${player.uid}/portfolio/${company.id}`] = 0
        }
      }
    }
  }
  for (const { uid, rank } of rankSnapshot) {
    allUpdates[`rooms/${roomId}/players/${uid}/rank`] = rank
  }
  // 세후 현금 + 파산 구제 반영
  for (const player of Object.values(room.players)) {
    allUpdates[`rooms/${roomId}/players/${player.uid}/cash`] = cashAfterTax[player.uid]
    if (refillApplied[player.uid] > 0) {
      allUpdates[`rooms/${roomId}/players/${player.uid}/refillTotal`] =
        (player.refillTotal ?? 0) + refillApplied[player.uid]
    }
  }

  await update(ref(db()), allUpdates)
}

/** 특수 카드 사용 기록 (플레이어 대상 카드는 targetUserId 전달) */
export async function playSpecialCard(
  roomId: string,
  round: number,
  uid: string,
  companyId: string,
  cardId: string,
  cardType: string,
  targetUserId?: string,
) {
  const playId = `${uid}-${cardId}`
  const cardPlay: Record<string, unknown> = { playId, userId: uid, companyId, cardType, cardId }
  if (targetUserId) cardPlay.targetUserId = targetUserId

  const [, playerSnap] = await Promise.all([
    set(ref(db(), `rooms/${roomId}/cardPlays/${round}/${playId}`), cardPlay),
    get(ref(db(), `rooms/${roomId}/players/${uid}`)),
  ])

  const player = playerSnap.val() as Player
  const cardsArr: Player['cards'] = Array.isArray(player.cards)
    ? player.cards
    : Object.values(player.cards)
  const updatedCards = cardsArr.map(c => c.id === cardId ? { ...c, used: true } : c)

  const extraUpdates: Record<string, unknown> = {
    cards: updatedCards,
    usedSpecialThisRound: (player.usedSpecialThisRound ?? 0) + 1,
  }

  // trade_freeze: 대상 플레이어 activeEffects에 즉시 기록
  // forced_invest: 대상 플레이어에게 즉시 표시
  if (targetUserId) {
    if (cardType === 'trade_freeze' && companyId) {
      await update(ref(db(), `rooms/${roomId}/players/${targetUserId}`), {
        'activeEffects/tradeFreezeCompanyId': companyId,
      })
    }
    if (cardType === 'forced_invest') {
      await update(ref(db(), `rooms/${roomId}/players/${targetUserId}`), {
        'activeEffects/forcedInvest': true,
      })
    }
  }

  await update(ref(db(), `rooms/${roomId}/players/${uid}`), extraUpdates)
}

/** 손바꿈 — 두 플레이어의 현금 즉시 교환 */
export async function applyHandSwap(
  roomId: string,
  uid: string,
  cardId: string,
  targetUserId: string,
) {
  const [mySnap, targetSnap] = await Promise.all([
    get(ref(db(), `rooms/${roomId}/players/${uid}`)),
    get(ref(db(), `rooms/${roomId}/players/${targetUserId}`)),
  ])
  const me = mySnap.val() as Player
  const target = targetSnap.val() as Player

  const myCardsArr: Card[] = Array.isArray(me.cards) ? me.cards : Object.values(me.cards ?? {})
  const updatedMyCards = myCardsArr.map(c => c.id === cardId ? { ...c, used: true } : c)

  await update(ref(db()), {
    [`rooms/${roomId}/players/${uid}/cash`]: target.cash,
    [`rooms/${roomId}/players/${uid}/cards`]: updatedMyCards,
    [`rooms/${roomId}/players/${uid}/usedSpecialThisRound`]: (me.usedSpecialThisRound ?? 0) + 1,
    [`rooms/${roomId}/players/${targetUserId}/cash`]: me.cash,
  })
}


/** 방 실시간 구독 */
export function subscribeRoom(roomId: string, cb: (room: Room | null) => void): DatabaseReference {
  const roomRef = ref(db(), `rooms/${roomId}`)
  onValue(roomRef, snap => cb(snap.exists() ? (snap.val() as Room) : null))
  return roomRef
}

/** 구독 해제 */
export function unsubscribeRoom(roomRef: DatabaseReference) {
  off(roomRef)
}

/** 대기 중인 방 목록 실시간 구독 (status === 'waiting') */
export function subscribeRooms(cb: (rooms: Room[]) => void): DatabaseReference {
  const roomsRef = ref(db(), 'rooms')
  onValue(roomsRef, snap => {
    if (!snap.exists()) { cb([]); return }
    const all = snap.val() as Record<string, Room>
    const waiting = Object.values(all).filter(r => r.status === 'waiting')
    cb(waiting)
  })
  return roomsRef
}

/** 정보 카드 사용 — 카드 used 처리 + usedInfoThisRound 증가 */
export async function useInfoCard(
  roomId: string,
  uid: string,
  cardId: string,
  extraUpdates: Record<string, unknown> = {},
) {
  const playerSnap = await get(ref(db(), `rooms/${roomId}/players/${uid}`))
  const player = playerSnap.val() as Player
  const cardsRaw = player.cards
  const cardsArr: Player['cards'] = Array.isArray(cardsRaw)
    ? cardsRaw
    : Object.values(cardsRaw ?? {})
  const updatedCards = cardsArr.map(c => c.id === cardId ? { ...c, used: true } : c)
  await update(ref(db(), `rooms/${roomId}/players/${uid}`), {
    cards: updatedCards,
    usedInfoThisRound: (player.usedInfoThisRound ?? 0) + 1,
    ...extraUpdates,
  })
}

/** 특급 카드 — 이번 라운드 특수/정보 카드 한도 각 +1 */
export async function usePremiumCard(roomId: string, uid: string, cardId: string) {
  const playerSnap = await get(ref(db(), `rooms/${roomId}/players/${uid}`))
  const player = playerSnap.val() as Player
  await useInfoCard(roomId, uid, cardId, {
    maxSpecialThisRound: (player.maxSpecialThisRound ?? 2) + 1,
    maxInfoThisRound: (player.maxInfoThisRound ?? 1) + 1,
  })
}

/** 라운드 레디 설정 */
export async function setRoundReady(roomId: string, uid: string, ready: boolean) {
  await update(ref(db(), `rooms/${roomId}/roundReady`), { [uid]: ready })
}

/** 방 강제 해산 (방장만) — 방 데이터 전체 삭제 → 모든 구독자가 로비로 이동 */
export async function dissolveRoom(roomId: string) {
  await remove(ref(db(), `rooms/${roomId}`))
}

/** 라운드 카드 선택권 사용 — 10라운드 이벤트 카드를 직접 선택 */
export async function useRoundCardChoice(roomId: string, uid: string, cardId: string, chosenRoundCard: RoundCardType) {
  const snap = await get(ref(db(), `rooms/${roomId}/players/${uid}`))
  const player = snap.val() as Player
  const cardsArr: Card[] = Array.isArray(player.cards) ? player.cards : Object.values(player.cards ?? {})
  const updatedCards = cardsArr.map(c => c.id === cardId ? { ...c, used: true } : c)

  await update(ref(db()), {
    [`rooms/${roomId}/players/${uid}/cards`]: updatedCards,
    [`rooms/${roomId}/players/${uid}/usedInfoThisRound`]: (player.usedInfoThisRound ?? 0) + 1,
    [`rooms/${roomId}/roundCard/10`]: chosenRoundCard,
  })
}

/** 방장이 라운드 종료 처리 (결과 계산 후 상태 업데이트) */
export async function endRound(roomId: string) {
  await update(ref(db(), `rooms/${roomId}`), { status: 'round_result' })
}

/** 다음 라운드 시작 */
export async function nextRound(roomId: string, nextRound: number, totalRounds: number) {
  if (nextRound > totalRounds) {
    await update(ref(db(), `rooms/${roomId}`), { status: 'ended' })
    return
  }

  const snap = await get(ref(db(), `rooms/${roomId}`))
  const room = snap.val() as Room
  const players = room.players

  const updates: Record<string, unknown> = {
    [`rooms/${roomId}/status`]: 'playing',
    [`rooms/${roomId}/currentRound`]: nextRound,
    [`rooms/${roomId}/roundStartAt`]: serverTimestamp(),
    [`rooms/${roomId}/roundReady`]: {},
    [`rooms/${roomId}/roundCard/${nextRound}`]: drawRoundCard(),
  }

  // 상장폐지 회사 → 신규 회사로 교체
  const companies = Object.values(room.companies)
  for (const company of companies) {
    if (!company.delisted) continue
    const futureRounds = Math.max(1, totalRounds - nextRound)
    const [fresh] = generateCompanies(1, futureRounds)
    const ipoPrice = fresh.priceHistory[0]
    // 과거 라운드 이력은 ipoPrice로 채우고, 이후 라운드는 새 가격 사용
    const newHistory: number[] = Array(nextRound).fill(ipoPrice)
    for (let i = 0; i < fresh.priceHistory.length; i++) {
      newHistory.push(fresh.priceHistory[i])
    }
    updates[`rooms/${roomId}/companies/${company.id}`] = {
      id: company.id,
      name: fresh.name,
      type: fresh.type,
      emoji: fresh.emoji,
      priceHistory: newHistory,
      delisted: false,
    }
  }

  // 3라운드마다 보너스 카드 지급
  const isBonusRound = nextRound > 1 && nextRound % 3 === 1
  const bonusCountByUid: Record<string, number> = {}
  let lastPlaceUid: string | null = null
  if (isBonusRound) {
    const sorted = Object.values(players).sort((a, b) => a.rank - b.rank)
    sorted.forEach((p, i) => {
      if (i < 2) bonusCountByUid[p.uid] = 1
      else if (i < 4) bonusCountByUid[p.uid] = 2
      else bonusCountByUid[p.uid] = 3
    })
    lastPlaceUid = sorted[sorted.length - 1]?.uid ?? null
  }

  // 공유 드래프트 풀 설정 (2라운드부터)
  if (nextRound >= 2) {
    const playerCount = Object.keys(players).length
    const pool = drawDraftPool(playerCount + 1)
    // 꼴지부터 선택 (rank 높은 순)
    const draftOrder = Object.values(players)
      .sort((a, b) => b.rank - a.rank)
      .map(p => p.uid)
    updates[`rooms/${roomId}/draftPool`] = pool
    updates[`rooms/${roomId}/draftOrder`] = draftOrder
    updates[`rooms/${roomId}/draftPickIndex`] = 0
    updates[`rooms/${roomId}/draftPickers`] = {}
  }

  // 플레이어별 초기화
  for (const uid of Object.keys(players)) {
    updates[`rooms/${roomId}/players/${uid}/usedSpecialThisRound`] = 0
    updates[`rooms/${roomId}/players/${uid}/usedInfoThisRound`] = 0
    updates[`rooms/${roomId}/players/${uid}/maxSpecialThisRound`] = 2
    updates[`rooms/${roomId}/players/${uid}/maxInfoThisRound`] = 1
    updates[`rooms/${roomId}/players/${uid}/draftChosen`] = null
    updates[`rooms/${roomId}/players/${uid}/activeEffects`] = {}  // 라운드 효과 초기화

    if (isBonusRound) {
      const player = players[uid]
      const cardsRaw = player.cards
      const cardsArr: Player['cards'] = Array.isArray(cardsRaw)
        ? cardsRaw
        : Object.values(cardsRaw ?? {})
      const count = bonusCountByUid[uid] ?? 1
      const bonusCards = drawBonusCards(count)
      // 최하위에게 특수카드 무효 추가 지급
      const extras: Card[] = uid === lastPlaceUid ? [drawNullifierCard()] : []
      // 9라운드 꼴등에게 라운드 카드 선택권 추가 지급
      if (uid === lastPlaceUid && nextRound === 10) {
        extras.push(drawRoundCardChoiceCard())
      }
      updates[`rooms/${roomId}/players/${uid}/cards`] = [...cardsArr, ...bonusCards, ...extras]
    }
  }

  await update(ref(db()), updates)
}

/** 드래프트 카드 선택 (공유 풀 방식) */
export async function pickDraft(roomId: string, uid: string, cardId: string) {
  const snap = await get(ref(db(), `rooms/${roomId}`))
  const room = snap.val() as Room

  const pickIndex = room.draftPickIndex ?? 0
  const draftOrderRaw = room.draftOrder
  const draftOrder: string[] = Array.isArray(draftOrderRaw)
    ? draftOrderRaw
    : Object.values(draftOrderRaw ?? {})

  // 자기 차례인지 확인
  if (draftOrder[pickIndex] !== uid) return

  const draftPoolRaw = room.draftPool
  const draftPool: Player['cards'] = Array.isArray(draftPoolRaw)
    ? draftPoolRaw
    : Object.values(draftPoolRaw ?? {})
  const pickedCard = draftPool.find(c => c.id === cardId)
  if (!pickedCard) return

  const player = room.players[uid]
  const cardsRaw = player.cards
  const cardsArr: Player['cards'] = Array.isArray(cardsRaw)
    ? cardsRaw
    : Object.values(cardsRaw ?? {})

  await update(ref(db()), {
    [`rooms/${roomId}/players/${uid}/cards`]: [...cardsArr, { ...pickedCard, used: false }],
    [`rooms/${roomId}/players/${uid}/draftChosen`]: cardId,
    [`rooms/${roomId}/draftPickers/${uid}`]: cardId,
    [`rooms/${roomId}/draftPickIndex`]: pickIndex + 1,
  })
}
