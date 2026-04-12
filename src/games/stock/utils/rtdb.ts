import {
  ref, set, get, update, onValue, off, serverTimestamp,
} from 'firebase/database'
import type { DatabaseReference } from 'firebase/database'
import { rtdb } from '../../../firebase/config'
import type { Room, RoomSettings, Player, Trade, RoundResult } from '../types'
import { generateCompanies, autoCompanyCount } from './scenario'
import { createStarterCards, drawDraftOptions, drawRoundCard } from './cards'

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
    portfolio: {},
    cards: createStarterCards(),
    rank: 0,
    usedSpecialThisRound: 0,
    usedInfoThisRound: 0,
    maxSpecialThisRound: 2,
    maxInfoThisRound: 1,
    draftChosen: null,
    draftOptions: [],
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
    portfolio: {},
    cards: createStarterCards(),
    rank: 0,
    usedSpecialThisRound: 0,
    usedInfoThisRound: 0,
    maxSpecialThisRound: 2,
    maxInfoThisRound: 1,
    draftChosen: null,
    draftOptions: [],
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

  const roundCard = drawRoundCard()
  const companies = Object.values(room.companies)
  const cardPlaysThisRound = room.cardPlays?.[round] ?? {}

  // 각 회사별 유효 등락률 계산
  const effectiveRates: Record<string, number> = {}
  for (const company of companies) {
    const prevPrice = company.priceHistory[round - 1] ?? company.priceHistory[0]
    const seededPrice = company.priceHistory[round] ?? prevPrice
    let rate = prevPrice > 0 ? (seededPrice - prevPrice) / prevPrice : 0

    // 특수 카드 적용
    const playsOnThis = Object.values(cardPlaysThisRound).filter(p => p.companyId === company.id)
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

  // 실제 가격 계산
  const newPrices: Record<string, number> = {}
  for (const company of companies) {
    const prevPrice = company.priceHistory[round - 1] ?? company.priceHistory[0]
    newPrices[company.id] = Math.max(100, Math.round(prevPrice * (1 + effectiveRates[company.id])))
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

  const roundResult: RoundResult = {
    round,
    finalRates: effectiveRates,
    roundCardType: roundCard,
    rankSnapshot,
  }

  // RTDB 일괄 업데이트
  const allUpdates: Record<string, unknown> = {
    [`rooms/${roomId}/roundCard/${round}`]: roundCard,
    [`rooms/${roomId}/roundResults/${round}`]: roundResult,
  }
  for (const company of companies) {
    allUpdates[`rooms/${roomId}/companies/${company.id}/priceHistory/${round}`] = newPrices[company.id]
  }
  for (const { uid, rank } of rankSnapshot) {
    allUpdates[`rooms/${roomId}/players/${uid}/rank`] = rank
  }

  await update(ref(db()), allUpdates)
}

/** 특수 카드 사용 기록 */
export async function playSpecialCard(
  roomId: string,
  round: number,
  uid: string,
  companyId: string,
  cardId: string,
  cardType: string,
) {
  const playId = `${uid}-${cardId}`
  await set(ref(db(), `rooms/${roomId}/cardPlays/${round}/${playId}`), {
    playId,
    userId: uid,
    companyId,
    cardType,
    cardId,
  })
  // 카드 used 처리
  const cardsSnap = await get(ref(db(), `rooms/${roomId}/players/${uid}/cards`))
  const cards = cardsSnap.val() as Player['cards']
  const idx = cards.findIndex(c => c.id === cardId)
  if (idx !== -1) {
    await update(ref(db(), `rooms/${roomId}/players/${uid}/cards/${idx}`), { used: true })
  }
  await update(ref(db(), `rooms/${roomId}/players/${uid}`), {
    usedSpecialThisRound: (await get(ref(db(), `rooms/${roomId}/players/${uid}/usedSpecialThisRound`))).val() + 1,
  })
}

/** 드래프트 선택 */
export async function chooseDraft(
  roomId: string,
  round: number,
  uid: string,
  chosenCardId: string,
) {
  const optionsSnap = await get(ref(db(), `rooms/${roomId}/players/${uid}/draftOptions`))
  const options = optionsSnap.val() as string[] | null
  if (!options) return

  await update(ref(db(), `rooms/${roomId}/players/${uid}`), {
    draftChosen: chosenCardId,
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

  // 각 플레이어 카운터 초기화 + 드래프트 옵션 배분
  const snap = await get(ref(db(), `rooms/${roomId}/players`))
  const players = snap.val() as Room['players']
  const updates: Record<string, unknown> = {
    [`rooms/${roomId}/status`]: 'playing',
    [`rooms/${roomId}/currentRound`]: nextRound,
    [`rooms/${roomId}/roundStartAt`]: serverTimestamp(),
  }

  for (const uid of Object.keys(players)) {
    updates[`rooms/${roomId}/players/${uid}/usedSpecialThisRound`] = 0
    updates[`rooms/${roomId}/players/${uid}/usedInfoThisRound`] = 0
    updates[`rooms/${roomId}/players/${uid}/maxSpecialThisRound`] = 2
    updates[`rooms/${roomId}/players/${uid}/maxInfoThisRound`] = 1
    updates[`rooms/${roomId}/players/${uid}/draftChosen`] = null

    if (nextRound >= 2) {
      const [cardA, cardB] = drawDraftOptions()
      updates[`rooms/${roomId}/players/${uid}/draftOptions`] = [cardA, cardB]
    }
  }

  await update(ref(db()), updates)
}
