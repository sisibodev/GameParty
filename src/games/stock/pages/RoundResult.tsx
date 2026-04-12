import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { subscribeRoom, unsubscribeRoom, calculateRoundResult, nextRound } from '../utils/rtdb'
import { formatRate } from '../utils/scenario'
import { CARD_LABEL, CARD_DESC } from '../utils/cards'
import type { Room } from '../types'
import styles from './RoundResult.module.css'

const ROUND_CARD_LABEL: Record<string, string> = {
  market_boom: '📈 시장 활황',
  market_crash: '📉 시장 폭락',
  big_boom: '🚀 대호재',
  big_crash: '💥 대폭락',
  volatility_up: '⚡ 변동성 확대',
  volatility_down: '🌊 변동성 축소',
  reversal_day: '🔄 역전의 날',
  calm: '😴 무풍지대',
  polarization: '⚖️ 양극화',
  bubble: '🫧 버블',
  panic: '😱 공황',
  rate_hike: '💰 금리 인상',
  liquidity: '💧 유동성 장세',
  news_blackout: '📵 뉴스 블랙아웃',
}

const ROUND_CARD_DESC: Record<string, string> = {
  market_boom: '전 종목 +10%p',
  market_crash: '전 종목 -10%p',
  big_boom: '전 종목 +25%p',
  big_crash: '전 종목 -25%p',
  volatility_up: '전 종목 등락률 ×1.5',
  volatility_down: '전 종목 등락률 ×0.5',
  reversal_day: '전 종목 등락 부호 반전',
  calm: '전 종목 0% 확정 (특수카드 무효)',
  polarization: '상위 절반 +15%p / 하위 절반 -15%p',
  bubble: '상승 종목 ×1.3',
  panic: '전 종목 ×0.7',
  rate_hike: '전 종목 -5%p',
  liquidity: '전 종목 +5%p',
  news_blackout: '이번 라운드 정보 카드 무효',
}

