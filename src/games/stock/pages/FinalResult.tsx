import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { subscribeRoom, unsubscribeRoom } from '../utils/rtdb'
import { ref, remove } from 'firebase/database'
import { rtdb } from '../../../firebase/config'
import type { Room, Player } from '../types'
import styles from './FinalResult.module.css'

interface PlayerResult {
  player: Player
  totalAssets: number
  rank: number
  cashChange: number
}

export default function FinalResult() {
  const { roomId } = useParams<{ roomId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [room, setRoom] = useState<Room | null>(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    if (!roomId) return
    const roomRef = subscribeRoom(roomId, r => {
      if (!r) { navigate('/game/stock-boardgame'); return }
      setRoom(r)
    })
    return () => unsubscribeRoom(roomRef)
  }, [roomId, navigate])

  // 잠깐 후 결과 공개 애니메이션
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 600)
    return () => clearTimeout(t)
  }, [])

  if (!room || !user) return <div className={styles.loading}>집계 중...</div>

  const totalRounds = room.settings.rounds
  const lastRoundPrices: Record<string, number> = {}
  for (const [id, company] of Object.entries(room.companies)) {
    lastRoundPrices[id] = company.priceHistory[totalRounds] ?? company.priceHistory[company.priceHistory.length - 1]
  }

  const results: PlayerResult[] = Object.values(room.players)
    .map(p => {
      const portfolioValue = Object.entries(p.portfolio ?? {}).reduce((sum, [cid, qty]) => {
        return sum + (lastRoundPrices[cid] ?? 0) * (qty as number)
      }, 0)
      const rawAssets = p.cash + portfolioValue
      const refillDeduction = p.refillTotal ?? 0
      const totalAssets = rawAssets - refillDeduction   // 파산구제 차감 후 최종 자산
      const cashChange = totalAssets - room.settings.startCash
      return { player: p, totalAssets, rank: p.rank || 0, cashChange }
    })
    .sort((a, b) => b.totalAssets - a.totalAssets)
    .map((r, i) => ({ ...r, rank: i + 1 }))

  const me = results.find(r => r.player.uid === user.uid)
  const winner = results[0]

  async function handleExit() {
    navigate('/game/stock-boardgame')
  }

  async function handleDeleteRoom() {
    if (!roomId || !rtdb) return
    try {
      await remove(ref(rtdb, `rooms/${roomId}`))
    } catch {
      // 이미 삭제됐을 수 있음
    }
    navigate('/game/stock-boardgame')
  }

  const rankEmoji = (rank: number) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return `${rank}위`
  }

  return (
    <div className={styles.page}>
      {/* 헤더 */}
      <div className={styles.header}>
        <h1 className={styles.title}>📈 최종 결과</h1>
        <p className={styles.subtitle}>{totalRounds}라운드 게임 종료</p>
      </div>

      <div className={styles.body}>
        {/* 우승자 배너 */}
        <div className={`${styles.winnerBanner} ${revealed ? styles.revealed : ''}`}>
          <div className={styles.winnerCrown}>👑</div>
          <div className={styles.winnerName}>{winner?.player.name}</div>
          <div className={styles.winnerAssets}>
            최종 자산: {winner?.totalAssets.toLocaleString()}원
          </div>
          {winner?.player.uid === user.uid && (
            <div className={styles.winnerYou}>🎉 당신이 우승했습니다!</div>
          )}
        </div>

        {/* 순위표 */}
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>최종 순위</h2>
          <div className={styles.rankList}>
            {results.map(({ player, totalAssets, rank, cashChange }, i) => {
              const isMe = player.uid === user.uid
              const delay = i * 120

              return (
                <div
                  key={player.uid}
                  className={`${styles.rankRow} ${isMe ? styles.rankRowMe : ''} ${revealed ? styles.rankRowIn : ''}`}
                  style={{ transitionDelay: `${delay}ms` }}
                >
                  <span className={styles.rankEmoji}>{rankEmoji(rank)}</span>
                  <div className={styles.playerInfo}>
                    {player.photoURL
                      ? <img src={player.photoURL} className={styles.avatar} alt="" />
                      : <div className={styles.avatarFb}>{player.name[0]}</div>
                    }
                    <span className={styles.playerName}>{player.name}</span>
                  </div>
                  <div className={styles.assetInfo}>
                    <span className={styles.totalAssets}>{totalAssets.toLocaleString()}원</span>
                    {(player.refillTotal ?? 0) > 0 && (
                      <span className={styles.refillNote}>구제 −{player.refillTotal.toLocaleString()}</span>
                    )}
                    <span
                      className={styles.cashChange}
                      style={{ color: cashChange >= 0 ? '#4caf50' : '#f44336' }}
                    >
                      {cashChange >= 0 ? '+' : ''}{cashChange.toLocaleString()}원
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 주가 변동 히스토리 */}
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>종목별 최종 주가</h2>
          <div className={styles.stockList}>
            {Object.values(room.companies).map(c => {
              const startPrice = c.priceHistory[0]
              const endPrice = lastRoundPrices[c.id]
              const totalRate = startPrice > 0 ? (endPrice - startPrice) / startPrice : 0
              return (
                <div key={c.id} className={styles.stockRow}>
                  <span className={styles.stockEmoji}>{c.emoji}</span>
                  <span className={styles.stockName}>{c.name}</span>
                  <div className={styles.stockPrices}>
                    <span className={styles.stockEnd}>{endPrice.toLocaleString()}원</span>
                    <span
                      className={styles.stockTotal}
                      style={{ color: totalRate >= 0 ? '#4caf50' : '#f44336' }}
                    >
                      {totalRate >= 0 ? '+' : ''}{(totalRate * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 내 결과 요약 */}
        {me && (
          <div className={styles.mySummary}>
            <div className={styles.mySummaryTitle}>내 최종 성적</div>
            <div className={styles.mySummaryRank}>{rankEmoji(me.rank)}</div>
            <div className={styles.mySummaryAssets}>{me.totalAssets.toLocaleString()}원</div>
            {(me.player.refillTotal ?? 0) > 0 && (
              <div className={styles.mySummaryRefill}>
                파산구제 차감: −{(me.player.refillTotal).toLocaleString()}원
              </div>
            )}
            <div
              className={styles.mySummaryChange}
              style={{ color: me.cashChange >= 0 ? '#4caf50' : '#f44336' }}
            >
              {me.cashChange >= 0 ? '+' : ''}{me.cashChange.toLocaleString()}원
              {' '}({me.cashChange >= 0 ? '+' : ''}{((me.cashChange / room.settings.startCash) * 100).toFixed(1)}%)
            </div>
          </div>
        )}

        {/* 버튼 */}
        <div className={styles.actions}>
          <button className={styles.exitBtn} onClick={handleExit}>로비로 돌아가기</button>
          {user.uid === room.host && (
            <button className={styles.deleteBtn} onClick={handleDeleteRoom}>방 삭제</button>
          )}
        </div>
      </div>
    </div>
  )
}