export default function RoundResult() {
  const { roomId } = useParams<{ roomId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [room, setRoom] = useState<Room | null>(null)
  const [calculated, setCalculated] = useState(false)
  const calcRef = useRef(false)

  useEffect(() => {
    if (!roomId) return
    const roomRef = subscribeRoom(roomId, r => {
      if (!r) { navigate('/game/stock-boardgame'); return }
      if (r.status === 'playing') {
        navigate(`/game/stock-boardgame/room/${roomId}/play`)
        return
      }
      if (r.status === 'ended') {
        navigate(`/game/stock-boardgame/room/${roomId}/final`)
        return
      }
      setRoom(r)

      // 방장: 아직 결과가 없으면 계산
      if (
        r.status === 'round_result' &&
        !r.roundResults?.[r.currentRound] &&
        !calcRef.current &&
        user?.uid === r.host
      ) {
        calcRef.current = true
        calculateRoundResult(roomId, r.currentRound)
          .then(() => setCalculated(true))
          .catch(console.error)
      } else if (r.roundResults?.[r.currentRound]) {
        setCalculated(true)
      }
    })
    return () => unsubscribeRoom(roomRef)
  }, [roomId, navigate, user])

  if (!room || !user) return <div className={styles.loading}>계산 중...</div>

  const result = room.roundResults?.[room.currentRound]
  const isHost = room.host === user.uid
  const isLastRound = room.currentRound >= room.settings.rounds

  async function handleNext() {
    if (!roomId) return
    if (isLastRound) {
      // 마지막 라운드 → 최종 결과
      await nextRound(roomId, room!.currentRound + 1, room!.settings.rounds)
    } else {
      await nextRound(roomId, room!.currentRound + 1, room!.settings.rounds)
    }
  }

  if (!result || !calculated) {
    return (
      <div className={styles.page}>
        <div className={styles.calculating}>
          <div className={styles.spinner} />
          <p>라운드 결과 계산 중...</p>
        </div>
      </div>
    )
  }

  const companies = Object.values(room.companies)
  const playersSorted = [...result.rankSnapshot]
    .sort((a, b) => a.rank - b.rank)
    .map(r => ({ ...r, player: room.players[r.uid] }))

  const me = room.players[user.uid]
  const myRank = result.rankSnapshot.find(r => r.uid === user.uid)?.rank ?? 0

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <span className={styles.roundBadge}>{room.currentRound} / {room.settings.rounds} 라운드 결과</span>
      </div>

      <div className={styles.body}>
        {/* 라운드 카드 */}
        <div className={styles.roundCardBox}>
          <div className={styles.roundCardInner}>
            <div className={styles.roundCardTitle}>이번 라운드 이벤트</div>
            <div className={styles.roundCardName}>
              {ROUND_CARD_LABEL[result.roundCardType] ?? result.roundCardType}
            </div>
            <div className={styles.roundCardDesc}>
              {ROUND_CARD_DESC[result.roundCardType] ?? ''}
            </div>
          </div>
        </div>

        {/* 주가 변동 */}
        <div className={styles.card}>
          <h3 className={styles.sectionTitle}>주가 변동</h3>
          <div className={styles.priceList}>
            {companies.map(c => {
              const rate = result.finalRates[c.id] ?? 0
              const prevPrice = c.priceHistory[room.currentRound - 1] ?? c.priceHistory[0]
              const newPrice = c.priceHistory[room.currentRound] ?? prevPrice
              const holding = me?.portfolio?.[c.id] ?? 0
              const pnl = holding * (newPrice - prevPrice)

              return (
                <div key={c.id} className={styles.priceRow}>
                  <span className={styles.companyEmoji}>{c.emoji}</span>
                  <span className={styles.companyName}>{c.name}</span>
                  <div className={styles.priceChange}>
                    <span className={styles.priceVal}>{newPrice.toLocaleString()}원</span>
                    <span
                      className={styles.rateVal}
                      style={{ color: rate >= 0 ? '#4caf50' : '#f44336' }}
                    >
                      {formatRate(rate)}
                    </span>
                    {holding > 0 && (
                      <span
                        className={styles.pnl}
                        style={{ color: pnl >= 0 ? '#4caf50' : '#f44336' }}
                      >
                        {pnl >= 0 ? '+' : ''}{pnl.toLocaleString()}원
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 이번 라운드 카드 사용 내역 */}
        {room.cardPlays?.[room.currentRound] && Object.keys(room.cardPlays[room.currentRound]).length > 0 && (
          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>사용된 특수 카드</h3>
            <div className={styles.cardPlayList}>
              {Object.values(room.cardPlays[room.currentRound]).map(play => {
                const company = room.companies[play.companyId]
                const player = room.players[play.userId]
                return (
                  <div key={play.playId} className={styles.cardPlayRow}>
                    <span className={styles.cardPlayName}>{player?.name ?? '?'}</span>
                    <span className={styles.cardPlayType}>{CARD_LABEL[play.cardType] ?? play.cardType}</span>
                    <span className={styles.cardPlayTarget}>→ {company?.emoji} {company?.name}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 순위 */}
        <div className={styles.card}>
          <h3 className={styles.sectionTitle}>현재 순위</h3>
          <div className={styles.rankList}>
            {playersSorted.map(({ uid, rank, player }) => {
              const isMe = uid === user.uid
              const totalAssets = (player?.cash ?? 0) + Object.entries(player?.portfolio ?? {}).reduce((sum, [cid, qty]) => {
                const p = room.companies[cid]?.priceHistory[room.currentRound] ?? 0
                return sum + p * (qty as number)
              }, 0)
              return (
                <div key={uid} className={`${styles.rankRow} ${isMe ? styles.rankRowMe : ''}`}>
                  <span className={styles.rankNum}>
                    {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}위`}
                  </span>
                  <span className={styles.rankName}>{player?.name ?? uid}</span>
                  <span className={styles.rankAssets}>{totalAssets.toLocaleString()}원</span>
                </div>
              )
            })}
          </div>
          <div className={styles.myRankNote}>내 순위: {myRank}위</div>
        </div>

        {/* 다음 라운드 버튼 (방장) */}
        {isHost && (
          <button className={styles.nextBtn} onClick={handleNext}>
            {isLastRound ? '최종 결과 보기 →' : `${room.currentRound + 1}라운드 시작 →`}
          </button>
        )}

        {!isHost && (
          <div className={styles.waitHint}>방장이 다음 라운드를 시작할 때까지 기다려 주세요</div>
        )}
      </div>
    </div>
  )
}
